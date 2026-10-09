// Verificação em dois passos (TOTP) — obrigatória para a equipa (admin/técnico).
// Sem fator: configura (QR code para Google Authenticator, Microsoft Authenticator, Bitwarden...).
// Com fator: pede o código de 6 dígitos para subir a sessão para aal2.
// Telemóvel perdido: outro administrador usa "Repor 2 passos" em Utilizadores.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

type Inscricao = { factorId: string; qr: string; segredo: string };

export default function Mfa() {
  const { user, temMfa, refreshAal, signOut } = useAuth();
  const [inscricao, setInscricao] = useState<Inscricao | null>(null);
  const [codigo, setCodigo] = useState("");
  const [aEnviar, setAEnviar] = useState(false);

  // Sem fator verificado: preparar a configuração (apaga tentativas antigas por concluir).
  useEffect(() => {
    if (temMfa || inscricao) return;
    (async () => {
      const { data: lista } = await supabase.auth.mfa.listFactors();
      for (const f of lista?.all ?? []) {
        if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `CyberDossier ${new Date().toISOString().slice(0, 10)}`,
      });
      if (error || !data) {
        toast.error(error?.message ?? "Não foi possível iniciar a configuração.");
        return;
      }
      setInscricao({ factorId: data.id, qr: data.totp.qr_code, segredo: data.totp.secret });
    })();
  }, [temMfa, inscricao]);

  const verificar = async (e: React.FormEvent) => {
    e.preventDefault();
    setAEnviar(true);
    try {
      let factorId = inscricao?.factorId;
      if (!factorId) {
        const { data } = await supabase.auth.mfa.listFactors();
        factorId = data?.totp?.find((f) => f.status === "verified")?.id;
      }
      if (!factorId) throw new Error("Nenhum fator encontrado.");
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: codigo.trim() });
      if (error) throw error;
      await refreshAal();
      toast.success(inscricao ? "Verificação em dois passos ativada." : "Verificado.");
    } catch (err: any) {
      toast.error(err?.message?.includes("Invalid") ? "Código errado ou expirado." : (err?.message ?? "Falhou."));
      setCodigo("");
    } finally {
      setAEnviar(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <ShieldCheck className="h-8 w-8 text-accent" />
            <CardTitle className="text-xl font-bold text-primary">Verificação em dois passos</CardTitle>
          </div>
          <CardDescription>
            {temMfa
              ? "Introduza o código de 6 dígitos da aplicação de autenticação."
              : "Obrigatória para a equipa: o dossier guarda dados sensíveis dos clientes."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!temMfa && (
            inscricao ? (
              <div className="space-y-3 text-sm">
                <p>1. Na aplicação de autenticação (Google/Microsoft Authenticator, Bitwarden…), leia este código QR:</p>
                <div className="flex justify-center">
                  <img src={inscricao.qr} alt="Código QR" className="h-48 w-48 bg-white p-2 rounded" />
                </div>
                <p className="text-xs text-muted-foreground break-all">
                  Ou introduza a chave à mão: <span className="font-mono">{inscricao.segredo}</span>
                </p>
                <p>2. Escreva o código que aparece na aplicação:</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">A preparar…</p>
            )
          )}
          <form onSubmit={verificar} className="space-y-3">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              placeholder="000000"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              className="text-center text-lg tracking-widest font-mono"
            />
            <Button type="submit" className="w-full" disabled={aEnviar || codigo.length !== 6 || (!temMfa && !inscricao)}>
              {aEnviar ? "A verificar..." : "Confirmar"}
            </Button>
          </form>
          <div className="text-center text-xs text-muted-foreground space-y-1">
            <p>{user?.email}</p>
            {temMfa && <p>Perdeu o telemóvel? Peça a outro administrador para repor a verificação.</p>}
            <button onClick={signOut} className="underline hover:text-primary">Terminar sessão</button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
