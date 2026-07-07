// supabase/functions/phishing-track/index.ts
//
// Endpoint PÚBLICO (sem autenticação) — é para aqui que apontam os
// links dos emails de teste. Regista a tentativa e responde sempre
// 204 No Content: sem HTML, sem texto, sem redirecionamento. Não
// existe qualquer sinal visível de que algo aconteceu.
//
// IMPORTANTE: esta function tem de ser marcada como pública no
// config.toml do Supabase, com:
//
//   [functions.phishing-track]
//   verify_jwt = false
//
// Caso contrário o Supabase exige um token de autenticação, que o
// alvo (que não tem conta na app) nunca vai ter.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  // Responde sempre 204, mesmo em caso de erro — nunca revelar
  // nada ao alvo através da resposta.
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("t");

    if (token) {
      const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: target } = await supabaseClient
        .from("phishing_targets")
        .select("id")
        .eq("token", token)
        .maybeSingle();

      if (target) {
        await supabaseClient.from("phishing_clicks").insert({ target_id: target.id });
      }
    }
  } catch (_err) {
    // Silencioso de propósito — nunca deixar um erro vazar para a resposta.
  }

  return new Response(null, { status: 204 });
});
