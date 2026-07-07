// supabase/functions/dossier-section-fill/index.ts
//
// Recebe notas soltas (ou campos preenchidos) para uma secção do
// dossier e devolve o texto/estrutura final, escrito pela Claude.
// Reaproveita o mesmo secret ANTHROPIC_API_KEY já configurado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { dossierId, sectionId, sectionName, notes, clientName } = await req.json();
    if (!sectionId || !notes) {
      return new Response(JSON.stringify({ error: "sectionId e notes são obrigatórios." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Estás a preparar a secção "${sectionName}" de um dossier técnico de cibersegurança para a empresa "${clientName || "o cliente"}" (micro/pequena empresa — a linguagem deve ser clara, sem jargão desnecessário, e o âmbito deve ficar limitado ao que é tecnicamente responsabilidade de um consultor de TI/MSP, nunca a decisões legais, de seguros, ou de gestão que sejam do cliente).

Aqui estão as notas soltas do consultor, tal como as escreveu no terreno (podem estar desorganizadas, em fragmentos, com abreviaturas):
"""
${notes}
"""

Tarefa: reescreve isto como o texto final e estruturado desta secção do dossier, em português europeu, pronto a incluir no documento. Usa parágrafos curtos e, sempre que fizer sentido o conteúdo, tabelas em markdown. Não inventes dados que não estejam nas notas — se faltar informação relevante, assinala com "[A CONFIRMAR: ...]" em vez de inventar. Não escrevas preâmbulo nem comentários sobre a tarefa, apenas o conteúdo final da secção.`;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      return new Response(JSON.stringify({ error: "Erro na API Anthropic", details: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anthropicData = await anthropicResponse.json();
    const generatedText = anthropicData.content
      ?.filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n") ?? "";

    // Grava o resultado + as notas originais na secção
    await supabaseClient
      .from("dossier_sections")
      .update({
        ai_generated_content: generatedText,
        data: { notes },
      })
      .eq("id", sectionId)
      .eq("dossier_id", dossierId);

    return new Response(JSON.stringify({ content: generatedText }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro interno.", details: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
