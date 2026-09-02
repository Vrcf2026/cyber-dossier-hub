// src/lib/sectionGuide.ts
// Guia detalhado por secção: o que colocar, exemplos reais, erros comuns,
// referências normativas. Usado pelo componente SectionGuide (drawer lateral).

export interface SectionGuide {
  number: number;
  what: string;          // o que esta secção deve conter
  mandatory: string[];   // campos obrigatórios / indispensáveis
  optional: string[];    // campos opcionais mas recomendados
  example: string;       // exemplo real preenchido (markdown)
  mistakes: string[];    // erros comuns a evitar
  nis2ref?: string;      // referência NIS2 relevante
  rgpdref?: string;      // referência RGPD relevante
}

export const SECTION_GUIDES: SectionGuide[] = [
  {
    number: 1,
    what: "Identifica quem é o cliente, qual o âmbito do trabalho, e quem é responsável por quê. É o 'contrato técnico' do dossier.",
    mandatory: ["Nome, NIF, morada, setor de atividade", "Número de colaboradores", "Contacto responsável pelo lado do cliente", "Período de validade do dossier", "Âmbito: o que está incluído e o que fica fora"],
    optional: ["Volumes de dados tratados", "Sistemas críticos identificados à partida", "Referência ao contrato de prestação de serviços"],
    example: `**Empresa:** Clínica Dentária Sorriso, Lda. | NIF: 509 123 456
**Morada:** Rua do Comércio 45, 2870-000 Montijo
**Setor:** Saúde — Clínica Dentária | **Colaboradores:** 6
**Responsável:** Dra. Sofia Martins (sócia-gerente) | sofiam@sorriso.pt | 915 000 001

**Âmbito:** Este dossier cobre a infraestrutura de TI da clínica — rede, servidores, endpoints, backups e acessos. Não cobre decisões jurídicas (contratos com fornecedores, seguros, questões legais RGPD) que são da responsabilidade do cliente.

**Validade:** Maio 2025 – Maio 2026. Revisão anual obrigatória ou após incidente grave.`,
    mistakes: ["Não definir o âmbito → depois és responsabilizado por tudo", "Não indicar validade → o dossier fica 'eterno' e desactualizado", "Colocar a morada mas não o contacto directo do responsável"],
    nis2ref: "Art. 21.º — Obrigação de identificar o âmbito de gestão de risco",
  },
  {
    number: 2,
    what: "Lista completa de tudo o que existe: hardware, software, serviços cloud, licenças. Base de tudo o resto — sem inventário não há gestão de risco.",
    mandatory: ["Servidores (nome, IP, OS, função)", "PCs e portáteis (modelo, OS, utilizador)", "Equipamento de rede (router, switches, APs)", "Software crítico e versões", "Serviços cloud activos"],
    optional: ["Impressoras e periféricos", "Equipamento IoT / médico", "Licenças e datas de expiração", "Dispositivos móveis com acesso a email corporativo"],
    example: `| Dispositivo | IP | OS | Função | Criticidade |
|---|---|---|---|---|
| SRV-001 Dell PowerEdge | 192.168.20.10 | WS 2022 Std | AD + Dentix + SQL | Alta |
| NAS QNAP TS-464 | 192.168.20.20 | QTS 5.1.7 | Backup local | Alta |
| PC-RECEP01 HP EliteDesk | 192.168.10.11 | Win 11 Pro | Receção | Média |

**Software crítico:** Dentix Server 8.3, Microsoft SQL Server 2019, Iperius Backup 7.8
**Cloud:** Microsoft 365 Business (6 lic.), Backblaze B2, NextDNS Pro, Bitwarden Teams`,
    mistakes: ["Listar só o servidor e esquecer os PCs", "Não indicar versões do software crítico (impossível saber se está desactualizado)", "Não distinguir local vs. cloud"],
    nis2ref: "Art. 21.º, n.º 2, al. a) — Inventário de ativos como base da política de segurança",
  },
  {
    number: 3,
    what: "Como a rede está organizada: segmentação, acessos remotos, o que está exposto à internet, e como o tráfego flui entre zonas.",
    mandatory: ["ISP e tipo de ligação", "Router/firewall (marca, modelo, firmware)", "VLANs ou segmentação existente", "Acessos remotos (VPN, RDP, TeamViewer...)", "Portas abertas para o exterior"],
    optional: ["Topologia desenhada (diagrama)", "WiFi — SSIDs e políticas de acesso", "Filtragem DNS", "Monitorização de rede activa"],
    example: `**ISP:** MEO Fibra 1Gbps | **Router:** Reyee RG-EG105G (fw 3.3.1) — gerido pela VRCF via Reyee Cloud

**Segmentação por VLANs:**
| VLAN | Rede | Utilização |
|---|---|---|
| 10 | 192.168.10.0/24 | Clínica — PCs de trabalho |
| 20 | 192.168.20.0/24 | Servidores |
| 30 | 192.168.30.0/24 | IoT / Equipamento médico |
| 40 | 192.168.40.0/24 | WiFi visitantes (sem acesso interno) |

**Acesso remoto:** RDP com porta personalizada (a substituir por VPN — planeado Q3 2025)
**DNS:** NextDNS Pro em todos os endpoints — filtragem de domínios maliciosos activa`,
    mistakes: ["Não mencionar acessos remotos (é onde estão os maiores riscos)", "Não registar o firmware do router (pode estar desactualizado)", "Dizer 'têm firewall' sem especificar o quê"],
    nis2ref: "Art. 21.º, n.º 2, al. e) — Segurança na aquisição, desenvolvimento e manutenção de redes",
  },
  {
    number: 4,
    what: "Quem tem acesso a quê, com que privilégios, e como as contas são geridas (criação, alteração, saída de colaborador).",
    mandatory: ["Lista de utilizadores e perfis (admin vs. utilizador comum)", "MFA — onde está activo e onde não está", "Política de passwords (comprimento mínimo, complexidade, expiração)", "Procedimento de saída de colaborador", "Contas de serviço / partilhadas"],
    optional: ["Gestão de passwords (cofre)", "Acesso privilegiado (PAM)", "Revisão periódica de acessos", "Single Sign-On (SSO)"],
    example: `**Active Directory:** domínio sorriso.local | **M365:** Business (6 licenças)
**MFA:** Activo no M365 para todos ✓ | Não disponível no AD local (sem Azure AD Join)

| Utilizador | Perfil AD | M365 | Sistema clínico | Acesso remoto |
|---|---|---|---|---|
| odin (VRCF) | Admin Global | Admin | Supervisor | Sim |
| sofiam | Domain User | Business | Admin | Não |
| recepcao | Domain User | Business | Básico | Não |

**Passwords:** mín. 12 caracteres, complexidade, expiração 180 dias
**Saída de colaborador:** revogar AD + M365 + Bitwarden no próprio dia — responsabilidade VRCF (notificação pelo cliente)
**Cofre de passwords:** Bitwarden Teams — gerido pela VRCF`,
    mistakes: ["Não registar contas de admin (é o dado mais crítico)", "Não definir o procedimento de saída → ex-colaboradores ficam com acesso", "Dizer 'têm MFA' sem especificar em que sistemas"],
    nis2ref: "Art. 21.º, n.º 2, al. i) — Controlo de acesso e autenticação",
    rgpdref: "Art. 32.º RGPD — Medidas técnicas de segurança dos dados pessoais",
  },
  {
    number: 5,
    what: "Que dados pessoais são tratados, onde estão, como estão protegidos, e se cumprem o RGPD. O teu âmbito é técnico — não decides sobre retenção ou base legal (isso é do DPO/advogado do cliente).",
    mandatory: ["Categorias de dados tratados (e se incluem dados sensíveis — art. 9.º RGPD)", "Onde estão armazenados (servidor local, cloud, papel)", "Encriptação em repouso e em trânsito", "Quem tem acesso (mapeamento básico)", "Transferências para fora da UE"],
    optional: ["Classificação de dados por criticidade", "Política de retenção (nota: decidida pelo cliente, não por ti)", "DPO designado ou não", "Registos de atividades de tratamento (nota: obrigação do cliente)"],
    example: `**Dados tratados:** dados de saúde de doentes (cat. especial — art. 9.º RGPD): identificação, histórico clínico, radiografias, tratamentos, pagamentos.

**Armazenamento:** SQL Server no SRV-001 (VLAN 20, sem acesso directo à internet). Radiografias em Planmeca Romexis (VLAN 30 isolada).

**Encriptação:** HTTPS/TLS no Dentix web client. Disco do SRV-001 sem BitLocker activo — **RECOMENDAÇÃO: activar BitLocker** (ver Roadmap).

**Transferências fora da UE:** Backblaze B2 — datacenter Amesterdão (UE) ✓

**Nota (fora do âmbito técnico):** DPO não designado e sem registo de atividades de tratamento — obrigação legal do cliente; recomendado consultar advogado/DPO externo.`,
    mistakes: ["Decidir sobre base legal ou períodos de retenção — não é o teu papel", "Não mencionar dados sensíveis (saúde, menores, etc.) quando existem", "Esquecer as transferências cloud (Dropbox, Google Drive pessoal, etc.)"],
    nis2ref: "Art. 21.º, n.º 2, al. h) — Criptografia e gestão de dados",
    rgpdref: "Art. 32.º e 35.º RGPD — Segurança do tratamento e AIPD",
  },
  {
    number: 6,
    what: "Mapa dos riscos técnicos que identificaste — não riscos de negócio ou legais. Probabilidade × Impacto = nível de risco. Indica o que já mitiga e o que falta.",
    mandatory: ["Ativo em risco", "Ameaça / cenário de risco", "Probabilidade (1-5 ou Baixo/Médio/Alto)", "Impacto (1-5 ou Baixo/Médio/Alto)", "Controlo existente", "Risco residual"],
    optional: ["Custo estimado de mitigação", "Prazo sugerido", "Responsável pela mitigação"],
    example: `| Ativo | Ameaça | P | I | Nível | Controlo atual | Risco residual |
|---|---|---|---|---|---|---|
| SRV-001 | Ransomware via RDP exposto | Alta | Alta | **Crítico** | AV Bitdefender, RDP com porta custom | Alto — RDP ainda exposto |
| Dados Dentix | Acesso não autorizado | Média | Alta | **Alto** | AD + passwords políticas | Médio — sem MFA no AD |
| Backups | Falha silenciosa sem teste | Média | Alta | **Alto** | Iperius + Backblaze | Médio — sem testes de restauro |
| Utilizadores | Phishing / engenharia social | Alta | Média | **Alto** | Nenhum (sem formação) | Alto |`,
    mistakes: ["Incluir riscos legais ou de seguros (não são teus)", "Não indicar o controlo já existente (parece que não fizeste nada)", "Nível de risco sem critério claro — define a escala no início"],
    nis2ref: "Art. 21.º, n.º 1 — Obrigação de análise de risco proporcional",
  },
  {
    number: 7,
    what: "Política de backup (o que, onde, quando, quanto tempo) e plano de recuperação em caso de desastre. Inclui RTO e RPO definidos.",
    mandatory: ["O que é copiado (dados, sistemas, configurações)", "Onde estão os backups (local, remoto, cloud)", "Frequência e hora de execução", "Retenção (quantos dias/semanas de histórico)", "RTO — Recovery Time Objective (quanto tempo para recuperar)", "RPO — Recovery Point Objective (perda máxima de dados aceitável)"],
    optional: ["Regra 3-2-1 aplicada (3 cópias, 2 meios, 1 offsite)", "Testes de restauro (frequência e resultado)", "Plano de continuidade para serviços cloud (dependência do SLA do fornecedor)"],
    example: `**Política 3-2-1 aplicada:** ✓
- **Cópia 1 (local):** SRV-001 → NAS QNAP TS-464 via Iperius Backup | Diário, 23h00 | Retenção: 30 dias + snapshots
- **Cópia 2 (remoto):** SRV-001 → Backblaze B2 (Amesterdão) via Iperius | Diário, 01h00 | Retenção: 90 dias

**RPO:** 24 horas | **RTO estimado:** 4-8 horas (restauro total do SRV-001)

**Testes de restauro:** Não realizados até à data.
⚠️ **Acção urgente:** agendar teste de restauro trimestral — sem teste, o backup não é garantido.

**Serviços cloud (M365):** redundância gerida pela Microsoft (SLA 99,9%). Não está incluído no backup local — emails e SharePoint dependem exclusivamente da Microsoft.`,
    mistakes: ["Dizer 'têm backup' sem especificar o quê, onde e com que retenção", "Não mencionar testes de restauro (é o ponto mais crítico e mais ignorado)", "Assumir que M365 tem backup — não tem, por defeito"],
    nis2ref: "Art. 21.º, n.º 2, al. c) — Continuidade das atividades e gestão de crises",
  },
  {
    number: 8,
    what: "O que fazer quando algo corre mal: quem contactar, em que ordem, e quais os passos técnicos concretos para os cenários mais prováveis.",
    mandatory: ["Classificação de incidentes (baixo/médio/alto/crítico)", "Contactos de emergência (VRCF + cliente + fornecedores críticos)", "Procedimento passo-a-passo para pelo menos: ransomware e falha de servidor", "Prazo de notificação CNCS/APD se aplicável"],
    optional: ["Template de registo de incidente", "Lista de fornecedores de IR externos", "Lições aprendidas de incidentes anteriores", "Comunicação externa (cliente comunica aos seus clientes?)"],
    example: `**Contactos de emergência:**
| Contacto | Função | Telefone | Disponibilidade |
|---|---|---|---|
| Valter Oliveira (VRCF) | MSP principal | 961 000 000 | Seg-Sex 9h-18h / Urgências 24/7 |
| Dra. Sofia Martins | Responsável cliente | 915 000 001 | Horário clínica |

**Cenário: Suspeita de ransomware**
1. Isola imediatamente os sistemas afectados da rede (desliga cabo ou desactiva porta no switch)
2. Contacta VRCF — 961 000 000
3. NÃO reinicies os sistemas afectados
4. VRCF avalia extensão e inicia restauro a partir do backup do NAS (se limpo)
5. Se confirmado ransomware grave: notificação ao CNCS em 72h (obrigação NIS2)

**Prazo de notificação:** Incidentes com impacto significativo → CNCS em 72h (NIS2); violação de dados pessoais → APD em 72h (RGPD art. 33.º)`,
    mistakes: ["Plano genérico sem números de telefone reais", "Não definir quando notificar as autoridades (CNCS, APD)", "Esquecer que o cliente também precisa de saber o que fazer antes de te conseguir contactar"],
    nis2ref: "Art. 23.º — Obrigações de notificação de incidentes",
    rgpdref: "Art. 33.º RGPD — Notificação de violação à autoridade de controlo",
  },
  {
    number: 9,
    what: "O que é feito regularmente para manter os sistemas seguros: patches, antivírus, monitorização. É aqui que documentas as evidências de manutenção contínua.",
    mandatory: ["Política de actualizações (quem, quando, como)", "Antivírus/EDR — produto, versão, gestão centralizada", "Gestão de patches — ferramenta e frequência", "O que é monitorizado e por quem"],
    optional: ["Calendário de manutenção acordado com o cliente", "Procedimento de aplicação de patches críticos (urgência vs. janela normal)", "Ferramentas de monitorização (RMM, alertas)", "Scan de vulnerabilidades periódico"],
    example: `**Actualizações de sistema:** Windows Update gerido via Action1 — críticos aplicados em 48h, outros na janela de manutenção mensal (1.º sábado do mês, 01h00).

**Antivírus/EDR:** Bitdefender GravityZone — gerido centralmente pela VRCF. Definições actualizadas automaticamente. Scans completos semanais (sábados, 03h00).

**Monitorização:** Action1 (RMM) — alertas de disco, CPU, falha de agente. NextDNS — bloqueio de domínios maliciosos com log. Alertas enviados para valter@vrcf.pt.

**Calendário de evidências obrigatórias:**
- Semanal: verificação de alertas Bitdefender e confirmação de backup
- Mensal: revisão de patches, relatório ao cliente
- Trimestral: teste de restauro, revisão de acessos
- Semestral: campanha de phishing, scan de vulnerabilidades`,
    mistakes: ["Não mencionar a ferramenta de gestão de patches — 'actualizações automáticas' não chega", "Não definir quem monitoriza os alertas e com que periodicidade", "Não incluir o calendário — fica tudo vago e não documentável"],
    nis2ref: "Art. 21.º, n.º 2, al. e) — Manutenção e higiene digital",
  },
  {
    number: 10,
    what: "Formação e sensibilização dos colaboradores: o que foi feito, quando, com que resultado, e o que está planeado.",
    mandatory: ["Formação realizada: data, tema, participantes", "Resultado de testes de phishing (se realizados)", "Periodicidade prevista para formação futura"],
    optional: ["Listas de presença (em anexo)", "Temas abordados e materiais usados", "Política de uso aceitável assinada pelos colaboradores", "Procedimentos comunicados (o que fazer se receber email suspeito)"],
    example: `**Sessão de sensibilização:** Não realizada até à data.
**Planeado:** Sessão de 1h em Junho 2025 — temas: phishing, passwords, dispositivos móveis, notificação de incidentes.

**Teste de phishing:** Campanha realizada em Abril 2025:
- Emails enviados: 6 | Cliques: 1 (receção) | Taxa de clique: 16,7%
- Acção: sessão de formação individual com a colaboradora afectada

**Política de uso aceitável:** Não existe ainda — a criar e assinar por todos os colaboradores até Julho 2025 (ver Roadmap).`,
    mistakes: ["Dizer 'têm formação' sem data, temas e participantes — não é verificável", "Não ligar os resultados do phishing à formação dada", "Esquecer que a lista de presença é a evidência — deve estar nos Anexos"],
    nis2ref: "Art. 21.º, n.º 2, al. g) — Práticas básicas de higiene e formação em cibersegurança",
  },
  {
    number: 11,
    what: "Checklist de conformidade: o que está implementado, o que falta, e referência às secções onde cada item está detalhado.",
    mandatory: ["Checklist de boas práticas básicas (NIS2 / CIS Controls)", "Estado de cada item: implementado / parcial / não implementado", "Referência à secção onde está documentado"],
    optional: ["Certificações existentes (ISO 27001, etc.)", "Auditorias anteriores e resultados", "Seguro de cibersegurança"],
    example: `| Controlo | Estado | Ref. |
|---|---|---|
| Inventário de ativos actualizado | ✓ Implementado | Sec. 2 |
| Segmentação de rede | ✓ Implementado | Sec. 3 |
| MFA em serviços cloud | ✓ Implementado | Sec. 4 |
| MFA em sistemas internos | ⚠ Parcial (M365 só) | Sec. 4 |
| Backup 3-2-1 com cópia offsite | ✓ Implementado | Sec. 7 |
| Testes de restauro regulares | ✗ Não implementado | Sec. 7 |
| Formação anual de colaboradores | ✗ Não implementado | Sec. 10 |
| Plano de resposta a incidentes | ✓ Implementado | Sec. 8 |
| Seguro cyber | ✗ Não contratado | — |`,
    mistakes: ["Marcar tudo como 'implementado' para parecer bem — é contraproducente e expõe-te a responsabilidade", "Não referenciar as secções — fica uma lista solta sem ligação ao resto do dossier"],
    nis2ref: "Art. 21.º — Lista de medidas mínimas de gestão de riscos de cibersegurança",
  },
  {
    number: 12,
    what: "O que recomendas que seja feito, por ordem de prioridade, com estimativa de custo e prazo. Inclui aqui também o que é responsabilidade do cliente (decisões legais, seguros) — mas separado e claramente assinalado.",
    mandatory: ["Lista de recomendações técnicas prioritárias", "Prazo sugerido (imediato / curto prazo / médio prazo)", "Estimativa de custo (ordem de grandeza)"],
    optional: ["Responsável pela implementação", "Dependências (o que bloqueia o quê)", "Notas sobre responsabilidades do cliente (DPO, seguro, etc.)"],
    example: `**Prioridade Alta (imediato):**
1. Substituir acesso RDP por VPN — risco crítico de exposição | Custo: ~€150-300 | Prazo: 30 dias
2. Agendar e realizar teste de restauro de backup | Custo: incluído no contrato | Prazo: 15 dias

**Prioridade Média (3 meses):**
3. Activar BitLocker no SRV-001 | Custo: incluído no contrato
4. Sessão de formação de colaboradores | Custo: ~€200 | Prazo: Junho 2025
5. Criar e assinar Política de Uso Aceitável

**Prioridade Baixa (6-12 meses):**
6. Scan de vulnerabilidades externo (Nessus ou similar) | Custo: ~€300-500/ano

---
*Nota (responsabilidade do cliente — fora do âmbito técnico VRCF):*
- *Designar DPO ou responsável de protecção de dados*
- *Avaliar contratação de seguro de cibersegurança*
- *Elaborar registos de atividades de tratamento (art. 30.º RGPD)*`,
    mistakes: ["Colocar recomendações legais como se fossem tuas — cria confusão sobre responsabilidades", "Não priorizar — uma lista de 20 itens sem ordem é inútil", "Não indicar custo — o cliente precisa de decidir com informação"],
    nis2ref: "Art. 21.º — Base para o roadmap de melhoria contínua",
  },
  {
    number: 13,
    what: "Secção interna (não sai para o cliente): o teu plano de acção concreto, o que já fizeste, o que falta, com datas e estado. É o teu 'kanban' do projecto.",
    mandatory: ["Acções realizadas com data", "Acções pendentes com prazo e responsável", "Estado de cada acção"],
    optional: ["Notas de visitas e reuniões", "Emails e comunicações relevantes (resumo)", "Bloqueios identificados"],
    example: `| Acção | Estado | Data | Notas |
|---|---|---|---|
| Levantamento inicial e inventário | ✓ Concluído | 14/05/2025 | CSV Action1 exportado |
| Instalação Bitdefender GravityZone | ✓ Concluído | 15/05/2025 | Todos os endpoints |
| Configuração NextDNS | ✓ Concluído | 15/05/2025 | |
| Substituir RDP por VPN | 🔄 Em curso | Prazo: 15/06/2025 | A aguardar aprovação cliente |
| Teste de restauro | ⏳ Pendente | Prazo: 30/05/2025 | |
| Sessão de formação | ⏳ Pendente | Prazo: 30/06/2025 | Proposta enviada |`,
    mistakes: ["Não actualizar esta secção — perde o valor de acompanhamento", "Colocar aqui informação que devia ir na secção 8 (incidentes) ou 12 (recomendações)"],
  },
  {
    number: 14,
    what: "Declaração formal de que o dossier foi entregue, revisado e aceite por ambas as partes. Protege o MSP e o cliente.",
    mandatory: ["Declaração de que o dossier reflecte o estado dos sistemas na data indicada", "Responsabilidades de cada parte após entrega", "Data e assinatura do cliente e do MSP"],
    optional: ["Cláusula de limitação de responsabilidade do MSP", "Referência às normas aplicáveis (NIS2, RGPD)", "Próxima data de revisão"],
    example: `O presente dossier foi elaborado com base na informação recolhida durante o levantamento de infraestrutura realizado em Maio de 2025 e reflecte o estado dos sistemas à data de entrega.

A VRCF – Informática & Segurança assume a responsabilidade técnica pelo conteúdo das secções de âmbito TI. As recomendações de carácter legal, regulatório ou de seguro são da responsabilidade exclusiva do cliente.

**Data de entrega:** ___/___/2025
**Assinatura VRCF:** _________________________
**Assinatura Cliente:** _________________________`,
    mistakes: ["Não obter assinatura — sem ela o dossier não tem validade formal", "Não incluir cláusula de responsabilidade — expõe-te a reclamações por matérias fora do teu âmbito"],
    rgpdref: "Art. 28.º RGPD — Responsabilidades entre responsável e subcontratante",
  },
  {
    number: 15,
    what: "Secção interna (não sai para o cliente): índice de evidências físicas ou digitais de suporte ao dossier — prints, logs, listas de presença, relatórios de ferramentas.",
    mandatory: ["Índice dos documentos de suporte", "Localização onde estão arquivados (pasta partilhada, cofre digital, etc.)"],
    optional: ["Prints de configurações críticas", "Relatórios de ferramentas (Action1, Bitdefender, Iperius)", "Listas de presença de formação", "Emails de aprovação do cliente para acções realizadas"],
    example: `**Arquivo:** /VRCF/Clientes/Sorriso/Dossier2025/Evidencias/

| Documento | Data | Localização |
|---|---|---|
| Export Action1 — Hardware | 14/05/2025 | /Evidencias/action1_hardware.csv |
| Export Action1 — Software | 14/05/2025 | /Evidencias/action1_software.csv |
| Screenshot Bitdefender — todos online | 15/05/2025 | /Evidencias/bd_status.png |
| Log Iperius Backup — último mês | 31/05/2025 | /Evidencias/iperius_maio.html |
| Relatório NextDNS — Maio | 31/05/2025 | /Evidencias/nextdns_maio.pdf |`,
    mistakes: ["Não guardar as evidências — o dossier diz 'backup OK' mas sem print não é verificável", "Guardar só localmente no teu PC — se perderes o PC, perdes as evidências"],
  },
];

export function getSectionGuide(number: number): SectionGuide | undefined {
  return SECTION_GUIDES.find(g => g.number === number);
}
