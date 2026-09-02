// supabase/functions/notify-overdue/index.ts
// Cron job diário (seg-sex 08:00): envia via Resend o resumo de tarefas
// em atraso e lembretes do dia seguinte, com email HTML profissional.
// Configurar no Supabase: Cron → "0 8 * * 1-5" → /notify-overdue
//
// Secrets necessários: RESEND_API_KEY, NOTIFY_FROM_EMAIL (ex: alertas@vrcf.pt)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("NOTIFY_FROM_EMAIL") || "alertas@vrcf.pt";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const TYPE_LABELS: Record<string, string> = {
  backup_check: "Verificação de Backup", restore_test: "Teste de Restauro",
  patch_update: "Patches / Actualizações", log_review: "Revisão de Logs",
  vuln_scan: "Scan de Vulnerabilidades", access_review: "Revisão de Acessos",
  phishing_campaign: "Campanha de Phishing", ssl_renewal: "Renovação SSL",
  dossier_review: "Revisão do Dossier", incident: "Incidente", other: "Outro",
};

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `VRCF CyberDossier <${FROM_EMAIL}>`, to, subject, html }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function buildEmailHtml(
  overdue: any[], tomorrow: any[], date: string, recipientName: string
): string {
  const hasOverdue = overdue.length > 0;
  const hasTomorrow = tomorrow.length > 0;

  const tableRow = (t: any, isOverdue: boolean) => {
    const daysLate = isOverdue
      ? Math.ceil((Date.now() - new Date(t.next_due).getTime()) / 864e5)
      : null;
    return `
      <tr style="border-bottom:1px solid #e2e8f0">
        <td style="padding:10px 12px;font-weight:500">${(t.clients as any)?.name ?? "—"}</td>
        <td style="padding:10px 12px">${t.title}</td>
        <td style="padding:10px 12px;color:#64748b">${TYPE_LABELS[t.evidence_type] ?? t.evidence_type}</td>
        <td style="padding:10px 12px;color:${isOverdue ? "#dc2626" : "#d97706"};font-weight:500">
          ${t.next_due}${daysLate ? ` <span style="font-size:12px">(${daysLate}d atraso)</span>` : ""}
        </td>
      </tr>`;
  };

  return `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
      
      <!-- Cabeçalho -->
      <tr><td style="background:#1e293b;padding:24px 32px">
        <p style="margin:0;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.05em">VRCF – Informática &amp; Segurança</p>
        <h1 style="margin:4px 0 0;color:#ffffff;font-size:20px;font-weight:600">
          ${hasOverdue ? "⚠️ Alertas de manutenção" : "📅 Lembretes para amanhã"}
        </h1>
        <p style="margin:6px 0 0;color:#94a3b8;font-size:14px">${date}</p>
      </td></tr>

      <!-- Corpo -->
      <tr><td style="padding:32px">
        <p style="margin:0 0 24px;color:#475569;font-size:15px">Olá${recipientName ? ` ${recipientName}` : ""},</p>

        ${hasOverdue ? `
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin-bottom:24px">
          <p style="margin:0 0 4px;font-weight:600;color:#dc2626;font-size:15px">
            ${overdue.length} tarefa${overdue.length > 1 ? "s" : ""} em atraso
          </p>
          <p style="margin:0;color:#7f1d1d;font-size:13px">Regista as evidências o mais brevemente possível para manter o histórico de conformidade.</p>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px">
          <tr style="background:#fef2f2">
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase">Cliente</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase">Tarefa</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase">Tipo</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase">Previsto</th>
          </tr>
          ${overdue.map(t => tableRow(t, true)).join("")}
        </table>` : ""}

        ${hasTomorrow ? `
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;margin-bottom:24px">
          <p style="margin:0 0 4px;font-weight:600;color:#d97706;font-size:15px">
            ${tomorrow.length} tarefa${tomorrow.length > 1 ? "s" : ""} para amanhã
          </p>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px">
          <tr style="background:#fffbeb">
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase">Cliente</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase">Tarefa</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase">Tipo</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase">Data</th>
          </tr>
          ${tomorrow.map(t => tableRow(t, false)).join("")}
        </table>` : ""}

        <a href="${SUPABASE_URL.replace("https://", "https://app.")}/continuidade" 
           style="display:inline-block;background:#1e293b;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px">
          Ver na app →
        </a>
      </td></tr>

      <!-- Rodapé -->
      <tr><td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0">
        <p style="margin:0;color:#94a3b8;font-size:12px">
          VRCF – Informática &amp; Segurança | valter@vrcf.pt<br>
          Para gerir as tuas notificações, abre a app → Empresa → Notificações.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY não configurada.");

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 864e5).toISOString().split("T")[0];
    const dateStr = new Date().toLocaleDateString("pt-PT", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const { data: overdueAll } = await sb.from("client_tasks")
      .select("*, clients(name, id)").eq("active", true).lt("next_due", today).order("next_due");

    const { data: tomorrowAll } = await sb.from("client_tasks")
      .select("*, clients(name, id)").eq("active", true).eq("next_due", tomorrow);

    if ((!overdueAll || overdueAll.length === 0) && (!tomorrowAll || tomorrowAll.length === 0)) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "nothing_pending" }), { headers: cors });
    }

    const { data: staff } = await sb.from("profiles").select("user_id, full_name").eq("is_approved", true);

    let sent = 0;
    for (const s of (staff ?? [])) {
      const { data: settings } = await sb.from("notification_settings")
        .select("*").eq("user_id", s.user_id).maybeSingle();
      if (settings && !settings.email_alerts_enabled) continue;

      const { data: authUser } = await sb.auth.admin.getUserById(s.user_id);
      const email = authUser.user?.email;
      if (!email) continue;

      const subject = overdueAll && overdueAll.length > 0
        ? `⚠️ ${overdueAll.length} tarefa(s) em atraso — CyberDossier VRCF`
        : `📅 ${tomorrowAll?.length} tarefa(s) para amanhã — CyberDossier VRCF`;

      const html = buildEmailHtml(overdueAll ?? [], tomorrowAll ?? [], dateStr, s.full_name ?? "");
      await sendEmail(email, subject, html);
      sent++;
    }

    return new Response(JSON.stringify({ ok: true, sent }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
