-- Segurança dos acessos antes de entregar dossiers a clientes.
--
-- 1) Contas novas: o papel, o cliente e a aprovação passam a vir de raw_app_meta_data (só o
--    servidor o pode escrever). Antes vinham de raw_user_meta_data, que qualquer pessoa preenche
--    num registo público ({ data: { role: "admin", created_by_admin: true } }).
-- 2) Perfis: um utilizador deixa de poder alterar ou criar o seu próprio perfil (podia marcar-se
--    como aprovado ou associar-se a outro cliente). Só o servidor (admin-users) mexe nos perfis.
-- 3) Tabelas do dossier: todas as políticas antigas são apagadas e recriadas (havia políticas
--    "USING (true)" do início do projeto que, se ainda existirem, deixam qualquer conta ler tudo).
-- 4) Continuidade (evidências, tarefas, colaboradores, ficheiros): só a equipa. Uma conta de
--    cliente lê apenas as evidências do seu próprio cliente (portal).
-- 5) Logótipos: só administradores os alteram.
--
-- Idempotente: pode correr-se mais de uma vez.

-- ---------- Funções auxiliares ----------

-- Cliente associado a uma conta de cliente aprovada (null para a equipa).
CREATE OR REPLACE FUNCTION public.cliente_da_conta(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.client_id FROM public.profiles p
  WHERE p.user_id = _user_id AND p.is_approved
    AND public.has_role(_user_id, 'cliente')
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.cliente_da_conta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cliente_da_conta(uuid) TO authenticated;

-- ---------- 1) Contas novas ----------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  first_user BOOLEAN;
  meta_role app_role;
  meta_client uuid;
  criado_admin boolean;
BEGIN
  SELECT COUNT(*) = 0 INTO first_user FROM public.profiles;

  -- Só raw_app_meta_data: é definido pelo servidor (admin-users), nunca por quem se regista.
  BEGIN
    meta_role := COALESCE(NULLIF(NEW.raw_app_meta_data->>'role',''), 'tecnico')::app_role;
  EXCEPTION WHEN others THEN
    meta_role := 'tecnico';
  END;
  BEGIN
    meta_client := NULLIF(NEW.raw_app_meta_data->>'client_id','')::uuid;
  EXCEPTION WHEN others THEN
    meta_client := NULL;
  END;
  BEGIN
    criado_admin := COALESCE((NEW.raw_app_meta_data->>'created_by_admin')::boolean, false);
  EXCEPTION WHEN others THEN
    criado_admin := false;
  END;

  IF first_user THEN
    meta_role := 'admin';
  END IF;

  INSERT INTO public.profiles (user_id, email, full_name, is_approved, client_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name',''), NEW.email),
    first_user OR criado_admin,
    meta_client
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, meta_role);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ---------- 2) a 4) Políticas das tabelas ----------

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY (ARRAY[
      'profiles', 'clients', 'dossiers', 'dossier_sections', 'dossier_facts', 'dossier_intake_messages',
      'client_evidences', 'client_tasks', 'client_staff', 'company_settings'
    ])
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- profiles: cada um vê o seu; administradores veem todos. Alterações só pelo servidor.
CREATE POLICY "Perfil: próprio ou administrador" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- clients
CREATE POLICY "Clientes: equipa ou o próprio cliente" ON public.clients
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR id = public.cliente_da_conta(auth.uid()));
CREATE POLICY "Clientes: equipa cria" ON public.clients
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Clientes: equipa altera" ON public.clients
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Clientes: administrador apaga" ON public.clients
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- dossiers
CREATE POLICY "Dossiers: quem tem acesso" ON public.dossiers
  FOR SELECT TO authenticated USING (public.can_access_dossier(auth.uid(), id));
CREATE POLICY "Dossiers: equipa cria" ON public.dossiers
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Dossiers: equipa com acesso altera" ON public.dossiers
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()) AND public.can_access_dossier(auth.uid(), id))
  WITH CHECK (public.is_staff(auth.uid()) AND public.can_access_dossier(auth.uid(), id));
CREATE POLICY "Dossiers: administrador apaga" ON public.dossiers
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- dossier_sections: o cliente só vê as secções visíveis ao cliente
CREATE POLICY "Secções: quem tem acesso" ON public.dossier_sections
  FOR SELECT TO authenticated
  USING (public.can_access_dossier(auth.uid(), dossier_id) AND (public.is_staff(auth.uid()) OR client_visible));
CREATE POLICY "Secções: equipa cria" ON public.dossier_sections
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND public.can_access_dossier(auth.uid(), dossier_id));
CREATE POLICY "Secções: equipa altera" ON public.dossier_sections
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()) AND public.can_access_dossier(auth.uid(), dossier_id))
  WITH CHECK (public.is_staff(auth.uid()) AND public.can_access_dossier(auth.uid(), dossier_id));
CREATE POLICY "Secções: administrador apaga" ON public.dossier_sections
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- dossier_facts e mensagens do intake: só a equipa
CREATE POLICY "Factos: equipa lê" ON public.dossier_facts
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) AND public.can_access_dossier(auth.uid(), dossier_id));
CREATE POLICY "Factos: equipa cria" ON public.dossier_facts
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()) AND public.can_access_dossier(auth.uid(), dossier_id));
CREATE POLICY "Factos: equipa altera" ON public.dossier_facts
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()) AND public.can_access_dossier(auth.uid(), dossier_id));
CREATE POLICY "Factos: administrador apaga" ON public.dossier_facts
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Intake: equipa lê" ON public.dossier_intake_messages
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) AND public.can_access_dossier(auth.uid(), dossier_id));
CREATE POLICY "Intake: equipa escreve" ON public.dossier_intake_messages
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()) AND public.can_access_dossier(auth.uid(), dossier_id));

-- client_evidences: equipa; o cliente lê só as suas (portal)
CREATE POLICY "Evidências: equipa ou o próprio cliente lê" ON public.client_evidences
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR client_id = public.cliente_da_conta(auth.uid()));
CREATE POLICY "Evidências: equipa regista" ON public.client_evidences
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Evidências: equipa altera" ON public.client_evidences
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Evidências: administrador apaga" ON public.client_evidences
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- client_tasks: só a equipa
CREATE POLICY "Tarefas: equipa" ON public.client_tasks
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- client_staff (nomes e formação dos colaboradores do cliente): só a equipa
CREATE POLICY "Colaboradores: equipa lê" ON public.client_staff
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Colaboradores: equipa cria" ON public.client_staff
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Colaboradores: equipa altera" ON public.client_staff
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Colaboradores: administrador apaga" ON public.client_staff
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- company_settings (dados da VRCF): contas aprovadas leem; só administradores alteram
CREATE POLICY "Empresa: contas aprovadas leem" ON public.company_settings
  FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "Empresa: administrador cria" ON public.company_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Empresa: administrador altera" ON public.company_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ---------- Ficheiros ----------

DROP POLICY IF EXISTS "Admins can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete logos" ON storage.objects;
CREATE POLICY "Admins can upload logos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'logos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update logos" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'logos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete logos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'logos' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Staff can read evidence files" ON storage.objects;
DROP POLICY IF EXISTS "Staff can upload evidence files" ON storage.objects;
CREATE POLICY "Staff can read evidence files" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'evidence-files' AND public.is_staff(auth.uid()));
CREATE POLICY "Staff can upload evidence files" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'evidence-files' AND public.is_staff(auth.uid()));
