import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderOpen, CheckCircle, Users, ShieldAlert, AlertTriangle, CheckCircle2, ClipboardCheck, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "secondary" },
  em_progresso: { label: "Em Progresso", variant: "default" },
  concluido: { label: "Concluído", variant: "outline" },
};

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalDossiers: 0, completedDossiers: 0, activeClients: 0,
    phishingClickRate: null as number | null,
    overdueTasks: 0, intakePending: 0,
  });
  const [recentDossiers, setRecentDossiers] = useState<any[]>([]);
  const [overdueList, setOverdueList] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];

    const [dossiers, clients, recent, phishingResults, overdueTasks, intakePending] = await Promise.all([
      supabase.from("dossiers").select("id, status"),
      supabase.from("clients").select("id"),
      supabase.from("dossiers").select("*, clients(name)").order("created_at", { ascending: false }).limit(5),
      supabase.from("phishing_campaign_results").select("attempts"),
      supabase.from("client_tasks").select("id, title, next_due, evidence_type, clients(name, id)")
        .eq("active", true).lt("next_due", today).order("next_due").limit(10),
      supabase.from("dossiers").select("id").eq("intake_completed", false),
    ]);

    const results = phishingResults.data ?? [];
    const clickRate = results.length > 0
      ? Math.round((results.filter((r) => (r.attempts ?? 0) > 0).length / results.length) * 100)
      : null;

    setMetrics({
      totalDossiers: dossiers.data?.length ?? 0,
      completedDossiers: dossiers.data?.filter((d) => d.status === "concluido").length ?? 0,
      activeClients: clients.data?.length ?? 0,
      phishingClickRate: clickRate,
      overdueTasks: overdueTasks.data?.length ?? 0,
      intakePending: intakePending.data?.length ?? 0,
    });
    setRecentDossiers(recent.data ?? []);
    setOverdueList(overdueTasks.data ?? []);
    setLoading(false);
  };

  const TYPE_LABELS: Record<string, string> = {
    backup_check: "Backup", restore_test: "Restauro", patch_update: "Patches",
    log_review: "Logs", vuln_scan: "Scan", access_review: "Acessos",
    phishing_campaign: "Phishing", ssl_renewal: "SSL", dossier_review: "Dossier",
    incident: "Incidente", other: "Outro",
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("pt-PT");

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>

      {/* Alertas do dia — aparecem primeiro se houver algo urgente */}
      {!loading && (metrics.overdueTasks > 0 || metrics.intakePending > 0) && (
        <div className="space-y-2">
          {metrics.overdueTasks > 0 && (
            <div className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                <div>
                  <p className="font-medium text-sm text-red-800 dark:text-red-200">
                    {metrics.overdueTasks} tarefa{metrics.overdueTasks > 1 ? "s" : ""} de manutenção em atraso
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400">Clica para ver e registar as evidências</p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="border-red-300 shrink-0" onClick={() => navigate("/continuidade")}>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          {metrics.intakePending > 0 && (
            <div className="flex items-center justify-between p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20">
              <div className="flex items-center gap-3">
                <ClipboardCheck className="h-5 w-5 text-amber-600 shrink-0" />
                <div>
                  <p className="font-medium text-sm text-amber-800 dark:text-amber-200">
                    {metrics.intakePending} dossier{metrics.intakePending > 1 ? "s" : ""} com intake pendente
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">Informação por recolher — secções por preencher</p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="border-amber-300 shrink-0" onClick={() => navigate("/dossiers")}>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : [
          { title: "Total Dossiers", value: metrics.totalDossiers, icon: FolderOpen, color: "text-primary" },
          { title: "Concluídos", value: metrics.completedDossiers, icon: CheckCircle, color: "text-green-600" },
          { title: "Clientes", value: metrics.activeClients, icon: Users, color: "text-blue-600" },
          {
            title: "Tarefas em atraso", value: metrics.overdueTasks, icon: AlertTriangle,
            color: metrics.overdueTasks > 0 ? "text-red-600" : "text-green-600",
          },
          {
            title: "Intake pendente", value: metrics.intakePending, icon: ClipboardCheck,
            color: metrics.intakePending > 0 ? "text-amber-600" : "text-green-600",
          },
          {
            title: "Taxa Phishing", value: metrics.phishingClickRate === null ? "—" : `${metrics.phishingClickRate}%`,
            icon: ShieldAlert,
            color: metrics.phishingClickRate && metrics.phishingClickRate > 20 ? "text-red-600" : "text-green-600",
          },
        ].map((m) => (
          <Card key={m.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground leading-tight">{m.title}</CardTitle>
              <m.icon className={`h-4 w-4 shrink-0 ${m.color}`} />
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="text-2xl font-bold">{m.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tarefas em atraso */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" /> Manutenção em atraso
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : overdueList.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-green-600 py-4">
                <CheckCircle2 className="h-5 w-5" /> Tudo em dia — sem tarefas em atraso.
              </div>
            ) : (
              <div className="space-y-2">
                {overdueList.map((t: any) => {
                  const daysLate = Math.ceil((Date.now() - new Date(t.next_due).getTime()) / 864e5);
                  return (
                    <div key={t.id} className="flex items-center justify-between p-2 rounded border border-red-100 bg-red-50/50 dark:bg-red-950/10 cursor-pointer"
                      onClick={() => navigate(`/clientes/${t.clients?.id}/continuidade`)}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{t.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.clients?.name} · <span className="text-red-600">{daysLate}d em atraso</span>
                          {" · "}{TYPE_LABELS[t.evidence_type] ?? t.evidence_type}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                    </div>
                  );
                })}
                {metrics.overdueTasks > 10 && (
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate("/continuidade")}>
                    Ver todas ({metrics.overdueTasks}) →
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Últimos dossiers */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Últimos Dossiers</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : recentDossiers.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4">Nenhum dossier encontrado.</p>
            ) : (
              <div className="space-y-2">
                {recentDossiers.map((d) => {
                  const cfg = statusConfig[d.status] || statusConfig.rascunho;
                  return (
                    <div key={d.id}
                      className="flex items-center justify-between p-2 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => navigate(`/dossiers/${d.id}`)}>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{d.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {(d.clients as any)?.name} · {formatDate(d.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {!d.intake_completed && (
                          <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs hidden sm:flex">Intake</Badge>
                        )}
                        <Badge variant={cfg.variant} className="text-xs">{cfg.label}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
