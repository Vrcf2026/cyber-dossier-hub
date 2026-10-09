// supabase/functions/sentinela-evidencia/index.ts
//
// Recebe as provas automáticas do VRCF Sentinela e regista-as como evidência do cliente,
// com o relatório anexado. Campo "tipo": log_review (relatórios, por omissão), backup_check
// (resumo mensal dos backups), config_review (configuração) ou asset_review (parque).
//
// Pública (verify_jwt = false no config.toml) porque quem chama é o servidor do
// Sentinela, não um utilizador. A autenticação é por assinatura HMAC-SHA256 com
// um segredo partilhado:
//   cabeçalhos  x-sentinela-tempo: <epoch em segundos>
//               x-sentinela-assinatura: hex(HMAC_SHA256(SENTINELA_SEGREDO, tempo + "." + corpo))
// O pedido só é aceite até 10 minutos depois do "tempo" (impede reenvios antigos).
//
// Segredo: Supabase → Edge Functions → Secrets → SENTINELA_SEGREDO (o mesmo valor
// que se gera na página Configuração do Sentinela).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SEGREDO = Deno.env.get("SENTINELA_SEGREDO") ?? "";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json; charset=utf-8" } });

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

function igual(a: string, b: string) {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

async function assinatura(texto: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(SEGREDO), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(texto)));
}

const soDigitos = (v?: string | null) => (v ?? "").replace(/\D/g, "");

function base64ParaBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ erro: "metodo" }, 405);
  if (SEGREDO.length < 32) return json({ erro: "nao_configurado" }, 503);

  const corpo = await req.text();
  if (corpo.length > 8_000_000) return json({ erro: "demasiado_grande" }, 413);
  const tempo = req.headers.get("x-sentinela-tempo") ?? "";
  const recebida = req.headers.get("x-sentinela-assinatura") ?? "";
  const agora = Math.floor(Date.now() / 1000);
  if (!/^\d{10}$/.test(tempo) || Math.abs(agora - Number(tempo)) > 600) return json({ erro: "tempo" }, 401);
  if (!igual(await assinatura(`${tempo}.${corpo}`), recebida)) return json({ erro: "assinatura" }, 401);

  let p: any;
  try { p = JSON.parse(corpo); } catch { return json({ erro: "json" }, 400); }
  if (!p?.external_id || !p?.titulo || !p?.data) return json({ erro: "campos" }, 400);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Já recebido? (o Sentinela pode repetir o envio)
  const { data: existe } = await sb.from("client_evidences").select("id")
    .eq("source", "sentinela").eq("external_id", String(p.external_id)).maybeSingle();
  if (existe) return json({ ok: true, duplicado: true, id: existe.id });

  // Cliente: pelo NIF (só os dígitos); se não houver NIF, pelo nome exato.
  const { data: clientes } = await sb.from("clients").select("id, name, nif");
  const nif = soDigitos(p.nif);
  let cliente = nif ? (clientes ?? []).find((c: any) => soDigitos(c.nif) === nif) : undefined;
  if (!cliente && p.cliente_nome) {
    const nome = String(p.cliente_nome).trim().toLowerCase();
    const porNome = (clientes ?? []).filter((c: any) => (c.name ?? "").trim().toLowerCase() === nome);
    if (porNome.length === 1) cliente = porNome[0];
  }
  if (!cliente) return json({ erro: "cliente_nao_encontrado", nif, nome: p.cliente_nome ?? null }, 404);

  // Ficheiro do relatório
  let filePath: string | null = null;
  let fileName: string | null = null;
  if (p.ficheiro?.base64 && p.ficheiro?.nome) {
    fileName = String(p.ficheiro.nome).replace(/[\\/:*?"<>|]+/g, "-").slice(0, 150);
    filePath = `${cliente.id}/sentinela/${String(p.external_id).replace(/[^\w-]/g, "")}_${fileName}`;
    const { error: up } = await sb.storage.from("evidence-files")
      .upload(filePath, base64ParaBytes(p.ficheiro.base64), { contentType: p.ficheiro.tipo ?? "text/html", upsert: true });
    if (up) return json({ erro: "ficheiro", detalhe: up.message }, 500);
  }

  // Dossier mais recente do cliente (opcional)
  const { data: dossier } = await sb.from("dossiers").select("id").eq("client_id", cliente.id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  const resultado = ["ok", "warning", "fail", "pending"].includes(p.resultado) ? p.resultado : "ok";
  // Tipo de prova: relatórios (log_review), backups (backup_check), configuração (config_review), parque (asset_review)
  const tipo = ["log_review", "backup_check", "config_review", "asset_review"].includes(p.tipo) ? p.tipo : "log_review";
  const { data: ev, error } = await sb.from("client_evidences").insert({
    client_id: cliente.id,
    dossier_id: dossier?.id ?? null,
    evidence_type: tipo,
    result: resultado,
    title: String(p.titulo).slice(0, 300),
    notes: p.notas ? String(p.notas).slice(0, 4000) : null,
    evidence_date: String(p.data).slice(0, 10),
    file_path: filePath,
    file_name: fileName,
    performed_by: null,
    source: "sentinela",
    external_id: String(p.external_id),
  }).select("id").single();
  if (error) return json({ erro: "inserir", detalhe: error.message }, 500);

  // A tarefa do mesmo tipo avança sozinha na base de dados (trigger tarefa_registar_prova).

  return json({ ok: true, id: ev.id, cliente: cliente.name }, 201);
});
