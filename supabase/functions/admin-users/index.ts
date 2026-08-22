// supabase/functions/admin-users/index.ts
//
// Gestão de utilizadores, exclusiva de administradores.
// Ações: list, create, set_role, set_approved, set_client, grant_dossier, revoke_dossier

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const { data: userData, error: userErr } = await admin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userErr || !userData?.user) return json({ error: "Sessão inválida." }, 401);

    const callerId = userData.user.id;
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: callerId, _role: "admin" });
    if (!isAdmin) return json({ error: "Apenas administradores." }, 403);

    const { action, ...payload } = await req.json();

    switch (action) {
      case "list": {
        const [{ data: profiles }, { data: roles }, { data: access }] = await Promise.all([
          admin.from("profiles").select("*").order("created_at"),
          admin.from("user_roles").select("user_id, role"),
          admin.from("dossier_access").select("user_id, dossier_id"),
        ]);
        return json({
          users: (profiles ?? []).map((p) => ({
            ...p,
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

      default:
        return json({ error: "Ação desconhecida." }, 400);
    }
  } catch (err) {
    return json({ error: "Erro interno.", details: String(err) }, 500);
  }
});
