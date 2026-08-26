import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import Dossiers from "./pages/Dossiers";
import DossierEditor from "./pages/DossierEditor";
import DossierIntake from "./pages/DossierIntake";
import DossierCredentials from "./pages/DossierCredentials";
import Company from "./pages/Company";
import PhishingTest from "./pages/PhishingTest";
import Users from "./pages/Users";
import Portal from "./pages/Portal";
import AuditLog from "./pages/AuditLog";
import Backups from "./pages/Backups";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const Loading = () => (
  <div className="min-h-screen flex items-center justify-center text-muted-foreground">A carregar...</div>
);

function NotApproved() {
  const { signOut, user } = useAuth();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold text-primary">Conta por ativar</h1>
      <p className="text-sm text-muted-foreground max-w-sm">
        A conta {user?.email} ainda não foi ativada pelo administrador.
      </p>
      <button onClick={signOut} className="text-sm underline text-muted-foreground hover:text-primary">
        Terminar sessão
      </button>
    </div>
  );
}

/** Rotas internas (admin / técnico) */
function StaffRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isStaff, isCliente, isApproved } = useAuth();
  if (isLoading) return <Loading />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isApproved) return <NotApproved />;
  if (isCliente) return <Navigate to="/portal" replace />;
  if (!isStaff) return <NotApproved />;
  return <AppLayout>{children}</AppLayout>;
}

/** Rotas exclusivas de administrador */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, isAdmin } = useAuth();
  if (isLoading) return <Loading />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <StaffRoute>{children}</StaffRoute>;
}

/** Portal de leitura do cliente */
function ClientRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isCliente, isApproved } = useAuth();
  if (isLoading) return <Loading />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isApproved) return <NotApproved />;
  if (!isCliente) return <Navigate to="/" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AuthRoute() {
  const { user, isLoading, isCliente } = useAuth();
  if (isLoading) return null;
  if (user) return <Navigate to={isCliente ? "/portal" : "/"} replace />;
  return <Auth />;
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/auth" element={<AuthRoute />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/portal" element={<ClientRoute><Portal /></ClientRoute>} />
              <Route path="/" element={<StaffRoute><Dashboard /></StaffRoute>} />
              <Route path="/clientes" element={<StaffRoute><Clients /></StaffRoute>} />
              <Route path="/clientes/:id" element={<StaffRoute><ClientDetail /></StaffRoute>} />
              <Route path="/clientes/:id/phishing" element={<StaffRoute><PhishingTest /></StaffRoute>} />
              <Route path="/dossiers" element={<StaffRoute><Dossiers /></StaffRoute>} />
              <Route path="/dossiers/:id" element={<StaffRoute><DossierEditor /></StaffRoute>} />
              <Route path="/dossiers/:id/intake" element={<StaffRoute><DossierIntake /></StaffRoute>} />
              <Route path="/dossiers/:id/credenciais" element={<AdminRoute><DossierCredentials /></AdminRoute>} />
              <Route path="/empresa" element={<AdminRoute><Company /></AdminRoute>} />
              <Route path="/utilizadores" element={<AdminRoute><Users /></AdminRoute>} />
              <Route path="/auditoria" element={<AdminRoute><AuditLog /></AdminRoute>} />
              <Route path="/backups" element={<AdminRoute><Backups /></AdminRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
