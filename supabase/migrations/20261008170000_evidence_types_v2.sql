-- ============================================================
-- NOVOS TIPOS DE EVIDÊNCIA
-- Cobrem requisitos típicos de questionários de fornecedores
-- (VDA ISA / TISAX) e NIS2 sem criar módulos novos:
--   physical_access_review → revisão anual de chaves/códigos de alarme
--   media_disposal         → destruição/limpeza de discos e papel
--   training_session       → sessão de formação/sensibilização
-- Ficheiro separado porque ALTER TYPE ... ADD VALUE tem de ficar
-- em commit antes de os valores poderem ser usados.
-- ============================================================

ALTER TYPE public.evidence_type ADD VALUE IF NOT EXISTS 'physical_access_review';
ALTER TYPE public.evidence_type ADD VALUE IF NOT EXISTS 'media_disposal';
ALTER TYPE public.evidence_type ADD VALUE IF NOT EXISTS 'training_session';
