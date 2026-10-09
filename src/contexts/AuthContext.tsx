import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "tecnico" | "cliente" | "user";

type AuthContextType = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  role: AppRole | null;
  isAdmin: boolean;
  isStaff: boolean;
  isCliente: boolean;
  isApproved: boolean;
  /** Nível da sessão: "aal2" = verificação em dois passos feita nesta sessão. */
  aal: "aal1" | "aal2" | null;
  /** Já tem um fator (TOTP) verificado — só falta o código, não a configuração. */
  temMfa: boolean;
  refreshAal: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  role: null,
  isAdmin: false,
  isStaff: false,
  isCliente: false,
  isApproved: false,
  aal: null,
  temMfa: false,
  refreshAal: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [aal, setAal] = useState<"aal1" | "aal2" | null>(null);
  const [temMfa, setTemMfa] = useState(false);

  const refreshAal = async () => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setAal((data?.currentLevel as "aal1" | "aal2" | null) ?? null);
    setTemMfa(data?.nextLevel === "aal2");
  };

  const loadProfile = async (userId: string) => {
    const [, { data: roleRow }, { data: profile }] = await Promise.all([
      refreshAal(),
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("is_approved").eq("user_id", userId).maybeSingle(),
    ]);
    setRole((roleRow?.role as AppRole) ?? null);
    setIsApproved(!!profile?.is_approved);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        // Fora do callback: chamar o auth (getAuthenticatorAssuranceLevel) aqui dentro pode bloquear.
        const id = session.user.id;
        setTimeout(() => { loadProfile(id).finally(() => setIsLoading(false)); }, 0);
      } else {
        setRole(null);
        setIsApproved(false);
        setAal(null);
        setTemMfa(false);
        setIsLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isAdmin = role === "admin";
  const isCliente = role === "cliente";
  const isStaff = role === "admin" || role === "tecnico" || role === "user";

  return (
    <AuthContext.Provider
      value={{ user, session, isLoading, role, isAdmin, isStaff, isCliente, isApproved, aal, temMfa, refreshAal, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}
