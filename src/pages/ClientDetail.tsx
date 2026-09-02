import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, ShieldAlert, AlertTriangle, ClipboardCheck, CheckCircle2, XCircle, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "secondary" },
  em_progresso: { label: "Em Progresso", variant: "default" },
  concluido: { label: "Concluído", variant: "outline" },
};

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [client, setClient] = useState<any>(null);
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [overdueTasks, setOverdueTasks] = useState(0);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [lastRestore, setLastRestore] = useState<string | null>(null);
  const [offboardOpen, setOffboardOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [password, setPassword] = useState("");
  const [offboarding, setOffboarding] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase.from("clients").select("*").eq("id", id).single().then(({ data }) => setClient(data));
    supabase.from("dossiers").select("*").eq("client_id", id).order("created_at", { ascending: false }).then(({ data }) => setDossiers(data ?? []));
    const today = new Date().toISOString().split("T")[0];
    supabase.from("client_tasks").select("id").eq("client_id", id).eq("active", true).lt("next_due", today)
      .then(({ data }) => setOverdueTasks(data?.length ?? 0));
    supabase.from("client_evidences").select("evidence_date").eq("client_id", id).eq("evidence_type", "backup_check")
      .order("evidence_date", { ascending: false }).limit(1)
      .then(({ data }) => setLastBackup(data?.[0]?.evidence_date ?? null));
    supabase.from("client_evidences").select("evidence_date").eq("client_id", id).eq("evidence_type", "restore_test")
      .order("evidence_date", { ascending: false }).limit(1)
      .then(({ data }) => setLastRestore(data?.[0]?.evidence_date ?? null));
  }, [id]);

  if (!client) return <p className="text-muted-foreground">A carregar...</p>;

  const formatDate = (d: string) => new Date(d).toLocaleDateString("pt-PT");

  const resetOffboardDialog = () => {
    setOffboardOpen(false);
    setConfirmName("");
    setPassword("");
  };

  const handleOffboard = async () => {
    if (!user?.email) return;
    if (confirmName.trim().toLowerCase() !== client.name.trim().toLowerCase()) {
      toast.error("O nome escrito não corresponde ao nome do cliente.");
      return;
    }
    if (!password) {
      toast.error("Introduz a tua password para confirmar.");
      return;
    }
    setOffboarding(true);
    try {
      // Reautenticação: confirma que és mesmo tu antes de uma ação irreversível.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (reauthError) {
        toast.error("Password incorreta.");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/client-offboard`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: id, confirmName }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao encerrar o cliente.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Arquivo_${client.name.replace(/\s+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Cliente encerrado. PDF descarregado e arquivado internamente.");
      resetOffboardDialog();
      navigate("/clientes");
    } catch (e: any) {
      toast.error(e.message || "Erro ao encerrar o cliente.");
    } finally {
      setOffboarding(false);
    }
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate("/clientes")} className="mb-2">
        <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
      </Button>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{client.name}</CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => navigate(`/clientes/${id}/continuidade`)}>
              <ClipboardCheck className="h-4 w-4 mr-2" /> Continuidade
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/clientes/${id}/phishing`)}>
              <ShieldAlert className="h-4 w-4 mr-2" /> Phishing
            </Button>
            {isAdmin && (
              <Button variant="destructive" size="sm" onClick={() => setOffboardOpen(true)}>
                <AlertTriangle className="h-4 w-4 mr-2" /> Encerrar
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Semáforos de continuidade */}
          <div className="grid grid-cols-3 gap-3 pb-2 border-b">
            {(() => {
              const today = new Date();
              const daysSinceBackup = lastBackup ? Math.floor((today.getTime() - new Date(lastBackup).getTime()) / 864e5) : null;
              const daysSinceRestore = lastRestore ? Math.floor((today.getTime() - new Date(lastRestore).getTime()) / 864e5) : null;
              const backupOk = daysSinceBackup !== null && daysSinceBackup <= 7;
              const backupWarn = daysSinceBackup !== null && daysSinceBackup <= 14;
              const restoreOk = daysSinceRestore !== null && daysSinceRestore <= 90;
              const restoreWarn = daysSinceRestore !== null && daysSinceRestore <= 180;
              return [
                {
                  label: "Último backup",
                  value: lastBackup ? `${daysSinceBackup}d atrás` : "Nunca registado",
                  icon: backupOk ? CheckCircle2 : daysSinceBackup !== null && daysSinceBackup <= 14 ? Clock : XCircle,
                  color: backupOk ? "text-green-600" : backupWarn ? "text-amber-600" : "text-red-600",
                },
                {
                  label: "Último restauro",
                  value: lastRestore ? `${daysSinceRestore}d atrás` : "Nunca realizado",
                  icon: restoreOk ? CheckCircle2 : restoreWarn ? Clock : XCircle,
                  color: restoreOk ? "text-green-600" : restoreWarn ? "text-amber-600" : "text-red-600",
                },
                {
                  label: "Tarefas em atraso",
                  value: overdueTasks === 0 ? "Nenhuma" : `${overdueTasks} em atraso`,
                  icon: overdueTasks === 0 ? CheckCircle2 : AlertTriangle,
                  color: overdueTasks === 0 ? "text-green-600" : "text-red-600",
                },
              ].map(s => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="text-center cursor-pointer" onClick={() => navigate(`/clientes/${id}/continuidade`)}>
                    <Icon className={`h-5 w-5 mx-auto ${s.color}`} />
                    <p className={`text-xs font-medium mt-1 ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                );
              });
            })()}
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
          {client.nif && <div><span className="text-muted-foreground">NIF:</span> {client.nif}</div>}
          {client.sector && <div><span className="text-muted-foreground">Setor:</span> {client.sector}</div>}
          {client.email && <div><span className="text-muted-foreground">Email:</span> {client.email}</div>}
          {client.phone && <div><span className="text-muted-foreground">Telefone:</span> {client.phone}</div>}
          {client.address && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Morada:</span>{" "}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:opacity-80"
              >
                {client.address}
              </a>
            </div>
          )}
          {client.contact_person && <div><span className="text-muted-foreground">Contacto:</span> {client.contact_person}</div>}
          {client.num_employees && <div><span className="text-muted-foreground">Colaboradores:</span> {client.num_employees}</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dossiers do Cliente</CardTitle>
        </CardHeader>
        <CardContent>
          {dossiers.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sem dossiers.</p>
          ) : (
            <div className="space-y-3">
              {dossiers.map((d) => {
                const cfg = statusConfig[d.status] || statusConfig.rascunho;
                return (
                  <div
                    key={d.id}
                    className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/dossiers/${d.id}`)}
                  >
                    <div>
                      <p className="font-medium">{d.title}</p>
                      <p className="text-sm text-muted-foreground">{formatDate(d.created_at)}</p>
                    </div>
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={offboardOpen} onOpenChange={(open) => !offboarding && (open ? setOffboardOpen(true) : resetOffboardDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Encerrar Cliente — ação irreversível
            </DialogTitle>
            <DialogDescription>
              Isto gera um PDF com <strong>tudo</strong> sobre "{client.name}" (todos os dossiers, secções
              internas e credenciais), descarrega-o, guarda uma cópia arquivada, e <strong>elimina
              definitivamente</strong> o cliente e todos os dossiers associados. Não há forma de desfazer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="confirm-name">Escreve o nome do cliente para confirmar</Label>
              <Input id="confirm-name" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={client.name} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm-password">A tua password</Label>
              <Input id="confirm-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetOffboardDialog} disabled={offboarding}>Cancelar</Button>
            <Button variant="destructive" onClick={handleOffboard} disabled={offboarding}>
              {offboarding ? "A processar..." : "Exportar tudo e eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
