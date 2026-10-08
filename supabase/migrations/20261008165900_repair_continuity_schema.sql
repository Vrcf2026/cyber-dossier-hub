-- ============================================================
-- REPARAÇÃO — CONTINUIDADE, NOTIFICAÇÕES E COLABORADORES
--
-- As migrações 20260901100000_continuity_evidences e
-- 20260902100000_section_status_audit_notifications nunca chegaram
-- a ser aplicadas na base de dados de produção (só correram as
-- geradas pelo Lovable). Este script cria tudo o que falta, já
-- com os tipos de evidência novos e a tabela client_staff.
--
-- IDEMPOTENTE: pode ser corrido várias vezes sem erro e sem
-- duplicar nada. Não altera dados existentes.
-- ============================================================

-- ---------- Tipos ----------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'evidence_type' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.evidence_type AS ENUM (
      'backup_check', 'restore_test', 'patch_update', 'log_review', 'vuln_scan',
      'access_review', 'phishing_campaign', 'ssl_renewal', 'dossier_review',
      'incident', 'other',
      'physical_access_review', 'media_disposal', 'training_session'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'evidence_result' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.evidence_result AS ENUM ('ok', 'warning', 'fail', 'pending');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_frequency' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.task_frequency AS ENUM ('weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual');
  END IF;
END $$;

-- Se o enum já existia sem os valores novos (não estraga nada se já existirem)
ALTER TYPE public.evidence_type ADD VALUE IF NOT EXISTS 'physical_access_review';
ALTER TYPE public.evidence_type ADD VALUE IF NOT EXISTS 'media_disposal';
ALTER TYPE public.evidence_type ADD VALUE IF NOT EXISTS 'training_session';

-- ---------- Evidências ----------
CREATE TABLE IF NOT EXISTS public.client_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  dossier_id UUID REFERENCES public.dossiers(id) ON DELETE SET NULL,
  evidence_type public.evidence_type NOT NULL,
  result public.evidence_result NOT NULL DEFAULT 'ok',
  title TEXT NOT NULL,
  notes TEXT,
  evidence_date DATE NOT NULL DEFAULT CURRENT_DATE,
  file_path TEXT,
  file_name TEXT,
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_evidences_client ON public.client_evidences(client_id, evidence_date DESC);
CREATE INDEX IF NOT EXISTS idx_client_evidences_type ON public.client_evidences(evidence_type, result);
ALTER TABLE public.client_evidences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read evidences" ON public.client_evidences;
CREATE POLICY "Staff can read evidences" ON public.client_evidences
  FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
DROP POLICY IF EXISTS "Staff can insert evidences" ON public.client_evidences;
CREATE POLICY "Staff can insert evidences" ON public.client_evidences
  FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()));
DROP POLICY IF EXISTS "Staff can update evidences" ON public.client_evidences;
CREATE POLICY "Staff can update evidences" ON public.client_evidences
  FOR UPDATE TO authenticated USING (public.is_approved(auth.uid()));
DROP POLICY IF EXISTS "Admins can delete evidences" ON public.client_evidences;
CREATE POLICY "Admins can delete evidences" ON public.client_evidences
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_client_evidences_updated_at ON public.client_evidences;
CREATE TRIGGER update_client_evidences_updated_at
  BEFORE UPDATE ON public.client_evidences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Tarefas recorrentes ----------
CREATE TABLE IF NOT EXISTS public.client_tasks (
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
CREATE INDEX IF NOT EXISTS idx_client_tasks_due ON public.client_tasks(next_due, active);
CREATE INDEX IF NOT EXISTS idx_client_tasks_client ON public.client_tasks(client_id, active);
ALTER TABLE public.client_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read tasks" ON public.client_tasks;
CREATE POLICY "Staff can read tasks" ON public.client_tasks
  FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
DROP POLICY IF EXISTS "Staff can manage tasks" ON public.client_tasks;
CREATE POLICY "Staff can manage tasks" ON public.client_tasks
  FOR ALL TO authenticated USING (public.is_approved(auth.uid()));

DROP TRIGGER IF EXISTS update_client_tasks_updated_at ON public.client_tasks;
CREATE TRIGGER update_client_tasks_updated_at
  BEFORE UPDATE ON public.client_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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

-- ---------- Ficheiros de evidência (bucket privado) ----------
INSERT INTO storage.buckets (id, name, public) VALUES ('evidence-files', 'evidence-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Staff can read evidence files" ON storage.objects;
CREATE POLICY "Staff can read evidence files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'evidence-files' AND public.is_approved(auth.uid()));
DROP POLICY IF EXISTS "Staff can upload evidence files" ON storage.objects;
CREATE POLICY "Staff can upload evidence files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'evidence-files' AND public.is_approved(auth.uid()));
DROP POLICY IF EXISTS "Service role manages evidence files" ON storage.objects;
CREATE POLICY "Service role manages evidence files" ON storage.objects
  FOR ALL TO service_role USING (bucket_id = 'evidence-files');

-- ---------- Estado das secções (not_applicable) ----------
ALTER TABLE public.dossier_sections
  ADD COLUMN IF NOT EXISTS section_status TEXT NOT NULL DEFAULT 'pending';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.dossier_sections'::regclass AND conname = 'dossier_sections_section_status_check'
  ) THEN
    ALTER TABLE public.dossier_sections
      ADD CONSTRAINT dossier_sections_section_status_check
      CHECK (section_status IN ('pending', 'in_progress', 'completed', 'not_applicable'));
  END IF;
END $$;

-- Sincroniza só as linhas ainda em 'pending' (não mexe em estados já definidos)
UPDATE public.dossier_sections
  SET section_status = CASE
    WHEN is_completed = true THEN 'completed'
    WHEN ai_generated_content IS NOT NULL AND ai_generated_content != '' THEN 'in_progress'
    ELSE 'pending'
  END
WHERE section_status = 'pending';

-- ---------- Registo de offboard no audit_log ----------
CREATE OR REPLACE FUNCTION public.log_client_offboard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, user_email, action, entity_type, entity_id, details)
  SELECT
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    'client_offboard',
    'client',
    OLD.id,
    jsonb_build_object('client_name', OLD.name, 'client_nif', OLD.nif, 'offboarded_at', now());
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_client_offboard ON public.clients;
CREATE TRIGGER trg_log_client_offboard
  BEFORE DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.log_client_offboard();

-- ---------- Notificações ----------
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  alert_days_before INTEGER NOT NULL DEFAULT 1,
  alert_on_overdue BOOLEAN NOT NULL DEFAULT true,
  daily_digest BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own notification settings" ON public.notification_settings;
CREATE POLICY "Users manage own notification settings" ON public.notification_settings
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS update_notification_settings_updated_at ON public.notification_settings;
CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.notification_settings (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
