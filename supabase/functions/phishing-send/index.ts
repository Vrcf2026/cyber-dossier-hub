// supabase/functions/phishing-send/index.ts
//
// Envia os emails da campanha via Resend, com um link único e
// silencioso por destinatário (aponta para phishing-track).
//
// Pré-requisito: secret RESEND_API_KEY definido, e domínio de
// envio (ex: alertas@vrcf.pt) verificado no Resend.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL = Deno.env.get("PHISHING_FROM_EMAIL") || "alertas@vrcf.pt";

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

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY não configurada." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { clientId, dossierId, theme, subject, bodyHtml, baitType, emails, fromName } = await req.json();

    if (!subject || !bodyHtml || !Array.isArray(emails) || emails.length === 0) {
      return new Response(JSON.stringify({ error: "subject, bodyHtml e emails[] são obrigatórios." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Criar a campanha
    const { data: campaign, error: campaignError } = await supabaseClient
      .from("phishing_campaigns")
      .insert({
        client_id: clientId ?? null,
        dossier_id: dossierId ?? null,
        theme: theme ?? null,
        subject,
        body_html: bodyHtml,
        bait_type: baitType ?? "link",
        from_name: fromName ?? null,
        created_by: userData.user.id,
      })
      .select()
      .single();

    if (campaignError) {
      return new Response(JSON.stringify({ error: "Erro ao criar campanha.", details: campaignError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Para cada email: criar alvo com token único, enviar via Resend
    const results = [];
    for (const email of emails) {
      const { data: target, error: targetError } = await supabaseClient
        .from("phishing_targets")
        .insert({ campaign_id: campaign.id, email })
        .select()
        .single();

      if (targetError || !target) {
        results.push({ email, sent: false, error: targetError?.message });
        continue;
      }

      const trackingLink = `${SUPABASE_URL}/functions/v1/phishing-track?t=${target.token}`;
      const personalizedBody = bodyHtml.replaceAll("{{LINK}}", trackingLink);

      const fromHeader = fromName ? `${fromName} <${FROM_EMAIL}>` : FROM_EMAIL;

      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromHeader,
          to: email,
          subject,
          html: personalizedBody,
        }),
      });

      if (resendResponse.ok) {
        await supabaseClient
          .from("phishing_targets")
          .update({ sent_at: new Date().toISOString() })
          .eq("id", target.id);
        results.push({ email, sent: true });
      } else {
        const errText = await resendResponse.text();
        results.push({ email, sent: false, error: errText });
      }
    }

    return new Response(JSON.stringify({ campaignId: campaign.id, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro interno.", details: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
