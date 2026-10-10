// supabase/functions/dossier-export/policy.ts
//
// 4.ª variante do export: "Política de Segurança da Informação".
//
// Texto FIXO e revisto (não gerado por IA) — é um documento que a
// gerência assina, por isso tem de ser previsível e igual para todos
// os clientes. Só variam os dados do cliente e o Anexo A (controlos
// implementados), calculado a partir do estado das secções do dossier,
// das evidências registadas e da lista de colaboradores.
//
// Estrutura:
//   1–15  Capítulos curtos da política (pensados para micro/pequenas empresas)
//   Anexo A — Controlos implementados (SoA simplificado)
//   Anexo B — Aprovação pela gerência
//   Anexo C — Declaração do colaborador (uma página por colaborador ativo)

import {
  Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, AlignmentType, ShadingType,
} from "npm:docx@8.5.0";

// ---------------------------------------------------------------
// Tipos de entrada (só o que o builder precisa)
// ---------------------------------------------------------------
export interface PolicyInput {
  client: { name: string; nif?: string | null; address?: string | null; contact_person?: string | null };
  provider: { name?: string | null; email?: string | null; phone?: string | null } | null;
  sections: { section_number: number; section_status?: string | null; is_completed?: boolean | null; ai_generated_content?: string | null }[];
  evidences: { evidence_type: string; evidence_date: string; result: string }[];
  tasks: { evidence_type: string; active: boolean; frequency?: string | null }[];
  /** clients.opcoes_plano — tipos marcados "na" (não se aplica) saem como "Não aplicável". */
  planOptions?: Record<string, string> | null;
  staff: { name: string; active: boolean; policy_ack_signed_at: string | null; confidentiality_signed_at: string | null; last_training_at: string | null }[];
  today?: Date;
}

type Status = "Implementado" | "Parcial" | "Não implementado" | "Não aplicável";

// ---------------------------------------------------------------
// Helpers de formatação
// ---------------------------------------------------------------
export const fmtDate = (d: Date) => d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });

export function p(text: string, opts: { bold?: boolean; italics?: boolean; after?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) {
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.after ?? 120 },
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italics })],
  });
}

export function bullet(text: string) {
  // Suporta **negrito** inline
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((t) =>
    t.startsWith("**") && t.endsWith("**") ? new TextRun({ text: t.slice(2, -2), bold: true }) : new TextRun({ text: t })
  );
  return new Paragraph({ spacing: { after: 60 }, indent: { left: 360, hanging: 240 }, children: [new TextRun({ text: "•  " }), ...parts] });
}

export function h1(text: string, pageBreak = false) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: pageBreak,
    spacing: { before: 300, after: 150 },
    children: [new TextRun({ text, bold: true })],
  });
}

function cell(text: string, opts: { bold?: boolean; fill?: string; width: number }) {
  return new TableCell({
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold, size: 18 })] })],
  });
}

export function table(headers: string[], widths: number[], rows: string[][], fills?: (string | undefined)[][]) {
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, { bold: true, fill: "D9D9D9", width: widths[i] })) }),
      ...rows.map((r, ri) => new TableRow({ children: r.map((c, i) => cell(c, { width: widths[i], fill: fills?.[ri]?.[i] })) })),
    ],
  });
}

export function signatureBlock(lines: string[]) {
  return lines.flatMap((l) => [
    p(`${l}: ______________________________________________`, { after: 240 }),
  ]);
}

// ---------------------------------------------------------------
// Cálculo do estado dos controlos (Anexo A)
// ---------------------------------------------------------------
function buildControls(input: PolicyInput) {
  const today = input.today ?? new Date();
  const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };

  const sectionStatus = (n: number): Status => {
    const s = input.sections.find((x) => x.section_number === n);
    if (!s) return "Não implementado";
    const st = s.section_status ?? (s.is_completed ? "completed" : s.ai_generated_content ? "in_progress" : "pending");
    if (st === "completed") return "Implementado";
    if (st === "in_progress") return "Parcial";
    if (st === "not_applicable") return "Não aplicável";
    return "Não implementado";
  };

  const lastEvidence = (type: string) =>
    input.evidences
      .filter((e) => e.evidence_type === type && e.result !== "pending")
      .map((e) => new Date(e.evidence_date))
      .sort((a, b) => b.getTime() - a.getTime())[0];

  const hasTask = (type: string) => input.tasks.some((t) => t.active && t.evidence_type === type);
  const FREQ_DIAS: Record<string, number> = { weekly: 7, biweekly: 14, monthly: 31, quarterly: 92, semiannual: 183, annual: 366 };

  // Evidência recente → Implementado; tarefa agendada ou evidência antiga → Parcial.
  // O prazo vem da frequência da tarefa do cliente + 15 dias de janela (senão, maxDays).
  const evidenceStatus = (type: string, maxDays: number): { status: Status; note: string } => {
    if (input.planOptions?.[type] === "na") return { status: "Não aplicável", note: "Não se aplica a esta empresa (plano de manutenção)" };
    const tarefa = input.tasks.find((t) => t.active && t.evidence_type === type);
    if (tarefa?.frequency && FREQ_DIAS[tarefa.frequency]) maxDays = FREQ_DIAS[tarefa.frequency] + 15;
    if (tarefa?.frequency === "once") maxDays = 100000;
    const last = lastEvidence(type);
    if (last && last >= daysAgo(maxDays)) return { status: "Implementado", note: `Último registo: ${fmtDate(last)}` };
    if (last) return { status: "Parcial", note: `Último registo: ${fmtDate(last)} (fora do prazo)` };
    if (hasTask(type)) return { status: "Parcial", note: "Tarefa agendada, sem registo ainda" };
    return { status: "Não implementado", note: "Sem registo" };
  };

  const active = input.staff.filter((s) => s.active);
  const pctStatus = (n: number, label: string): { status: Status; note: string } => {
    if (active.length === 0) return { status: "Não implementado", note: "Lista de colaboradores por preencher" };
    const pct = Math.round((n / active.length) * 100);
    const status: Status = pct >= 95 ? "Implementado" : pct > 0 ? "Parcial" : "Não implementado";
    return { status, note: `${pct}% dos colaboradores ativos (${n}/${active.length}) ${label}` };
  };
  const yearAgo = daysAgo(365);

  const sec = (n: number, extra = "") => ({ status: sectionStatus(n), note: `Dossier — secção ${n}${extra}` });

  return [
    { area: "Governação", control: "Política de segurança aprovada pela gerência", ...{ status: "Parcial" as Status, note: "Este documento — fica Implementado com a assinatura do Anexo B" } },
    { area: "Governação", control: "Responsável de segurança da informação nomeado", ...sec(1) },
    { area: "Governação", control: "Avaliação de riscos (matriz de risco)", ...sec(6) },
    { area: "Governação", control: "Revisão anual do dossier / auditoria interna", ...evidenceStatus("dossier_review", 365) },
    { area: "Ativos", control: "Inventário de equipamentos, software e serviços", ...sec(2) },
    { area: "Ativos", control: "Atualização periódica do inventário do parque", ...evidenceStatus("asset_review", 200) },
    { area: "Fornecedores", control: "Revisão de fornecedores e acessos remotos de terceiros", ...evidenceStatus("supplier_review", 381) },
    { area: "Informação", control: "Classificação e proteção de dados", ...sec(5) },
    { area: "Pessoas", control: "Confidencialidade assinada", ...pctStatus(active.filter((s) => s.confidentiality_signed_at).length, "com confidencialidade") },
    { area: "Pessoas", control: "Declaração de aceitação desta política", ...pctStatus(active.filter((s) => s.policy_ack_signed_at).length, "assinaram") },
    { area: "Pessoas", control: "Formação de sensibilização (últimos 12 meses)", ...(input.planOptions?.training_session === "na" ? { status: "Não aplicável" as Status, note: "Não incluída no plano de manutenção" } : pctStatus(active.filter((s) => s.last_training_at && new Date(s.last_training_at) >= yearAgo).length, "formados")) },
    { area: "Pessoas", control: "Testes de phishing", ...evidenceStatus("phishing_campaign", 365) },
    { area: "Acessos", control: "Gestão de identidades, passwords e MFA", ...sec(4) },
    { area: "Acessos", control: "Revisão anual de acessos lógicos", ...evidenceStatus("access_review", 365) },
    { area: "Física", control: "Revisão de chaves e códigos de alarme", ...evidenceStatus("physical_access_review", 365) },
    { area: "Física", control: "Destruição segura de papel e suportes", ...evidenceStatus("media_disposal", 365) },
    { area: "Rede", control: "Firewall, segmentação e acessos remotos", ...sec(3) },
    { area: "Sistemas", control: "Manutenção e atualizações (plano)", ...sec(9) },
    { area: "Sistemas", control: "Aplicação de patches (dentro do prazo do plano)", ...evidenceStatus("patch_update", 45) },
    { area: "Sistemas", control: "Revisão de logs de segurança (dentro do prazo do plano)", ...evidenceStatus("log_review", 45) },
    { area: "Sistemas", control: "Revisão da configuração de segurança dos equipamentos", ...evidenceStatus("config_review", 107) },
    { area: "Continuidade", control: "Plano de backups e recuperação", ...sec(7) },
    { area: "Continuidade", control: "Verificação de backups (dentro do prazo do plano)", ...evidenceStatus("backup_check", 45) },
    { area: "Continuidade", control: "Teste de restauro (dentro do prazo do plano)", ...evidenceStatus("restore_test", 107) },
    { area: "Incidentes", control: "Plano de resposta a incidentes", ...sec(8) },
    { area: "Incidentes", control: "Contactos de emergência revistos", ...evidenceStatus("contacts_review", 381) },
  ];
}

const STATUS_FILL: Record<Status, string> = {
  "Implementado": "D5F5E3",
  "Parcial": "FCF3CF",
  "Não implementado": "FADBD8",
  "Não aplicável": "EAECEE",
};

// ---------------------------------------------------------------
// Documento
// ---------------------------------------------------------------
export function buildPolicyDoc(input: PolicyInput): Document {
  const today = input.today ?? new Date();
  const C = input.client.name;
  const P = input.provider?.name || "o prestador de serviços de TI";
  const controls = buildControls(input);
  const activeStaff = input.staff.filter((s) => s.active);

  const counts = controls.reduce((acc, c) => { acc[c.status] = (acc[c.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  const children: (Paragraph | Table)[] = [
    // --- Capa ---
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1800, after: 120 }, children: [new TextRun({ text: "POLÍTICA DE SEGURANÇA DA INFORMAÇÃO", bold: true, size: 36 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: C, size: 28 })] }),
    ...(input.client.nif ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: `NIF ${input.client.nif}`, size: 20, color: "666666" })] })] : []),
    table(["Versão", "Data", "Estado", "Próxima revisão"], [2250, 2250, 2250, 2250], [[
      "1.0", fmtDate(today), "Para aprovação", fmtDate(new Date(today.getFullYear() + 1, today.getMonth(), today.getDate())),
    ]]),
    p(""),
    p("Classificação: INTERNO — distribuir a todos os colaboradores.", { italics: true, align: AlignmentType.CENTER }),

    // --- 1 ---
    h1("1. Objetivo e âmbito", true),
    p(`Esta política define as regras mínimas para proteger a informação da ${C} — dados de clientes, fornecedores, colaboradores e da própria empresa — contra perda, roubo, alteração indevida ou indisponibilidade.`),
    p("Aplica-se a todos os colaboradores, estagiários, prestadores de serviços e visitantes que acedam às instalações, equipamentos, sistemas ou informação da empresa, em qualquer local (escritório, casa ou deslocação)."),
    p("Os detalhes técnicos (inventário, rede, acessos, backups, plano de incidentes) estão no Dossier Técnico de Cibersegurança da empresa, que complementa este documento."),

    // --- 2 ---
    h1("2. Papéis e responsabilidades"),
    bullet(`**Gerência** — aprova esta política, aceita os riscos residuais, garante os meios necessários e revê a política pelo menos uma vez por ano.`),
    bullet(`**Responsável de Segurança da Informação** — ${P}${input.provider?.email ? ` (${input.provider.email})` : ""}, por nomeação da gerência. Mantém o dossier técnico, acompanha a manutenção, regista evidências, propõe melhorias e é o primeiro contacto em caso de incidente.`),
    bullet("**Colaboradores** — cumprem esta política, protegem as credenciais pessoais e reportam de imediato qualquer situação suspeita."),
    bullet("**Prestadores externos** — cumprem as regras desta política na parte que lhes diz respeito e assinam acordo de confidencialidade antes de aceder a informação da empresa."),

    // --- 3 ---
    h1("3. Classificação da informação"),
    p("Toda a informação é tratada de acordo com um de quatro níveis:"),
    table(["Nível", "Exemplos", "Regras de tratamento"], [1800, 3400, 3800], [
      ["Público", "Site, catálogos, publicidade", "Pode ser divulgada livremente."],
      ["Interno", "Procedimentos, contactos internos, planeamento", "Só dentro da empresa. Não partilhar com terceiros sem necessidade."],
      ["Confidencial", "Dados de clientes, desenhos e projetos, propostas, faturação, dados pessoais", "Acesso só a quem precisa. Envio para fora apenas por canal seguro (link com password/validade ou portal do cliente). Não guardar em dispositivos pessoais."],
      ["Restrito", "Passwords, dados de saúde, segredos industriais, dados bancários", "Acesso nominal e mínimo. Sempre cifrado em repouso e em trânsito. Nunca enviar por email sem cifra."],
    ]),
    p(""),
    p("Em caso de dúvida, a informação é tratada como Confidencial. Informação de clientes é Confidencial por defeito, salvo indicação contrária do cliente."),

    // --- 4 ---
    h1("4. Utilização aceitável dos equipamentos e sistemas"),
    bullet("Os equipamentos, contas e sistemas da empresa destinam-se a uso profissional. O uso pessoal pontual é tolerado desde que não comprometa a segurança nem o trabalho."),
    bullet("É proibido instalar software, extensões ou aplicações sem autorização do Responsável de Segurança."),
    bullet("É proibido desativar ou contornar o antivírus, a firewall, as atualizações ou outras proteções."),
    bullet("Não ligar pens USB, discos ou outros dispositivos de origem desconhecida."),
    bullet("Bloquear o computador sempre que se afasta do posto (Windows + L)."),
    bullet("Não deixar documentos confidenciais à vista em secretárias, impressoras ou ecrãs (secretária limpa)."),
    bullet("A empresa pode monitorizar a utilização dos sistemas para fins de segurança, de forma proporcional e nos termos da lei."),

    // --- 5 ---
    h1("5. Passwords e autenticação"),
    bullet("Cada pessoa usa a sua própria conta. Contas partilhadas só quando tecnicamente inevitável e registadas no dossier."),
    bullet("Passwords com pelo menos 12 caracteres, únicas para cada serviço. Recomenda-se o uso de frases-passe."),
    bullet("Nunca partilhar passwords, nem com colegas nem por telefone ou email. O suporte técnico nunca pede a password."),
    bullet("Guardar passwords apenas no gestor de passwords aprovado pela empresa — nunca em papel, ficheiros ou no browser de equipamentos partilhados."),
    bullet("Autenticação de dois fatores (MFA) obrigatória no email, nos serviços cloud e em qualquer acesso remoto, sempre que o serviço o permita."),
    bullet("Mudar a password de imediato se houver suspeita de que foi conhecida por outra pessoa."),

    // --- 6 ---
    h1("6. Email, internet e phishing"),
    bullet("Desconfiar de mensagens urgentes, inesperadas ou que peçam pagamentos, dados, credenciais ou a abertura de anexos."),
    bullet("Confirmar por telefone (para um número já conhecido, não o da mensagem) qualquer pedido de alteração de IBAN ou pagamento."),
    bullet("Não clicar em links nem abrir anexos suspeitos. Na dúvida, reportar ao Responsável de Segurança antes de abrir."),
    bullet("Não usar o email profissional para registos em serviços pessoais."),
    ...(input.planOptions?.phishing_campaign === "na" ? [] : [bullet("A empresa realiza testes de phishing simulados para efeitos de formação. Os resultados são usados apenas para melhorar a formação.")]),

    // --- 7 ---
    h1("7. Dispositivos móveis e trabalho remoto"),
    bullet("Telemóveis e portáteis com acesso a informação da empresa devem ter PIN/password, bloqueio automático, cifra do dispositivo ativa e localização/apagamento remoto ativos."),
    bullet("Manter o sistema operativo e as aplicações atualizados."),
    bullet("Acesso remoto aos sistemas da empresa apenas pelos meios aprovados (VPN ou ferramenta de suporte autorizada), com MFA."),
    bullet("Não usar redes Wi-Fi públicas sem VPN. Não deixar equipamentos sem vigilância em viaturas ou locais públicos."),
    bullet("Perda ou roubo de um dispositivo é reportada de imediato, para bloqueio e apagamento remoto."),

    // --- 8 ---
    h1("8. Rede, sistemas e manutenção"),
    bullet("A rede é protegida por firewall e, sempre que possível, segmentada (por exemplo: postos de trabalho, servidores, máquinas/IoT e convidados)."),
    bullet("A rede Wi-Fi de convidados é separada da rede interna."),
    bullet("Todos os equipamentos têm antivírus/EDR ativo e gerido."),
    bullet("Sistemas operativos, aplicações e firmware são atualizados regularmente, de acordo com o plano de manutenção (Dossier — secção 9)."),
    bullet("Os registos (logs) de segurança são revistos periodicamente."),
    bullet("Alterações relevantes à rede ou aos sistemas são feitas ou validadas pelo Responsável de Segurança e registadas no dossier."),

    // --- 9 ---
    h1("9. Cópias de segurança e continuidade"),
    bullet("A informação importante é copiada automaticamente, com pelo menos uma cópia fora das instalações (regra 3-2-1)."),
    bullet("Os backups são verificados regularmente e é feito um teste de restauro pelo menos de três em três meses."),
    bullet("O plano de recuperação (o que recuperar primeiro, em quanto tempo, quem decide) está descrito no Dossier — secção 7 e é revisto anualmente."),
    bullet("Informação de trabalho não deve ser guardada apenas no disco local do computador, mas nas pastas/serviços abrangidos pelo backup."),

    // --- 10 ---
    h1("10. Segurança física"),
    bullet("O acesso às instalações e às áreas restritas (servidores, arquivo, áreas de projeto) é limitado a quem precisa."),
    bullet("Chaves, cartões e códigos de alarme são atribuídos nominalmente e registados. São revistos uma vez por ano e retirados/alterados quando alguém sai."),
    bullet("Visitantes são acompanhados e não ficam sozinhos em áreas com informação confidencial."),
    bullet("É proibido fotografar ou filmar áreas, equipamentos ou documentos confidenciais sem autorização."),
    bullet("Papel confidencial é destruído em destruidora de corte cruzado. Discos, pens e equipamentos são apagados de forma segura ou destruídos antes de abate/venda, ficando registo."),

    // --- 11 ---
    h1("11. Fornecedores e terceiros"),
    bullet("Fornecedores que acedam a informação confidencial ou aos sistemas assinam acordo de confidencialidade (NDA) antes de iniciar o trabalho."),
    bullet("Os acessos de fornecedores são nominais, limitados ao necessário e removidos no fim do serviço."),
    bullet("A subcontratação de trabalho que envolva informação de clientes só é feita com acordo prévio do cliente quando este o exija."),

    // --- 12 ---
    h1("12. Incidentes de segurança"),
    p("Um incidente é qualquer situação que comprometa ou possa comprometer a informação: email suspeito aberto, vírus, perda de equipamento, acesso indevido, password revelada, ficheiros cifrados, etc."),
    bullet("**Reportar de imediato** ao Responsável de Segurança e à gerência — mesmo que seja só uma suspeita ou um erro próprio. Reportar cedo é o mais importante; ninguém é penalizado por reportar."),
    bullet("Em caso de vírus/ransomware: desligar o cabo de rede/Wi-Fi do equipamento, não o desligar da corrente e aguardar instruções."),
    bullet("Todos os incidentes são registados, analisados e encerrados com as medidas tomadas (Dossier — secção 8)."),
    bullet("Quando aplicável, a gerência comunica o incidente a clientes, à CNPD (dados pessoais, até 72 horas) ou ao CNCS, nos prazos legais."),

    // --- 13 ---
    h1("13. Entrada e saída de colaboradores"),
    bullet("Na entrada: assinatura da confidencialidade e da declaração de aceitação desta política (Anexo C), criação de contas nominais com os acessos mínimos necessários e formação inicial."),
    bullet("Para funções com acesso a informação Restrita, é feita a verificação adequada na admissão (referências e documentação)."),
    bullet("Na saída: no próprio dia, desativação das contas, recolha de equipamentos, chaves e cartões, alteração de códigos e de passwords partilhadas que a pessoa conhecesse."),

    // --- 14 ---
    h1("14. Formação e sensibilização"),
    ...(input.planOptions?.training_session === "na"
      ? [bullet("Todos os colaboradores recebem esta política na entrada e confirmam a sua leitura; dúvidas são esclarecidas pelo Responsável de Segurança.")]
      : [
        bullet(input.planOptions?.training_session === "once"
          ? "Os colaboradores recebem formação de sensibilização na entrada e numa sessão inicial para toda a equipa."
          : `Todos os colaboradores recebem formação de sensibilização na entrada e pelo menos uma vez por ${input.planOptions?.training_session === "semiannual" ? "semestre" : "ano"}.`),
        bullet("A formação inclui phishing, passwords, utilização aceitável, classificação da informação e como reportar incidentes."),
        bullet("A participação é registada (lista de colaboradores e evidência da sessão)."),
      ]),

    // --- 15 ---
    h1("15. Cumprimento e revisão"),
    p("O incumprimento desta política pode ter consequências disciplinares, nos termos da lei e do contrato de trabalho, sem prejuízo de outras responsabilidades legais."),
    p("Esta política é revista pela gerência e pelo Responsável de Segurança pelo menos uma vez por ano, e sempre que haja alterações relevantes na empresa, nos sistemas ou na lei, ou após um incidente grave."),

    // --- Anexo A ---
    h1("Anexo A — Controlos implementados", true),
    p(`Estado à data de ${fmtDate(today)}, calculado a partir do dossier técnico, das evidências registadas e da lista de colaboradores.`, { italics: true }),
    p(`Resumo: ${counts["Implementado"] ?? 0} implementados · ${counts["Parcial"] ?? 0} parciais · ${counts["Não implementado"] ?? 0} não implementados · ${counts["Não aplicável"] ?? 0} não aplicáveis.`, { bold: true }),
    table(
      ["Área", "Controlo", "Estado", "Evidência / onde"],
      [1400, 3300, 1600, 2700],
      controls.map((c) => [c.area, c.control, c.status, c.note]),
      controls.map((c) => [undefined, undefined, STATUS_FILL[c.status], undefined]),
    ),

    // --- Anexo B ---
    h1("Anexo B — Aprovação pela gerência", true),
    p(`A gerência da ${C} aprova a presente Política de Segurança da Informação, aceita os riscos residuais identificados na matriz de risco do Dossier Técnico de Cibersegurança e nomeia ${P} como Responsável de Segurança da Informação.`),
    p("Compromete-se a divulgar esta política a todos os colaboradores, a garantir os meios para o seu cumprimento e a revê-la pelo menos uma vez por ano."),
    p(""),
    p("Pela gerência", { bold: true }),
    ...signatureBlock(["Nome", "Cargo", "Data", "Assinatura"]),
    p(""),
    p("Responsável de Segurança da Informação", { bold: true }),
    ...signatureBlock(["Nome", "Data", "Assinatura"]),
  ];

  // --- Anexo C: uma página por colaborador ativo (ou uma em branco) ---
  const names = activeStaff.length > 0 ? activeStaff.map((s) => s.name) : [""];
  names.forEach((name, i) => {
    children.push(
      h1("Anexo C — Declaração do colaborador", true),
      p(`Eu, ${name || "______________________________________________"}, declaro que:`),
      bullet(`recebi, li e compreendi a Política de Segurança da Informação da ${C};`),
      bullet("me comprometo a cumpri-la, bem como as instruções do Responsável de Segurança da Informação;"),
      bullet("manterei a confidencialidade da informação a que tenha acesso, durante e após a minha relação com a empresa;"),
      bullet("reportarei de imediato qualquer incidente ou situação suspeita de que tenha conhecimento;"),
      bullet("devolverei todos os equipamentos, documentos e meios de acesso quando cessar funções."),
      p(""),
      ...signatureBlock(["Função", "Data", "Assinatura"]),
    );
    if (i === names.length - 1) children.push(p("Original arquivado pela empresa. Registar a data de assinatura na lista de colaboradores.", { italics: true }));
  });

  return new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 21 } } } },
    sections: [{ children }],
  });
}
