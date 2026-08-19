-- ============================================================
-- FACTOS ESTRUTURADOS DO DOSSIER
-- Camada central de dados extraídos pela IA durante o intake.
-- Qualquer secção pode ler daqui em vez de depender de texto
-- de outra secção. Quando um facto muda, pode propagar-se.
-- ============================================================

CREATE TABLE public.dossier_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  -- 'asset' | 'identity' | 'network' | 'policy' | 'risk' | 'backup'
  -- | 'incident' | 'training' | 'compliance' | 'contact' | 'other'
  key TEXT NOT NULL,          -- identificador legível, ex: 'servidor-principal'
  label TEXT NOT NULL,        -- nome para mostrar, ex: 'Servidor SRV-01'
  data JSONB NOT NULL DEFAULT '{}', -- campos livres por categoria
  source TEXT NOT NULL DEFAULT 'intake', -- 'intake' | 'manual' | 'import'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(dossier_id, category, key)
);

CREATE INDEX idx_dossier_facts_dossier ON public.dossier_facts(dossier_id, category);

ALTER TABLE public.dossier_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read facts" ON public.dossier_facts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert facts" ON public.dossier_facts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update facts" ON public.dossier_facts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete facts" ON public.dossier_facts FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_dossier_facts_updated_at
  BEFORE UPDATE ON public.dossier_facts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- MENSAGENS DO INTAKE
-- Guarda o histórico do chat de intake para que a IA nunca
-- perca contexto se a sessão for interrompida.
-- ============================================================

CREATE TABLE public.dossier_intake_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dossier_intake_messages_dossier ON public.dossier_intake_messages(dossier_id, created_at);

ALTER TABLE public.dossier_intake_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read intake messages" ON public.dossier_intake_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert intake messages" ON public.dossier_intake_messages FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- COLUNA intake_completed NO DOSSIER
-- Indica se o intake já foi feito. Enquanto false, o editor
-- mostra um aviso e redireciona para o intake.
-- ============================================================

ALTER TABLE public.dossiers ADD COLUMN IF NOT EXISTS intake_completed BOOLEAN NOT NULL DEFAULT false;
