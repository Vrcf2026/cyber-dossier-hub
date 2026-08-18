// supabase/functions/client-offboard/index.ts
//
// Botão "Encerrar Cliente": gera um PDF com TUDO o que existe sobre
// o cliente (todos os dossiers, todas as secções — incluindo as
// internas — e as folhas de credenciais de cada dossier), guarda
// uma cópia no bucket privado "client-archives", devolve o PDF para
// download imediato, e só depois elimina o cliente (cascata apaga
// dossiers/secções/credenciais associados).
//
// Proteções:
//  - Requer JWT válido de utilizador aprovado E com role 'admin'.
//  - Requer reautenticação por password no frontend antes de chamar
//    esta função (ver ClientDetail.tsx) — a função em si confirma
//    apenas admin + nome do cliente escrito corretamente.
//  - Nunca elimina sem primeiro conseguir gerar e arquivar o PDF.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { jsPDF } from "npm:jspdf@2.5.2";
import "npm:jspdf-autotable@3.8.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonError(msg: string, status: number, details?: unknown) {
  return new Response(JSON.stringify({ error: msg, details }), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// --- Escreve markdown simples (o mesmo formato usado no export docx)
// no PDF: títulos #, tabelas |...|, listas -, negrito **, parágrafos.
function writeMarkdown(doc: jsPDF, markdown: string, startY: number, margin: number): number {
  let y = startY;
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - margin * 2;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const stripBold = (s: string) => s.replace(/\*\*(.*?)\*\*/g, "$1");

  const lines = markdown.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }

    // Tabela markdown
    if (line.startsWith("|") && lines[i + 1]?.trim().match(/^\|?[\s:|-]+\|?$/)) {
      const header = line.split("|").map((c) => c.trim()).filter((c) => c.length > 0);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim().startsWith("|")) {
        rows.push(lines[j].split("|").map((c) => stripBold(c.trim())).slice(1, -1));
        j++;
      }
      ensureSpace(30);
      (doc as any).autoTable({
        startY: y,
        margin: { left: margin, right: margin },
        head: [header],
        body: rows,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [217, 217, 217], textColor: 20 },
        theme: "grid",
      });
      y = (doc as any).lastAutoTable.finalY + 10;
      i = j;
      continue;
    }

    // Cabeçalho
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headingMatch) {
      ensureSpace(20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(headingMatch[1].length === 1 ? 13 : 11);
      const text = doc.splitTextToSize(headingMatch[2], maxWidth);
      doc.text(text, margin, y);
      y += text.length * 6 + 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      i++;
      continue;
    }

    // Lista
    if (line.startsWith("- ") || line.startsWith("* ")) {
      ensureSpace(12);
      doc.setFontSize(10);
      const text = doc.splitTextToSize(`•  ${stripBold(line.slice(2))}`, maxWidth - 4);
      doc.text(text, margin + 2, y);
      y += text.length * 5 + 2;
      i++;
      continue;
    }

    // Parágrafo normal
    ensureSpace(12);
    doc.setFontSize(10);
    const text = doc.splitTextToSize(stripBold(line), maxWidth);
    doc.text(text, margin, y);
    y += text.length * 5 + 4;
    i++;
  }

  return y;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonError("Não autenticado.", 401);

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(jwt);
    if (userError || !userData?.user) return jsonError("Sessão inválida.", 401);

    const { data: profile } = await supabaseClient
      .from("profiles").select("is_approved").eq("user_id", userData.user.id).maybeSingle();
    if (!profile?.is_approved) return jsonError("Conta não aprovada.", 403);

    const { data: roleRow } = await supabaseClient
      .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return jsonError("Só um administrador pode encerrar um cliente.", 403);

    const { clientId, confirmName } = await req.json();
    if (!clientId || !confirmName) return jsonError("clientId e confirmName são obrigatórios.", 400);

    const { data: client } = await supabaseClient.from("clients").select("*").eq("id", clientId).single();
    if (!client) return jsonError("Cliente não encontrado.", 404);
    if (confirmName.trim().toLowerCase() !== client.name.trim().toLowerCase()) {
      return jsonError("O nome escrito não corresponde ao nome do cliente.", 400);
    }

    const { data: dossiers } = await supabaseClient
      .from("dossiers").select("*").eq("client_id", clientId).order("created_at");

    // --- Construir o PDF ---
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 40;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Arquivo Completo do Cliente", margin, 60);
    doc.setFontSize(13);
    doc.text(client.name, margin, 82);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(
      `Gerado em ${new Date().toLocaleString("pt-PT")} — cópia de arquivo antes do encerramento da relação com o cliente.`,
      margin, 98
    );
    doc.setTextColor(0);
    doc.setFont("helvetica", "normal");

    let y = 130;
    doc.setFontSize(10);
    const clientLines = [
      client.nif ? `NIF: ${client.nif}` : null,
      client.sector ? `Setor: ${client.sector}` : null,
      client.email ? `Email: ${client.email}` : null,
      client.phone ? `Telefone: ${client.phone}` : null,
      client.address ? `Morada: ${client.address}` : null,
      client.contact_person ? `Contacto: ${client.contact_person}` : null,
      client.num_employees ? `Colaboradores: ${client.num_employees}` : null,
    ].filter(Boolean) as string[];
    for (const l of clientLines) { doc.text(l, margin, y); y += 14; }

    for (const dossier of dossiers ?? []) {
      doc.addPage();
      y = margin;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(`Dossier: ${dossier.title}`, margin, y);
      y += 20;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(`Estado: ${dossier.status}  |  Criado em: ${new Date(dossier.created_at).toLocaleDateString("pt-PT")}`, margin, y);
      doc.setTextColor(0);
      y += 20;

      const { data: sections } = await supabaseClient
        .from("dossier_sections").select("*").eq("dossier_id", dossier.id).order("section_number");

      for (const s of sections ?? []) {
        if (y > doc.internal.pageSize.getHeight() - margin - 40) { doc.addPage(); y = margin; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text(`${s.section_number}. ${s.section_name}`, margin, y);
        y += 16;
        doc.setFont("helvetica", "normal");
        if (s.ai_generated_content) {
          y = writeMarkdown(doc, s.ai_generated_content, y, margin);
        } else {
          doc.setFontSize(9);
          doc.setTextColor(150);
          doc.text("[Secção não preenchida]", margin, y);
          doc.setTextColor(0);
          y += 16;
        }
        y += 10;
      }

      // Credenciais deste dossier — junto no arquivo interno (o PDF fica
      // no bucket privado, não é isto que se entrega ao cliente).
      const { data: creds } = await supabaseClient
        .from("dossier_credentials").select("*").eq("dossier_id", dossier.id).maybeSingle();
      const entries = (creds?.entries as any[]) ?? [];
      if (entries.length > 0) {
        doc.addPage();
        y = margin;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(192, 57, 43);
        doc.text("Folha de Credenciais (CONFIDENCIAL)", margin, y);
        doc.setTextColor(0);
        y += 20;
        (doc as any).autoTable({
          startY: y,
          margin: { left: margin, right: margin },
          head: [["Sistema/Serviço", "IP/URL", "Utilizador", "Password", "Observações"]],
          body: entries.map((e) => [e.sistema ?? "", e.ip_url ?? "", e.utilizador ?? "", e.password ?? "", e.observacoes ?? ""]),
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { fillColor: [192, 57, 43], textColor: 255 },
          theme: "grid",
        });
      }
    }

    const pdfBytes = doc.output("arraybuffer");
    const safeName = client.name.replace(/[^a-zA-Z0-9]+/g, "_");
    const archivePath = `${clientId}/${Date.now()}_${safeName}.pdf`;

    // 1) Arquivar primeiro — só avançamos para o apagar se isto correr bem.
    const { error: uploadError } = await supabaseClient
      .storage.from("client-archives")
      .upload(archivePath, new Uint8Array(pdfBytes), { contentType: "application/pdf" });
    if (uploadError) {
      return jsonError("Falha ao arquivar o PDF — cliente NÃO foi eliminado.", 500, uploadError.message);
    }

    // 2) Eliminar o cliente (cascata trata de dossiers/secções/credenciais).
    const { error: deleteError } = await supabaseClient.from("clients").delete().eq("id", clientId);
    if (deleteError) {
      return jsonError("PDF arquivado, mas falhou eliminar o cliente. Tenta novamente.", 500, deleteError.message);
    }

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Arquivo_${safeName}.pdf"`,
        "X-Archive-Path": archivePath,
      },
    });
  } catch (err) {
    return jsonError("Erro interno.", 500, String(err));
  }
});
