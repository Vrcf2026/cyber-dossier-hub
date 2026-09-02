// supabase/functions/continuity-report/index.ts
// Gera PDF com todas as evidências de um cliente num período,
// tarefas em atraso, e resumo executivo gerado por IA.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { jsPDF } from "npm:jspdf@2.5.2";
import "npm:jspdf-autotable@3.8.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TYPE_LABELS: Record<string, string> = {
  backup_check: "Verificação de Backup",
  restore_test: "Teste de Restauro",
  patch_update: "Patches / Actualizações",
  log_review: "Revisão de Logs",
  vuln_scan: "Scan de Vulnerabilidades",
  access_review: "Revisão de Acessos",
  phishing_campaign: "Campanha de Phishing",
  ssl_renewal: "Renovação SSL",
  dossier_review: "Revisão do Dossier",
  incident: "Incidente",
  other: "Outro",
};

const RESULT_LABELS: Record<string, string> = {
  ok: "✓ OK",
  warning: "⚠ Alerta",
  fail: "✗ Falha",
  pending: "… Pendente",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Não autenticado." }), { status: 401, headers: cors });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return new Response(JSON.stringify({ error: "Sessão inválida." }), { status: 401, headers: cors });

    const { clientId, periodStart, periodEnd } = await req.json();
    if (!clientId || !periodStart || !periodEnd) {
      return new Response(JSON.stringify({ error: "clientId, periodStart e periodEnd são obrigatórios." }), { status: 400, headers: cors });
    }

    // Buscar dados
    const [{ data: client }, { data: evidences }, { data: overdueTasks }] = await Promise.all([
      sb.from("clients").select("name, nif, sector, email, contact_person").eq("id", clientId).single(),
      sb.from("client_evidences")
        .select("*, profiles(full_name)")
        .eq("client_id", clientId)
        .gte("evidence_date", periodStart)
        .lte("evidence_date", periodEnd)
        .order("evidence_date"),
      sb.from("client_tasks")
        .select("*")
        .eq("client_id", clientId)
        .eq("active", true)
        .lt("next_due", new Date().toISOString().split("T")[0]),
    ]);

    // Resumo executivo por IA
    const evidenceSummary = (evidences ?? []).map(e =>
      `${e.evidence_date} | ${TYPE_LABELS[e.evidence_type] ?? e.evidence_type} | ${RESULT_LABELS[e.result] ?? e.result} | ${e.title}${e.notes ? ` — ${e.notes}` : ""}`
    ).join("\n");

    const overdueList = (overdueTasks ?? []).map(t =>
      `${TYPE_LABELS[t.evidence_type] ?? t.evidence_type} (previsto: ${t.next_due})`
    ).join(", ");

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: `Escreve um parágrafo executivo conciso (máx. 120 palavras) para um relatório de continuidade de cibersegurança.
Cliente: ${client?.name} | Setor: ${client?.sector}
Período: ${periodStart} a ${periodEnd}
Evidências registadas (${(evidences ?? []).length}):
${evidenceSummary || "(nenhuma)"}
Tarefas em atraso: ${overdueList || "nenhuma"}
Tom profissional, português europeu. Não uses bullet points — só prosa. Não uses introdução como "Este relatório...".`,
        }],
      }),
    });
    const aiData = await aiRes.json();
    const executiveSummary = aiData.content?.[0]?.text ?? "Resumo não disponível.";

    // Construir PDF
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 40;
    const pageW = doc.internal.pageSize.getWidth();
    let y = margin;

    // Cabeçalho
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageW, 70, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Relatório de Continuidade de Cibersegurança", margin, 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`${client?.name ?? "Cliente"} | Período: ${periodStart} a ${periodEnd}`, margin, 48);
    doc.text(`VRCF – Informática & Segurança | valter@vrcf.pt`, margin, 62);
    doc.setTextColor(0, 0, 0);
    y = 90;

    // Info cliente
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text("Dados do Cliente", margin, y); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    if (client?.nif) { doc.text(`NIF: ${client.nif}`, margin, y); y += 12; }
    if (client?.sector) { doc.text(`Setor: ${client.sector}`, margin, y); y += 12; }
    if (client?.contact_person) { doc.text(`Contacto: ${client.contact_person}`, margin, y); y += 12; }
    y += 10;

    // Resumo executivo
    doc.setFillColor(241, 245, 249);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text("Resumo Executivo", margin, y); y += 14;
    doc.setFont("helvetica", "italic"); doc.setFontSize(9);
    const summaryLines = doc.splitTextToSize(executiveSummary, pageW - margin * 2);
    doc.text(summaryLines, margin, y);
    y += summaryLines.length * 12 + 16;

    // Métricas rápidas
    const counts = { ok: 0, warning: 0, fail: 0, pending: 0 };
    (evidences ?? []).forEach(e => { if (e.result in counts) counts[e.result as keyof typeof counts]++; });

    (doc as any).autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Total evidências", "✓ OK", "⚠ Alertas", "✗ Falhas", "Tarefas em atraso"]],
      body: [[(evidences ?? []).length, counts.ok, counts.warning, counts.fail, (overdueTasks ?? []).length]],
      styles: { fontSize: 10, cellPadding: 5, halign: "center" },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, halign: "center" },
      theme: "grid",
    });
    y = (doc as any).lastAutoTable.finalY + 20;

    // Tabela de evidências
    if ((evidences ?? []).length > 0) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(11);
      doc.text("Evidências Registadas", margin, y); y += 6;

      (doc as any).autoTable({
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Data", "Tipo", "Resultado", "Descrição", "Notas"]],
        body: (evidences ?? []).map(e => [
          e.evidence_date,
          TYPE_LABELS[e.evidence_type] ?? e.evidence_type,
          RESULT_LABELS[e.result] ?? e.result,
          e.title,
          e.notes ?? "",
        ]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [51, 65, 85], textColor: 255 },
        columnStyles: { 2: { halign: "center" } },
        didParseCell: (data: any) => {
          if (data.column.index === 2 && data.section === "body") {
            const result = (evidences ?? [])[data.row.index]?.result;
            if (result === "fail") data.cell.styles.textColor = [220, 38, 38];
            if (result === "warning") data.cell.styles.textColor = [180, 83, 9];
            if (result === "ok") data.cell.styles.textColor = [22, 101, 52];
          }
        },
        theme: "striped",
      });
      y = (doc as any).lastAutoTable.finalY + 20;
    }

    // Tarefas em atraso
    if ((overdueTasks ?? []).length > 0) {
      if (y > doc.internal.pageSize.getHeight() - 100) { doc.addPage(); y = margin; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(11);
      doc.setTextColor(220, 38, 38);
      doc.text("⚠ Tarefas em Atraso", margin, y);
      doc.setTextColor(0);
      y += 6;
      (doc as any).autoTable({
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Tarefa", "Frequência", "Estava previsto para", "Última vez feita"]],
        body: (overdueTasks ?? []).map(t => [
          t.title,
          t.frequency,
          t.next_due,
          t.last_done ?? "Nunca",
        ]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [185, 28, 28], textColor: 255 },
        theme: "striped",
      });
    }

    // Rodapé
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(150);
      doc.text(`VRCF – Informática & Segurança | Gerado em ${new Date().toLocaleDateString("pt-PT")} | Pág. ${i}/${pageCount}`, margin, doc.internal.pageSize.getHeight() - 20);
      doc.setTextColor(0);
    }

    const pdfBytes = doc.output("arraybuffer");
    return new Response(pdfBytes, {
      headers: {
        ...cors,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Relatorio_Continuidade_${(client?.name ?? "cliente").replace(/\s+/g, "_")}_${periodStart}.pdf"`,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
