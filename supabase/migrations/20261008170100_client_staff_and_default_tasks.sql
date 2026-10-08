-- ============================================================
-- COLABORADORES DO CLIENTE
-- Lista simples por cliente: quem assinou o quê e quando teve
-- formação. Serve de evidência para confidencialidade, aceitação
-- da política de segurança, formação anual (KPI % formados nos
-- últimos 12 meses) e verificação na admissão.
-- Não é um módulo de RH — só o mínimo que um auditor pede.
-- ============================================================

CREATE TABLE public.client_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,                                -- liga ao resultado do phishing
  job_role TEXT,                             -- função (ex: "Rececionista")
  start_date DATE,                           -- data de admissão
  confidentiality_signed_at DATE,            -- acordo/cláusula de confidencialidade
  policy_ack_signed_at DATE,                 -- declaração "li e cumpro a política"
  last_training_at DATE,                     -- última formação de sensibilização
  screening_checked BOOLEAN NOT NULL DEFAULT false, -- verificação na admissão (referências/registos)
  active BOOLEAN NOT NULL DEFAULT true,
  left_at DATE,                              -- data de saída (acessos devem ser removidos)
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_staff_client ON public.client_staff(client_id, active);

ALTER TABLE public.client_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read client staff" ON public.client_staff
  FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "Staff can insert client staff" ON public.client_staff
  FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()));
CREATE POLICY "Staff can update client staff" ON public.client_staff
  FOR UPDATE TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "Admins can delete client staff" ON public.client_staff
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_client_staff_updated_at
  BEFORE UPDATE ON public.client_staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- TAREFAS RECOMENDADAS POR DEFEITO
-- Calendário mínimo que qualquer micro/pequena empresa deve ter.
-- Idempotente: só cria tarefas de tipos que o cliente ainda não
-- tem activas, por isso pode ser corrido várias vezes.
--   - Automático ao criar cliente novo (trigger)
--   - Manual para clientes existentes (botão na Agenda → rpc)
-- ============================================================

CREATE OR REPLACE FUNCTION public.seed_default_client_tasks(p_client_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('backup_check',           'Verificação dos backups',                                   'monthly'),
      ('patch_update',           'Aplicação de patches (sistema operativo e aplicações)',     'monthly'),
      ('log_review',             'Revisão de logs de segurança (firewall, servidor, AV)',      'monthly'),
      ('restore_test',           'Teste de restauro de backup',                               'quarterly'),
      ('phishing_campaign',      'Campanha de phishing',                                      'semiannual'),
      ('access_review',          'Revisão de contas e privilégios (acessos lógicos)',         'annual'),
      ('physical_access_review', 'Revisão de chaves e códigos de alarme (acessos físicos)',   'annual'),
      ('training_session',       'Formação anual de sensibilização a todos os colaboradores', 'annual'),
      ('dossier_review',         'Revisão anual do dossier e aprovação pela gerência',        'annual')
    ) AS t(ev_type, title, freq)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.client_tasks
      WHERE client_id = p_client_id AND active = true AND evidence_type::text = r.ev_type
    ) THEN
      INSERT INTO public.client_tasks (client_id, evidence_type, title, frequency, next_due, notes)
      VALUES (
        p_client_id,
        r.ev_type::public.evidence_type,
        r.title,
        r.freq::public.task_frequency,
        public.next_due_from_frequency(CURRENT_DATE, r.freq::public.task_frequency),
        'Tarefa recomendada (criada automaticamente)'
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_default_client_tasks(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_default_client_tasks(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_seed_default_client_tasks()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_default_client_tasks(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_default_tasks_on_client_insert ON public.clients;
CREATE TRIGGER seed_default_tasks_on_client_insert
  AFTER INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.trg_seed_default_client_tasks();
