// supabase/functions/dossier-export/index.ts
//
// Gera o documento Word final do dossier, em 3 variantes:
// "cliente" (só secções visíveis ao cliente), "tecnico" (todas),
// "credenciais" (folha à parte, nunca junta com as outras).
//
// Devolve o ficheiro .docx diretamente (binário), não JSON.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType,
} from "npm:docx@8.5.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- Conversor simples de markdown (o formato em que a IA escreve
// o conteúdo das secções) para parágrafos/tabelas do docx ---
function parseInlineBold(text: string): TextRun[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return new TextRun({ text: part.slice(2, -2), bold: true });
    }
    return new TextRun({ text: part });
  });
}

function markdownToDocxBlocks(markdown: string): (Paragraph | Table)[] {
  const lines = markdown.split("\n");
  const blocks: (Paragraph | Table)[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line) { i++; continue; }

    // Tabela markdown: linha com | ... | seguida de linha separadora ---
    if (line.startsWith("|") && lines[i + 1]?.trim().match(/^\|?[\s:|-]+\|?$/)) {
      const headerCells = line.split("|").map((c) => c.trim()).filter((c) => c.length > 0);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim().startsWith("|")) {
        const cells = lines[j].split("|").map((c) => c.trim()).filter((_, idx, arr) => !(idx === 0 && arr[0] === "") && !(idx === arr.length - 1 && arr[arr.length - 1] === ""));
        rows.push(lines[j].split("|").map((c) => c.trim()).slice(1, -1));
        j++;
      }
      const colWidth = Math.floor(9000 / headerCells.length);
      const headerRow = new TableRow({
        children: headerCells.map((h) => new TableCell({
          width: { size: colWidth, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: "D9D9D9" },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
        })),
      });
      const bodyRows = rows.map((r) => new TableRow({
        children: r.map((c) => new TableCell({
          width: { size: colWidth, type: WidthType.DXA },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({ children: parseInlineBold(c) })],
        })),
      }));
      blocks.push(new Table({ width: { size: 9000, type: WidthType.DXA }, rows: [headerRow, ...bodyRows] }));
      blocks.push(new Paragraph({ text: "", spacing: { after: 150 } }));
      i = j;
      continue;
    }

    // Cabeçalhos markdown (#, ##, ###)
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(new Paragraph({
        heading: level === 1 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: headingMatch[2], bold: true })],
      }));
      i++;
      continue;
    }

    // Lista com "- " ou "* "
    if (line.startsWith("- ") || line.startsWith("* ")) {
      blocks.push(new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: "•  " }), ...parseInlineBold(line.slice(2))],
      }));
      i++;
      continue;
    }

    // Parágrafo normal
    blocks.push(new Paragraph({ spacing: { after: 120 }, children: parseInlineBold(line) }));
    i++;
  }

  return blocks;
}

function buildHeader(title: string, clientName: string, subtitle: string) {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: title, bold: true, size: 32 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: clientName, size: 24 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [new TextRun({ text: subtitle, italics: true, size: 18, color: "666666" })],
    }),
  ];
}

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

    const url = new URL(req.url);
    const dossierId = url.searchParams.get("dossierId");
    const variant = url.searchParams.get("variant") || "cliente"; // cliente | tecnico | credenciais

    if (!dossierId) {
      return new Response(JSON.stringify({ error: "dossierId é obrigatório." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: dossier } = await supabaseClient
      .from("dossiers").select("*, clients(*)").eq("id", dossierId).single();
    if (!dossier) {
      return new Response(JSON.stringify({ error: "Dossier não encontrado." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const client = (dossier as any).clients;

    let doc: Document;
    let filename: string;

    if (variant === "credenciais") {
      const { data: creds } = await supabaseClient
        .from("dossier_credentials").select("*").eq("dossier_id", dossierId).maybeSingle();
      const entries = (creds?.entries as any[]) ?? [];

      const colWidth = 1800;
      const headerRow = new TableRow({
        children: ["Sistema/Serviço", "IP/URL", "Utilizador", "Password", "Observações"].map((h) =>
          new TableCell({
            width: { size: colWidth, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: "D9D9D9" },
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
          })
        ),
      });
      const bodyRows = entries.map((e) => new TableRow({
        children: [e.sistema, e.ip_url, e.utilizador, e.password, e.observacoes].map((v) =>
          new TableCell({
            width: { size: colWidth, type: WidthType.DXA },
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [new Paragraph({ children: [new TextRun({ text: v || "" })] })],
          })
        ),
      }));

      doc = new Document({
        sections: [{
          children: [
            ...buildHeader("FOLHA DE CREDENCIAIS", client?.name ?? "", "CONFIDENCIAL — ACESSO RESTRITO AO ADMINISTRADOR"),
            new Paragraph({
              spacing: { after: 200 },
              border: { top: { style: BorderStyle.SINGLE, size: 6, color: "C0392B" }, bottom: { style: BorderStyle.SINGLE, size: 6, color: "C0392B" } },
              children: [new TextRun({ text: "Este documento não faz parte do dossier principal e não deve circular com o mesmo.", bold: true, color: "C0392B" })],
            }),
            new Table({ width: { size: 9000, type: WidthType.DXA }, rows: [headerRow, ...bodyRows] }),
          ],
        }],
      });
      filename = `Credenciais_${(client?.name ?? "cliente").replace(/\s+/g, "_")}.docx`;
    } else {
      const { data: sections } = await supabaseClient
        .from("dossier_sections")
        .select("*")
        .eq("dossier_id", dossierId)
        .order("section_number");

      const filtered = (sections ?? []).filter((s) => variant === "tecnico" || s.client_visible);

      const sectionBlocks = filtered.flatMap((s) => [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 150 },
          children: [new TextRun({ text: `${s.section_number}. ${s.section_name}`, bold: true })],
        }),
        ...(s.ai_generated_content
          ? markdownToDocxBlocks(s.ai_generated_content)
          : [new Paragraph({ children: [new TextRun({ text: "[Secção ainda por preencher]", italics: true, color: "999999" })] })]),
      ]);

      doc = new Document({
        sections: [{
          children: [
            ...buildHeader(
              "Dossier Técnico de Cibersegurança",
              client?.name ?? "",
              variant === "tecnico" ? "Versão Técnica — Uso Interno" : "Versão para o Cliente"
            ),
            ...sectionBlocks,
          ],
        }],
      });
      filename = `Dossier_${variant === "tecnico" ? "Tecnico" : "Cliente"}_${(client?.name ?? "cliente").replace(/\s+/g, "_")}.docx`;
    }

    const buffer = await Packer.toBuffer(doc);

    return new Response(buffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro interno.", details: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
