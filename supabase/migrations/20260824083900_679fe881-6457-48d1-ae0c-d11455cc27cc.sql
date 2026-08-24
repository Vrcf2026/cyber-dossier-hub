CREATE TABLE public.audit_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  retention_months integer NOT NULL DEFAULT 12,
  auto_purge_enabled boolean NOT NULL DEFAULT true,
  last_purge_at timestamp with time zone,
  last_purge_deleted integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT audit_settings_retention_range CHECK (retention_months BETWEEN 1 AND 120)
);

GRANT SELECT, INSERT, UPDATE ON public.audit_settings TO authenticated;
GRANT ALL ON public.audit_settings TO service_role;

ALTER TABLE public.audit_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read audit settings" ON public.audit_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert audit settings" ON public.audit_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update audit settings" ON public.audit_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_audit_settings_updated_at
  BEFORE UPDATE ON public.audit_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.audit_settings (retention_months, auto_purge_enabled) VALUES (12, true);

CREATE OR REPLACE FUNCTION public.purge_audit_logs(_force boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.audit_settings;
  deleted integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem limpar o registo de auditoria.';
  END IF;

  SELECT * INTO s FROM public.audit_settings ORDER BY created_at LIMIT 1;
  IF s.id IS NULL THEN
    RETURN 0;
  END IF;
  IF NOT _force AND NOT s.auto_purge_enabled THEN
    RETURN 0;
  END IF;

  WITH d AS (
    DELETE FROM public.audit_logs
    WHERE created_at < now() - make_interval(months => s.retention_months)
    RETURNING 1
  )
  SELECT count(*) INTO deleted FROM d;

  UPDATE public.audit_settings
  SET last_purge_at = now(), last_purge_deleted = deleted
  WHERE id = s.id;

  RETURN deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_audit_logs(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_audit_logs(boolean) TO authenticated;