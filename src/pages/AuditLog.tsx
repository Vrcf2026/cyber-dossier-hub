import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { auditActionLabels } from "@/lib/audit";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, ScrollText, Eye, Pencil, Download, Trash2, Settings2 } from "lucide-react";

type Log = {
  id: string;
  user_email: string | null;
  action: string;
  entity_type: string;
  dossier_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

type Settings = {
  id: string;
  retention_months: number;
  auto_purge_enabled: boolean;
  last_purge_at: string | null;
  last_purge_deleted: number | null;
};

const groupOf = (action: string) =>
  action.includes("export") ? "exportacao" : action.includes("update") || action.includes("generate") ? "alteracao" : "acesso";

const groupMeta: Record<string, { label: string; icon: typeof Eye; variant: "secondary" | "default" | "outline" }> = {
  acesso: { label: "Acesso", icon: Eye, variant: "secondary" },
  alteracao: { label: "Alteração", icon: Pencil, variant: "default" },
  exportacao: { label: "Exportação", icon: Download, variant: "outline" },
};

export default function AuditLog() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("todos");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [purging, setPurging] = useState(false);

  const loadSettings = async () => {
    const { data } = await supabase
      .from("audit_settings")
      .select("id, retention_months, auto_purge_enabled, last_purge_at, last_purge_deleted")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (data) setSettings(data as Settings);
  };

  const saveSettings = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSavingSettings(true);
    const { error } = await supabase
      .from("audit_settings")
      .update({ retention_months: next.retention_months, auto_purge_enabled: next.auto_purge_enabled })
      .eq("id", settings.id);
    setSavingSettings(false);
    if (error) toast({ title: "Não foi possível guardar", description: error.message, variant: "destructive" });
    else toast({ title: "Configurações guardadas" });
  };

  const purgeNow = async () => {
    setPurging(true);
    const { data, error } = await supabase.rpc("purge_audit_logs", { _force: true });
    setPurging(false);
    if (error) {
      toast({ title: "Falha na limpeza", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Limpeza concluída`, description: `${data ?? 0} registo(s) apagado(s).` });
    await Promise.all([load(), loadSettings()]);
  };

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("audit_logs")
      .select("id, user_email, action, entity_type, dossier_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    setLogs((data ?? []) as Log[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    loadSettings();
  }, []);

  const filtered = useMemo(
    () =>
      logs.filter((l) => {
        if (group !== "todos" && groupOf(l.action) !== group) return false;
        if (!search.trim()) return true;
        const haystack = [
          l.user_email ?? "",
          auditActionLabels[l.action] ?? l.action,
          JSON.stringify(l.details ?? {}),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(search.toLowerCase());
      }),
    [logs, search, group]
  );

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-primary flex items-center gap-2">
            <ScrollText className="h-6 w-6" /> Registo de auditoria
          </h2>
          <p className="text-sm text-muted-foreground">
            Histórico de acessos, alterações e exportações por utilizador (últimos 500 registos).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {settings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4" /> Retenção e limpeza
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label>Guardar registos durante</Label>
                <Select
                  value={String(settings.retention_months)}
                  onValueChange={(v) => saveSettings({ retention_months: Number(v) })}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[3, 6, 12, 24, 36, 60].map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {m} meses
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch
                  id="auto-purge"
                  checked={settings.auto_purge_enabled}
                  onCheckedChange={(v) => saveSettings({ auto_purge_enabled: v })}
                />
                <Label htmlFor="auto-purge">Limpeza automática diária</Label>
              </div>
              <Button variant="outline" size="sm" onClick={purgeNow} disabled={purging || savingSettings}>
                <Trash2 className="h-4 w-4 mr-2" /> Limpar agora
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Registos com mais de {settings.retention_months} meses são apagados automaticamente todas as noites.
              {settings.last_purge_at
                ? ` Última limpeza: ${fmt(settings.last_purge_at)} (${settings.last_purge_deleted ?? 0} registo(s) apagado(s)).`
                : " Ainda não foi executada nenhuma limpeza."}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Procurar por utilizador, ação ou detalhe..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={group} onValueChange={setGroup}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="acesso">Acessos</SelectItem>
            <SelectItem value="alteracao">Alterações</SelectItem>
            <SelectItem value="exportacao">Exportações</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{filtered.length} registo(s)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">A carregar...</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">Sem registos para os filtros escolhidos.</p>
          )}
          {filtered.map((l) => {
            const meta = groupMeta[groupOf(l.action)];
            const Icon = meta.icon;
            const d = (l.details ?? {}) as Record<string, unknown>;
            const detailBits = [
              d.dossier_title as string | undefined,
              d.client_name as string | undefined,
              d.section_name ? `Secção: ${d.section_name}` : undefined,
              d.variant ? `Versão: ${d.variant}` : undefined,
            ].filter(Boolean);
            return (
              <div key={l.id} className="flex items-start gap-3 rounded-md border p-3">
                <Badge variant={meta.variant} className="mt-0.5 shrink-0">
                  <Icon className="h-3 w-3 mr-1" />
                  {meta.label}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{auditActionLabels[l.action] ?? l.action}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {l.user_email ?? "utilizador removido"}
                    {detailBits.length > 0 && ` — ${detailBits.join(" · ")}`}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{fmt(l.created_at)}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
