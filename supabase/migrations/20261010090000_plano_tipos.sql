-- Plano de manutenção v2 — tipos novos.
-- Ficheiro à parte: ALTER TYPE ... ADD VALUE tem de estar confirmado antes de o valor ser usado.

ALTER TYPE public.task_frequency ADD VALUE IF NOT EXISTS 'once';           -- tarefa única (ex.: uma campanha de phishing)
ALTER TYPE public.evidence_type ADD VALUE IF NOT EXISTS 'asset_review';     -- atualização do inventário do parque informático
ALTER TYPE public.evidence_type ADD VALUE IF NOT EXISTS 'config_review';    -- revisão da configuração de segurança dos equipamentos
ALTER TYPE public.evidence_type ADD VALUE IF NOT EXISTS 'supplier_review';  -- fornecedores e acessos remotos de terceiros
ALTER TYPE public.evidence_type ADD VALUE IF NOT EXISTS 'contacts_review';  -- contactos de emergência do plano de incidentes
