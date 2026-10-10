import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Marca } from "@/components/Marca";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error("Introduza o seu email primeiro.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Email de recuperação enviado. Verifique a sua caixa de correio.");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast.error(error.message);
    else navigate("/");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-sidebar p-4">
      {/* Fundo da marca: azul-tinta com uma grelha ténue e um brilho atrás do cartão. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:linear-gradient(hsl(var(--sidebar-foreground))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--sidebar-foreground))_1px,transparent_1px)] [background-size:44px_44px]" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sidebar-primary/20 blur-[120px]" />
      <div className="relative w-full max-w-md">
      <Marca escuro className="mb-8" />
      <Card className="w-full rounded-2xl shadow-elevada">
        <CardHeader>
          <CardTitle className="text-xl">Iniciar sessão</CardTitle>
          <CardDescription>Entre com o email e a palavra-passe da sua conta.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.pt"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Palavra-passe</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "A processar..." : "Iniciar sessão"}
            </Button>
          </form>
          <div className="mt-4 text-center space-y-2">
            <button
              type="button"
              onClick={handleForgotPassword}
              className="block w-full text-sm text-muted-foreground hover:text-primary underline"
            >
              Esqueci-me da palavra-passe
            </button>
            <p className="text-xs text-muted-foreground">
              As contas são criadas pelo administrador. Se não tem acesso, contacte-o.
            </p>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
