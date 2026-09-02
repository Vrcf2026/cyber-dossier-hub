// supabase/functions/send-monthly-report/index.ts
// Envia o relatório mensal de continuidade por email (PDF em anexo)
// directamente para o contacto do cliente via Resend.
// Chamado manualmente pelo staff ou por cron mensal.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { jsPDF } from "npm:jspdf@2.5.2";
import "npm:jspdf-autotable@3.8.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("NOTIFY_FROM_EMAIL") || "alertas@vrcf.pt";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const TYPE_LABELS: Record<string, string> = {
  backup_check: "Verificação de Backup", restore_test: "Teste de Restauro",
  patch_update: "Patches", log_review: "Revisão de Logs", vuln_scan: "Scan Vulnerabilidades",
  access_review: "Revisão de Acessos", phishing_campaign: "Phishing", ssl_renewal: "SSL",
  dossier_review: "Revisão do Dossier", incident: "Incidente", other: "Outro",
};

const RESULT_LABELS: Record<string, string> = { ok: "✓ OK", warning: "⚠ Alerta", fail: "✗ Falha", pending: "Pendente" };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Não autenticado." }), { status: 401, headers: cors });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return new Response(JSON.stringify({ error: "Sessão inválida." }), { status: 401, headers: cors });

    const { clientId, periodStart, periodEnd, recipientEmail, recipientName } = await req.json();
    if (!clientId || !periodStart || !periodEnd || !recipientEmail) {
      return new Response(JSON.stringify({ error: "clientId, periodStart, periodEnd e recipientEmail são obrigatórios." }), { status: 400, headers: cors });
    }

    const [{ data: client }, { data: evidences }, { data: overdueTasks }] = await Promise.all([
      sb.from("clients").select("name, nif, sector, contact_person").eq("id", clientId).single(),
      sb.from("client_evidences").select("*").eq("client_id", clientId)
        .gte("evidence_date", periodStart).lte("evidence_date", periodEnd).order("evidence_date"),
      sb.from("client_tasks").select("*").eq("client_id", clientId).eq("active", true)
        .lt("next_due", new Date().toISOString().split("T")[0]),
    ]);

    // Resumo executivo por IA
    const evSummary = (evidences ?? []).map(e =>
      `${e.evidence_date} | ${TYPE_LABELS[e.evidence_type]} | ${RESULT_LABELS[e.result]} | ${e.title}`
    ).join("\n") || "(nenhuma evidência no período)";

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6", max_tokens: 400,
        messages: [{ role: "user", content: `Escreve um parágrafo executivo conciso (máx. 80 palavras) para email ao cliente sobre o trabalho de cibersegurança realizado. Cliente: ${client?.name}, Setor: ${client?.sector}. Período: ${periodStart} a ${periodEnd}. Evidências: ${evSummary}. Tarefas em atraso: ${overdueTasks?.length ?? 0}. Tom: profissional, directo, transmite confiança. Português europeu. Só o parágrafo, sem título.` }],
      }),
    });
    const aiData = await aiRes.json();
    const summary = aiData.content?.[0]?.text ?? "";

    // Gerar PDF
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 40; const pageW = doc.internal.pageSize.getWidth();
    doc.setFillColor(30, 41, 59); doc.rect(0, 0, pageW, 60, "F");
    doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(14);
    doc.text("Relatório de Manutenção de Cibersegurança", margin, 25);
    doc.setFont("helvetica","normal"); doc.setFontSize(10);
    doc.text(`${client?.name ?? ""} | ${periodStart} a ${periodEnd}`, margin, 45);
    doc.setTextColor(0);

    let y = 80;
    doc.setFont("helvetica","italic"); doc.setFontSize(10);
    const sumLines = doc.splitTextToSize(summary, pageW - margin * 2);
    doc.text(sumLines, margin, y); y += sumLines.length * 14 + 20;

    const counts = { ok: 0, warning: 0, fail: 0 };
    (evidences ?? []).forEach(e => { if (e.result in counts) counts[e.result as keyof typeof counts]++; });

    (doc as any).autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [["Evidências", "✓ OK", "⚠ Alertas", "✗ Falhas", "Tarefas em atraso"]],
      body: [[(evidences ?? []).length, counts.ok, counts.warning, counts.fail, (overdueTasks ?? []).length]],
      styles: { fontSize: 10, cellPadding: 5, halign: "center" },
      headStyles: { fillColor: [30,41,59], textColor: 255, halign: "center" }, theme: "grid",
    });
    y = (doc as any).lastAutoTable.finalY + 16;

    if ((evidences ?? []).length > 0) {
      (doc as any).autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [["Data","Tipo","Resultado","Descrição"]],
        body: (evidences ?? []).map(e => [e.evidence_date, TYPE_LABELS[e.evidence_type] ?? e.evidence_type, RESULT_LABELS[e.result] ?? e.result, e.title]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [51,65,85], textColor: 255 }, theme: "striped",
      });
    }

    const pdfBytes = doc.output("arraybuffer");
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)));
    const safeName = (client?.name ?? "cliente").replace(/\s+/g,"_");
    const fileName = `Relatorio_${safeName}_${periodStart}.pdf`;

    // Enviar por email com PDF em anexo via Resend
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `VRCF – Informática & Segurança <${FROM_EMAIL}>`,
        to: recipientEmail,
        subject: `Relatório de Manutenção de Cibersegurança — ${periodStart} a ${periodEnd}`,
        html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <div style="background:#1e293b;padding:24px;border-radius:8px;margin-bottom:24px">
            <h1 style="color:#fff;margin:0;font-size:18px">Relatório de Manutenção</h1>
            <p style="color:#94a3b8;margin:4px 0 0;font-size:13px">${client?.name} · ${periodStart} a ${periodEnd}</p>
          </div>
          <p style="color:#475569">Caro${recipientName ? ` ${recipientName}` : ""},</p>
          <p style="color:#475569">${summary}</p>
          <p style="color:#475569">Em anexo encontra o relatório completo com todas as evidências do período.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
          <p style="color:#94a3b8;font-size:12px">VRCF – Informática & Segurança | valter@vrcf.pt | 961 000 000</p>
        </body></html>`,
        attachments: [{ filename: fileName, content: pdfBase64 }],
      }),
    });

    if (!emailRes.ok) throw new Error(await emailRes.text());

    return new Response(JSON.stringify({ ok: true, emailSentTo: recipientEmail }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
