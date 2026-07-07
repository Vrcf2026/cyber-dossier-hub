
CREATE OR REPLACE FUNCTION public.seed_dossier_sections()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.dossier_sections (dossier_id, section_number, section_name, data)
  VALUES
    (NEW.id, 1,  'Identificação e Âmbito', '{}'::jsonb),
    (NEW.id, 2,  'Inventário de Ativos', '{}'::jsonb),
    (NEW.id, 3,  'Arquitetura e Segurança de Rede', '{}'::jsonb),
    (NEW.id, 4,  'Gestão de Identidades e Acessos (IAM)', '{}'::jsonb),
    (NEW.id, 5,  'Proteção de Dados e Privacidade', '{}'::jsonb),
    (NEW.id, 6,  'Matriz de Risco', '{}'::jsonb),
    (NEW.id, 7,  'Disaster Recovery & Continuidade', '{}'::jsonb),
    (NEW.id, 8,  'Plano de Resposta a Incidentes', '{}'::jsonb),
    (NEW.id, 9,  'Manutenção e Higiene Digital', '{}'::jsonb),
    (NEW.id, 10, 'Formação e Sensibilização', '{}'::jsonb),
    (NEW.id, 11, 'Conformidade e Boas Práticas', '{}'::jsonb),
    (NEW.id, 12, 'Recomendações e Roadmap', '{}'::jsonb),
    (NEW.id, 13, 'Plano de Ação', '{}'::jsonb),
    (NEW.id, 14, 'Termo de Responsabilidade e Assinaturas', '{}'::jsonb),
    (NEW.id, 15, 'Anexos', '{}'::jsonb);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_dossier_sections ON public.dossiers;
CREATE TRIGGER trg_seed_dossier_sections
  AFTER INSERT ON public.dossiers
  FOR EACH ROW EXECUTE FUNCTION public.seed_dossier_sections();

CREATE TABLE IF NOT EXISTS public.dossier_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID NOT NULL UNIQUE REFERENCES public.dossiers(id) ON DELETE CASCADE,
  entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dossier_credentials TO authenticated;
GRANT ALL ON public.dossier_credentials TO service_role;
ALTER TABLE public.dossier_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users can read credentials" ON public.dossier_credentials;
DROP POLICY IF EXISTS "Approved users can insert credentials" ON public.dossier_credentials;
DROP POLICY IF EXISTS "Approved users can update credentials" ON public.dossier_credentials;

CREATE POLICY "Approved users can read credentials" ON public.dossier_credentials
  FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "Approved users can insert credentials" ON public.dossier_credentials
  FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()));
CREATE POLICY "Approved users can update credentials" ON public.dossier_credentials
  FOR UPDATE TO authenticated USING (public.is_approved(auth.uid()));

-- Também garantir view + grants do phishing (caso migration anterior tenha sido parcial)
CREATE OR REPLACE VIEW public.phishing_campaign_results AS
SELECT
  t.campaign_id,
  t.id AS target_id,
  t.email,
  t.sent_at,
  COUNT(c.id) AS attempts,
  MIN(c.clicked_at) AS first_attempt_at,
  MAX(c.clicked_at) AS last_attempt_at
FROM public.phishing_targets t
LEFT JOIN public.phishing_clicks c ON c.target_id = t.id
GROUP BY t.campaign_id, t.id, t.email, t.sent_at;
GRANT SELECT ON public.phishing_campaign_results TO authenticated;
GRANT SELECT, INSERT ON public.phishing_campaigns TO authenticated;
GRANT ALL ON public.phishing_campaigns TO service_role;
GRANT SELECT ON public.phishing_targets TO authenticated;
GRANT ALL ON public.phishing_targets TO service_role;
GRANT SELECT ON public.phishing_clicks TO authenticated;
GRANT ALL ON public.phishing_clicks TO service_role;
