---
name: Registo de auditoria
description: Tabela audit_logs, helper logAudit e página /auditoria (só admin) para rastrear acessos, alterações e exportações
type: feature
---

- Tabela `audit_logs` (user_id, user_email, action, entity_type, entity_id, dossier_id, details, created_at). Imutável: só SELECT (admin) e INSERT (próprio utilizador).
- Helper `src/lib/audit.ts` → `logAudit(action, { dossierId, entityType, entityId, details })`; nunca lança erro.
- Ações registadas no cliente: dossier_view, dossier_section_view, dossier_section_update, dossier_section_generate, dossier_status_update, credentials_view, portal_view.
- Exportações são registadas do lado do servidor na edge function `dossier-export` (action `dossier_export`) — não duplicar no cliente.
- Página `/auditoria` (AdminRoute) com filtros por tipo (acesso/alteração/exportação) e pesquisa.
