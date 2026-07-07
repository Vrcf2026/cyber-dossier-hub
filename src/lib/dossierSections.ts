// src/lib/dossierSections.ts
//
// Fonte única de verdade sobre as secções do dossier: número, nome,
// se aparece na versão do cliente, e uma dica do que lá vai dentro.
// Usado pelo editor e, mais tarde, pelo motor de export.

export interface SectionDefinition {
  number: number;
  name: string;
  clientVisible: boolean;
  helpText: string;
}

export const DOSSIER_SECTIONS: SectionDefinition[] = [
  { number: 1, name: "Identificação e Âmbito", clientVisible: true,
    helpText: "Dados do cliente, responsáveis, período de validade, responsabilidades de cada parte." },
  { number: 2, name: "Inventário de Ativos", clientVisible: true,
    helpText: "Equipamentos, software instalado, licenças. Indica para cada item se é alojado localmente ou é um serviço cloud/fornecedor." },
  { number: 3, name: "Arquitetura e Segurança de Rede", clientVisible: true,
    helpText: "VLANs, portas abertas no firewall, acessos remotos (VPN, suporte remoto)." },
  { number: 4, name: "Gestão de Identidades e Acessos (IAM)", clientVisible: true,
    helpText: "Utilizadores, privilégios, política de passwords/MFA, procedimento de saída de colaborador." },
  { number: 5, name: "Proteção de Dados e Privacidade", clientVisible: true,
    helpText: "Classificação de dados, encriptação implementada. Não incluir decisões legais do cliente (retenção, EPD) — essas vão só como nota no roadmap." },
  { number: 6, name: "Matriz de Risco", clientVisible: true,
    helpText: "Só riscos técnicos/infraestrutura que geres: ativo, ameaça, probabilidade, impacto, mitigação já existente. 3 níveis (Baixo/Médio/Alto) chegam." },
  { number: 7, name: "Disaster Recovery & Continuidade", clientVisible: true,
    helpText: "Política de backup 3-2-1, RTO/RPO. Para serviços cloud/SaaS, indicar que a disponibilidade depende do SLA do fornecedor, não é responsabilidade tua." },
  { number: 8, name: "Plano de Resposta a Incidentes", clientVisible: true,
    helpText: "Classificação de incidentes, cadeia de contactos de emergência, procedimento passo a passo (ex: ransomware)." },
  { number: 9, name: "Manutenção e Higiene Digital", clientVisible: true,
    helpText: "Calendário de evidências obrigatórias (patches, AV, scans) — o que é feito e com que frequência." },
  { number: 10, name: "Formação e Sensibilização", clientVisible: true,
    helpText: "Workshop realizado, temas abordados, resultado do teste de phishing, periodicidade obrigatória." },
  { number: 11, name: "Conformidade e Boas Práticas", clientVisible: true,
    helpText: "Checklist de boas práticas implementadas, com referência à secção onde cada uma está detalhada." },
  { number: 12, name: "Recomendações e Roadmap", clientVisible: true,
    helpText: "Ações urgentes e melhorias sugeridas. Inclui aqui, como notas separadas, assuntos fora do teu âmbito (seguro de cibersegurança, política de retenção de dados) como responsabilidade do Cliente/EPD." },
  { number: 13, name: "Plano de Ação", clientVisible: false,
    helpText: "Interno — ações realizadas e pendentes, para o teu acompanhamento. Não sai na versão do cliente." },
  { number: 14, name: "Termo de Responsabilidade e Assinaturas", clientVisible: true,
    helpText: "Declaração de conformidade, normas de utilização aceites, exclusão de responsabilidade, assinaturas." },
  { number: 15, name: "Anexos", clientVisible: false,
    helpText: "Interno — índice de evidências (prints, listas de presença) e onde estão arquivadas." },
];

export function getSectionDefinition(number: number): SectionDefinition | undefined {
  return DOSSIER_SECTIONS.find((s) => s.number === number);
}
