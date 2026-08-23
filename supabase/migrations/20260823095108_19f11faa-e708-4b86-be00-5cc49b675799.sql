CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  action text NOT NULL,
  entity_type text NOT NULL DEFAULT 'dossier',
  entity_id uuid,
  dossier_id uuid REFERENCES public.dossiers(id) ON DELETE CASCADE,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_dossier ON public.audit_logs (dossier_id);
CREATE INDEX idx_audit_logs_user ON public.audit_logs (user_id);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own audit logs"
ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());