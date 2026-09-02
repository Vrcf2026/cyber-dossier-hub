// supabase/functions/notify-overdue/index.ts
// Cron job diário: envia email com resumo de tarefas em atraso.
// Configurar no Supabase como scheduled function (cron: "0 8 * * 1-5")
// para correr de seg a sex às 8h00.
// Usa o Supabase Auth email (não requer SMTP externo).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const TYPE_LABELS: Record<string, string> = {
  backup_check: "Verificação de Backup", restore_test: "Teste de Restauro",
  patch_update: "Patches", log_review: "Revisão de Logs", vuln_scan: "Scan de Vulnerabilidades",
  access_review: "Revisão de Acessos", phishing_campaign: "Phishing", ssl_renewal: "SSL",
  dossier_review: "Revisão do Dossier", incident: "Incidente", other: "Outro",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 864e5).toISOString().split("T")[0];

    // Buscar utilizadores com alertas activos (staff aprovado)
    const { data: users } = await sb.from("profiles")
      .select("user_id, full_name")
      .eq("is_approved", true);

    if (!users || users.length === 0) return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: cors });

    // Buscar tarefas em atraso globais
    const { data: overdue } = await sb.from("client_tasks")
      .select("*, clients(name)")
      .eq("active", true)
      .lt("next_due", today)
      .order("next_due");

    // Buscar tarefas que vencem amanhã
    const { data: tomorrow_tasks } = await sb.from("client_tasks")
      .select("*, clients(name)")
      .eq("active", true)
      .eq("next_due", tomorrow);

    if ((!overdue || overdue.length === 0) && (!tomorrow_tasks || tomorrow_tasks.length === 0)) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "nothing_pending" }), { headers: cors });
    }

    let emailsSent = 0;

    for (const u of users) {
      const { data: settings } = await sb.from("notification_settings")
        .select("*").eq("user_id", u.user_id).maybeSingle();

      if (!settings?.email_alerts_enabled) continue;

      // Buscar email do utilizador
      const { data: authUser } = await sb.auth.admin.getUserById(u.user_id);
      const email = authUser.user?.email;
      if (!email) continue;

      // Construir email HTML
      let body = `<h2 style="color:#1e293b">VRCF — Alertas de Manutenção</h2>`;
      body += `<p style="color:#64748b">${new Date().toLocaleDateString("pt-PT", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>`;

      if (overdue && overdue.length > 0) {
        body += `<h3 style="color:#dc2626">⚠️ ${overdue.length} tarefa(s) em atraso</h3><table style="width:100%;border-collapse:collapse">`;
        body += `<tr style="background:#fee2e2"><th style="padding:8px;text-align:left">Cliente</th><th style="padding:8px;text-align:left">Tarefa</th><th style="padding:8px;text-align:left">Tipo</th><th style="padding:8px;text-align:left">Previsto</th></tr>`;
        for (const t of overdue) {
          const daysLate = Math.ceil((Date.now() - new Date(t.next_due).getTime()) / 864e5);
          body += `<tr style="border-bottom:1px solid #fecaca">
            <td style="padding:8px">${(t.clients as any)?.name ?? "—"}</td>
            <td style="padding:8px">${t.title}</td>
            <td style="padding:8px">${TYPE_LABELS[t.evidence_type] ?? t.evidence_type}</td>
            <td style="padding:8px;color:#dc2626">${t.next_due} (${daysLate}d atraso)</td>
          </tr>`;
        }
        body += `</table>`;
      }

      if (tomorrow_tasks && tomorrow_tasks.length > 0) {
        body += `<h3 style="color:#d97706">📅 ${tomorrow_tasks.length} tarefa(s) para amanhã</h3><ul>`;
        for (const t of tomorrow_tasks) {
          body += `<li>${(t.clients as any)?.name} — ${t.title} (${TYPE_LABELS[t.evidence_type] ?? t.evidence_type})</li>`;
        }
        body += `</ul>`;
      }

      body += `<hr style="margin:24px 0"><p style="color:#94a3b8;font-size:12px">VRCF – Informática &amp; Segurança | valter@vrcf.pt<br>Para gerir as tuas notificações, abre a app e vai a Empresa → Notificações.</p>`;

      // Enviar via Supabase Auth (usa o SMTP configurado no projecto)
      await fetch(`${SUPABASE_URL}/auth/v1/admin/email`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", "apikey": SUPABASE_SERVICE_ROLE_KEY },
        body: JSON.stringify({
          email,
          subject: overdue && overdue.length > 0
            ? `⚠️ ${overdue.length} tarefa(s) em atraso — VRCF CyberDossier`
            : `📅 Lembrete de manutenção amanhã — VRCF CyberDossier`,
          body_html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">${body}</body></html>`,
        }),
      });

      emailsSent++;
    }

    return new Response(JSON.stringify({ ok: true, sent: emailsSent }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
