// supabase/functions/claude-assistant/index.ts
//
// Proxy server-side para a API da Anthropic. A chave API NUNCA
// chega ao browser: vive apenas como secret desta Edge Function.
//
// Deploy:
//   supabase functions deploy claude-assistant
//
// Definir o secret (uma vez, ou sempre que rodares a chave):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxx
//
// Chamada a partir do frontend (autenticada, com o JWT do utilizador):
//   const { data, error } = await supabase.functions.invoke("claude-assistant", {
//     body: { dossierId, sectionId, prompt, sectionContext }
//   });

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Só a equipa (não contas de cliente), com conta aprovada e, quando indicado, com acesso ao dossier/cliente. */
async function exigirEquipa(sb: any, userId: string, o: { dossierId?: string | null; clientId?: string | null } = {}): Promise<string | null> {
  const [{ data: papel }, { data: perfil }] = await Promise.all([
    sb.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    sb.from("profiles").select("is_approved").eq("user_id", userId).maybeSingle(),
  ]);
  if (!perfil?.is_approved) return "Conta não aprovada.";
  if (!papel || papel.role === "cliente") return "Só a equipa tem acesso a esta função.";
  if (o.dossierId) {
    const { data: ok } = await sb.rpc("can_access_dossier", { _user_id: userId, _dossier_id: o.dossierId });
    if (!ok) return "Sem acesso a este dossier.";
  }
  if (o.clientId && papel.role !== "admin") {
    const { data: ds } = await sb.from("dossiers").select("id").eq("client_id", o.clientId);
    let ok = false;
    for (const d of ds ?? []) {
      const { data } = await sb.rpc("can_access_dossier", { _user_id: userId, _dossier_id: d.id });
      if (data) { ok = true; break; }
    }
    if (!ok) return "Sem acesso a este cliente.";
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY não configurada nos secrets da function." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // 1. Validar o utilizador a partir do JWT enviado pelo cliente Supabase
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(jwt);

    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Confirmar que a conta está aprovada (mesma regra da RLS)
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("is_approved")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!profile?.is_approved) {
      return new Response(JSON.stringify({ error: "Conta não aprovada." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Ler o pedido
    const { dossierId, sectionId, prompt, sectionContext } = await req.json();
    { const e = await exigirEquipa(supabaseClient, userData.user.id, { dossierId }); if (e) return new Response(JSON.stringify({ error: e }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

    if (!prompt || !sectionId) {
      return new Response(JSON.stringify({ error: "prompt e sectionId são obrigatórios." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Chamar a API da Anthropic (chave só existe aqui, no servidor)
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: sectionContext
              ? `Contexto da secção do dossier de cibersegurança:\n${sectionContext}\n\nPedido: ${prompt}`
              : prompt,
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      return new Response(JSON.stringify({ error: "Erro na API Anthropic", details: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anthropicData = await anthropicResponse.json();
    const generatedText = anthropicData.content
      ?.filter((block: { type: string }) => block.type === "text")
      .map((block: { text: string }) => block.text)
      .join("\n") ?? "";

    // 5. Gravar o resultado na secção (via service role, respeitando o fluxo normal)
    if (dossierId) {
      await supabaseClient
        .from("dossier_sections")
        .update({ ai_generated_content: generatedText })
        .eq("id", sectionId)
        .eq("dossier_id", dossierId);
    }

    return new Response(JSON.stringify({ content: generatedText }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro interno.", details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
