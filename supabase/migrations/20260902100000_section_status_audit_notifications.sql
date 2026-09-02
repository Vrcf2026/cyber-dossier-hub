-- ============================================================
-- ESTADO "not_applicable" NAS SECÇÕES DO DOSSIER
-- Permite marcar secções que não se aplicam (ex: Sec. 15 Anexos
-- se não houver nada a anexar) sem que a auditoria as penalize.
-- ============================================================

ALTER TABLE public.dossier_sections
  ADD COLUMN IF NOT EXISTS section_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (section_status IN ('pending', 'in_progress', 'completed', 'not_applicable'));

-- Sincronizar com is_completed existente (migração de dados)
UPDATE public.dossier_sections
  SET section_status = CASE
    WHEN is_completed = true THEN 'completed'
    WHEN ai_generated_content IS NOT NULL AND ai_generated_content != '' THEN 'in_progress'
    ELSE 'pending'
  END;

-- ============================================================
-- REGISTO DE AUDIT NO OFFBOARD DE CLIENTE
-- Quando um cliente é encerrado, o evento fica registado no
-- audit_log para rastreabilidade (quem, quando, que cliente).
-- ============================================================

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

-- ============================================================
-- CONFIGURAÇÕES DE NOTIFICAÇÃO POR EMAIL
-- Define se e quando enviar alertas automáticos de tarefas
-- em atraso (requer Edge Function de envio de email separada).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  alert_days_before INTEGER NOT NULL DEFAULT 1,  -- avisar X dias antes do prazo
  alert_on_overdue BOOLEAN NOT NULL DEFAULT true,
  daily_digest BOOLEAN NOT NULL DEFAULT false,    -- resumo diário vs alertas individuais
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notification settings" ON public.notification_settings
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Criar settings por defeito para utilizadores existentes
INSERT INTO public.notification_settings (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
