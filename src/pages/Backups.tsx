import { useEffect, useState, useCallback } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
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

  const normalizeDriveFolderId = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";

    const folderMatch = trimmed.match(/\/folders\/([^/?#]+)/);
    if (folderMatch?.[1]) return folderMatch[1];

    try {
      const url = new URL(trimmed);
      return url.searchParams.get("id") ?? trimmed;
    } catch {
      return trimmed;
    }
  };

  const saveSettings = async (showSuccess = true) => {
    if (!settings?.id) {
      toast({
        title: "Configuração indisponível",
        description: "Recarrega a página e tenta novamente.",
        variant: "destructive",
      });
      return false;
    }

    const normalizedFolderId = normalizeDriveFolderId(driveFolderId);
    setDriveFolderId(normalizedFolderId);

    const { error } = await supabase
      .from("backup_settings")
      .update({
        enabled,
        drive_folder_id: normalizedFolderId || null,
        retention_weeks: retentionWeeks,
      })
      .eq("id", settings.id);

    if (error) {
      toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
      return false;
    }

    setSettings({
      ...settings,
      enabled,
      drive_folder_id: normalizedFolderId || null,
      retention_weeks: retentionWeeks,
    });

    if (showSuccess) {
      toast({ title: "Configuração guardada", description: "As definições de backup foram atualizadas." });
    }

    return true;
  };

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
    const saved = await saveSettings();
    if (saved) {
      loadSettings();
    }
    setSaving(false);
  };

  const handleRunNow = async () => {
    const normalizedFolderId = normalizeDriveFolderId(driveFolderId);
    if (!normalizedFolderId) {
      toast({
        title: "Falta o ID da pasta do Google Drive",
        description: "Cola o ID ou o URL da pasta, guarda a configuração e volta a executar o backup.",
        variant: "destructive",
      });
      return;
    }

    setRunning(true);
    try {
      const savedFolderId = settings?.drive_folder_id ?? "";
      const hasUnsavedChanges =
        normalizedFolderId !== savedFolderId ||
        enabled !== settings?.enabled ||
        retentionWeeks !== settings?.retention_weeks;

      if (hasUnsavedChanges) {
        const saved = await saveSettings(false);
        if (!saved) {
          setRunning(false);
          return;
        }
      }

      const { data, error } = await supabase.functions.invoke("db-backup-drive", {
        headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
      });

      if (error) {
        let description = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const responseText = await error.context.text();
            const errorBody = JSON.parse(responseText);
            description = [errorBody?.error, errorBody?.details].filter(Boolean).join(" ") || description;
          } catch {
            description = error.message;
          }
        }
        toast({ title: "Erro no backup", description, variant: "destructive" });
      } else if (data?.error) {
        toast({ title: "Erro no backup", description: [data.error, data.details].filter(Boolean).join(" "), variant: "destructive" });
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
          {!driveFolderId.trim() && (
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              Sem pasta definida, o backup é guardado na raiz da conta Google ligada.
            </div>
          )}

          <Button onClick={handleRunNow} disabled={running || saving} variant="outline" className="w-full">
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
            <Label htmlFor="folder">Pasta do Google Drive (opcional)</Label>
            <Input
              id="folder"
              value={driveFolderId}
              onChange={(e) => setDriveFolderId(e.target.value)}
              placeholder="ID ou URL da pasta do Google Drive"
            />
            <p className="text-xs text-muted-foreground">
              Podes colar o URL completo. Se deixares vazio, o backup é guardado na raiz da conta Google ligada.
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
          <CardTitle className="text-base">Como configurar o Google Drive</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Os backups usam a <strong>ligação directa à tua conta Google Drive</strong> (autorização OAuth feita no Lovable). Não é necessária qualquer Service Account nem chave JSON.</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Confirma que a ligação <strong>Google Drive</strong> está activa nos conectores do projeto.</li>
            <li>Opcional: cria no teu Drive uma pasta para os backups.</li>
            <li>Copia o URL completo da pasta (ou apenas o ID) e cola-o no campo acima.</li>
            <li>Se deixares o campo vazio, os backups são guardados na raiz do teu Drive.</li>
            <li>Guarda a configuração e clica em «Executar backup agora» para testar.</li>
          </ol>
        </CardContent>

      </Card>
    </div>
  );
}
