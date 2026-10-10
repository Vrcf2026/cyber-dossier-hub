import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Clock, ArrowRight } from "lucide-react";
import { diasEmAtraso, fimDoPrazo, formatarData, hojeISO, textoProxima } from "@/lib/prazos";

/** Quantas linhas mostrar antes de "Mostrar todas" (com muitos clientes a lista fica enorme). */
const LIMITE = 10;

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
  physical_access_review: "Revisão Acessos Físicos", media_disposal: "Destruição Suportes", training_session: "Formação", asset_review: "Parque Informático", config_review: "Configuração de Segurança", supplier_review: "Fornecedores", contacts_review: "Contactos de Emergência",
  other: "Outro",
};

type TaskWithClient = {
  id: string; client_id: string; evidence_type: string; title: string;
  frequency: string; next_due: string; last_done: string | null; due_limit: string | null;
  clients: { name: string } | null;
};

export default function ContinuityOverview() {
  const navigate = useNavigate();
  const [overdue, setOverdue] = useState<TaskWithClient[]>([]);
  const [upcoming, setUpcoming] = useState<TaskWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [cliente, setCliente] = useState("todos");
  const [todasAtraso, setTodasAtraso] = useState(false);
  const [todasProximas, setTodasProximas] = useState(false);

  useEffect(() => {
    const today = hojeISO();
    const in14 = hojeISO(new Date(Date.now() + 14 * 864e5));

    Promise.all([
      supabase.from("client_tasks")
        .select("*, clients(name)")
        .eq("active", true)
        .lt("due_limit", today)
        .order("due_limit"),
      supabase.from("client_tasks")
        .select("*, clients(name)")
        .eq("active", true)
        .gte("due_limit", today)
        .lte("next_due", in14)
        .order("next_due"),
    ]).then(([ov, up]) => {
      setOverdue((ov.data ?? []) as TaskWithClient[]);
      setUpcoming((up.data ?? []) as TaskWithClient[]);
      setLoading(false);
    });
  }, []);

  const clientes = useMemo(() => {
    const m = new Map<string, string>();
    [...overdue, ...upcoming].forEach((t) => m.set(t.client_id, (t.clients as any)?.name ?? "—"));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt"));
  }, [overdue, upcoming]);
  const doCliente = (t: TaskWithClient) => cliente === "todos" || t.client_id === cliente;
  const atrasoF = overdue.filter(doCliente);
  const proximasF = upcoming.filter(doCliente);
  const atrasoVis = todasAtraso ? atrasoF : atrasoF.slice(0, LIMITE);
  const proximasVis = todasProximas ? proximasF : proximasF.slice(0, LIMITE);

  if (loading) return <p className="text-muted-foreground p-6">A carregar...</p>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Continuidade</h2>
          <p className="text-muted-foreground text-sm">Tarefas de manutenção em atraso e próximas</p>
        </div>
        {clientes.length > 1 && (
          <Select value={cliente} onValueChange={setCliente}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os clientes</SelectItem>
              {clientes.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className={`text-3xl font-bold ${atrasoF.length > 0 ? "text-red-600" : "text-green-600"}`}>{atrasoF.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Em atraso</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-3xl font-bold text-amber-600">{proximasF.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Próximos 14 dias</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-3xl font-bold text-muted-foreground">{atrasoF.length + proximasF.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Total pendentes</p>
          </CardContent>
        </Card>
      </div>

      {/* Em atraso */}
      {atrasoF.length > 0 && (
        <Card className="border-red-200 dark:border-red-900/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" /> Em atraso ({atrasoF.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {atrasoVis.map(t => {
              const daysLate = diasEmAtraso(t);
              return (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-red-100 bg-red-50 dark:border-red-900/40 dark:bg-red-950/15">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{t.title}</span>
                      <Badge variant="secondary" className="text-xs">{TYPE_LABELS[t.evidence_type] ?? t.evidence_type}</Badge>
                      <span className="text-xs text-red-600 dark:text-red-400 font-medium">{daysLate}d em atraso</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(t.clients as any)?.name ?? "—"} · Previsto: {formatarData(t.next_due)} · Prazo terminou: {formatarData(fimDoPrazo(t))}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0 ml-3 border-red-300 dark:border-red-900"
                    onClick={() => navigate(`/clientes/${t.client_id}/continuidade`)}>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
            {atrasoF.length > LIMITE && (
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setTodasAtraso(!todasAtraso)}>
                {todasAtraso ? "Mostrar menos" : `Mostrar todas (${atrasoF.length})`}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Próximos */}
      {proximasF.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" /> Próximos 14 dias ({proximasF.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {proximasVis.map(t => {
              return (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{t.title}</span>
                      <Badge variant="secondary" className="text-xs">{TYPE_LABELS[t.evidence_type] ?? t.evidence_type}</Badge>
                      <span className="text-xs text-muted-foreground">{textoProxima(t)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(t.clients as any)?.name ?? "—"} · {formatarData(t.next_due)}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="shrink-0 ml-3"
                    onClick={() => navigate(`/clientes/${t.client_id}/continuidade`)}>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
            {proximasF.length > LIMITE && (
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setTodasProximas(!todasProximas)}>
                {todasProximas ? "Mostrar menos" : `Mostrar todas (${proximasF.length})`}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {atrasoF.length === 0 && proximasF.length === 0 && (
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
