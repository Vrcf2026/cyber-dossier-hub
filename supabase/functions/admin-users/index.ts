// supabase/functions/admin-users/index.ts
//
// Gestão de utilizadores, exclusiva de administradores.
// Ações: list, create, set_role, set_approved, set_client, grant_dossier, revoke_dossier, reset_mfa
//
// Exige sessão com verificação em dois passos (aal2): uma password roubada não chega para gerir contas.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Nível de autenticação do token. Só chamar DEPOIS de getUser() ter validado o token no servidor de auth. */
function aalDoToken(token: string): string | null {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))).aal ?? null;
  } catch { return null; }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado." }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Sessão inválida." }, 401);
    if (aalDoToken(token) !== "aal2") return json({ error: "Confirme a verificação em dois passos." }, 403);

    const callerId = userData.user.id;
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: callerId, _role: "admin" });
    if (!isAdmin) return json({ error: "Apenas administradores." }, 403);

    const { action, ...payload } = await req.json();

    switch (action) {
      case "list": {
        // Quem tem a verificação em dois passos configurada (fator TOTP verificado)
        const mfaPorUtilizador = new Map<string, boolean>();
        for (let page = 1; page <= 20; page++) {
          const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
          const lista = data?.users ?? [];
          for (const u of lista) mfaPorUtilizador.set(u.id, (u.factors ?? []).some((f: any) => f.status === "verified"));
          if (lista.length < 200) break;
        }
        const [{ data: profiles }, { data: roles }, { data: access }] = await Promise.all([
          admin.from("profiles").select("*").order("created_at"),
          admin.from("user_roles").select("user_id, role"),
          admin.from("dossier_access").select("user_id, dossier_id"),
        ]);
        return json({
          users: (profiles ?? []).map((p) => ({
            ...p,
            mfa: mfaPorUtilizador.get(p.user_id) ?? false,
            role: roles?.find((r) => r.user_id === p.user_id)?.role ?? "tecnico",
            dossier_ids: (access ?? []).filter((a) => a.user_id === p.user_id).map((a) => a.dossier_id),
          })),
        });
      }

      case "create": {
        const { email, password, full_name, role, client_id } = payload;
        if (!email || !password || !role) return json({ error: "Dados incompletos." }, 400);
        if (role === "cliente" && !client_id) return json({ error: "Conta de cliente precisa de um cliente associado." }, 400);

        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: full_name ?? email,
            role,
            client_id: client_id ?? null,
            created_by_admin: true,
          },
        });
        if (error) return json({ error: error.message }, 400);
        return json({ user_id: data.user?.id });
      }

      case "set_role": {
        const { user_id, role } = payload;
        if (user_id === callerId) return json({ error: "Não pode alterar o seu próprio papel." }, 400);
        await admin.from("user_roles").delete().eq("user_id", user_id);
        const { error } = await admin.from("user_roles").insert({ user_id, role });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      case "set_approved": {
        const { user_id, is_approved } = payload;
        if (user_id === callerId) return json({ error: "Não pode alterar o seu próprio estado." }, 400);
        const { error } = await admin.from("profiles").update({ is_approved }).eq("user_id", user_id);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      case "set_client": {
        const { user_id, client_id } = payload;
        const { error } = await admin.from("profiles").update({ client_id: client_id || null }).eq("user_id", user_id);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      case "grant_dossier": {
        const { user_id, dossier_id } = payload;
        const { error } = await admin.from("dossier_access").upsert(
          { user_id, dossier_id },
          { onConflict: "user_id,dossier_id" }
        );
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      case "revoke_dossier": {
        const { user_id, dossier_id } = payload;
        const { error } = await admin
          .from("dossier_access")
          .delete()
          .eq("user_id", user_id)
          .eq("dossier_id", dossier_id);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      case "reset_mfa": {
        // Telemóvel perdido: apaga os fatores; no próximo login a pessoa configura de novo.
        const { user_id } = payload;
        if (!user_id) return json({ error: "Dados incompletos." }, 400);
        if (user_id === callerId) return json({ error: "Peça a outro administrador para repor a sua verificação." }, 400);
        const { data: lista, error: errLista } = await admin.auth.admin.mfa.listFactors({ userId: user_id });
        if (errLista) return json({ error: errLista.message }, 400);
        for (const f of lista?.factors ?? []) {
          const { error } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: user_id });
          if (error) return json({ error: error.message }, 400);
        }
        return json({ ok: true, removidos: lista?.factors?.length ?? 0 });
      }

      default:
        return json({ error: "Ação desconhecida." }, 400);
    }
  } catch (err) {
    return json({ error: "Erro interno.", details: String(err) }, 500);
  }
});
