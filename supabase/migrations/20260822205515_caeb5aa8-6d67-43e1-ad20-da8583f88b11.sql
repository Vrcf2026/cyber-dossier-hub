-- 1. profiles.client_id (para contas de cliente)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

-- 2. Autorizações de dossier por técnico
CREATE TABLE IF NOT EXISTS public.dossier_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dossier_id)
);
GRANT SELECT ON public.dossier_access TO authenticated;
GRANT ALL ON public.dossier_access TO service_role;
ALTER TABLE public.dossier_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own access, admins see all" ON public.dossier_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 3. Funções auxiliares
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_approved(_user_id) AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','tecnico','user')
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_dossier(_user_id uuid, _dossier_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_approved(_user_id) AND (
    CASE
      WHEN public.has_role(_user_id, 'admin') THEN true
      WHEN public.has_role(_user_id, 'user') THEN true
      WHEN public.has_role(_user_id, 'tecnico') THEN EXISTS (
        SELECT 1 FROM public.dossier_access da
        WHERE da.user_id = _user_id AND da.dossier_id = _dossier_id
      )
      WHEN public.has_role(_user_id, 'cliente') THEN EXISTS (
        SELECT 1 FROM public.dossiers d
        JOIN public.profiles p ON p.user_id = _user_id
        WHERE d.id = _dossier_id AND d.client_id = p.client_id AND p.client_id IS NOT NULL
      )
      ELSE false
    END
  )
$$;

REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_dossier(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_dossier(uuid, uuid) TO authenticated;

-- 4. clients
DROP POLICY IF EXISTS "Approved users can read clients" ON public.clients;
DROP POLICY IF EXISTS "Approved users can insert clients" ON public.clients;
DROP POLICY IF EXISTS "Approved users can update clients" ON public.clients;
CREATE POLICY "Staff read clients, clients read own" ON public.clients
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.client_id = clients.id)
  );
CREATE POLICY "Staff can insert clients" ON public.clients
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update clients" ON public.clients
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- 5. dossiers
DROP POLICY IF EXISTS "Approved users can read dossiers" ON public.dossiers;
DROP POLICY IF EXISTS "Approved users can insert dossiers" ON public.dossiers;
DROP POLICY IF EXISTS "Approved users can update dossiers" ON public.dossiers;
CREATE POLICY "Read accessible dossiers" ON public.dossiers
  FOR SELECT TO authenticated USING (public.can_access_dossier(auth.uid(), id));
CREATE POLICY "Staff can insert dossiers" ON public.dossiers
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update accessible dossiers" ON public.dossiers
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()) AND public.can_access_dossier(auth.uid(), id));

-- 6. dossier_sections
DROP POLICY IF EXISTS "Approved users can read sections" ON public.dossier_sections;
DROP POLICY IF EXISTS "Approved users can insert sections" ON public.dossier_sections;
DROP POLICY IF EXISTS "Approved users can update sections" ON public.dossier_sections;
CREATE POLICY "Read accessible sections" ON public.dossier_sections
  FOR SELECT TO authenticated
  USING (
    public.can_access_dossier(auth.uid(), dossier_id)
    AND (public.is_staff(auth.uid()) OR client_visible)
  );
CREATE POLICY "Staff can insert sections" ON public.dossier_sections
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND public.can_access_dossier(auth.uid(), dossier_id));
CREATE POLICY "Staff can update sections" ON public.dossier_sections
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()) AND public.can_access_dossier(auth.uid(), dossier_id));

-- 7. dossier_facts
DROP POLICY IF EXISTS "Approved users can read facts" ON public.dossier_facts;
DROP POLICY IF EXISTS "Approved users can insert facts" ON public.dossier_facts;
DROP POLICY IF EXISTS "Approved users can update facts" ON public.dossier_facts;
CREATE POLICY "Staff read facts" ON public.dossier_facts
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND public.can_access_dossier(auth.uid(), dossier_id));
CREATE POLICY "Staff insert facts" ON public.dossier_facts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND public.can_access_dossier(auth.uid(), dossier_id));
CREATE POLICY "Staff update facts" ON public.dossier_facts
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()) AND public.can_access_dossier(auth.uid(), dossier_id));

-- 8. dossier_intake_messages
DROP POLICY IF EXISTS "Approved users can read intake messages" ON public.dossier_intake_messages;
DROP POLICY IF EXISTS "Approved users can insert intake messages" ON public.dossier_intake_messages;
CREATE POLICY "Staff read intake messages" ON public.dossier_intake_messages
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND public.can_access_dossier(auth.uid(), dossier_id));
CREATE POLICY "Staff insert intake messages" ON public.dossier_intake_messages
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND public.can_access_dossier(auth.uid(), dossier_id));

-- 9. dossier_credentials (apenas administradores)
DROP POLICY IF EXISTS "Approved users can read credentials" ON public.dossier_credentials;
DROP POLICY IF EXISTS "Approved users can insert credentials" ON public.dossier_credentials;
DROP POLICY IF EXISTS "Approved users can update credentials" ON public.dossier_credentials;
CREATE POLICY "Admins read credentials" ON public.dossier_credentials
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert credentials" ON public.dossier_credentials
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update credentials" ON public.dossier_credentials
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 10. histórico de secções
DROP POLICY IF EXISTS "Approved users can read section history" ON public.dossier_sections_history;
CREATE POLICY "Staff read section history" ON public.dossier_sections_history
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND public.can_access_dossier(auth.uid(), dossier_id));

-- 11. phishing: staff apenas
DROP POLICY IF EXISTS "Approved users can read campaigns" ON public.phishing_campaigns;
DROP POLICY IF EXISTS "Approved users can insert campaigns" ON public.phishing_campaigns;
CREATE POLICY "Staff read campaigns" ON public.phishing_campaigns
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff insert campaigns" ON public.phishing_campaigns
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Approved users can read targets" ON public.phishing_targets;
CREATE POLICY "Staff read targets" ON public.phishing_targets
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Approved users can read clicks" ON public.phishing_clicks;
CREATE POLICY "Staff read clicks" ON public.phishing_clicks
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- 12. user_roles: administradores podem gerir
CREATE POLICY "Admins read all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 13. novas contas: papel e aprovação vêm dos metadados definidos pelo administrador
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  first_user BOOLEAN;
  meta_role app_role;
  meta_client uuid;
BEGIN
  SELECT COUNT(*) = 0 INTO first_user FROM public.profiles;

  BEGIN
    meta_role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role',''), 'tecnico')::app_role;
  EXCEPTION WHEN others THEN
    meta_role := 'tecnico';
  END;

  BEGIN
    meta_client := NULLIF(NEW.raw_user_meta_data->>'client_id','')::uuid;
  EXCEPTION WHEN others THEN
    meta_client := NULL;
  END;

  IF first_user THEN
    meta_role := 'admin';
  END IF;

  INSERT INTO public.profiles (user_id, email, full_name, is_approved, client_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    first_user OR COALESCE((NEW.raw_user_meta_data->>'created_by_admin')::boolean, false),
    meta_client
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, meta_role);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;