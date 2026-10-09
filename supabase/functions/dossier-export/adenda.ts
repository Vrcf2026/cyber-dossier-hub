// supabase/functions/dossier-export/adenda.ts
//
// 5.ª variante do export: "Adenda de monitorização de segurança e tratamento de dados".
//
// Acordo entre o cliente (responsável pelo tratamento) e o prestador (subcontratante, art. 28.º RGPD)
// para o serviço VRCF Sentinela, com:
//   Anexo I  — Nota informativa aos colaboradores (Código do Trabalho, art. 20.º e seguintes; RGPD art. 13.º)
//   Anexo II — Declaração de tomada de conhecimento (uma por colaborador ativo)
//
// Texto FIXO (não gerado por IA), como a Política: é para assinar e tem de ser previsível.
// É uma MINUTA: deve ser validada juridicamente antes da primeira utilização.

import { Document, Paragraph, Table, TextRun, AlignmentType } from "npm:docx@8.5.0";
import { bullet, fmtDate, h1, p, signatureBlock, table } from "./policy.ts";

export interface AdendaInput {
  client: { name: string; nif?: string | null; address?: string | null; contact_person?: string | null };
  provider: { name?: string | null; email?: string | null; phone?: string | null; nif?: string | null } | null;
  staff: { name: string; active: boolean }[];
  today?: Date;
}

export function buildAdendaDoc(input: AdendaInput): Document {
  const today = input.today ?? new Date();
  const C = input.client.name;
  const P = input.provider?.name || "VRCF – Informática & Segurança";
  const contacto = [input.provider?.email, input.provider?.phone].filter(Boolean).join(" · ");
  const ativos = input.staff.filter((s) => s.active);

  const children: (Paragraph | Table)[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1200, after: 120 }, children: [new TextRun({ text: "ADENDA AO CONTRATO DE PRESTAÇÃO DE SERVIÇOS", bold: true, size: 32 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: "Monitorização de segurança informática e tratamento de dados pessoais", size: 26 })] }),
    p(`Minuta — versão de ${fmtDate(today)}. Deve ser validada juridicamente antes da primeira utilização.`, { italics: true, align: AlignmentType.CENTER, after: 400 }),

    h1("Partes"),
    bullet(`**Cliente (responsável pelo tratamento):** ${C}${input.client.nif ? `, NIF ${input.client.nif}` : ""}${input.client.address ? `, com sede em ${input.client.address}` : ""}.`),
    bullet(`**Prestador (subcontratante):** ${P}${input.provider?.nif ? `, NIF ${input.provider.nif}` : ""}${contacto ? ` (${contacto})` : ""}.`),
    p("A presente adenda faz parte do contrato de prestação de serviços de informática celebrado entre as partes e regula o serviço de monitorização de segurança e o tratamento de dados pessoais que dele resulta, nos termos do artigo 28.º do Regulamento Geral sobre a Proteção de Dados (RGPD)."),

    h1("1. Objeto"),
    p(`O Prestador instala nos computadores e servidores do Cliente um agente de monitorização de segurança (VRCF Sentinela), que recolhe eventos técnicos de segurança e os envia, de forma cifrada, para uma consola gerida pelo Prestador. O objetivo é detetar e responder a incidentes de segurança e produzir relatórios periódicos para o Cliente.`),

    h1("2. O que é monitorizado"),
    bullet("Inícios e fins de sessão, tentativas falhadas e acessos remotos (incluindo sessões AnyDesk/TeamViewer recebidas): conta, equipamento, hora e origem."),
    bullet("Criação e alteração de contas e de permissões de administrador."),
    bullet("Programas executados (nome, localização, assinatura digital) e software instalado ou removido."),
    bullet("Sinais de ataque: programas configurados para arrancar sozinhos, alterações ao antivírus, scripts suspeitos, registos apagados."),
    bullet("Ligação de pens e discos USB (marca, modelo, capacidade e conta com sessão aberta)."),
    bullet("Estado e configuração de segurança dos equipamentos (antivírus, firewall, atualizações, encriptação) e dados de hardware (modelo, número de série, discos)."),
    bullet("Nos servidores: acessos a pastas partilhadas e alterações ou eliminações de ficheiros nas pastas auditadas (nome do ficheiro, não o conteúdo)."),

    h1("3. O que NÃO é monitorizado"),
    p("O serviço não recolhe o conteúdo de ficheiros, documentos ou emails, o histórico de navegação na Internet, imagens do ecrã, o que é escrito no teclado, a localização, nem o microfone ou a câmara."),

    h1("4. Finalidade e limites"),
    p("Os dados são tratados exclusivamente para garantir a segurança da informação e dos sistemas do Cliente: prevenir, detetar e responder a incidentes, cumprir as obrigações de segurança do artigo 32.º do RGPD e, quando aplicável, da legislação de cibersegurança, e documentar essas medidas."),
    p("O serviço não se destina, e não pode ser utilizado, para avaliar o desempenho ou controlar a produtividade dos trabalhadores (artigo 20.º do Código do Trabalho). O Cliente não utilizará a informação para esse fim.", { bold: true }),

    h1("5. Dados pessoais e titulares"),
    p("Categorias de titulares: colaboradores, prestadores e outras pessoas que utilizem os equipamentos do Cliente."),
    p("Categorias de dados: nomes de contas de utilizador, nomes de equipamentos, endereços IP, datas e horas de acesso, nomes e localizações de programas e de ficheiros, identificadores de dispositivos USB e de sessões de acesso remoto. Não são tratadas categorias especiais de dados (artigo 9.º RGPD); se um nome de ficheiro as revelar acidentalmente, esse dado é tratado apenas para fins de segurança."),

    h1("6. Conservação"),
    table(["Informação", "Na consola", "Depois"], [3400, 2600, 3000], [
      ["Programas executados e acessos a ficheiros", "100 dias", "Arquivo cifrado/protegido durante ____ anos"],
      ["Restantes eventos, alertas e estado", "13 meses", "Arquivo cifrado/protegido durante ____ anos"],
      ["Relatórios entregues", "Duração do contrato", "____ anos após o fim do contrato"],
    ]),
    p(""),
    p("No fim dos prazos, os dados são eliminados de forma segura."),

    h1("7. Subcontratantes ulteriores"),
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

    h1("8. Medidas de segurança do Prestador"),
    bullet("Comunicação sempre cifrada (HTTPS); o agente só faz ligações de saída, não abre portas e não executa ordens remotas."),
    bullet("Acesso à consola apenas por técnicos autorizados, com verificação em dois passos e registo de acessos."),
    bullet("Integridade: os registos de cada dia são selados com uma impressão digital (SHA-256) encadeada, e os relatórios entregues ficam bloqueados contra alterações."),
    bullet("Confidencialidade: os técnicos do Prestador estão obrigados a sigilo."),

    h1("9. Verificação externa"),
    p("O Cliente autoriza o Prestador a verificar periodicamente, a partir da Internet, se o endereço IP público das suas instalações tem portas de serviço abertas (por exemplo, ambiente de trabalho remoto ou partilhas de ficheiros). A verificação limita-se a testar se a porta responde; não envolve tentativas de entrada."),

    h1("10. Incidentes e violações de dados"),
    p("O Prestador informa o Cliente, sem demora injustificada e no prazo máximo de 24 horas após ter conhecimento, de qualquer violação de dados pessoais, e presta a informação necessária para que o Cliente, se for o caso, notifique a CNPD no prazo de 72 horas e informe os titulares (artigos 33.º e 34.º RGPD)."),

    h1("11. Direitos dos titulares e auditoria"),
    p("O Prestador apoia o Cliente na resposta a pedidos dos titulares (acesso, retificação, apagamento, limitação, oposição) e disponibiliza a informação necessária para demonstrar o cumprimento desta adenda, incluindo auditorias razoáveis mediante aviso prévio."),

    h1("12. Obrigações do Cliente"),
    bullet("Informar os colaboradores antes da instalação, entregando a nota informativa do Anexo I e recolhendo a declaração do Anexo II."),
    bullet("Havendo comissão de trabalhadores ou estrutura representativa, cumprir os deveres de informação e consulta previstos na lei antes da instalação."),
    bullet("Avaliar se é necessária uma avaliação de impacto (artigo 35.º RGPD), com o apoio do Prestador."),
    bullet("Não usar a informação para fins diferentes dos previstos no ponto 4."),

    h1("13. Fim do contrato"),
    p("No fim do contrato o Prestador desinstala o agente, entrega ao Cliente, se este o pedir, uma cópia dos relatórios e do arquivo num formato de uso corrente, e elimina os restantes dados no prazo de 30 dias, salvo obrigação legal de conservação."),

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

    // --- Anexo II ---
  ];

  const nomes = ativos.length > 0 ? ativos.map((s) => s.name) : [""];
  nomes.forEach((nome) => {
    children.push(
      h1("Anexo II — Declaração de tomada de conhecimento", true),
      p(`Eu, ${nome || "______________________________________________"}, declaro que recebi e li a nota informativa sobre a monitorização de segurança dos equipamentos informáticos da ${C} (Anexo I) e que fui informado(a) do que é registado, da finalidade, do prazo de conservação e dos meus direitos.`),
      p(""),
      ...signatureBlock(["Função", "Data", "Assinatura"]),
    );
  });

  return new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 21 } } } },
    sections: [{ children }],
  });
}
