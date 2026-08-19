// supabase/functions/dossier-audit/index.ts
//
// Analisa todas as secções preenchidas + factos do dossier e devolve:
//   - Lista de lacunas (informação em falta crítica para NIS2)
//   - Inconsistências entre secções
//   - Score de completude por secção (semáforo: ok / incompleto / vazio)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_AUDIT = `És um auditor de cibersegurança especializado em NIS2 para PMEs portuguesas.
Recebes o conteúdo completo de um dossier de cibersegurança e analisas-o criticamente.

Devolves APENAS um JSON válido (sem markdown, sem texto antes ou depois) com esta estrutura:

{
  "sections": [
    {
      "number": 1,
      "name": "...",
      "status": "ok|incomplete|empty",
      "issues": ["problema específico encontrado nesta secção, string por issue"]
    }
  ],
  "cross_issues": [
    "inconsistência entre secções — ex: 'A política de MFA definida na secção 4 não está reflectida no inventário de acessos remotos da secção 3'"
  ],
  "critical_missing": [
    "informação crítica para conformidade NIS2 que está ausente em todo o dossier"
  ],
  "overall_score": 0
}

Para "status":
- "ok": secção completa e coerente, sem lacunas críticas
- "incomplete": tem conteúdo mas falta informação importante (tem "[A CONFIRMAR]" ou lacunas óbvias)
- "empty": sem conteúdo significativo

"overall_score": percentagem 0-100 de completude global estimada.

Sê específico e directo — não faças observações genéricas. Cada issue deve apontar algo concreto que falta ou está errado.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Não autenticado." }), { status: 401, headers: cors });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return new Response(JSON.stringify({ error: "Sessão inválida." }), { status: 401, headers: cors });

    const { dossierId } = await req.json();
    if (!dossierId) return new Response(JSON.stringify({ error: "dossierId obrigatório." }), { status: 400, headers: cors });

    // Buscar dossier + secções + factos
    const { data: dossier } = await sb.from("dossiers")
      .select("*, clients(name, sector, num_employees)").eq("id", dossierId).single();
    if (!dossier) return new Response(JSON.stringify({ error: "Dossier não encontrado." }), { status: 404, headers: cors });

    const { data: sections } = await sb.from("dossier_sections")
      .select("section_number, section_name, ai_generated_content, is_completed, data")
      .eq("dossier_id", dossierId).order("section_number");

    const { data: facts } = await sb.from("dossier_facts")
      .select("category, label, data").eq("dossier_id", dossierId);

    // Construir prompt com o conteúdo completo
    const client = dossier.clients;
    const header = `Empresa: ${client?.name ?? "?"} | Setor: ${client?.sector ?? "?"} | Colaboradores: ${client?.num_employees ?? "?"}`;

    const sectionsText = (sections ?? []).map((s: any) => {
      const content = s.ai_generated_content?.trim() || "(vazio)";
      return `### ${s.section_number}. ${s.section_name}\n${content.slice(0, 1500)}${content.length > 1500 ? "\n[...truncado...]" : ""}`;
    }).join("\n\n---\n\n");

    const factsText = facts?.length
      ? `\nFACTOS ESTRUTURADOS EXTRAÍDOS (${facts.length} registos):\n${JSON.stringify(facts.slice(0, 50), null, 2)}`
      : "\nSem factos estruturados extraídos ainda.";

    const prompt = `${header}\n\nCONTEÚDO DO DOSSIER:\n\n${sectionsText}${factsText}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: SYSTEM_AUDIT,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(await res.text());
    const aiData = await res.json();
    const rawText = aiData.content?.filter((b: any) => b.type === "text").map((b: any) => b.text).join("") ?? "";

    let audit: any;
    try {
      audit = JSON.parse(rawText.replace(/```json|```/g, "").trim());
    } catch {
      audit = { sections: [], cross_issues: [], critical_missing: ["Erro ao analisar resposta da IA."], overall_score: 0 };
    }

    return new Response(JSON.stringify(audit), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
