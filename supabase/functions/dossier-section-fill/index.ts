// supabase/functions/dossier-section-fill/index.ts
// Preenche uma secção individual — agora lê dossier_facts para manter
// coerência com o que foi extraído no intake. Suporta notas + ficheiros.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Não autenticado." }), { status: 401, headers: cors });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return new Response(JSON.stringify({ error: "Sessão inválida." }), { status: 401, headers: cors });

    const { data: profile } = await sb.from("profiles").select("is_approved").eq("user_id", user.id).maybeSingle();
    if (!profile?.is_approved) return new Response(JSON.stringify({ error: "Conta não aprovada." }), { status: 403, headers: cors });

    const { dossierId, sectionId, sectionName, sectionNumber, notes, clientName, attachments } = await req.json();
    const attachmentList: { name: string; mediaType: string; base64: string }[] = Array.isArray(attachments) ? attachments : [];

    if (!sectionId || (!notes?.trim() && attachmentList.length === 0)) {
      return new Response(JSON.stringify({ error: "sectionId e (notes ou attachments) são obrigatórios." }), { status: 400, headers: cors });
    }

    // Buscar factos estruturados do intake (se existirem) para dar contexto à IA
    // Isto garante que edições pontuais mantêm coerência com o dossier inteiro.
    let factsContext = "";
    if (dossierId) {
      const { data: facts } = await sb.from("dossier_facts")
        .select("category, label, data").eq("dossier_id", dossierId).limit(60);
      if (facts && facts.length > 0) {
        factsContext = `\nFACTOS ESTRUTURADOS DO DOSSIER (extraídos no intake — usa-os para consistência com as outras secções, não os contradijas):\n${JSON.stringify(facts, null, 2).slice(0, 4000)}`;
      }
    }

    // Processar ficheiros anexados
    const TEXTUAL_TYPES = ["text/csv", "text/plain", "application/json", "text/html", "text/markdown"];
    const inlineTextParts: string[] = [];
    const contentBlocks: any[] = [];

    for (const att of attachmentList) {
      const isTextual = TEXTUAL_TYPES.includes(att.mediaType) || /\.(csv|txt|json|html?|md)$/i.test(att.name);
      if (isTextual) {
        try {
          const decoded = atob(att.base64);
          const text = decoded.length > 20000 ? decoded.slice(0, 20000) + "\n[truncado]" : decoded;
          inlineTextParts.push(`--- Ficheiro: ${att.name} ---\n${text}`);
        } catch { /* ignorar */ }
      } else if (att.mediaType === "application/pdf") {
        contentBlocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: att.base64 } });
      } else if (att.mediaType?.startsWith("image/")) {
        contentBlocks.push({ type: "image", source: { type: "base64", media_type: att.mediaType, data: att.base64 } });
      }
    }

    const prompt = `Estás a preparar a secção "${sectionName}" de um dossier técnico de cibersegurança para "${clientName || "o cliente"}" (micro/pequena empresa — linguagem clara sem jargão, âmbito limitado ao técnico/MSP, nunca decisões legais ou de seguros).
${factsContext}
Notas do consultor para esta secção (podem estar desorganizadas ou parciais):
"""
${notes || "(sem notas — usa os factos do intake e/ou ficheiros anexados)"}
"""
${inlineTextParts.length > 0 ? `\nFicheiros anexados:\n${inlineTextParts.join("\n\n")}` : ""}
${contentBlocks.length > 0 ? "\nTambém foram anexados PDF(s) e/ou imagem(ns) — extrai o que for relevante para esta secção." : ""}

Redige o conteúdo final desta secção, em português europeu, pronto a incluir no documento. Usa tabelas markdown quando a informação for tabular. Não inventes — usa "[A CONFIRMAR: ...]" onde faltar informação. Não escrevas introdução nem comentário sobre a tarefa.`;

    const userContent = contentBlocks.length > 0
      ? [...contentBlocks, { type: "text", text: prompt }]
      : prompt;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 3000, messages: [{ role: "user", content: userContent }] }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: "Erro na API Anthropic", details: errText }), { status: 502, headers: cors });
    }

    const data = await res.json();
    const generatedText = data.content?.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n") ?? "";

    await sb.from("dossier_sections").update({
      ai_generated_content: generatedText,
      data: { notes },
    }).eq("id", sectionId).eq("dossier_id", dossierId);

    return new Response(JSON.stringify({ content: generatedText }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro interno.", details: String(err) }), { status: 500, headers: cors });
  }
});
