-- 1) Security definer view -> security invoker + read-only grants
ALTER VIEW public.phishing_campaign_results SET (security_invoker = true);
REVOKE ALL ON public.phishing_campaign_results FROM anon, authenticated;
GRANT SELECT ON public.phishing_campaign_results TO authenticated;

-- 2) Revoke EXECUTE on SECURITY DEFINER functions not meant to be called via the API
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_dossier_sections() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_dossier_section_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
-- RLS helpers: needed by policies for signed-in users, never for anonymous callers
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_approved(uuid) FROM PUBLIC, anon;

-- 3) profiles: own record or admins only
DROP POLICY IF EXISTS "Approved users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) dossier-exports storage: only admins or the dossier creator (first path folder = dossier id)
DROP POLICY IF EXISTS "Approved users can read own dossier exports" ON storage.objects;
CREATE POLICY "Admins or dossier owners can read dossier exports"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'dossier-exports'
    AND public.is_approved(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.dossiers d
        WHERE d.created_by = auth.uid()
          AND d.id::text = (storage.foldername(storage.objects.name))[1]
      )
    )
  );