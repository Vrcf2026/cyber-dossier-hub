ALTER TABLE public.dossier_sections
  ADD COLUMN IF NOT EXISTS client_visible BOOLEAN NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.seed_dossier_sections()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.dossier_sections (dossier_id, section_number, section_name, client_visible, data)
  VALUES
    (NEW.id, 1,  'Identificação e Âmbito', true, '{}'::jsonb),
    (NEW.id, 2,  'Inventário de Ativos', true, '{}'::jsonb),
    (NEW.id, 3,  'Arquitetura e Segurança de Rede', true, '{}'::jsonb),
    (NEW.id, 4,  'Gestão de Identidades e Acessos (IAM)', true, '{}'::jsonb),
    (NEW.id, 5,  'Proteção de Dados e Privacidade', true, '{}'::jsonb),
    (NEW.id, 6,  'Matriz de Risco', true, '{}'::jsonb),
    (NEW.id, 7,  'Disaster Recovery & Continuidade', true, '{}'::jsonb),
    (NEW.id, 8,  'Plano de Resposta a Incidentes', true, '{}'::jsonb),
    (NEW.id, 9,  'Manutenção e Higiene Digital', true, '{}'::jsonb),
    (NEW.id, 10, 'Formação e Sensibilização', true, '{}'::jsonb),
    (NEW.id, 11, 'Conformidade e Boas Práticas', true, '{}'::jsonb),
    (NEW.id, 12, 'Recomendações e Roadmap', true, '{}'::jsonb),
    (NEW.id, 13, 'Plano de Ação', false, '{}'::jsonb),
    (NEW.id, 14, 'Termo de Responsabilidade e Assinaturas', true, '{}'::jsonb),
    (NEW.id, 15, 'Anexos', false, '{}'::jsonb);
  RETURN NEW;
END;
$$;

UPDATE public.dossier_sections SET client_visible = false WHERE section_number IN (13, 15);
UPDATE public.dossier_sections SET client_visible = true WHERE section_number NOT IN (13, 15);