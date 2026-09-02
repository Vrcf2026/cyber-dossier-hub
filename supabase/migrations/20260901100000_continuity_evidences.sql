-- ============================================================
-- EVIDÊNCIAS DE CONTINUIDADE
-- Registo cronológico de tudo o que é feito após entrega do
-- dossier: verificações de backup, testes de restauro, patches,
-- revisão de logs, scans, etc. É a prova documental do trabalho
-- de manutenção contínua — protege o MSP em caso de auditoria.
-- ============================================================

CREATE TYPE public.evidence_type AS ENUM (
  'backup_check',       -- verificação que o backup correu
  'restore_test',       -- teste de restauro efectivo
  'patch_update',       -- aplicação de patches/actualizações
  'log_review',         -- revisão de logs de segurança
  'vuln_scan',          -- scan de vulnerabilidades
  'access_review',      -- revisão de contas e acessos
  'phishing_campaign',  -- campanha de phishing (ligada à tabela existente)
  'ssl_renewal',        -- renovação de certificados SSL
  'dossier_review',     -- revisão anual do dossier
  'incident',           -- registo de incidente
  'other'               -- outro
);

CREATE TYPE public.evidence_result AS ENUM (
  'ok',       -- correu bem, sem problemas
  'warning',  -- correu mas com alertas menores
  'fail',     -- falhou ou encontrou problema grave
  'pending'   -- agendado mas ainda não executado
);

CREATE TABLE public.client_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  dossier_id UUID REFERENCES public.dossiers(id) ON DELETE SET NULL,
  evidence_type public.evidence_type NOT NULL,
  result public.evidence_result NOT NULL DEFAULT 'ok',
  title TEXT NOT NULL,               -- ex: "Verificação backup SRV-001"
  notes TEXT,                        -- observações livres
  evidence_date DATE NOT NULL DEFAULT CURRENT_DATE,
  file_path TEXT,                    -- caminho no bucket evidence-files (opcional)
  file_name TEXT,                    -- nome original do ficheiro
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_evidences_client ON public.client_evidences(client_id, evidence_date DESC);
CREATE INDEX idx_client_evidences_type ON public.client_evidences(evidence_type, result);

ALTER TABLE public.client_evidences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read evidences" ON public.client_evidences
  FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "Staff can insert evidences" ON public.client_evidences
  FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()));
CREATE POLICY "Staff can update evidences" ON public.client_evidences
  FOR UPDATE TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "Admins can delete evidences" ON public.client_evidences
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_client_evidences_updated_at
  BEFORE UPDATE ON public.client_evidences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- TAREFAS RECORRENTES DE MANUTENÇÃO
-- Define o calendário de obrigações por cliente: o que fazer,
-- com que frequência, e a data da próxima execução.
-- Quando a data passa sem evidência registada → alerta vermelho.
-- ============================================================

CREATE TYPE public.task_frequency AS ENUM (
  'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual'
);

CREATE TABLE public.client_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  evidence_type public.evidence_type NOT NULL,
  title TEXT NOT NULL,
  frequency public.task_frequency NOT NULL,
  next_due DATE NOT NULL,
  last_done DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_tasks_due ON public.client_tasks(next_due, active);
CREATE INDEX idx_client_tasks_client ON public.client_tasks(client_id, active);

ALTER TABLE public.client_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read tasks" ON public.client_tasks
  FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "Staff can manage tasks" ON public.client_tasks
  FOR ALL TO authenticated USING (public.is_approved(auth.uid()));

CREATE TRIGGER update_client_tasks_updated_at
  BEFORE UPDATE ON public.client_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- BUCKET PRIVADO PARA FICHEIROS DE EVIDÊNCIA
-- Screenshots, logs exportados, relatórios de ferramentas.
-- Só staff aprovado lê; service_role gere.
-- ============================================================

INSERT INTO storage.buckets (id, name, public) VALUES ('evidence-files', 'evidence-files', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Staff can read evidence files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'evidence-files' AND public.is_approved(auth.uid()));

CREATE POLICY "Staff can upload evidence files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'evidence-files' AND public.is_approved(auth.uid()));

CREATE POLICY "Service role manages evidence files" ON storage.objects
  FOR ALL TO service_role USING (bucket_id = 'evidence-files');

-- ============================================================
-- FUNÇÃO HELPER: calcula próxima data com base na frequência
-- ============================================================

CREATE OR REPLACE FUNCTION public.next_due_from_frequency(
  base_date DATE,
  freq public.task_frequency
) RETURNS DATE
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE freq
    WHEN 'weekly'      THEN base_date + INTERVAL '7 days'
    WHEN 'biweekly'    THEN base_date + INTERVAL '14 days'
    WHEN 'monthly'     THEN base_date + INTERVAL '1 month'
    WHEN 'quarterly'   THEN base_date + INTERVAL '3 months'
    WHEN 'semiannual'  THEN base_date + INTERVAL '6 months'
    WHEN 'annual'      THEN base_date + INTERVAL '1 year'
  END::DATE;
$$;
