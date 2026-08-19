// supabase/functions/dossier-intake/index.ts
//
// Chat de intake: recebe mensagens + ficheiros do utilizador, extrai
// factos estruturados, e quando tem informação suficiente preenche
// todas as secções do dossier de uma vez.
//
// Modos:
//   mode: "chat"    → conversa normal, devolve resposta + perguntas pendentes
//   mode: "fill"    → preenche todas as secções com os factos já reunidos

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function callClaude(messages: { role: string; content: any }[], system: string, maxTokens = 3000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.content?.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n") ?? "";
}

// Secções do dossier com descrição do que cada uma deve conter
const SECTIONS: Record<number, { name: string; needs: string[] }> = {
  1:  { name: "Identificação e Âmbito", needs: ["nome empresa", "NIF", "setor", "nº colaboradores", "contacto responsável", "âmbito do dossier"] },
  2:  { name: "Inventário de Ativos", needs: ["servidores", "PCs/portáteis", "dispositivos móveis", "impressoras", "equipamento de rede", "serviços cloud", "software crítico"] },
  3:  { name: "Arquitetura e Segurança de Rede", needs: ["ISP/router", "firewall", "switches", "WiFi", "segmentação de rede", "acesso remoto", "VPN"] },
  4:  { name: "Gestão de Identidades e Acessos (IAM)", needs: ["Active Directory/Azure AD", "contas de admin", "política de passwords", "MFA", "contas partilhadas", "utilizadores com acesso remoto"] },
  5:  { name: "Proteção de Dados e Privacidade", needs: ["dados pessoais tratados", "RGPD", "classificação de dados", "encriptação", "política de retenção"] },
  6:  { name: "Matriz de Risco", needs: ["riscos identificados", "probabilidade", "impacto", "medidas de mitigação"] },
  7:  { name: "Disaster Recovery & Continuidade", needs: ["plano de continuidade", "RTO", "RPO", "testes de recuperação"] },
  8:  { name: "Plano de Resposta a Incidentes", needs: ["procedimentos de resposta", "contactos de emergência", "comunicação de incidentes", "histórico de incidentes"] },
  9:  { name: "Manutenção e Higiene Digital", needs: ["política de atualizações", "antivírus/EDR", "gestão de patches", "monitorização"] },
  10: { name: "Formação e Sensibilização", needs: ["formação em cibersegurança", "testes de phishing", "política de uso aceitável"] },
  11: { name: "Conformidade e Boas Práticas", needs: ["certificações", "auditorias anteriores", "conformidade NIS2/RGPD", "seguros cyber"] },
  12: { name: "Recomendações e Roadmap", needs: ["melhorias prioritárias", "prazo", "custo estimado"] },
  13: { name: "Plano de Ação", needs: ["ações concretas", "responsável", "prazo", "estado"] },
  14: { name: "Termo de Responsabilidade e Assinaturas", needs: ["declaração de responsabilidade", "data", "assinatura do cliente"] },
  15: { name: "Anexos", needs: ["documentos de suporte"] },
};

const SYSTEM_INTAKE = `És um assistente especializado em cibersegurança para PMEs portuguesas, a ajudar a preencher um dossier técnico de cibersegurança baseado na NIS2 e boas práticas.

O teu objetivo é recolher toda a informação necessária para preencher as 15 secções do dossier. Fazes isso através de uma conversa natural com o consultor (que pode dar informação desorganizada, em fragmentos, com apontamentos de visita, ou através de ficheiros exportados de ferramentas como Action1).

Regras:
- Faz MÁXIMO 3 perguntas por resposta — as mais importantes primeiro
- Agrupa perguntas relacionadas numa só
- Quando receberes um ficheiro (CSV, PDF, imagem), extrai todos os factos relevantes sem pedir confirmação de cada um — só pergunta o que faltou
- Quando achares que tens informação suficiente para a maioria das secções, avisa: "Tenho informação suficiente para preencher o dossier. Posso fazê-lo agora, ou queres acrescentar mais detalhes sobre [X, Y]?"
- Nunca inventas dados — se faltam, assinalas como "[A CONFIRMAR]" na geração final
- Comunica em português europeu informal, direto ao ponto`;

const SYSTEM_EXTRACT = `És um extrator de factos estruturados para dossiers de cibersegurança.
Recebes uma conversa de intake e devolves APENAS um JSON válido (sem markdown, sem texto antes ou depois) com esta estrutura:

{
  "facts": [
    {
      "category": "asset|identity|network|policy|risk|backup|incident|training|compliance|contact|other",
      "key": "identificador-unico-sem-espacos",
      "label": "Nome legível",
      "data": { /* campos relevantes para esta categoria */ }
    }
  ],
  "missing": ["lista de informação que faltou recolher, string por item"],
  "ready_to_fill": true
}

Para a categoria "asset": inclui campos tipo, hostname, ip, os, localização, criticidade, fabricante, software_critico.
Para "identity": username, tipo (admin/user/service), mfa, acesso_remoto.
Para "network": tipo (router/firewall/switch/wifi/vpn), fabricante, modelo, ip, segmento.
Para "policy": nome, estado (definida/implementada/verificada), detalhe.
Para "risk": descrição, probabilidade (1-5), impacto (1-5), mitigação.
Para "backup": alvo, frequência, localização, último_teste, rpo, rto.
Para "contact": nome, cargo, email, telefone, tipo (cliente/fornecedor/emergência).`;

const SYSTEM_FILL = `És um especialista em cibersegurança a redigir secções de um dossier técnico para uma PME portuguesa.
Recebes factos estruturados extraídos de uma conversa de intake e rediges o conteúdo final de cada secção.
Regras:
- Português europeu, linguagem clara sem jargão excessivo
- Usa tabelas markdown quando a informação for tabular (listas de equipamento, riscos, ações)
- Não inventes — usa "[A CONFIRMAR: descrição do que falta]" para informação em falta
- Cada secção deve ser completa e autónoma: um revisor não precisa de ler outras secções para perceber esta
- Não escrevas introdução nem conclusão sobre o teu trabalho — só o conteúdo final da secção`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return err("Não autenticado.", 401);

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return err("Sessão inválida.", 401);

    const body = await req.json();
    const { dossierId, mode, message, attachments } = body;
    // attachments: [{ name, mediaType, base64 }]

    if (!dossierId) return err("dossierId obrigatório.");

    // Buscar dossier + cliente
    const { data: dossier } = await sb.from("dossiers")
      .select("*, clients(name, nif, sector, num_employees, email, phone, contact_person, address)")
      .eq("id", dossierId).single();
    if (!dossier) return err("Dossier não encontrado.", 404);

    // Buscar histórico do intake
    const { data: history } = await sb.from("dossier_intake_messages")
      .select("role, content").eq("dossier_id", dossierId).order("created_at");

    const messages: { role: string; content: any }[] = (history ?? []).map((m: any) => ({
      role: m.role, content: m.content,
    }));

    // ─── MODO CHAT ─────────────────────────────────────────────────────────
    if (mode === "chat") {
      if (!message?.trim() && (!attachments || attachments.length === 0)) {
        return err("message ou attachments obrigatório.");
      }

      // Construir o content da mensagem do utilizador (texto + ficheiros)
      const TEXTUAL = ["text/csv", "text/plain", "application/json", "text/html", "text/markdown"];
      const userContentBlocks: any[] = [];

      if (attachments?.length) {
        for (const att of attachments) {
          const isText = TEXTUAL.includes(att.mediaType) || /\.(csv|txt|json|html?|md)$/i.test(att.name);
          if (isText) {
            try {
              const decoded = atob(att.base64);
              const text = decoded.length > 25000 ? decoded.slice(0, 25000) + "\n[truncado]" : decoded;
              userContentBlocks.push({ type: "text", text: `[Ficheiro: ${att.name}]\n${text}` });
            } catch { /* ignorar */ }
          } else if (att.mediaType === "application/pdf") {
            userContentBlocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: att.base64 } });
          } else if (att.mediaType?.startsWith("image/")) {
            userContentBlocks.push({ type: "image", source: { type: "base64", media_type: att.mediaType, data: att.base64 } });
          }
        }
      }

      if (message?.trim()) {
        userContentBlocks.push({ type: "text", text: message });
      }

      const userContent = userContentBlocks.length === 1 && userContentBlocks[0].type === "text"
        ? userContentBlocks[0].text
        : userContentBlocks;

      // Contexto do cliente no system (primeira mensagem)
      const client = dossier.clients;
      const clientCtx = `Cliente: ${client?.name ?? "?"}, NIF: ${client?.nif ?? "?"}, Setor: ${client?.sector ?? "?"}, Colaboradores: ${client?.num_employees ?? "?"}`;

      const systemWithCtx = messages.length === 0
        ? `${SYSTEM_INTAKE}\n\nContexto já conhecido sobre o cliente:\n${clientCtx}`
        : SYSTEM_INTAKE;

      // Chamar Claude
      const assistantReply = await callClaude(
        [...messages, { role: "user", content: userContent }],
        systemWithCtx,
        1500
      );

      // Guardar mensagens no histórico
      const userMsgStr = typeof userContent === "string"
        ? userContent
        : userContentBlocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n")
          + (attachments?.length ? `\n[${attachments.length} ficheiro(s) anexado(s): ${attachments.map((a: any) => a.name).join(", ")}]` : "");

      await sb.from("dossier_intake_messages").insert([
        { dossier_id: dossierId, role: "user", content: userMsgStr },
        { dossier_id: dossierId, role: "assistant", content: assistantReply },
      ]);

      // Verificar se a IA diz que está pronto
      const readySignal = assistantReply.toLowerCase().includes("tenho informação suficiente") ||
                          assistantReply.toLowerCase().includes("posso preencher") ||
                          assistantReply.toLowerCase().includes("podemos avançar");

      return new Response(JSON.stringify({ reply: assistantReply, readyToFill: readySignal }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ─── MODO FILL ─────────────────────────────────────────────────────────
    if (mode === "fill") {
      if (messages.length === 0) return err("Sem histórico de intake para gerar o dossier.");

      const intakeTranscript = messages.map((m) => `${m.role === "user" ? "Consultor" : "IA"}: ${m.content}`).join("\n\n");

      // 1) Extrair factos estruturados
      const factsRaw = await callClaude(
        [{ role: "user", content: `Conversa de intake:\n\n${intakeTranscript}` }],
        SYSTEM_EXTRACT,
        4000
      );

      let extracted: { facts: any[]; missing: string[]; ready_to_fill: boolean };
      try {
        extracted = JSON.parse(factsRaw.replace(/```json|```/g, "").trim());
      } catch {
        extracted = { facts: [], missing: [], ready_to_fill: true };
      }

      // 2) Guardar factos na tabela dossier_facts
      if (extracted.facts?.length > 0) {
        for (const fact of extracted.facts) {
          await sb.from("dossier_facts").upsert({
            dossier_id: dossierId,
            category: fact.category ?? "other",
            key: fact.key ?? fact.label?.toLowerCase().replace(/\s+/g, "-"),
            label: fact.label,
            data: fact.data ?? {},
            source: "intake",
          }, { onConflict: "dossier_id,category,key" });
        }
      }

      // 3) Buscar secções do dossier
      const { data: sections } = await sb.from("dossier_sections")
        .select("id, section_number, section_name").eq("dossier_id", dossierId).order("section_number");

      const factsForPrompt = JSON.stringify(extracted.facts ?? [], null, 2);
      const clientInfo = dossier.clients;
      const contextHeader = `Empresa: ${clientInfo?.name ?? "?"} | Setor: ${clientInfo?.sector ?? "?"} | Colaboradores: ${clientInfo?.num_employees ?? "?"}`;

      const results: { section_number: number; ok: boolean }[] = [];

      // 4) Preencher cada secção com os factos
      for (const section of (sections ?? [])) {
        const sectionDef = SECTIONS[section.section_number];
        const sectionNeeds = sectionDef?.needs?.join(", ") ?? "";

        // Secções 14 e 15 têm conteúdo mínimo gerado (assinaturas e anexos são manuais)
        if ([14, 15].includes(section.section_number)) {
          const minimal = section.section_number === 14
            ? "Esta secção requer assinatura manuscrita ou digital do cliente e do consultor, a ser preenchida aquando da entrega formal do dossier.\n\n**[A CONFIRMAR: Data de entrega e assinatura das partes]**"
            : "Esta secção destina-se a documentos de suporte: relatórios de ferramentas, prints de configurações, capturas de ecrã, etc.\n\n**[A CONFIRMAR: Adicionar anexos relevantes]**";
          await sb.from("dossier_sections").update({ ai_generated_content: minimal, is_completed: false })
            .eq("id", section.id);
          results.push({ section_number: section.section_number, ok: true });
          continue;
        }

        try {
          const prompt = `Dossier de cibersegurança — ${contextHeader}

Secção a redigir: ${section.section_number}. ${section.section_name}
Esta secção deve cobrir: ${sectionNeeds}

Factos estruturados extraídos do intake (usa estes como base — não inventes o que não está aqui):
${factsForPrompt}

Conversa de intake completa (para contexto adicional):
${intakeTranscript.slice(0, 6000)}

Redige agora o conteúdo completo desta secção.`;

          const content = await callClaude([{ role: "user", content: prompt }], SYSTEM_FILL, 2000);

          await sb.from("dossier_sections").update({
            ai_generated_content: content,
            is_completed: !content.includes("[A CONFIRMAR"),
            data: { notes: "(gerado automaticamente via intake)" },
          }).eq("id", section.id);

          results.push({ section_number: section.section_number, ok: true });
        } catch {
          results.push({ section_number: section.section_number, ok: false });
        }
      }

      // 5) Marcar dossier como intake concluído
      const completed = results.filter((r) => r.ok).length;
      const progress = Math.round((completed / (sections?.length ?? 15)) * 100);
      await sb.from("dossiers").update({ intake_completed: true, progress, status: "em_progresso" }).eq("id", dossierId);

      return new Response(JSON.stringify({
        ok: true,
        sectionsProcessed: completed,
        total: sections?.length ?? 15,
        missingInfo: extracted.missing ?? [],
        progress,
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    return err("mode deve ser 'chat' ou 'fill'.");
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
