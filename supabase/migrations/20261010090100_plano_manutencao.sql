-- =====================================================================
-- Plano de manutenção periódica v2
--
--  1. Perfil do cliente: "tem servidores ou PCs com dados sensíveis?"
--     → revisão de registos e patches mensais; senão trimestrais.
--  2. Opções por cliente para phishing, formação e chaves/alarme:
--     na (não se aplica) | once (única) | semiannual | annual.
--  3. Datas fixas com janela de ±15 dias: uma prova dentro da janela conta
--     como feita e a data seguinte NÃO escorrega (conta a partir da data
--     prevista, não do dia em que se fez). Em atraso só depois de +15 dias.
--  4. A tarefa avança sozinha quando entra uma prova OK/alerta do mesmo
--     tipo (à mão ou automática, ex.: VRCF Sentinela) — num sítio só (trigger).
--  5. As tarefas criadas pelo plano ficam com origem = 'plano'; as criadas
--     à mão ('manual') nunca são mexidas pelo plano.
-- =====================================================================

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS dados_sensiveis BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS opcoes_plano JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.client_tasks ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'manual';
DO $$ BEGIN
  ALTER TABLE public.client_tasks ADD CONSTRAINT client_tasks_origem_check CHECK (origem IN ('manual', 'plano'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Fim da janela de tolerância: em atraso só quando due_limit < hoje.
ALTER TABLE public.client_tasks ADD COLUMN IF NOT EXISTS due_limit DATE GENERATED ALWAYS AS (next_due + 15) STORED;

UPDATE public.client_tasks SET origem = 'plano'
 WHERE origem = 'manual' AND notes = 'Tarefa recomendada (criada automaticamente)';

CREATE OR REPLACE FUNCTION public.next_due_from_frequency(base_date DATE, freq public.task_frequency)
RETURNS DATE LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE freq::text
    WHEN 'weekly'     THEN base_date + INTERVAL '7 days'
    WHEN 'biweekly'   THEN base_date + INTERVAL '14 days'
    WHEN 'monthly'    THEN base_date + INTERVAL '1 month'
    WHEN 'quarterly'  THEN base_date + INTERVAL '3 months'
    WHEN 'semiannual' THEN base_date + INTERVAL '6 months'
    WHEN 'annual'     THEN base_date + INTERVAL '1 year'
    ELSE base_date + INTERVAL '0 days'   -- once: não se repete
  END::DATE;
$$;

-- O plano que o cliente deve ter, a partir do perfil e das opções.
-- frequency = 'na' quer dizer "não se aplica" (a tarefa do plano é desativada).
CREATE OR REPLACE FUNCTION public.plano_cliente(p_client_id UUID)
RETURNS TABLE(evidence_type TEXT, title TEXT, frequency TEXT, automatico BOOLEAN)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH c AS (SELECT dados_sensiveis AS s, opcoes_plano AS o FROM public.clients WHERE id = p_client_id),
  base(t, titulo, freq, auto, ordem) AS (VALUES
    ('backup_check',           'Verificação dos backups',                                       'monthly',        true,  1),
    ('restore_test',           'Teste de restauro de backup',                                   'quarterly',      false, 2),
    ('patch_update',           'Aplicação de patches (sistema operativo e aplicações)',         'perfil',         false, 3),
    ('log_review',             'Revisão dos registos de segurança (relatório VRCF Sentinela)',  'perfil',         true,  4),
    ('config_review',          'Revisão da configuração de segurança dos equipamentos',         'quarterly',      true,  5),
    ('asset_review',           'Atualização do inventário do parque informático',               'semiannual',     true,  6),
    ('access_review',          'Revisão de contas e privilégios (acessos lógicos)',             'annual',         false, 7),
    ('supplier_review',        'Revisão de fornecedores e acessos remotos de terceiros',        'annual',         false, 8),
    ('contacts_review',        'Revisão dos contactos de emergência do plano de incidentes',    'annual',         false, 9),
    ('dossier_review',         'Revisão anual do dossier e aprovação pela gerência',            'annual',         false, 10),
    ('phishing_campaign',      'Campanha de phishing',                                          'opt:semiannual', false, 11),
    ('training_session',       'Formação de sensibilização a todos os colaboradores',           'opt:annual',     false, 12),
    ('physical_access_review', 'Revisão de chaves e códigos de alarme (acessos físicos)',       'opt:annual',     false, 13)
  )
  SELECT b.t, b.titulo,
    CASE
      WHEN b.freq = 'perfil' THEN CASE WHEN c.s THEN 'monthly' ELSE 'quarterly' END
      WHEN b.freq LIKE 'opt:%' THEN
        CASE WHEN c.o->>b.t IN ('na', 'once', 'quarterly', 'semiannual', 'annual') THEN c.o->>b.t ELSE substr(b.freq, 5) END
      ELSE b.freq
    END,
    b.auto
  FROM base b, c
  ORDER BY b.ordem;
$$;

-- Cria/ajusta as tarefas do plano. Idempotente. Não mexe em tarefas manuais.
CREATE OR REPLACE FUNCTION public.aplicar_plano_cliente(p_client_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  r RECORD; t RECORD; n INTEGER := 0;
BEGIN
  FOR r IN SELECT * FROM public.plano_cliente(p_client_id) LOOP
    IF r.frequency = 'na' THEN
      UPDATE public.client_tasks SET active = false
       WHERE client_id = p_client_id AND evidence_type::text = r.evidence_type AND origem = 'plano' AND active;
      CONTINUE;
    END IF;

    -- Já há uma tarefa manual ativa deste tipo: respeitar a do técnico.
    IF EXISTS (SELECT 1 FROM public.client_tasks WHERE client_id = p_client_id AND evidence_type::text = r.evidence_type
                AND origem = 'manual' AND active) THEN
      CONTINUE;
    END IF;

    SELECT * INTO t FROM public.client_tasks
     WHERE client_id = p_client_id AND evidence_type::text = r.evidence_type AND origem = 'plano' AND active
     ORDER BY next_due LIMIT 1;

    IF FOUND THEN
      IF t.frequency::text <> r.frequency THEN
        UPDATE public.client_tasks SET
          frequency = r.frequency::public.task_frequency,
          next_due = CASE WHEN r.frequency = 'once' THEN t.next_due
                          ELSE public.next_due_from_frequency(COALESCE(t.last_done, CURRENT_DATE), r.frequency::public.task_frequency) END
         WHERE id = t.id;
        n := n + 1;
      END IF;
      CONTINUE;
    END IF;

    -- Tarefa única já feita: não voltar a criar.
    IF r.frequency = 'once' AND EXISTS (SELECT 1 FROM public.client_tasks WHERE client_id = p_client_id
         AND evidence_type::text = r.evidence_type AND origem = 'plano' AND frequency::text = 'once' AND last_done IS NOT NULL) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.client_tasks (client_id, evidence_type, title, frequency, next_due, notes, origem)
    VALUES (p_client_id, r.evidence_type::public.evidence_type, r.title, r.frequency::public.task_frequency,
            CASE WHEN r.frequency = 'once' THEN CURRENT_DATE + 30
                 ELSE public.next_due_from_frequency(CURRENT_DATE, r.frequency::public.task_frequency) END,
            CASE WHEN r.automatico THEN 'Plano de manutenção — prova automática (VRCF Sentinela)' ELSE 'Plano de manutenção' END,
            'plano');
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.aplicar_plano_cliente(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_plano_cliente(UUID) TO authenticated;

-- Compatibilidade: o botão antigo "Tarefas recomendadas" passa a aplicar o plano.
CREATE OR REPLACE FUNCTION public.seed_default_client_tasks(p_client_id UUID)
RETURNS INTEGER LANGUAGE sql SET search_path = public AS $$ SELECT public.aplicar_plano_cliente(p_client_id) $$;

CREATE OR REPLACE FUNCTION public.trg_seed_default_client_tasks()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM public.aplicar_plano_cliente(NEW.id);
  RETURN NEW;
END $$;

-- Mudou o perfil ou as opções → ajustar o plano.
DROP TRIGGER IF EXISTS aplicar_plano_on_client_update ON public.clients;
CREATE TRIGGER aplicar_plano_on_client_update
  AFTER UPDATE OF dados_sensiveis, opcoes_plano ON public.clients
  FOR EACH ROW WHEN (OLD.dados_sensiveis IS DISTINCT FROM NEW.dados_sensiveis OR OLD.opcoes_plano IS DISTINCT FROM NEW.opcoes_plano)
  EXECUTE FUNCTION public.trg_seed_default_client_tasks();

-- Uma prova OK/alerta avança a tarefa do mesmo tipo, com a janela de ±15 dias.
CREATE OR REPLACE FUNCTION public.tarefa_registar_prova()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t RECORD; v_next DATE;
BEGIN
  IF NEW.result::text NOT IN ('ok', 'warning') THEN RETURN NEW; END IF;
  FOR t IN SELECT * FROM public.client_tasks
            WHERE client_id = NEW.client_id AND evidence_type = NEW.evidence_type AND active LOOP
    IF t.frequency::text = 'once' THEN
      UPDATE public.client_tasks SET last_done = NEW.evidence_date, active = false WHERE id = t.id;
      CONTINUE;
    END IF;
    IF NEW.evidence_date < t.next_due - 15 THEN
      -- Prova extra antes da janela: fica registada, o calendário não mexe.
      UPDATE public.client_tasks SET last_done = GREATEST(COALESCE(last_done, NEW.evidence_date), NEW.evidence_date) WHERE id = t.id;
      CONTINUE;
    END IF;
    -- Próxima data a partir da data PREVISTA (não escorrega); se a prova chegou muito tarde,
    -- salta para a primeira data prevista depois da prova.
    v_next := public.next_due_from_frequency(t.next_due, t.frequency);
    WHILE v_next <= NEW.evidence_date LOOP
      v_next := public.next_due_from_frequency(v_next, t.frequency);
    END LOOP;
    UPDATE public.client_tasks
       SET last_done = GREATEST(COALESCE(last_done, NEW.evidence_date), NEW.evidence_date), next_due = v_next
     WHERE id = t.id;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tarefa_registar_prova ON public.client_evidences;
CREATE TRIGGER tarefa_registar_prova
  AFTER INSERT ON public.client_evidences
  FOR EACH ROW EXECUTE FUNCTION public.tarefa_registar_prova();

-- Clientes existentes: aplicar o plano novo (não mexe em tarefas manuais).
DO $$ DECLARE c RECORD; BEGIN
  FOR c IN SELECT id FROM public.clients LOOP PERFORM public.aplicar_plano_cliente(c.id); END LOOP;
END $$;
