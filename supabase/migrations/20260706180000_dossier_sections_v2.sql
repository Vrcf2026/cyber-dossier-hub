-- ============================================================
-- ESTRUTURA DO DOSSIER — 15 secções fixas + credenciais à parte
-- ============================================================

-- dossier_sections já existe e é genérica (data jsonb) — mantém-se,
-- só passa a ser semeada automaticamente com as 15 secções certas
-- sempre que um dossier novo é criado, em vez de ficar vazia.

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

-- ------------------------------------------------------------
-- Folha de Credenciais — separada de propósito. Nunca faz parte
-- de dossier_sections, para nunca poder ser incluída por engano
-- num export de cliente ou técnico. Só é usada quando se gera
-- explicitamente o documento "credenciais".
-- ------------------------------------------------------------
CREATE TABLE public.dossier_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID NOT NULL UNIQUE REFERENCES public.dossiers(id) ON DELETE CASCADE,
  entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- cada entrada: { sistema, ip_url, utilizador, password, observacoes }
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dossier_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can read credentials" ON public.dossier_credentials
  FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "Approved users can insert credentials" ON public.dossier_credentials
  FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()));
CREATE POLICY "Approved users can update credentials" ON public.dossier_credentials
  FOR UPDATE TO authenticated USING (public.is_approved(auth.uid()));
