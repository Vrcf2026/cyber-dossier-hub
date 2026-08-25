import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { HardDrive, RefreshCw, Cloud, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

type BackupSettings = {
  id: string;
  enabled: boolean;
  drive_folder_id: string | null;
  retention_weeks: number;
  last_backup_at: string | null;
  last_backup_status: string | null;
  last_backup_error: string | null;
};

export default function Backups() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  // Campos editáveis
  const [enabled, setEnabled] = useState(false);
  const [driveFolderId, setDriveFolderId] = useState("");
  const [retentionWeeks, setRetentionWeeks] = useState(12);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("backup_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error) {
      toast({ title: "Erro ao carregar configuração", description: error.message, variant: "destructive" });
    } else if (data) {
      setSettings(data);
      setEnabled(data.enabled);
      setDriveFolderId(data.drive_folder_id ?? "");
      setRetentionWeeks(data.retention_weeks);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("backup_settings")
      .update({
        enabled,
        drive_folder_id: driveFolderId.trim() || null,
        retention_weeks: retentionWeeks,
      })
      .eq("id", settings?.id);

    if (error) {
      toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configuração guardada", description: "As definições de backup foram atualizadas." });
      loadSettings();
    }
    setSaving(false);
  };

  const handleRunNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("db-backup-drive", {
        headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
      });

      if (error) {
        toast({ title: "Erro no backup", description: error.message, variant: "destructive" });
      } else if (data?.error) {
        toast({ title: "Erro no backup", description: data.error, variant: "destructive" });
      } else if (data?.skipped) {
        toast({ title: "Backup ignorado", description: data.reason });
      } else {
        toast({
          title: "Backup concluído",
          description: `Ficheiro enviado para o Google Drive (${data?.old_backups_deleted ?? 0} backups antigos removidos).`,
        });
        loadSettings();
      }
    } catch (err) {
      toast({ title: "Erro", description: String(err), variant: "destructive" });
    }
    setRunning(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statusInfo = (() => {
    if (!settings?.last_backup_at) {
      return { label: "Nunca executado", color: "secondary" as const, icon: AlertCircle };
    }
    if (settings.last_backup_status === "sucesso") {
      return { label: "Sucesso", color: "default" as const, icon: CheckCircle2 };
    }
    return { label: "Erro", color: "destructive" as const, icon: AlertCircle };
  })();

  const StatusIcon = statusInfo.icon;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <HardDrive className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-primary">Backups & Segurança</h1>
          <p className="text-sm text-muted-foreground">
            Configuração de backups automáticos semanais para o Google Drive.
          </p>
        </div>
      </div>

      {/* Estado atual */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Estado do Backup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Último backup</span>
            <div className="flex items-center gap-2">
              <StatusIcon className={`h-4 w-4 ${statusInfo.color === "destructive" ? "text-destructive" : statusInfo.color === "default" ? "text-green-500" : "text-muted-foreground"}`} />
              <Badge variant={statusInfo.color}>{statusInfo.label}</Badge>
              {settings?.last_backup_at && (
                <span className="text-sm text-muted-foreground">
                  {new Date(settings.last_backup_at).toLocaleString("pt-PT")}
                </span>
              )}
            </div>
          </div>
          {settings?.last_backup_error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              <strong>Erro:</strong> {settings.last_backup_error}
            </div>
          )}
          <Button onClick={handleRunNow} disabled={running} variant="outline" className="w-full">
            {running ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                A executar backup...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Executar backup agora
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Configuração */}
      <Card>
        <CardHeader>
          <CardTitle>Configuração</CardTitle>
          <CardDescription>
            Define a pasta do Google Drive e o período de retenção dos backups.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Ativar/desativar */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="enabled">Backups automáticos</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Quando ativos, um backup completo é gerado semanalmente (todos os domingos às 03:00).
              </p>
            </div>
            <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {/* Pasta do Drive */}
          <div className="space-y-2">
            <Label htmlFor="folder">ID da pasta do Google Drive</Label>
            <Input
              id="folder"
              value={driveFolderId}
              onChange={(e) => setDriveFolderId(e.target.value)}
              placeholder="ex.: 1aBcDeFgHiJkLmNoPqRsTuVwXyZ"
            />
            <p className="text-xs text-muted-foreground">
              Cria uma pasta no Google Drive, copia o ID do URL e partilha-a com o email da Service Account.
            </p>
          </div>

          {/* Retenção */}
          <div className="space-y-2">
            <Label htmlFor="retention">Semanas de retenção</Label>
            <Input
              id="retention"
              type="number"
              min={1}
              max={260}
              value={retentionWeeks}
              onChange={(e) => setRetentionWeeks(parseInt(e.target.value) || 12)}
            />
            <p className="text-xs text-muted-foreground">
              Backups com mais de {retentionWeeks} semanas serão automaticamente removidos do Drive.
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                A guardar...
              </>
            ) : (
              "Guardar configuração"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Guia de configuração */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como configurar a Service Account do Google</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Para que os backups automáticos funcionem, é necessário configurar uma Service Account do Google Cloud:</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Acede ao <strong>Google Cloud Console</strong> e cria um projeto (ou usa um existente).</li>
            <li>Ativa a <strong>Google Drive API</strong> no projeto.</li>
            <li>Vai a <strong>IAM &amp; Admin → Service Accounts</strong> e cria uma nova Service Account.</li>
            <li>Gera uma chave JSON e <strong>envia-a para o Lovable</strong> para ser guardada como secret <code className="text-xs bg-muted px-1 rounded">GOOGLE_SERVICE_ACCOUNT_JSON</code>.</li>
            <li>Copia o email da Service Account (ex.: <code className="text-xs bg-muted px-1 rounded">backup@projeto.iam.gserviceaccount.com</code>).</li>
            <li>Cria uma pasta no Google Drive e <strong>partilha-a</strong> com esse email (permissão de Editor).</li>
            <li>Copia o ID da pasta do URL e cola-o no campo acima.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
