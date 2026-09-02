import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Clock, ArrowRight } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  backup_check: "Verificação Backup",
  restore_test: "Teste Restauro",
  patch_update: "Patches",
  log_review: "Revisão Logs",
  vuln_scan: "Scan Vuln.",
  access_review: "Revisão Acessos",
  phishing_campaign: "Phishing",
  ssl_renewal: "SSL",
  dossier_review: "Revisão Dossier",
  incident: "Incidente",
  other: "Outro",
};

type TaskWithClient = {
  id: string; client_id: string; evidence_type: string; title: string;
  frequency: string; next_due: string; last_done: string | null;
  clients: { name: string } | null;
};

export default function ContinuityOverview() {
  const navigate = useNavigate();
  const [overdue, setOverdue] = useState<TaskWithClient[]>([]);
  const [upcoming, setUpcoming] = useState<TaskWithClient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    const in14 = new Date(Date.now() + 14 * 864e5).toISOString().split("T")[0];

    Promise.all([
      supabase.from("client_tasks")
        .select("*, clients(name)")
        .eq("active", true)
        .lt("next_due", today)
        .order("next_due"),
      supabase.from("client_tasks")
        .select("*, clients(name)")
        .eq("active", true)
        .gte("next_due", today)
        .lte("next_due", in14)
        .order("next_due"),
    ]).then(([ov, up]) => {
      setOverdue((ov.data ?? []) as TaskWithClient[]);
      setUpcoming((up.data ?? []) as TaskWithClient[]);
      setLoading(false);
    });
  }, []);

  if (loading) return <p className="text-muted-foreground p-6">A carregar...</p>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold">Continuidade</h2>
        <p className="text-muted-foreground text-sm">Tarefas de manutenção em atraso e próximas (todos os clientes)</p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className={`text-3xl font-bold ${overdue.length > 0 ? "text-red-600" : "text-green-600"}`}>{overdue.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Em atraso</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-3xl font-bold text-amber-600">{upcoming.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Próximos 14 dias</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-3xl font-bold text-muted-foreground">{overdue.length + upcoming.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Total pendentes</p>
          </CardContent>
        </Card>
      </div>

      {/* Em atraso */}
      {overdue.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4" /> Em Atraso ({overdue.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdue.map(t => {
              const daysLate = Math.ceil((Date.now() - new Date(t.next_due).getTime()) / 864e5);
              return (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-red-100 bg-red-50">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{t.title}</span>
                      <Badge variant="secondary" className="text-xs">{TYPE_LABELS[t.evidence_type] ?? t.evidence_type}</Badge>
                      <span className="text-xs text-red-600 font-medium">{daysLate}d em atraso</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(t.clients as any)?.name ?? "—"} · Previsto: {new Date(t.next_due).toLocaleDateString("pt-PT")}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0 ml-3 border-red-300"
                    onClick={() => navigate(`/clientes/${t.client_id}/continuidade`)}>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Próximos */}
      {upcoming.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" /> Próximos 14 dias ({upcoming.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.map(t => {
              const daysLeft = Math.ceil((new Date(t.next_due).getTime() - Date.now()) / 864e5);
              return (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{t.title}</span>
                      <Badge variant="secondary" className="text-xs">{TYPE_LABELS[t.evidence_type] ?? t.evidence_type}</Badge>
                      <span className="text-xs text-muted-foreground">em {daysLeft}d</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(t.clients as any)?.name ?? "—"} · {new Date(t.next_due).toLocaleDateString("pt-PT")}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="shrink-0 ml-3"
                    onClick={() => navigate(`/clientes/${t.client_id}/continuidade`)}>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {overdue.length === 0 && upcoming.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
            <p className="font-medium">Tudo em dia!</p>
            <p className="text-sm text-muted-foreground mt-1">Sem tarefas em atraso nem para os próximos 14 dias.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
