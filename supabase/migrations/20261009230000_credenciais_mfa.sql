-- Credenciais dos clientes: só administradores E com a verificação em dois passos
-- feita na sessão atual (aal2). Uma password de admin roubada já não chega.
-- Telemóvel perdido: outro administrador repõe em Utilizadores → "Repor 2 passos".

DROP POLICY IF EXISTS "Admins read credentials" ON public.dossier_credentials;
DROP POLICY IF EXISTS "Admins insert credentials" ON public.dossier_credentials;
DROP POLICY IF EXISTS "Admins update credentials" ON public.dossier_credentials;
DROP POLICY IF EXISTS "Admins delete credentials" ON public.dossier_credentials;

CREATE POLICY "Admins read credentials" ON public.dossier_credentials
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND (auth.jwt() ->> 'aal') = 'aal2');
CREATE POLICY "Admins insert credentials" ON public.dossier_credentials
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND (auth.jwt() ->> 'aal') = 'aal2');
CREATE POLICY "Admins update credentials" ON public.dossier_credentials
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND (auth.jwt() ->> 'aal') = 'aal2');
