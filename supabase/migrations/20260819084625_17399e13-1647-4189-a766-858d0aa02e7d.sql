CREATE TABLE public.dossier_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'intake',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(dossier_id, category, key)
);

CREATE INDEX idx_dossier_facts_dossier ON public.dossier_facts(dossier_id, category);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dossier_facts TO authenticated;
GRANT ALL ON public.dossier_facts TO service_role;

ALTER TABLE public.dossier_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved users can read facts" ON public.dossier_facts FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "Approved users can insert facts" ON public.dossier_facts FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()));
CREATE POLICY "Approved users can update facts" ON public.dossier_facts FOR UPDATE TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "Admins can delete facts" ON public.dossier_facts FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_dossier_facts_updated_at
  BEFORE UPDATE ON public.dossier_facts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.dossier_intake_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dossier_intake_messages_dossier ON public.dossier_intake_messages(dossier_id, created_at);

GRANT SELECT, INSERT ON public.dossier_intake_messages TO authenticated;
GRANT ALL ON public.dossier_intake_messages TO service_role;

ALTER TABLE public.dossier_intake_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved users can read intake messages" ON public.dossier_intake_messages FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "Approved users can insert intake messages" ON public.dossier_intake_messages FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()));

ALTER TABLE public.dossiers ADD COLUMN IF NOT EXISTS intake_completed BOOLEAN NOT NULL DEFAULT false;