CREATE TABLE public.dossier_sections_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.dossier_sections(id) ON DELETE CASCADE,
  dossier_id UUID NOT NULL,
  section_number INTEGER NOT NULL,
  section_name TEXT NOT NULL,
  data JSONB,
  ai_generated_content TEXT,
  is_completed BOOLEAN,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dossier_sections_history TO authenticated;
GRANT ALL ON public.dossier_sections_history TO service_role;

CREATE INDEX idx_dossier_sections_history_section ON public.dossier_sections_history(section_id, changed_at DESC);

ALTER TABLE public.dossier_sections_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can read section history" ON public.dossier_sections_history
  FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_dossier_section_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.data IS DISTINCT FROM NEW.data)
     OR (OLD.ai_generated_content IS DISTINCT FROM NEW.ai_generated_content)
     OR (OLD.is_completed IS DISTINCT FROM NEW.is_completed) THEN
    INSERT INTO public.dossier_sections_history
      (section_id, dossier_id, section_number, section_name, data, ai_generated_content, is_completed, changed_by)
    VALUES
      (OLD.id, OLD.dossier_id, OLD.section_number, OLD.section_name, OLD.data, OLD.ai_generated_content, OLD.is_completed, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_dossier_section_history ON public.dossier_sections;
CREATE TRIGGER trg_log_dossier_section_history
  BEFORE UPDATE ON public.dossier_sections
  FOR EACH ROW EXECUTE FUNCTION public.log_dossier_section_history();

CREATE POLICY "Admins can read client archives" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'client-archives' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role manages client archives" ON storage.objects
  FOR ALL TO service_role USING (bucket_id = 'client-archives');