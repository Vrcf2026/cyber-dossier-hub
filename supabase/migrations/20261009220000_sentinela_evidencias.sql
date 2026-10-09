-- ============================================================
-- EVIDÊNCIAS VINDAS DO VRCF SENTINELA
-- Os relatórios de segurança entregues no Sentinela (mensal dos
-- servidores, trimestral dos postos) entram aqui automaticamente
-- como evidência "log_review" — cobrem o controlo "Revisão de logs
-- de segurança" do Anexo A — com o relatório anexado.
-- source + external_id evitam duplicados quando o Sentinela repete
-- um envio (ex.: falha de rede a meio).
-- ============================================================

ALTER TABLE public.client_evidences
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS client_evidences_origem_unica
  ON public.client_evidences (source, external_id)
  WHERE source IS NOT NULL AND external_id IS NOT NULL;
