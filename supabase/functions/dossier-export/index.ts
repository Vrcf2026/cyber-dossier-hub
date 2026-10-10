// supabase/functions/dossier-export/index.ts
//
// Gera o documento Word final do dossier, em 5 variantes:
// "cliente" (só secções visíveis ao cliente), "tecnico" (todas),
// "credenciais" (folha à parte, nunca junta com as outras),
// "politica" (Política de Segurança da Informação — ver policy.ts),
// "adenda" (Adenda de monitorização de segurança e RGPD — ver adenda.ts).
//
// Devolve o ficheiro .docx diretamente (binário), não JSON.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType,
} from "npm:docx@8.5.0";
import { buildPolicyDoc } from "./policy.ts";
import { buildAdendaDoc } from "./adenda.ts";
import { buildDossierDoc } from "./dossier.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildHeader(title: string, clientName: string, subtitle: string) {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: title, bold: true, size: 32 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: clientName, size: 24 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [new TextRun({ text: subtitle, italics: true, size: 18, color: "666666" })],
    }),
  ];
}

/** Logótipo da empresa (só PNG, até 2 MB, 4 s). Falhar aqui nunca impede a exportação. */
async function logotipo(url?: string | null): Promise<Uint8Array | null> {
  if (!url || !/^https:\/\//.test(url)) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    return b.length > 0 && b.length < 2_000_000 ? b : null;
  } catch { return null; }
}

/** Nível de autenticação do token. Só chamar DEPOIS de getUser() ter validado o token no servidor de auth. */
function aalDoToken(token: string): string | null {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))).aal ?? null;
  } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabaseClient
      .from("profiles").select("is_approved").eq("user_id", userData.user.id).maybeSingle();
    if (!profile?.is_approved) {
      return new Response(JSON.stringify({ error: "Conta não aprovada." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const dossierId = url.searchParams.get("dossierId");
    const variant = url.searchParams.get("variant") || "cliente"; // cliente | tecnico | credenciais | politica | adenda

    if (!["cliente", "tecnico", "credenciais", "politica", "adenda"].includes(variant)) {
      return new Response(JSON.stringify({ error: "Versão desconhecida." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!dossierId) {
      return new Response(JSON.stringify({ error: "dossierId é obrigatório." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Só quem tem acesso ao dossier o pode exportar
    const { data: canAccess } = await supabaseClient.rpc("can_access_dossier", {
      _user_id: userData.user.id,
      _dossier_id: dossierId,
    });
    if (!canAccess) {
      return new Response(JSON.stringify({ error: "Sem acesso a este dossier." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Versões técnica e de credenciais só para administradores
    const { data: isAdminCaller } = await supabaseClient.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if ((variant === "tecnico" || variant === "credenciais") && !isAdminCaller) {
      return new Response(JSON.stringify({ error: "Sem permissões para esta versão." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Versões técnica e de credenciais: só com a verificação em dois passos feita nesta sessão.
    if ((variant === "tecnico" || variant === "credenciais") && aalDoToken(jwt) !== "aal2") {
      return new Response(JSON.stringify({ error: "Confirme a verificação em dois passos." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: dossier } = await supabaseClient
      .from("dossiers").select("*, clients(*)").eq("id", dossierId).single();
    if (!dossier) {
      return new Response(JSON.stringify({ error: "Dossier não encontrado." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const client = (dossier as any).clients;

    let doc: Document;
    let filename: string;

    if (variant === "credenciais") {
      const { data: creds } = await supabaseClient
        .from("dossier_credentials").select("*").eq("dossier_id", dossierId).maybeSingle();
      const entries = (creds?.entries as any[]) ?? [];

      const colWidth = 1800;
      const headerRow = new TableRow({
        children: ["Sistema/Serviço", "IP/URL", "Utilizador", "Password", "Observações"].map((h) =>
          new TableCell({
            width: { size: colWidth, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: "D9D9D9" },
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
          })
        ),
      });
      const bodyRows = entries.map((e) => new TableRow({
        children: [e.sistema, e.ip_url, e.utilizador, e.password, e.observacoes].map((v) =>
          new TableCell({
            width: { size: colWidth, type: WidthType.DXA },
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [new Paragraph({ children: [new TextRun({ text: v || "" })] })],
          })
        ),
      }));

      doc = new Document({
        sections: [{
          children: [
            ...buildHeader("FOLHA DE CREDENCIAIS", client?.name ?? "", "CONFIDENCIAL — ACESSO RESTRITO AO ADMINISTRADOR"),
            new Paragraph({
              spacing: { after: 200 },
              border: { top: { style: BorderStyle.SINGLE, size: 6, color: "C0392B" }, bottom: { style: BorderStyle.SINGLE, size: 6, color: "C0392B" } },
              children: [new TextRun({ text: "Este documento não faz parte do dossier principal e não deve circular com o mesmo.", bold: true, color: "C0392B" })],
            }),
            new Table({ width: { size: 9000, type: WidthType.DXA }, rows: [headerRow, ...bodyRows] }),
          ],
        }],
      });
      filename = `Credenciais_${(client?.name ?? "cliente").replace(/\s+/g, "_")}.docx`;
    } else if (variant === "adenda") {
      const clientId = (dossier as any).client_id;
      const [{ data: company }, { data: staff }, { data: tasks }] = await Promise.all([
        supabaseClient.from("company_settings").select("name, email, phone, nif").limit(1).maybeSingle(),
        supabaseClient.from("client_staff").select("name, active").eq("client_id", clientId).order("name"),
        supabaseClient.from("client_tasks").select("title, evidence_type, frequency, active").eq("client_id", clientId).order("evidence_type"),
      ]);
      const nivelTxt = url.searchParams.get("nivel");
      const nivel = nivelTxt === "1" || nivelTxt === "2" || nivelTxt === "3" ? (Number(nivelTxt) as 1 | 2 | 3) : null;
      doc = buildAdendaDoc({
        nivel,
        tasks: (tasks as any[]) ?? [],
        client: { name: client?.name ?? "", nif: client?.nif, address: client?.address, contact_person: client?.contact_person },
        provider: company ?? null,
        staff: (staff as any[]) ?? [],
      });
      filename = `Adenda_Sentinela${nivel ? `_Nivel${nivel}` : ""}_${(client?.name ?? "cliente").replace(/\s+/g, "_")}.docx`;
    } else if (variant === "politica") {
      const clientId = (dossier as any).client_id;
      const [{ data: sections }, { data: company }, { data: evidences }, { data: tasks }, { data: staff }] = await Promise.all([
        supabaseClient.from("dossier_sections").select("section_number, section_status, is_completed, ai_generated_content").eq("dossier_id", dossierId),
        supabaseClient.from("company_settings").select("name, email, phone").limit(1).maybeSingle(),
        supabaseClient.from("client_evidences").select("evidence_type, evidence_date, result").eq("client_id", clientId),
        supabaseClient.from("client_tasks").select("evidence_type, active, frequency").eq("client_id", clientId),
        supabaseClient.from("client_staff").select("name, active, policy_ack_signed_at, confidentiality_signed_at, last_training_at").eq("client_id", clientId).order("name"),
      ]);
      doc = buildPolicyDoc({
        client: { name: client?.name ?? "", nif: client?.nif, address: client?.address, contact_person: client?.contact_person },
        provider: company ?? null,
        sections: (sections as any[]) ?? [],
        evidences: (evidences as any[]) ?? [],
        tasks: (tasks as any[]) ?? [],
        staff: (staff as any[]) ?? [],
        planOptions: (client as any)?.opcoes_plano ?? null,
      });
      filename = `Politica_Seguranca_${(client?.name ?? "cliente").replace(/\s+/g, "_")}.docx`;
    } else {
      const [{ data: sections }, { data: company }] = await Promise.all([
        supabaseClient.from("dossier_sections")
          .select("section_number, section_name, section_status, client_visible, ai_generated_content")
          .eq("dossier_id", dossierId).order("section_number"),
        supabaseClient.from("company_settings").select("name, email, phone, nif, logo_url").limit(1).maybeSingle(),
      ]);
      doc = buildDossierDoc({
        variant: variant === "tecnico" ? "tecnico" : "cliente",
        title: (dossier as any).title,
        updatedAt: (dossier as any).updated_at,
        client: { name: client?.name ?? "", nif: client?.nif, address: client?.address },
        provider: company ?? null,
        sections: (sections as any[]) ?? [],
        logoPng: await logotipo((company as any)?.logo_url),
      });
      filename = `Dossier_${variant === "tecnico" ? "Tecnico" : "Cliente"}_${(client?.name ?? "cliente").replace(/\s+/g, "_")}.docx`;
    }

    const buffer = await Packer.toBuffer(doc);

    // Registo de auditoria da exportação (fonte fiável, do lado do servidor)
    await supabaseClient.from("audit_logs").insert({
      user_id: userData.user.id,
      user_email: userData.user.email ?? null,
      action: "dossier_export",
      entity_type: "dossier",
      entity_id: dossierId,
      dossier_id: dossierId,
      details: { variant, dossier_title: (dossier as any).title, client_name: client?.name ?? null, source: "edge" },
    });

    return new Response(buffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro interno.", details: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
