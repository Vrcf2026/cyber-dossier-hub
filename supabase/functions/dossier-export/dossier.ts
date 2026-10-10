// supabase/functions/dossier-export/dossier.ts
//
// Documento principal do dossier (variantes "cliente" e "tecnico").
//
// É o que se entrega ao cliente, por isso tem de parecer um documento acabado:
//   - capa com a VRCF, o cliente, a versão, a data de emissão e a classificação;
//   - índice das secções;
//   - cabeçalho e rodapé em todas as páginas ("Confidencial", "Página X de Y");
//   - secções "não aplicáveis" ditas como tal e nunca "[por preencher]" na versão do cliente.
//
// O conteúdo das secções vem em markdown (escrito pela IA ou à mão) e é convertido aqui.

import {
  Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, ImageRun,
  WidthType, AlignmentType, BorderStyle, ShadingType, Header, Footer, PageNumber, TabStopType,
} from "npm:docx@8.5.0";

export interface DossierSection {
  section_number: number;
  section_name: string;
  section_status?: string | null;
  client_visible?: boolean | null;
  ai_generated_content?: string | null;
}

export interface DossierInput {
  variant: "cliente" | "tecnico";
  title: string;
  updatedAt?: string | null;
  client: { name: string; nif?: string | null; address?: string | null };
  provider: { name?: string | null; email?: string | null; phone?: string | null; nif?: string | null } | null;
  sections: DossierSection[];
  /** Logótipo da empresa (PNG). Opcional: sem ele a capa leva só o nome. */
  logoPng?: Uint8Array | null;
  today?: Date;
}

const AZUL = "1E3A8A";
const CINZA = "666666";
const LARGURA = 9000; // largura útil em DXA (A4 com margens normais)

const fmtData = (d: Date) => d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Lisbon" });

// ---------------------------------------------------------------
// Markdown → blocos do docx
// ---------------------------------------------------------------

/** **negrito**, *itálico* e `código` dentro de uma linha. */
export function inline(texto: string, base: { size?: number; color?: string } = {}): TextRun[] {
  const partes = texto.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g).filter(Boolean);
  return partes.map((t) => {
    if (t.startsWith("**") && t.endsWith("**") && t.length > 4) return new TextRun({ text: t.slice(2, -2), bold: true, ...base });
    if (t.startsWith("*") && t.endsWith("*") && t.length > 2) return new TextRun({ text: t.slice(1, -1), italics: true, ...base });
    if (t.startsWith("`") && t.endsWith("`") && t.length > 2) return new TextRun({ text: t.slice(1, -1), font: "Consolas", ...base });
    return new TextRun({ text: t, ...base });
  });
}

/** Algum conteúdo antigo vem em HTML simples: passa para texto com quebras de linha. */
export function htmlParaTexto(s: string): string {
  if (!/<\/?(p|br|li|ul|ol|strong|b|em|h\d)\b/i.test(s)) return s;
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h\d)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<(strong|b)>/gi, "**").replace(/<\/(strong|b)>/gi, "**")
    .replace(/<(em|i)>/gi, "*").replace(/<\/(em|i)>/gi, "*")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function celulas(linha: string): string[] {
  let l = linha.trim();
  if (l.startsWith("|")) l = l.slice(1);
  if (l.endsWith("|")) l = l.slice(0, -1);
  return l.split("|").map((c) => c.trim());
}

function tabela(cabecalho: string[], linhas: string[][]): Table {
  const n = cabecalho.length;
  const w = Math.floor(LARGURA / n);
  const cel = (t: string, cab: boolean) => new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: cab ? { type: ShadingType.CLEAR, fill: "E5E7EB" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: cab ? [new TextRun({ text: t, bold: true, size: 18 })] : inline(t, { size: 18 }) })],
  });
  // Todas as linhas com o mesmo número de colunas (o Word estraga a tabela se não tiverem).
  const acertar = (r: string[]) => Array.from({ length: n }, (_, i) => r[i] ?? "");
  return new Table({
    width: { size: w * n, type: WidthType.DXA },
    rows: [
      new TableRow({ tableHeader: true, children: cabecalho.map((c) => cel(c, true)) }),
      ...linhas.map((r) => new TableRow({ children: acertar(r).map((c) => cel(c, false)) })),
    ],
  });
}

export function markdownParaBlocos(md: string): (Paragraph | Table)[] {
  const linhas = htmlParaTexto(md).replace(/\r\n/g, "\n").split("\n");
  const blocos: (Paragraph | Table)[] = [];
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i].trim();
    if (!l) { i++; continue; }

    // Tabela: | a | b | seguida de |---|---|
    if (l.startsWith("|") && /^\|?[\s:|-]+\|?$/.test(linhas[i + 1]?.trim() ?? "") && (linhas[i + 1] ?? "").includes("-")) {
      const cab = celulas(l);
      const corpo: string[][] = [];
      let j = i + 2;
      while (j < linhas.length && linhas[j].trim().startsWith("|")) { corpo.push(celulas(linhas[j])); j++; }
      blocos.push(tabela(cab, corpo));
      blocos.push(new Paragraph({ text: "", spacing: { after: 120 } }));
      i = j;
      continue;
    }

    // Títulos (# a ####). A secção já é o nível 1 do documento: # → 2, ## → 2, ### e #### → 3.
    const t = l.match(/^(#{1,4})\s+(.*)$/);
    if (t) {
      blocos.push(new Paragraph({
        heading: t[1].length <= 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: t[2].replace(/\*\*/g, ""), bold: true })],
      }));
      i++;
      continue;
    }

    // Linha horizontal
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(l)) { i++; continue; }

    // Listas: "- ", "* ", "1. ", "1) " (com recuo para sublistas)
    const indent = (linhas[i].match(/^\s*/)?.[0].length ?? 0) >= 2 ? 1 : 0;
    const lista = l.match(/^([-*•])\s+(.*)$/);
    const num = l.match(/^(\d+)[.)]\s+(.*)$/);
    if (lista || num) {
      const marca = lista ? "•" : `${num![1]}.`;
      const texto = lista ? lista[2] : num![2];
      blocos.push(new Paragraph({
        spacing: { after: 60 },
        indent: { left: 360 + indent * 360, hanging: 280 },
        children: [new TextRun({ text: `${marca}\t` }), ...inline(texto)],
        tabStops: [{ type: TabStopType.LEFT, position: 360 + indent * 360 }],
      }));
      i++;
      continue;
    }

    // Citação
    if (l.startsWith(">")) {
      blocos.push(new Paragraph({
        spacing: { after: 120 },
        indent: { left: 360 },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: "9CA3AF", space: 8 } },
        children: inline(l.replace(/^>\s?/, ""), { color: "374151" }),
      }));
      i++;
      continue;
    }

    blocos.push(new Paragraph({ spacing: { after: 120 }, children: inline(l) }));
    i++;
  }
  return blocos;
}

// ---------------------------------------------------------------
// Logótipo (PNG): tamanho lido do próprio ficheiro
// ---------------------------------------------------------------
export function tamanhoPng(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

// ---------------------------------------------------------------
// Documento
// ---------------------------------------------------------------

/** O que aparece numa secção sem texto, conforme a versão e o estado. */
export function textoSemConteudo(s: DossierSection, variant: "cliente" | "tecnico"): string {
  if (s.section_status === "not_applicable") return "Não aplicável a esta organização.";
  return variant === "tecnico" ? "[Secção ainda por preencher]" : "Esta secção será completada na próxima revisão do dossier.";
}

export function seccoesDaVersao(sections: DossierSection[], variant: "cliente" | "tecnico"): DossierSection[] {
  return [...sections]
    .filter((s) => variant === "tecnico" || s.client_visible)
    .sort((a, b) => a.section_number - b.section_number);
}

export function buildDossierDoc(input: DossierInput): Document {
  const hoje = input.today ?? new Date();
  const fornecedor = input.provider?.name || "VRCF – Informática & Segurança";
  const versao = input.variant === "tecnico" ? "Versão técnica — uso interno" : "Versão para o cliente";
  const seccoes = seccoesDaVersao(input.sections, input.variant);

  // ---- Capa ----
  const capa: Paragraph[] = [];
  const dims = input.logoPng ? tamanhoPng(input.logoPng) : null;
  if (input.logoPng && dims && dims.w > 0 && dims.h > 0) {
    const largura = 220;
    capa.push(new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 600 },
      children: [new ImageRun({ data: input.logoPng, transformation: { width: largura, height: Math.round((largura * dims.h) / dims.w) } })],
    }));
  } else {
    capa.push(new Paragraph({ spacing: { after: 600 }, children: [new TextRun({ text: fornecedor, bold: true, size: 28, color: AZUL })] }));
  }
  capa.push(
    new Paragraph({ spacing: { before: 1800, after: 120 }, children: [new TextRun({ text: "Dossier de Cibersegurança", bold: true, size: 52, color: AZUL })] }),
    new Paragraph({ spacing: { after: 480 }, children: [new TextRun({ text: input.client.name, size: 36 })] }),
    new Paragraph({
      spacing: { after: 80 },
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: AZUL, space: 8 } },
      children: [new TextRun({ text: versao, bold: true, size: 22 })],
    }),
  );
  const linhaCapa = (rotulo: string, valor: string) => new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text: `${rotulo}: `, size: 20, color: CINZA }), new TextRun({ text: valor, size: 20 })],
  });
  if (input.client.nif) capa.push(linhaCapa("NIF do cliente", input.client.nif));
  capa.push(linhaCapa("Data de emissão", fmtData(hoje)));
  if (input.updatedAt) capa.push(linhaCapa("Última atualização do conteúdo", fmtData(new Date(input.updatedAt))));
  capa.push(linhaCapa("Classificação", input.variant === "tecnico" ? "Confidencial — uso interno da VRCF" : "Confidencial — destinado ao cliente"));
  capa.push(linhaCapa("Elaborado por", [fornecedor, input.provider?.email, input.provider?.phone].filter(Boolean).join(" · ")));
  capa.push(new Paragraph({
    spacing: { before: 1200 },
    children: [new TextRun({
      text: "Este documento descreve o estado da segurança informática da organização à data de emissão e as medidas acordadas para a manter. Contém informação sensível: não o partilhe fora da organização.",
      italics: true, size: 18, color: CINZA,
    })],
  }));

  // ---- Índice ----
  const indice: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 200 }, children: [new TextRun({ text: "Índice", bold: true })] }),
    ...seccoes.map((s) => new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ text: `${s.section_number}.  ${s.section_name}` }),
        ...(s.section_status === "not_applicable" ? [new TextRun({ text: "  (não aplicável)", italics: true, color: CINZA })] : []),
      ],
    })),
  ];

  // ---- Secções ----
  const corpo = seccoes.flatMap((s, idx) => {
    const conteudo = (s.ai_generated_content ?? "").trim();
    const na = s.section_status === "not_applicable";
    return [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: idx === 0,
        spacing: { before: 360, after: 160 },
        children: [new TextRun({ text: `${s.section_number}. ${s.section_name}`, bold: true })],
      }),
      ...(conteudo && !na
        ? markdownParaBlocos(conteudo)
        : [new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: textoSemConteudo(s, input.variant), italics: true, color: CINZA })] })]),
    ];
  });

  const cabecalho = new Header({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: `Dossier de Cibersegurança — ${input.client.name}`, size: 16, color: CINZA })],
    })],
  });
  const rodape = new Footer({
    children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: LARGURA }],
      children: [
        new TextRun({ text: `Confidencial · ${fornecedor}`, size: 16, color: CINZA }),
        new TextRun({ children: ["\tPágina ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES], size: 16, color: CINZA }),
      ],
    })],
  });

  return new Document({
    creator: fornecedor,
    title: `Dossier de Cibersegurança — ${input.client.name}`,
    description: versao,
    styles: {
      default: { document: { run: { font: "Calibri", size: 21 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, color: AZUL } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, color: "1F2937" } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 22, bold: true, color: "374151" } },
      ],
    },
    sections: [
      // Capa sem cabeçalho nem rodapé
      { children: capa },
      { headers: { default: cabecalho }, footers: { default: rodape }, children: [...indice, ...corpo] },
    ],
  });
}

/** Secções que ainda impedem a entrega ao cliente (visíveis, sem texto e não marcadas N/A). */
export function seccoesPorFechar(sections: DossierSection[]): DossierSection[] {
  return seccoesDaVersao(sections, "cliente").filter((s) => s.section_status !== "not_applicable" && !(s.ai_generated_content ?? "").trim());
}
