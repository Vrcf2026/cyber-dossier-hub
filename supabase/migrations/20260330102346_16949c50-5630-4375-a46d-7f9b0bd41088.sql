-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Company settings
CREATE TABLE public.company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  nif TEXT,
  address TEXT,
  email TEXT,
  phone TEXT,
  logo_url TEXT,
  claude_api_key TEXT,
  signature_data TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read company settings" ON public.company_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert company settings" ON public.company_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update company settings" ON public.company_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Clients
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  nif TEXT,
  sector TEXT,
  address TEXT,
  email TEXT,
  phone TEXT,
  contact_person TEXT,
  num_employees INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read clients" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update clients" ON public.clients FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete clients" ON public.clients FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Dossiers
CREATE TABLE public.dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'em_progresso', 'concluido')),
  progress INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dossiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read dossiers" ON public.dossiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert dossiers" ON public.dossiers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update dossiers" ON public.dossiers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete dossiers" ON public.dossiers FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Dossier sections
CREATE TABLE public.dossier_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  section_number INTEGER NOT NULL CHECK (section_number BETWEEN 1 AND 16),
  section_name TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  ai_generated_content TEXT,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(dossier_id, section_number)
);
ALTER TABLE public.dossier_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read sections" ON public.dossier_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert sections" ON public.dossier_sections FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update sections" ON public.dossier_sections FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete sections" ON public.dossier_sections FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_company_settings_updated_at BEFORE UPDATE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_dossiers_updated_at BEFORE UPDATE ON public.dossiers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_dossier_sections_updated_at BEFORE UPDATE ON public.dossier_sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile and assign admin role to first user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_count INTEGER;
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  SELECT COUNT(*) INTO user_count FROM public.profiles;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Storage bucket for logos
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true);
CREATE POLICY "Anyone can view logos" ON storage.objects FOR SELECT USING (bucket_id = 'logos');
CREATE POLICY "Admins can upload logos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'logos');
CREATE POLICY "Admins can update logos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'logos');
CREATE POLICY "Admins can delete logos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'logos');