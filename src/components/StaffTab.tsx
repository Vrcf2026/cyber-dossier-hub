// src/components/StaffTab.tsx
//
// Lista simples de colaboradores do cliente: quem assinou a
// confidencialidade e a política de segurança, e quando teve a última
// formação. Calcula os KPIs que os auditores pedem (% formados nos
// últimos 12 meses, % com declaração assinada) e mostra o resultado
// do último teste de phishing por email.

import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, UserMinus, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

type Staff = {
  id: string;
  client_id: string;
  name: string;
  email: string | null;
  job_role: string | null;
  start_date: string | null;
  confidentiality_signed_at: string | null;
  policy_ack_signed_at: string | null;
  last_training_at: string | null;
  screening_checked: boolean;
  active: boolean;
  left_at: string | null;
  notes: string | null;
};

type PhishingResult = { clicked: boolean; date: string | null };

const EMPTY_FORM = {
  name: "", email: "", job_role: "", start_date: "",
  confidentiality_signed_at: "", policy_ack_signed_at: "", last_training_at: "",
  screening_checked: false, notes: "",
};

const todayISO = () => new Date().toISOString().split("T")[0];
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("pt-PT") : "—");

// Formação conta como válida se foi nos últimos 12 meses
const trainedRecently = (d: string | null) => {
  if (!d) return false;
  const limit = new Date();
  limit.setFullYear(limit.getFullYear() - 1);
  return new Date(d) >= limit;
};

const pct = (n: number, total: number) => (total === 0 ? 0 : Math.round((n / total) * 100));

export default function StaffTab({ clientId }: { clientId: string }) {
  const { isAdmin } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [phishing, setPhishing] = useState<Record<string, PhishingResult>>({});
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("client_staff")
      .select("*")
      .eq("client_id", clientId)
      .order("active", { ascending: false })
      .order("name");
    if (error) toast.error("Erro ao carregar colaboradores: " + error.message);
    setStaff((data as Staff[]) ?? []);

    // Resultado do último teste de phishing por email (campanhas deste cliente)
    const { data: campaigns } = await supabase
      .from("phishing_campaigns")
      .select("id, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (campaigns && campaigns.length > 0) {
      const order = new Map(campaigns.map((c: any, i: number) => [c.id, i]));
      const { data: results } = await supabase
        .from("phishing_campaign_results")
        .select("campaign_id, email, attempts, sent_at")
        .in("campaign_id", campaigns.map((c: any) => c.id));
      const map: Record<string, PhishingResult & { rank: number }> = {};
      (results ?? []).forEach((r: any) => {
        if (!r.email || !r.sent_at) return;
        const key = r.email.toLowerCase();
        const rank = order.get(r.campaign_id) ?? 999;
        if (!map[key] || rank < map[key].rank) {
          map[key] = { clicked: (r.attempts ?? 0) > 0, date: r.sent_at, rank };
        }
      });
      setPhishing(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId]);

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM); setOpen(true); };
  const openEdit = (s: Staff) => {
    setEditing(s);
    setForm({
      name: s.name, email: s.email ?? "", job_role: s.job_role ?? "", start_date: s.start_date ?? "",
      confidentiality_signed_at: s.confidentiality_signed_at ?? "",
      policy_ack_signed_at: s.policy_ack_signed_at ?? "",
      last_training_at: s.last_training_at ?? "",
      screening_checked: s.screening_checked, notes: s.notes ?? "",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Nome obrigatório."); return; }
    setSaving(true);
    const payload = {
      client_id: clientId,
      name: form.name.trim(),
      email: form.email.trim() || null,
      job_role: form.job_role.trim() || null,
      start_date: form.start_date || null,
      confidentiality_signed_at: form.confidentiality_signed_at || null,
      policy_ack_signed_at: form.policy_ack_signed_at || null,
      last_training_at: form.last_training_at || null,
      screening_checked: form.screening_checked,
      notes: form.notes.trim() || null,
    };
    const { error } = editing
      ? await supabase.from("client_staff").update(payload).eq("id", editing.id)
      : await supabase.from("client_staff").insert(payload);
    setSaving(false);
    if (error) { toast.error("Erro ao guardar: " + error.message); return; }
    toast.success(editing ? "Colaborador atualizado." : "Colaborador adicionado.");
    setOpen(false);
    load();
  };

  const handleLeave = async (s: Staff) => {
    if (!confirm(`Registar saída de ${s.name}? Lembra-te de remover os acessos (contas, VPN, chaves, códigos de alarme).`)) return;
    const { error } = await supabase.from("client_staff").update({ active: false, left_at: todayISO() }).eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Saída registada.");
    load();
  };

  const handleDelete = async (s: Staff) => {
    if (!confirm(`Apagar ${s.name} da lista? (Para saídas usa "Registar saída" — fica o histórico.)`)) return;
    const { error } = await supabase.from("client_staff").delete().eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  // Regista a formação de hoje para todos os ativos (ex: depois da sessão anual)
  const handleTrainingAll = async () => {
    const ids = staff.filter(s => s.active).map(s => s.id);
    if (ids.length === 0) return;
    if (!confirm(`Registar formação de hoje para os ${ids.length} colaboradores ativos?`)) return;
    const { error } = await supabase.from("client_staff").update({ last_training_at: todayISO() }).in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success("Formação registada. Não te esqueças de registar também a evidência (lista de presenças).");
    load();
  };

  const active = staff.filter(s => s.active);
  const visible = showInactive ? staff : active;
  const kpis = [
    { label: "Formados (12 meses)", value: pct(active.filter(s => trainedRecently(s.last_training_at)).length, active.length) },
    { label: "Declaração política", value: pct(active.filter(s => s.policy_ack_signed_at).length, active.length) },
    { label: "Confidencialidade", value: pct(active.filter(s => s.confidentiality_signed_at).length, active.length) },
  ];
  const kpiColor = (v: number) => (v >= 95 ? "text-green-600" : v >= 60 ? "text-amber-600" : "text-red-600");

  const Mark = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
    <span className={`inline-flex items-center gap-1 ${ok ? "text-green-700" : "text-red-600"}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {children}
    </span>
  );

  if (loading) return <p className="text-muted-foreground text-sm">A carregar...</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold">{active.length}</p>
            <p className="text-xs text-muted-foreground">Colaboradores ativos</p>
          </CardContent>
        </Card>
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-3 text-center">
              <p className={`text-2xl font-bold ${active.length ? kpiColor(k.value) : "text-muted-foreground"}`}>
                {active.length ? `${k.value}%` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={showInactive} onCheckedChange={v => setShowInactive(!!v)} />
          Mostrar quem já saiu
        </label>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleTrainingAll} disabled={active.length === 0}>
            Formação hoje (todos)
          </Button>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Adicionar colaborador</Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">
          Sem colaboradores registados. Adiciona a equipa do cliente para acompanhar declarações e formação.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {visible.map(s => {
            const ph = s.email ? phishing[s.email.toLowerCase()] : undefined;
            return (
              <div key={s.id} className={`p-3 rounded-lg border ${s.active ? "" : "opacity-60 bg-muted/40"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{s.name}</span>
                      {s.job_role && <Badge variant="secondary" className="text-xs">{s.job_role}</Badge>}
                      {!s.active && <Badge variant="outline" className="text-xs">Saiu {fmt(s.left_at)}</Badge>}
                    </div>
                    {s.email && <p className="text-xs text-muted-foreground">{s.email}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(s)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                    {s.active && (
                      <Button size="icon" variant="ghost" onClick={() => handleLeave(s)} title="Registar saída"><UserMinus className="h-4 w-4" /></Button>
                    )}
                    {isAdmin && (
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(s)} title="Apagar"><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
                  <Mark ok={!!s.confidentiality_signed_at}>Confidencialidade {fmt(s.confidentiality_signed_at)}</Mark>
                  <Mark ok={!!s.policy_ack_signed_at}>Política {fmt(s.policy_ack_signed_at)}</Mark>
                  <Mark ok={trainedRecently(s.last_training_at)}>Formação {fmt(s.last_training_at)}</Mark>
                  <Mark ok={s.screening_checked}>Verificação admissão</Mark>
                  {ph && (
                    <Mark ok={!ph.clicked}>Phishing {fmt(ph.date)}: {ph.clicked ? "clicou" : "não clicou"}</Mark>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={o => !saving && setOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar colaborador" : "Novo colaborador"}</DialogTitle>
            <DialogDescription>Datas em branco = ainda não assinou / não teve formação.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Função</Label>
              <Input value={form.job_role} onChange={e => setForm({ ...form, job_role: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Data de admissão</Label>
              <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Confidencialidade assinada</Label>
              <Input type="date" value={form.confidentiality_signed_at} onChange={e => setForm({ ...form, confidentiality_signed_at: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Declaração da política</Label>
              <Input type="date" value={form.policy_ack_signed_at} onChange={e => setForm({ ...form, policy_ack_signed_at: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Última formação</Label>
              <Input type="date" value={form.last_training_at} onChange={e => setForm({ ...form, last_training_at: e.target.value })} />
            </div>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <Checkbox checked={form.screening_checked} onCheckedChange={v => setForm({ ...form, screening_checked: !!v })} />
              Verificação na admissão feita (referências / registo)
            </label>
            <div className="col-span-2 space-y-1">
              <Label>Notas</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "A guardar..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
