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
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { RefreshCw, ScrollText, Eye, Pencil, Download, Trash2, Settings2, FileSpreadsheet, FileText, ChevronLeft, ChevronRight } from "lucide-react";

type Log = {
  id: string; user_email: string | null; action: string;
  entity_type: string; dossier_id: string | null;
  details: Record<string, unknown> | null; created_at: string;
};
type Settings = {
  id: string; retention_months: number; auto_purge_enabled: boolean;
  last_purge_at: string | null; last_purge_deleted: number | null;
};

const PAGE_SIZE = 50;

const groupOf = (action: string) =>
  action.includes("export") ? "exportacao"
  : action.includes("update") || action.includes("generate") ? "alteracao"
  : "acesso";

const groupMeta: Record<string, { label: string; icon: typeof Eye; variant: "secondary" | "default" | "outline" }> = {
  acesso:     { label: "Acesso",     icon: Eye,     variant: "secondary" },
  alteracao:  { label: "Alteração",  icon: Pencil,  variant: "default"   },
  exportacao: { label: "Exportação", icon: Download, variant: "outline"  },
};

export default function AuditLog() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);                  // página actual (0-based)
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("todos");
  const [userFilter, setUserFilter] = useState("todos");
  const [dossierFilter, setDossierFilter] = useState("todos");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dossiers, setDossiers] = useState<{ id: string; title: string }[]>([]);
  const [allUsers, setAllUsers] = useState<string[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [purging, setPurging] = useState(false);

  const loadSettings = async () => {
    const { data } = await supabase.from("audit_settings")
      .select("id, retention_months, auto_purge_enabled, last_purge_at, last_purge_deleted")
      .order("created_at").limit(1).maybeSingle();
    if (data) setSettings(data as Settings);
  };

  const saveSettings = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSavingSettings(true);
    const { error } = await supabase.from("audit_settings")
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
    if (error) { toast({ title: "Falha na limpeza", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Limpeza concluída", description: `${data ?? 0} registo(s) apagado(s).` });
    await Promise.all([load(0), loadSettings()]);
  };

  // Construir query com filtros do lado do servidor — sem trazer tudo para memória
  const buildQuery = (forCount = false) => {
    let q = supabase.from("audit_logs")
      .select(forCount ? "id" : "id, user_email, action, entity_type, dossier_id, details, created_at", forCount ? { count: "exact", head: true } : undefined);

    if (group !== "todos") {
      if (group === "exportacao") q = q.ilike("action", "%export%");
      else if (group === "alteracao") q = q.or("action.ilike.%update%,action.ilike.%generate%");
      else q = q.not("action", "ilike", "%export%").not("action", "ilike", "%update%").not("action", "ilike", "%generate%");
    }
    if (userFilter !== "todos") q = q.eq("user_email", userFilter);
    if (dossierFilter !== "todos") q = q.eq("dossier_id", dossierFilter);
    if (dateFrom) q = q.gte("created_at", `${dateFrom}T00:00:00`);
    if (dateTo)   q = q.lte("created_at", `${dateTo}T23:59:59`);
    // Pesquisa de texto — só em user_email (o resto precisaria de full-text; filtro local abaixo)
    if (search.trim()) q = q.ilike("user_email", `%${search.trim()}%`);
    return q;
  };

  const load = async (targetPage = page) => {
    setLoading(true);
    const from = targetPage * PAGE_SIZE;

    const [countRes, dataRes] = await Promise.all([
      buildQuery(true),
      buildQuery(false).order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1),
    ]);

    setTotalCount(countRes.count ?? 0);
    setLogs((dataRes.data ?? []) as Log[]);
    setPage(targetPage);
    setLoading(false);
  };

  const loadMeta = async () => {
    const [dosRes, usersRes] = await Promise.all([
      supabase.from("dossiers").select("id, title").order("title"),
      supabase.from("audit_logs").select("user_email").not("user_email", "is", null).limit(1000),
    ]);
    setDossiers(dosRes.data ?? []);
    const unique = Array.from(new Set((usersRes.data ?? []).map((r: any) => r.user_email).filter(Boolean))).sort();
    setAllUsers(unique as string[]);
  };

  useEffect(() => { load(0); loadSettings(); loadMeta(); }, []);
  // Recarregar quando filtros mudam (resetar para página 0)
  useEffect(() => { load(0); }, [group, userFilter, dossierFilter, dateFrom, dateTo, search]);

  const dossierTitle = (id: string | null) => (id && dossiers.find((d) => d.id === id)?.title) || "";
  const fmt = (iso: string) => new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const detailsText = (l: Log) => {
    const d = (l.details ?? {}) as Record<string, unknown>;
    return [d.dossier_title as string, d.client_name as string, d.section_name ? `Secção: ${d.section_name}` : undefined, d.variant ? `Versão: ${d.variant}` : undefined].filter(Boolean).join(" · ");
  };

  // Export usa query sem paginação (só para export)
  const fetchAllForExport = async () => {
    const { data } = await buildQuery(false).order("created_at", { ascending: false }).limit(10000);
    return (data ?? []) as Log[];
  };

  const headers = ["Data", "Utilizador", "Ação", "Tipo", "Dossier", "Detalhes"];
  const toRow = (l: Log) => [fmt(l.created_at), l.user_email ?? "utilizador removido", auditActionLabels[l.action] ?? l.action, groupMeta[groupOf(l.action)].label, dossierTitle(l.dossier_id) || (l.details as any)?.dossier_title || "", detailsText(l)];
  const stamp = () => new Date().toISOString().slice(0, 10);

  const exportCsv = async () => {
    const all = await fetchAllForExport();
    if (all.length === 0) { toast({ title: "Sem registos para exportar", variant: "destructive" }); return; }
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers, ...all.map(toRow)].map((r) => r.map((c) => esc(String(c))).join(";")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `auditoria-${stamp()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: `CSV exportado (${all.length} registos)` });
  };

  const exportPdf = async () => {
    const all = await fetchAllForExport();
    if (all.length === 0) { toast({ title: "Sem registos para exportar", variant: "destructive" }); return; }
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14); doc.text("Registo de auditoria", 14, 14);
    autoTable(doc, { head: [headers], body: all.map(toRow), startY: 22, styles: { fontSize: 8 } });
    doc.save(`auditoria-${stamp()}.pdf`);
    toast({ title: `PDF exportado (${all.length} registos)` });
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-primary flex items-center gap-2">
            <ScrollText className="h-6 w-6" /> Registo de auditoria
          </h2>
          <p className="text-sm text-muted-foreground">
            Histórico completo de acessos, alterações e exportações — {totalCount} registo(s) no total.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {settings && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Settings2 className="h-4 w-4" /> Retenção e limpeza</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label>Guardar registos durante</Label>
                <Select value={String(settings.retention_months)} onValueChange={(v) => saveSettings({ retention_months: Number(v) })}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{[3,6,12,24,36,60].map((m) => <SelectItem key={m} value={String(m)}>{m} meses</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch id="auto-purge" checked={settings.auto_purge_enabled} onCheckedChange={(v) => saveSettings({ auto_purge_enabled: v })} />
                <Label htmlFor="auto-purge">Limpeza automática diária</Label>
              </div>
              <Button variant="outline" size="sm" onClick={purgeNow} disabled={purging || savingSettings}>
                <Trash2 className="h-4 w-4 mr-2" /> Limpar agora
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Registos com mais de {settings.retention_months} meses são apagados automaticamente.
              {settings.last_purge_at ? ` Última limpeza: ${fmt(settings.last_purge_at)} (${settings.last_purge_deleted ?? 0} apagado(s)).` : " Ainda não foi executada nenhuma limpeza."}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Procurar por utilizador..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={group} onValueChange={setGroup}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="acesso">Acessos</SelectItem>
            <SelectItem value="alteracao">Alterações</SelectItem>
            <SelectItem value="exportacao">Exportações</SelectItem>
          </SelectContent>
        </Select>
        <Select value={userFilter} onValueChange={setUserFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Utilizador" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os utilizadores</SelectItem>
            {allUsers.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={dossierFilter} onValueChange={setDossierFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Dossier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os dossiers</SelectItem>
            {dossiers.map((d) => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">De</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[140px]" />
          <Label className="text-xs text-muted-foreground">Até</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[140px]" />
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setGroup("todos"); setUserFilter("todos"); setDossierFilter("todos"); setDateFrom(""); setDateTo(""); }}>
          Limpar filtros
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}><FileSpreadsheet className="h-4 w-4 mr-2" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPdf}><FileText className="h-4 w-4 mr-2" /> PDF</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">
            {totalCount} registo(s) · página {page + 1} de {totalPages}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => load(page - 1)} disabled={page === 0 || loading}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => load(page + 1)} disabled={page >= totalPages - 1 || loading}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">A carregar...</p>}
          {!loading && logs.length === 0 && <p className="text-sm text-muted-foreground">Sem registos para os filtros escolhidos.</p>}
          {logs.map((l) => {
            const meta = groupMeta[groupOf(l.action)];
            const Icon = meta.icon;
            const d = (l.details ?? {}) as Record<string, unknown>;
            const bits = [d.dossier_title as string, d.client_name as string, d.section_name ? `Secção: ${d.section_name}` : undefined, d.variant ? `Versão: ${d.variant}` : undefined].filter(Boolean);
            return (
              <div key={l.id} className="flex items-start gap-3 rounded-md border p-3">
                <Badge variant={meta.variant} className="mt-0.5 shrink-0"><Icon className="h-3 w-3 mr-1" />{meta.label}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{auditActionLabels[l.action] ?? l.action}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {l.user_email ?? "utilizador removido"}{bits.length > 0 && ` — ${bits.join(" · ")}`}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{fmt(l.created_at)}</span>
              </div>
            );
          })}
        </CardContent>
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 p-4 border-t">
            <Button variant="outline" size="sm" onClick={() => load(0)} disabled={page === 0 || loading}>Primeira</Button>
            <Button variant="outline" size="sm" onClick={() => load(page - 1)} disabled={page === 0 || loading}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm px-2">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => load(page + 1)} disabled={page >= totalPages - 1 || loading}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => load(totalPages - 1)} disabled={page >= totalPages - 1 || loading}>Última</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
