import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import Dossiers from "./pages/Dossiers";
import DossierEditor from "./pages/DossierEditor";
import Company from "./pages/Company";
import PhishingTest from "./pages/PhishingTest";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">A carregar...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AuthRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user) return <Navigate to="/" replace />;
  return <Auth />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<AuthRoute />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/clientes" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
            <Route path="/clientes/:id" element={<ProtectedRoute><ClientDetail /></ProtectedRoute>} />
            <Route path="/clientes/:id/phishing" element={<ProtectedRoute><PhishingTest /></ProtectedRoute>} />
            <Route path="/dossiers" element={<ProtectedRoute><Dossiers /></ProtectedRoute>} />
            <Route path="/dossiers/:id" element={<ProtectedRoute><DossierEditor /></ProtectedRoute>} />
            <Route path="/empresa" element={<ProtectedRoute><Company /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
