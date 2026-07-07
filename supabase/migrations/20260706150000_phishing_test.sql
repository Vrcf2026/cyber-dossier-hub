-- ============================================================
-- TESTE DE PHISHING — schema
-- Campanhas silenciosas: envio por email (gerado por IA),
-- registo de tentativas de clique sem dar qualquer feedback
-- ao alvo. Resultados só visíveis dentro da app, para uso na
-- formação seguinte (secção 9.3 do dossier).
-- ============================================================

CREATE TABLE public.phishing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  dossier_id UUID REFERENCES public.dossiers(id) ON DELETE SET NULL,
  theme TEXT,                    -- ex: "fatura em atraso", "entrega CTT"
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,       -- deve conter o placeholder {{LINK}}
  bait_type TEXT DEFAULT 'link', -- só rótulo/cosmético: 'link' ou 'pdf_label'
  from_name TEXT,                -- ex: "Dra. Sofia Martins" — nome do remetente simulado
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.phishing_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.phishing_campaigns(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.phishing_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID NOT NULL REFERENCES public.phishing_targets(id) ON DELETE CASCADE,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now()
  -- uma linha por tentativa: contar linhas = nº de tentativas,
  -- min/max(clicked_at) = primeira/última tentativa
);

-- View de apoio: resumo por campanha, pronto a mostrar na secção 9.3
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

ALTER TABLE public.phishing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phishing_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phishing_clicks ENABLE ROW LEVEL SECURITY;

-- Só tu (aprovado) vês/crias campanhas e alvos, a partir da app
CREATE POLICY "Approved users can read campaigns" ON public.phishing_campaigns
  FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "Approved users can insert campaigns" ON public.phishing_campaigns
  FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()));

CREATE POLICY "Approved users can read targets" ON public.phishing_targets
  FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));

CREATE POLICY "Approved users can read clicks" ON public.phishing_clicks
  FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));

-- IMPORTANTE: não há policy de INSERT para "authenticated" em
-- phishing_targets nem phishing_clicks. Essas gravações só
-- acontecem através das Edge Functions (via service role), que
-- ignoram RLS — assim ninguém consegue forjar resultados a partir
-- do browser, nem sequer tu.
