// supabase/functions/dossier-update/index.ts
//
// Atualização rápida do dossier depois do intake: o técnico escreve o que mudou
// ("troquei 2 PCs na receção e o router da MEO por um Omada") e/ou anexa um export
// (Action1, CSV, PDF, foto) e a IA propõe as alterações em cada secção afetada.
//
// Só PROPÕE (não grava nada): o editor mostra as diferenças e o técnico escolhe o
// que aplicar; a gravação é feita no browser com a sessão do técnico, para o
// histórico das secções ficar com o nome dele.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODELO = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SISTEMA = `És o assistente técnico de uma empresa de informática (MSP) que mantém dossiers de cibersegurança de micro e pequenas empresas portuguesas (NIS2, RGPD).
O dossier já está preenchido. O técnico vai descrever uma alteração no cliente (equipamentos trocados, rede, contas, fornecedores, backups, incidentes, formação…), por texto ou com ficheiros.

A tua tarefa:
1. Identificar TODAS as secções afetadas (ex.: PC novo → 2 Inventário; router novo → 2 Inventário e 3 Rede; colaborador saiu → 4 Acessos e talvez 8 contactos; novo backup → 7; incidente → 8 e 13).
2. Para cada secção afetada, devolver o texto COMPLETO da secção já com a alteração aplicada: mantém tudo o resto exatamente igual (mesma estrutura, tabelas, formatação markdown), muda só o necessário. Equipamentos substituídos saem da tabela (ou ficam marcados como retirados com a data, se a secção já fizer isso).
3. Nunca inventes dados: o que não sabes fica "[A CONFIRMAR: …]".
4. Em "avisos", lista o que o técnico deve fazer por causa desta alteração e que não é texto do dossier (ex.: instalar o agente VRCF Sentinela e o antivírus no PC novo, ativar BitLocker, apagar com segurança o disco do PC retirado e registar a destruição, atualizar a palavra-passe do Wi-Fi, rever acessos remotos).
5. Em "perguntas", só o que é mesmo preciso para completar (máx. 3).
Português europeu, direto. Responde SEMPRE através da ferramenta propor_alteracoes.`;

const FERRAMENTA = {
  name: "propor_alteracoes",
  description: "Propõe as alterações às secções do dossier.",
  input_schema: {
    type: "object",
    properties: {
      resumo: { type: "string", description: "Uma ou duas frases com o que mudou." },
      alteracoes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            secao: { type: "integer", description: "Número da secção (1-13)." },
            motivo: { type: "string", description: "O que muda nesta secção e porquê, numa frase." },
            conteudo_novo: { type: "string", description: "Texto completo da secção já alterado (markdown)." },
          },
          required: ["secao", "motivo", "conteudo_novo"],
        },
      },
      avisos: { type: "array", items: { type: "string" } },
      perguntas: { type: "array", items: { type: "string" } },
    },
    required: ["resumo", "alteracoes", "avisos", "perguntas"],
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    if (!ANTHROPIC_API_KEY) return json({ error: "Falta a chave da IA (ANTHROPIC_API_KEY)." }, 503);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Não autenticado." }, 401);
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return json({ error: "Sessão inválida." }, 401);

    const { dossierId, texto, attachments } = await req.json();
    if (!dossierId || (!String(texto ?? "").trim() && !attachments?.length)) return json({ error: "Descreva a alteração." }, 400);

    // Só equipa (não clientes) com acesso a este dossier
    const [{ data: papel }, { data: acesso }] = await Promise.all([
      sb.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
      sb.rpc("can_access_dossier", { _user_id: user.id, _dossier_id: dossierId }),
    ]);
    if (!papel || papel.role === "cliente" || !acesso) return json({ error: "Sem acesso a este dossier." }, 403);

    const { data: dossier } = await sb.from("dossiers").select("title, clients(name, sector, num_employees)").eq("id", dossierId).single();
    const { data: seccoes } = await sb.from("dossier_sections")
      .select("id, section_number, section_name, ai_generated_content, section_status")
      .eq("dossier_id", dossierId).lte("section_number", 13).order("section_number");

    const atual = (seccoes ?? []).map((s: any) =>
      `### Secção ${s.section_number}. ${s.section_name}${s.section_status === "not_applicable" ? " (marcada como não aplicável)" : ""}\n${s.ai_generated_content?.trim() || "(vazia)"}`
    ).join("\n\n");

    const blocos: any[] = [];
    const TEXTUAIS = ["text/csv", "text/plain", "application/json", "text/html", "text/markdown"];
    for (const a of attachments ?? []) {
      if (TEXTUAIS.includes(a.mediaType) || /\.(csv|txt|json|html?|md)$/i.test(a.name ?? "")) {
        try { const t = atob(a.base64); blocos.push({ type: "text", text: `[Ficheiro: ${a.name}]\n${t.length > 30000 ? t.slice(0, 30000) + "\n[truncado]" : t}` }); } catch { /* ignorar */ }
      } else if (a.mediaType === "application/pdf") {
        blocos.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: a.base64 } });
      } else if (String(a.mediaType ?? "").startsWith("image/")) {
        blocos.push({ type: "image", source: { type: "base64", media_type: a.mediaType, data: a.base64 } });
      }
    }
    const cli: any = (dossier as any)?.clients ?? {};
    blocos.push({ type: "text", text:
`Cliente: ${cli.name ?? "?"} (setor ${cli.sector ?? "?"}, ${cli.num_employees ?? "?"} colaboradores). Data de hoje: ${new Date().toLocaleDateString("pt-PT")}.

DOSSIER ATUAL:
${atual.slice(0, 120000)}

ALTERAÇÃO DESCRITA PELO TÉCNICO:
${String(texto ?? "").trim() || "(ver ficheiros)"}` });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODELO, max_tokens: 16000, system: SISTEMA,
        tools: [FERRAMENTA], tool_choice: { type: "tool", name: "propor_alteracoes" },
        messages: [{ role: "user", content: blocos }],
      }),
    });
    if (!r.ok) return json({ error: `IA: ${r.status} ${(await r.text()).slice(0, 300)}` }, 502);
    const d = await r.json();
    const uso = d.content?.find((b: any) => b.type === "tool_use")?.input;
    if (!uso) return json({ error: "A IA não devolveu propostas." }, 502);

    const porNumero = new Map((seccoes ?? []).map((s: any) => [s.section_number, s]));
    const alteracoes = (uso.alteracoes ?? [])
      .filter((a: any) => porNumero.has(a.secao) && typeof a.conteudo_novo === "string" && a.conteudo_novo.trim())
      .map((a: any) => {
        const s: any = porNumero.get(a.secao);
        return { section_id: s.id, secao: a.secao, nome: s.section_name, motivo: a.motivo, antes: s.ai_generated_content ?? "", depois: a.conteudo_novo.trim() };
      })
      .filter((a: any) => a.antes.trim() !== a.depois);

    return json({ resumo: uso.resumo ?? "", alteracoes, avisos: uso.avisos ?? [], perguntas: uso.perguntas ?? [], truncado: d.stop_reason === "max_tokens" });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
