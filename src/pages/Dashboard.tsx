import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderOpen, CheckCircle, Users, CalendarDays } from "lucide-react";
import { useNavigate } from "react-router-dom";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "secondary" },
  em_progresso: { label: "Em Progresso", variant: "default" },
  concluido: { label: "Concluído", variant: "outline" },
};

export default function Dashboard() {
  const [metrics, setMetrics] = useState({
    totalDossiers: 0,
    completedDossiers: 0,
    activeClients: 0,
    thisMonth: 0,
  });
  const [recentDossiers, setRecentDossiers] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [dossiers, clients, monthDossiers, recent] = await Promise.all([
      supabase.from("dossiers").select("id, status"),
      supabase.from("clients").select("id"),
      supabase.from("dossiers").select("id").gte("created_at", firstOfMonth),
      supabase.from("dossiers").select("*, clients(name)").order("created_at", { ascending: false }).limit(5),
    ]);

    setMetrics({
      totalDossiers: dossiers.data?.length ?? 0,
      completedDossiers: dossiers.data?.filter((d) => d.status === "concluido").length ?? 0,
      activeClients: clients.data?.length ?? 0,
      thisMonth: monthDossiers.data?.length ?? 0,
    });
    setRecentDossiers(recent.data ?? []);
  };

  const metricCards = [
    { title: "Total Dossiers", value: metrics.totalDossiers, icon: FolderOpen, color: "text-primary" },
    { title: "Concluídos", value: metrics.completedDossiers, icon: CheckCircle, color: "text-success" },
    { title: "Clientes Ativos", value: metrics.activeClients, icon: Users, color: "text-accent" },
    { title: "Este Mês", value: metrics.thisMonth, icon: CalendarDays, color: "text-warning" },
  ];

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((m) => (
          <Card key={m.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{m.title}</CardTitle>
              <m.icon className={`h-5 w-5 ${m.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{m.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimos Dossiers</CardTitle>
        </CardHeader>
        <CardContent>
          {recentDossiers.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum dossier encontrado.</p>
          ) : (
            <div className="space-y-3">
              {recentDossiers.map((d) => {
                const cfg = statusConfig[d.status] || statusConfig.rascunho;
                return (
                  <div
                    key={d.id}
                    className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/dossiers/${d.id}`)}
                  >
                    <div>
                      <p className="font-medium">{d.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {(d.clients as any)?.name} · {formatDate(d.created_at)}
                      </p>
                    </div>
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
