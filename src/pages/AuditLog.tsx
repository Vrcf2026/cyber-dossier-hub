import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { auditActionLabels } from "@/lib/audit";
import { RefreshCw, ScrollText, Eye, Pencil, Download } from "lucide-react";

type Log = {
  id: string;
  user_email: string | null;
  action: string;
  entity_type: string;
  dossier_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
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
