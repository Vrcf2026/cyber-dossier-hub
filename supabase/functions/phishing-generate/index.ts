// supabase/functions/phishing-generate/index.ts
//
// Gera, por IA, o assunto e corpo de um email de teste de phishing,
// a partir de um tema (ex: "fatura em atraso", "entrega CTT").
// Usa o mesmo secret ANTHROPIC_API_KEY já configurado para o
// assistente do dossier.

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

    const { theme, clientName, senderPersona } = await req.json();
    if (!theme) {
      return new Response(JSON.stringify({ error: "theme é obrigatório." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isInternal = !!senderPersona;
    const senderInstruction = isInternal
      ? `O remetente deve parecer ser "${senderPersona}", um colega/superior DENTRO da própria empresa "${clientName || "o cliente"}" — escreve na primeira pessoa, como se fosse essa pessoa a escrever (tom direto, informal-profissional, pode incluir uma leve pressão/urgência de gestão, típico de um pedido interno).`
      : `O remetente deve parecer ser uma entidade EXTERNA credível (ex: fornecedor, transportadora, banco, Microsoft) — tom formal, institucional.`;

    const prompt = `Escreve um email de teste de phishing (simulação autorizada de sensibilização em cibersegurança) para a empresa "${clientName || "o cliente"}", com o pretexto: "${theme}".

${senderInstruction}

Regras:
- Assunto curto e credível, sem erros óbvios de phishing (sem urgência exagerada, sem erros ortográficos propositados).
- Corpo em HTML simples (parágrafos <p>), em português europeu.
- Inclui um único botão/link de ação, escrito como texto normal (ex: "Ver fatura", "Consultar estado da entrega", "Ver documento") — usa exatamente o placeholder {{LINK}} como href desse link, não inventes um URL.
- Não menciones que é um teste ou simulação em lado nenhum do texto.
- Responde APENAS em JSON, neste formato exato, sem markdown, sem crases: {"subject": "...", "body_html": "..."}`;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
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
    const rawText = anthropicData.content
      ?.filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n") ?? "{}";

    const cleaned = rawText.replace(/```json|```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(JSON.stringify({ error: "Resposta da IA não é JSON válido.", raw: rawText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro interno.", details: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
