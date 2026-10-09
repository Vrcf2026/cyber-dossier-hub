// supabase/functions/dossier-export/adenda.ts
//
// Variante "adenda": Adenda ao contrato para o serviço VRCF Sentinela — nível de serviço,
// garantias, limites de responsabilidade e tratamento de dados (art. 28.º RGPD; art. 20.º CT).
//
// Três níveis (parâmetro ?nivel=1|2|3; sem nível, os três ficam por assinalar à mão):
//   1 — Relatórios: só a entrega dos relatórios mensais e trimestrais (provas).
//   2 — Monitorização: + acompanhamento dos alertas, sem vigilância permanente nem tempo real.
//   3 — Monitorização com resposta remota: + notificação imediata e primeira resposta remota.
//
// Anexos: I — nota aos colaboradores; II — declaração por colaborador ativo;
//         III — plano de provas (tarefas ativas do cliente no dossier).
//
// Texto FIXO (não gerado por IA). É uma MINUTA: validar juridicamente antes de usar.

import { Document, Paragraph, Table, TextRun, AlignmentType } from "npm:docx@8.5.0";
import { bullet, fmtDate, h1, p, signatureBlock, table } from "./policy.ts";

export type NivelServico = 1 | 2 | 3;

export interface AdendaInput {
  client: { name: string; nif?: string | null; address?: string | null; contact_person?: string | null };
  provider: { name?: string | null; email?: string | null; phone?: string | null; nif?: string | null } | null;
  staff: { name: string; active: boolean }[];
  tasks?: { title: string; evidence_type: string; frequency: string; active: boolean }[];
  nivel?: NivelServico | null;
  today?: Date;
}

const NIVEIS: Record<NivelServico, { nome: string; resumo: string }> = {
  1: { nome: "Nível 1 — Relatórios", resumo: "Recolha automática e entrega dos relatórios mensais e trimestrais, registados no dossier como prova." },
  2: { nome: "Nível 2 — Monitorização", resumo: "Nível 1 + acompanhamento regular dos alertas pela VRCF em dias úteis. Sem vigilância permanente nem resposta em tempo real." },
  3: { nome: "Nível 3 — Monitorização com resposta remota", resumo: "Nível 2 + notificação imediata dos alertas graves e primeira resposta remota em dias úteis, no horário do Prestador, sem tempos garantidos." },
};

const FREQ: Record<string, string> = {
  weekly: "Semanal", biweekly: "Quinzenal", monthly: "Mensal", quarterly: "Trimestral", semiannual: "Semestral", annual: "Anual",
};

const TIPO: Record<string, string> = {
  backup_check: "Verificação de backup", restore_test: "Teste de restauro", patch_update: "Atualizações",
  log_review: "Revisão de registos", vuln_scan: "Análise de vulnerabilidades", access_review: "Revisão de acessos",
  phishing_campaign: "Campanha de phishing", ssl_renewal: "Renovação SSL", dossier_review: "Revisão do dossier",
  incident: "Incidente", physical_access_review: "Revisão de acessos físicos", media_disposal: "Destruição de suportes",
  training_session: "Formação", other: "Outro",
};

export function buildAdendaDoc(input: AdendaInput): Document {
  const today = input.today ?? new Date();
  const C = input.client.name;
  const P = input.provider?.name || "VRCF – Informática & Segurança";
  const contacto = [input.provider?.email, input.provider?.phone].filter(Boolean).join(" · ");
  const ativos = input.staff.filter((s) => s.active);
  const tarefas = (input.tasks ?? []).filter((t) => t.active);
  const n = input.nivel ?? null;
  const marca = (k: NivelServico) => (n === null ? "☐" : n === k ? "☒" : "☐");

  const children: (Paragraph | Table)[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1200, after: 120 }, children: [new TextRun({ text: "ADENDA AO CONTRATO DE PRESTAÇÃO DE SERVIÇOS", bold: true, size: 32 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: "Serviço VRCF Sentinela — monitorização de segurança, provas de conformidade e tratamento de dados pessoais", size: 24 })] }),
    p(`Minuta — versão de ${fmtDate(today)}. Deve ser validada juridicamente antes da primeira utilização.`, { italics: true, align: AlignmentType.CENTER, after: 400 }),

    h1("Partes"),
    bullet(`**Cliente (responsável pelo tratamento):** ${C}${input.client.nif ? `, NIF ${input.client.nif}` : ""}${input.client.address ? `, com sede em ${input.client.address}` : ""}.`),
    bullet(`**Prestador (subcontratante):** ${P}${input.provider?.nif ? `, NIF ${input.provider.nif}` : ""}${contacto ? ` (${contacto})` : ""}.`),
    p("A presente adenda faz parte do contrato de prestação de serviços de informática celebrado entre as partes. Define o nível de serviço contratado, o que o Prestador garante e o que não garante, e regula o tratamento de dados pessoais que resulta do serviço, nos termos do artigo 28.º do Regulamento Geral sobre a Proteção de Dados (RGPD)."),

    h1("1. Objeto"),
    p("O Prestador instala nos computadores e servidores do Cliente um agente de monitorização de segurança (VRCF Sentinela), que recolhe eventos técnicos de segurança e os envia, de forma cifrada, para uma consola gerida pelo Prestador. Com essa informação, o Prestador produz relatórios periódicos e mantém o registo de provas de segurança do Cliente no dossier de cibersegurança, e, consoante o nível contratado, acompanha os alertas e responde remotamente."),

    h1("2. Nível de serviço contratado"),
    table(["", "Nível", "Inclui"], [600, 3200, 5200], ([1, 2, 3] as NivelServico[]).map((k) => [marca(k), NIVEIS[k].nome, NIVEIS[k].resumo])),
    p(""),
    p("Nível 1 — Relatórios", { bold: true }),
    bullet("O agente recolhe a informação de forma automática e permanente."),
    bullet("O Prestador analisa a informação do período e entrega um relatório mensal e um relatório trimestral, até ao dia ___ do mês seguinte."),
    bullet("Os relatórios entregues ficam registados no dossier de cibersegurança do Cliente como prova, bloqueados contra alterações e com impressão digital (SHA-256)."),
    bullet("**Os alertas não são acompanhados à medida que acontecem:** são analisados na preparação do relatório."),
    p("Em todos os níveis, o Prestador pode, por iniciativa própria, usar a informação recolhida para antecipar problemas e intervir de forma preventiva. Essas intervenções são feitas no interesse do Cliente e não criam, nem alargam, qualquer obrigação de vigilância ou de resposta além do nível contratado.", { italics: true }),
    p("Nível 2 — Monitorização", { bold: true }),
    bullet("Tudo o que inclui o Nível 1."),
    bullet("O Prestador consulta os alertas da consola com regularidade, em dias úteis e dentro do seu horário de funcionamento, e informa o Cliente das situações relevantes, com recomendações."),
    bullet("O Prestador é avisado quando um servidor ou computador deixa de comunicar."),
    bullet("**Não inclui vigilância permanente, fora de horas ou em tempo real, nem intervenção nos equipamentos.**"),
    p("Nível 3 — Monitorização com resposta remota", { bold: true }),
    bullet("Tudo o que inclui o Nível 2."),
    bullet("Os alertas graves são notificados de imediato ao técnico do Prestador."),
    bullet("Primeira resposta remota, em dias úteis e dentro do horário de funcionamento do Prestador, logo que razoavelmente possível: contactar o Cliente, isolar o equipamento da rede, terminar o processo suspeito ou bloquear a conta afetada. Não há tempos de resposta garantidos."),
    bullet("**Fora desse horário não há resposta garantida.** A reparação, a recuperação de dados, a reinstalação e a investigação forense não estão incluídas e são orçamentadas à parte, salvo acordo escrito."),

    h1("3. O que o Prestador garante"),
    p("Em todos os níveis, o Prestador garante:"),
    bullet("a instalação, a configuração e a manutenção do agente nos equipamentos indicados pelo Cliente, incluindo a reposição automática dos componentes de recolha quando são parados ou removidos;"),
    bullet("a atualização periódica da consola: regras de deteção, listas de programas e de ameaças conhecidas e verificações de configuração;"),
    bullet("a conservação dos registos pelos prazos do ponto 9 e uma cópia de arquivo de longo prazo;"),
    bullet("a entrega dos relatórios nos prazos do nível contratado e o seu registo no dossier como prova;"),
    bullet("a realização e o registo no dossier das provas do plano acordado (Anexo III), como verificações de backup e testes de restauro, nas periodicidades indicadas;"),
    bullet("a confidencialidade da informação e as medidas de segurança do ponto 11."),

    h1("4. O que o Prestador não garante"),
    p("O serviço é uma obrigação de meios e não de resultado:", { bold: true }),
    bullet("a monitorização serve para detetar e documentar: não impede ataques, falhas ou perdas de dados, nem garante que todos são detetados;"),
    bullet("só são observados os equipamentos com o agente instalado, ligados e com acesso à Internet; equipamentos desligados, sem agente ou fora da rede não são cobertos nesse período;"),
    bullet("a deteção depende dos registos do Windows e das regras disponíveis à data; ameaças novas ou desconhecidas podem não ser detetadas;"),
    bullet("o Prestador não responde pelos sistemas, aplicações e serviços de terceiros (por exemplo, fornecedores de software, operadores de telecomunicações e serviços na nuvem);"),
    bullet("não há vigilância nem resposta em tempo real em nenhum nível; mesmo no Nível 3, a resposta é dada logo que razoavelmente possível, em dias úteis e no horário do Prestador."),

    h1("5. O que é monitorizado"),
    bullet("Inícios e fins de sessão, tentativas falhadas e acessos remotos (incluindo sessões AnyDesk/TeamViewer recebidas): conta, equipamento, hora e origem."),
    bullet("Criação e alteração de contas e de permissões de administrador."),
    bullet("Programas executados (nome, localização, assinatura digital) e software instalado ou removido."),
    bullet("Sinais de ataque: programas configurados para arrancar sozinhos, alterações ao antivírus, scripts suspeitos, registos apagados."),
    bullet("Ligação de pens e discos USB (marca, modelo, capacidade e conta com sessão aberta)."),
    bullet("Estado e configuração de segurança dos equipamentos (antivírus, firewall, atualizações, encriptação) e dados de hardware (modelo, número de série, discos)."),
    bullet("Nos servidores: acessos a pastas partilhadas e alterações ou eliminações de ficheiros nas pastas auditadas (nome do ficheiro, não o conteúdo)."),

    h1("6. O que NÃO é monitorizado"),
    p("O serviço não recolhe o conteúdo de ficheiros, documentos ou emails, o histórico de navegação na Internet, imagens do ecrã, o que é escrito no teclado, a localização, nem o microfone ou a câmara."),

    h1("7. Finalidade e limites"),
    p("Os dados são tratados exclusivamente para garantir a segurança da informação e dos sistemas do Cliente: prevenir, detetar e responder a incidentes, cumprir as obrigações de segurança do artigo 32.º do RGPD e, quando aplicável, da legislação de cibersegurança, e documentar essas medidas perante auditorias."),
    p("O serviço não se destina, e não pode ser utilizado, para avaliar o desempenho ou controlar a produtividade dos trabalhadores (artigo 20.º do Código do Trabalho). O Cliente não utilizará a informação para esse fim.", { bold: true }),

    h1("8. Dados pessoais e titulares"),
    p("Categorias de titulares: colaboradores, prestadores e outras pessoas que utilizem os equipamentos do Cliente."),
    p("Categorias de dados: nomes de contas de utilizador, nomes de equipamentos, endereços IP, datas e horas de acesso, nomes e localizações de programas e de ficheiros, identificadores de dispositivos USB e de sessões de acesso remoto. Não são tratadas categorias especiais de dados (artigo 9.º RGPD); se um nome de ficheiro as revelar acidentalmente, esse dado é tratado apenas para fins de segurança."),

    h1("9. Conservação"),
    table(["Informação", "Na consola", "Depois"], [3400, 2600, 3000], [
      ["Programas executados e acessos a ficheiros", "100 dias", "Arquivo protegido durante ____ anos"],
      ["Restantes eventos, alertas e estado", "13 meses", "Arquivo protegido durante ____ anos"],
      ["Relatórios e provas entregues", "Duração do contrato", "____ anos após o fim do contrato"],
    ]),
    p(""),
    p("No fim dos prazos, os dados são eliminados de forma segura."),

    h1("10. Subcontratantes ulteriores"),
    p("O Cliente autoriza o recurso aos seguintes fornecedores, que tratam os dados apenas por conta do Prestador e com garantias equivalentes às desta adenda:"),
    table(["Fornecedor", "Para quê", "Notas"], [2600, 3600, 2800], [
      ["Supabase", "Base de dados da consola", "Região: ________"],
      ["Cloudflare / Lovable", "Alojamento da consola web", ""],
      ["Google (Google Drive)", "Arquivo de longo prazo", "Conta do Prestador"],
      ["Telegram", "Notificações de alertas ao técnico", "Só o título do alerta e o nome do equipamento"],
      ["Anthropic (Claude)", "Análise de alertas e resumos por IA", "Só se ativada; com substituição de nomes por códigos, se pedido"],
    ]),
    p(""),
    p("Quando algum destes fornecedores trate dados fora do Espaço Económico Europeu, a transferência apoia-se nas garantias previstas no RGPD (decisão de adequação, como o Quadro de Privacidade de Dados UE-EUA, ou cláusulas contratuais-tipo). O Prestador informa o Cliente antes de acrescentar ou substituir fornecedores, podendo o Cliente opor-se."),

    h1("11. Medidas de segurança do Prestador"),
    bullet("Comunicação sempre cifrada (HTTPS); o agente só faz ligações de saída, não abre portas e não executa ordens remotas."),
    bullet("Acesso à consola apenas por técnicos autorizados, com verificação em dois passos e registo de acessos."),
    bullet("Integridade: os registos de cada dia são selados com uma impressão digital (SHA-256) encadeada, e os relatórios entregues ficam bloqueados contra alterações."),
    bullet("Confidencialidade: os técnicos do Prestador estão obrigados a sigilo."),

    h1("12. Verificação externa"),
    p("O Cliente autoriza o Prestador a verificar periodicamente, a partir da Internet, se o endereço IP público das suas instalações tem portas de serviço abertas (por exemplo, ambiente de trabalho remoto ou partilhas de ficheiros). A verificação limita-se a testar se a porta responde; não envolve tentativas de entrada."),

    h1("13. Incidentes e violações de dados"),
    p("O Prestador informa o Cliente, sem demora injustificada e no prazo máximo de 24 horas após ter conhecimento, de qualquer violação de dados pessoais nos sistemas do Prestador ou detetada pelo serviço, e presta a informação necessária para que o Cliente, se for o caso, notifique a CNPD no prazo de 72 horas e informe os titulares (artigos 33.º e 34.º RGPD). Nos Níveis 1 e 2, o prazo conta a partir do momento em que o Prestador toma efetivamente conhecimento, nos termos do ponto 2."),

    h1("14. Direitos dos titulares e auditoria"),
    p("O Prestador apoia o Cliente na resposta a pedidos dos titulares (acesso, retificação, apagamento, limitação, oposição) e disponibiliza a informação necessária para demonstrar o cumprimento desta adenda, incluindo auditorias razoáveis mediante aviso prévio."),

    h1("15. Obrigações do Cliente"),
    bullet("Informar os colaboradores antes da instalação, entregando a nota informativa do Anexo I e recolhendo a declaração do Anexo II."),
    bullet("Havendo comissão de trabalhadores ou estrutura representativa, cumprir os deveres de informação e consulta previstos na lei antes da instalação."),
    bullet("Avaliar se é necessária uma avaliação de impacto (artigo 35.º RGPD), com o apoio do Prestador."),
    bullet("Manter os equipamentos ligados à rede, não desinstalar nem desativar o agente e avisar o Prestador de equipamentos novos, substituídos ou retirados."),
    bullet("Manter um contacto disponível para receber os avisos do Prestador e decidir sobre eles."),
    bullet("Decidir e suportar a execução das recomendações dos relatórios e dos avisos; as consequências de recomendações não seguidas são da responsabilidade do Cliente."),
    bullet("Não usar a informação para fins diferentes dos previstos no ponto 7."),

    h1("16. Responsabilidade"),
    bullet("O Prestador responde apenas pelos danos diretos causados por incumprimento culposo das obrigações desta adenda."),
    bullet("Ficam excluídos os danos indiretos, nomeadamente lucros cessantes, perda de negócio, paragem de atividade e perda ou corrupção de dados, sem prejuízo das obrigações de prova de backup do Anexo III."),
    bullet("A responsabilidade total do Prestador fica limitada ao valor pago pelo Cliente por este serviço nos 12 meses anteriores ao facto que a origina."),
    bullet("Estas limitações não se aplicam a danos causados com dolo ou culpa grave, nem nos casos em que a lei não permita limitá-las."),
    bullet("O Prestador não é responsável por falhas causadas por terceiros, por atos ou omissões do Cliente ou dos seus colaboradores, nem por casos de força maior."),

    h1("17. Fim do contrato"),
    p("No fim do contrato o Prestador desinstala o agente, entrega ao Cliente, se este o pedir, uma cópia dos relatórios, das provas e do arquivo num formato de uso corrente, e elimina os restantes dados no prazo de 30 dias, salvo obrigação legal de conservação."),

    h1("Assinaturas", true),
    p(`Feito em ${fmtDate(today)}, em dois exemplares.`),
    p(""),
    p(`Pelo Cliente — ${C}`, { bold: true }),
    ...signatureBlock(["Nome", "Cargo", "Assinatura"]),
    p(""),
    p(`Pelo Prestador — ${P}`, { bold: true }),
    ...signatureBlock(["Nome", "Cargo", "Assinatura"]),

    // --- Anexo I ---
    h1("Anexo I — Nota informativa aos colaboradores", true),
    p(`Monitorização de segurança dos equipamentos informáticos da ${C}`, { bold: true }),
    p(`Para proteger a informação da empresa, dos clientes e dos próprios colaboradores contra ataques informáticos (vírus, ransomware, roubo de passwords), os computadores e servidores da ${C} têm instalado um programa de monitorização de segurança, gerido pela ${P}.`),
    p("O que fica registado", { bold: true }),
    bullet("quando se entra e sai do computador, e tentativas falhadas;"),
    bullet("que programas são executados ou instalados, e alterações às definições de segurança;"),
    bullet("ligação de pens USB e acessos remotos ao computador;"),
    bullet("nos servidores, acessos e alterações às pastas partilhadas (o nome do ficheiro, não o conteúdo)."),
    p("O que NÃO fica registado", { bold: true }),
    p("O conteúdo de documentos ou emails, os sites visitados, o ecrã, o que se escreve no teclado, a localização, o microfone ou a câmara."),
    p("Para quê — e para quê não", { bold: true }),
    p("Serve apenas para a segurança informática: detetar ataques e problemas e reagir a tempo. Não é usado para avaliar o seu trabalho nem para controlar a sua produtividade."),
    p("Quem vê e durante quanto tempo", { bold: true }),
    p(`Apenas os técnicos da ${P}, sujeitos a sigilo, e a gerência quando haja um incidente de segurança. Os registos ficam na consola até 13 meses (programas executados: 100 dias) e depois num arquivo protegido pelo prazo definido na adenda.`),
    p("Os seus direitos", { bold: true }),
    p(`Pode pedir acesso aos dados que lhe digam respeito, a sua retificação ou, quando aplicável, o apagamento ou a limitação, junto da gerência${input.client.contact_person ? ` (${input.client.contact_person})` : ""}. Pode também apresentar reclamação à Comissão Nacional de Proteção de Dados (www.cnpd.pt).`),
  ];

  // --- Anexo II (uma página por colaborador ativo; sem colaboradores, uma em branco) ---
  const nomes = ativos.length > 0 ? ativos.map((s) => s.name) : [""];
  nomes.forEach((nome) => {
    children.push(
      h1("Anexo II — Declaração de tomada de conhecimento", true),
      p(`Eu, ${nome || "______________________________________________"}, declaro que recebi e li a nota informativa sobre a monitorização de segurança dos equipamentos informáticos da ${C} (Anexo I) e que fui informado(a) do que é registado, da finalidade, do prazo de conservação e dos meus direitos.`),
      p(""),
      ...signatureBlock(["Função", "Data", "Assinatura"]),
    );
  });

  // --- Anexo III ---
  children.push(
    h1("Anexo III — Plano de provas", true),
    p("Provas que o Prestador realiza e regista no dossier de cibersegurança do Cliente, com a periodicidade indicada. Os relatórios do VRCF Sentinela são registados automaticamente como «Revisão de registos»."),
  );
  if (tarefas.length > 0) {
    children.push(table(["Prova", "Tipo", "Periodicidade"], [4400, 2800, 1800],
      tarefas.map((t) => [t.title, TIPO[t.evidence_type] ?? t.evidence_type, FREQ[t.frequency] ?? t.frequency])));
  } else {
    children.push(table(["Prova", "Tipo", "Periodicidade"], [4400, 2800, 1800], [
      ["Relatório mensal VRCF Sentinela", "Revisão de registos", "Mensal"],
      ["Relatório trimestral VRCF Sentinela", "Revisão de registos", "Trimestral"],
      ["", "", ""], ["", "", ""], ["", "", ""],
    ]));
  }
  children.push(p(""), p("Alterações a este plano são acordadas por escrito (incluindo email) e passam a fazer parte desta adenda."));

  return new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 21 } } } },
    sections: [{ children }],
  });
}
