import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Plus, Download, CheckCircle2, AlertTriangle, XCircle, Clock, Paperclip, X, CalendarClock, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const EVIDENCE_TYPES = [
  { value: "backup_check",      label: "Verificação de Backup" },
  { value: "restore_test",      label: "Teste de Restauro" },
  { value: "patch_update",      label: "Patches / Actualizações" },
  { value: "log_review",        label: "Revisão de Logs" },
  { value: "vuln_scan",         label: "Scan de Vulnerabilidades" },
  { value: "access_review",     label: "Revisão de Acessos" },
  { value: "phishing_campaign", label: "Campanha de Phishing" },
  { value: "ssl_renewal",       label: "Renovação SSL" },
  { value: "dossier_review",    label: "Revisão do Dossier" },
  { value: "incident",          label: "Incidente" },
  { value: "other",             label: "Outro" },
];

const FREQUENCIES = [
  { value: "weekly",     label: "Semanal" },
  { value: "biweekly",   label: "Quinzenal" },
  { value: "monthly",    label: "Mensal" },
  { value: "quarterly",  label: "Trimestral" },
  { value: "semiannual", label: "Semestral" },
  { value: "annual",     label: "Anual" },
];

const RESULT_CONFIG = {
  ok:      { label: "OK",       icon: CheckCircle2, color: "text-green-600",  bg: "bg-green-50 border-green-200" },
  warning: { label: "Alerta",   icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  fail:    { label: "Falha",    icon: XCircle,       color: "text-red-600",   bg: "bg-red-50 border-red-200" },
  pending: { label: "Pendente", icon: Clock,         color: "text-gray-500",  bg: "bg-gray-50 border-gray-200" },
};

type Evidence = {
  id: string; client_id: string; evidence_type: string; result: string;
  title: string; notes: string | null; evidence_date: string;
  file_name: string | null; file_path: string | null; created_at: string;
};

type Task = {
  id: string; client_id: string; evidence_type: string; title: string;
  frequency: string; next_due: string; last_done: string | null; active: boolean; notes: string | null;
};

export default function Continuity() {
  const { id: clientId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [client, setClient] = useState<any>(null);
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Formulário de evidência
  const [evOpen, setEvOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [evType, setEvType] = useState("backup_check");
  const [evResult, setEvResult] = useState("ok");
  const [evTitle, setEvTitle] = useState("");
  const [evNotes, setEvNotes] = useState("");
  const [evDate, setEvDate] = useState(new Date().toISOString().split("T")[0]);
  const [evDossier, setEvDossier] = useState("");
  const [evFile, setEvFile] = useState<File | null>(null);

  // Formulário de tarefa
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskType, setTaskType] = useState("backup_check");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskFreq, setTaskFreq] = useState("monthly");
  const [taskDue, setTaskDue] = useState("");
  const [taskNotes, setTaskNotes] = useState("");
  const [savingTask, setSavingTask] = useState(false);

  // Relatório
  const [reportStart, setReportStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0];
  });
  const [reportEnd, setReportEnd] = useState(() => new Date().toISOString().split("T")[0]);
  const [generating, setGenerating] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");

  useEffect(() => {
    if (!clientId) return;
    Promise.all([
      supabase.from("clients").select("*").eq("id", clientId).single(),
      supabase.from("client_evidences").select("*").eq("client_id", clientId).order("evidence_date", { ascending: false }),
      supabase.from("client_tasks").select("*").eq("client_id", clientId).eq("active", true).order("next_due"),
      supabase.from("dossiers").select("id, title").eq("client_id", clientId),
    ]).then(([c, ev, tk, dos]) => {
      setClient(c.data);
      setEvidences(ev.data ?? []);
      setTasks(tk.data ?? []);
      setDossiers(dos.data ?? []);
      setRecipientEmail(c.data?.email ?? "");
      setRecipientName(c.data?.contact_person ?? "");
      setLoading(false);
    });
  }, [clientId]);

  const resetEvForm = () => {
    setEvType("backup_check"); setEvResult("ok"); setEvTitle(""); setEvNotes("");
    setEvDate(new Date().toISOString().split("T")[0]); setEvDossier(""); setEvFile(null);
    setEvOpen(false);
  };

  const handleSaveEvidence = async () => {
    if (!evTitle.trim()) { toast.error("Título obrigatório."); return; }
    setSaving(true);
    try {
      let filePath: string | null = null;
      let fileName: string | null = null;

      if (evFile) {
        const ext = evFile.name.split(".").pop();
        const path = `${clientId}/${Date.now()}_${evFile.name}`;
        const { error: uploadErr } = await supabase.storage.from("evidence-files").upload(path, evFile);
        if (uploadErr) throw new Error("Erro ao carregar ficheiro: " + uploadErr.message);
        filePath = path;
        fileName = evFile.name;
      }

      const { error } = await supabase.from("client_evidences").insert({
        client_id: clientId,
        dossier_id: evDossier || null,
        evidence_type: evType,
        result: evResult,
        title: evTitle.trim(),
        notes: evNotes.trim() || null,
        evidence_date: evDate,
        file_path: filePath,
        file_name: fileName,
        performed_by: user?.id,
      });
      if (error) throw error;

      // Se OK, actualizar next_due da tarefa correspondente
      const matchingTask = tasks.find(t => t.evidence_type === evType);
      if (matchingTask) {
        const { data: nextDue } = await supabase.rpc("next_due_from_frequency", {
          base_date: evDate, freq: matchingTask.frequency, // usa a frequência da tarefa, não do form
        });
        await supabase.from("client_tasks").update({ last_done: evDate, next_due: nextDue }).eq("id", matchingTask.id);
      }

      toast.success("Evidência registada.");
      const { data } = await supabase.from("client_evidences").select("*").eq("client_id", clientId).order("evidence_date", { ascending: false });
      setEvidences(data ?? []);
      const { data: tk } = await supabase.from("client_tasks").select("*").eq("client_id", clientId).eq("active", true).order("next_due");
      setTasks(tk ?? []);
      resetEvForm();
    } catch (e: any) {
      toast.error(e.message || "Erro ao guardar.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTask = async () => {
    if (!taskTitle.trim() || !taskDue) { toast.error("Título e data obrigatórios."); return; }
    setSavingTask(true);
    try {
      const { error } = await supabase.from("client_tasks").insert({
        client_id: clientId, evidence_type: taskType, title: taskTitle.trim(),
        frequency: taskFreq, next_due: taskDue, notes: taskNotes.trim() || null,
      });
      if (error) throw error;
      toast.success("Tarefa criada.");
      const { data } = await supabase.from("client_tasks").select("*").eq("client_id", clientId).eq("active", true).order("next_due");
      setTasks(data ?? []);
      setTaskOpen(false); setTaskTitle(""); setTaskDue(""); setTaskNotes("");
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar tarefa.");
    } finally {
      setSavingTask(false);
    }
  };

  const handleMarkDone = async (task: Task) => {
    const today = new Date().toISOString().split("T")[0];
    const { data: nextDue } = await supabase.rpc("next_due_from_frequency", { base_date: today, freq: task.frequency });
    await supabase.from("client_tasks").update({ last_done: today, next_due: nextDue }).eq("id", task.id);
    // Abrir formulário de evidência pré-preenchido
    setEvType(task.evidence_type);
    setEvTitle(task.title);
    setEvDate(today);
    setEvOpen(true);
    const { data } = await supabase.from("client_tasks").select("*").eq("client_id", clientId).eq("active", true).order("next_due");
    setTasks(data ?? []);
  };

  const generateReport = async () => {
    setGenerating(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/continuity-report`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, periodStart: reportStart, periodEnd: reportEnd }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `Relatorio_Continuidade_${client?.name?.replace(/\s+/g, "_")}_${reportStart}.pdf`;
      a.click(); URL.revokeObjectURL(url);
      toast.success("Relatório gerado e descarregado.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar relatório.");
    } finally {
      setGenerating(false);
    }
  };

  const today = new Date().toISOString().split("T")[0];
  const overdueTasks = tasks.filter(t => t.next_due < today);
  const upcomingTasks = tasks.filter(t => t.next_due >= today);

  if (loading) return <p className="text-muted-foreground p-6">A carregar...</p>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/clientes/${clientId}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <div>
          <h2 className="text-xl font-bold">Continuidade — {client?.name}</h2>
          <p className="text-sm text-muted-foreground">Evidências de manutenção e agenda de tarefas</p>
        </div>
      </div>

      {/* Semáforos rápidos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Evidências (30d)", value: evidences.filter(e => e.evidence_date >= new Date(Date.now() - 30*864e5).toISOString().split("T")[0]).length, color: "text-blue-600" },
          { label: "OK", value: evidences.filter(e => e.result === "ok").length, color: "text-green-600" },
          { label: "Alertas / Falhas", value: evidences.filter(e => ["warning","fail"].includes(e.result)).length, color: "text-red-600" },
          { label: "Tarefas em atraso", value: overdueTasks.length, color: overdueTasks.length > 0 ? "text-red-600" : "text-green-600" },
        ].map(m => (
          <Card key={m.label}>
            <CardContent className="pt-4 pb-3 text-center">
              <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{m.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="evidences">
        <TabsList>
          <TabsTrigger value="evidences">Evidências</TabsTrigger>
          <TabsTrigger value="agenda">
            Agenda
            {overdueTasks.length > 0 && <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-1.5">{overdueTasks.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="report">Relatório</TabsTrigger>
        </TabsList>

        {/* ── EVIDÊNCIAS ─────────────────────────────────────── */}
        <TabsContent value="evidences" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setEvOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Registar evidência
            </Button>
          </div>

          {evidences.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">
              Ainda sem evidências registadas. Clica em "Registar evidência" para começar.
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {evidences.map(ev => {
                const cfg = RESULT_CONFIG[ev.result as keyof typeof RESULT_CONFIG] ?? RESULT_CONFIG.ok;
                const Icon = cfg.icon;
                const typeLabel = EVIDENCE_TYPES.find(t => t.value === ev.evidence_type)?.label ?? ev.evidence_type;
                return (
                  <div key={ev.id} className={`flex items-start gap-3 p-3 rounded-lg border ${cfg.bg}`}>
                    <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${cfg.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{ev.title}</span>
                        <Badge variant="secondary" className="text-xs">{typeLabel}</Badge>
                        <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                      </div>
                      {ev.notes && <p className="text-xs text-muted-foreground mt-0.5">{ev.notes}</p>}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{new Date(ev.evidence_date).toLocaleDateString("pt-PT")}</span>
                        {ev.file_name && <span className="flex items-center gap-1"><Paperclip className="h-3 w-3" />{ev.file_name}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── AGENDA ─────────────────────────────────────────── */}
        <TabsContent value="agenda" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setTaskOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Nova tarefa recorrente
            </Button>
          </div>

          {overdueTasks.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-red-600">Em atraso</p>
              {overdueTasks.map(t => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50">
                  <div>
                    <p className="font-medium text-sm">{t.title}</p>
                    <p className="text-xs text-red-600">Previsto para {new Date(t.next_due).toLocaleDateString("pt-PT")} · {FREQUENCIES.find(f=>f.value===t.frequency)?.label}</p>
                  </div>
                  <Button size="sm" variant="outline" className="border-red-300" onClick={() => handleMarkDone(t)}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Registar
                  </Button>
                </div>
              ))}
            </div>
          )}

          {upcomingTasks.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-muted-foreground">Próximas</p>
              {upcomingTasks.map(t => {
                const daysLeft = Math.ceil((new Date(t.next_due).getTime() - Date.now()) / 864e5);
                return (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium text-sm">{t.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(t.next_due).toLocaleDateString("pt-PT")} ({daysLeft}d) · {FREQUENCIES.find(f=>f.value===t.frequency)?.label}
                        {t.last_done && ` · Última vez: ${new Date(t.last_done).toLocaleDateString("pt-PT")}`}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => handleMarkDone(t)}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Registar
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {tasks.length === 0 && (
            <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">
              Sem tarefas recorrentes definidas. Cria a agenda de manutenção deste cliente.
            </CardContent></Card>
          )}
        </TabsContent>

        {/* ── RELATÓRIO ──────────────────────────────────────── */}
        <TabsContent value="report">
          <Card>
            <CardHeader><CardTitle>Relatório de Continuidade</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Gera um PDF com todas as evidências do período e resumo executivo por IA. Podes descarregar ou enviar directamente ao cliente por email.
              </p>
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-1">
                  <Label>Data início</Label>
                  <Input type="date" value={reportStart} onChange={e => setReportStart(e.target.value)} className="w-40" />
                </div>
                <div className="space-y-1">
                  <Label>Data fim</Label>
                  <Input type="date" value={reportEnd} onChange={e => setReportEnd(e.target.value)} className="w-40" />
                </div>
                <Button onClick={generateReport} disabled={generating || sendingEmail} variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  {generating ? "A gerar..." : "Descarregar PDF"}
                </Button>
              </div>
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-medium">Enviar por email ao cliente</p>
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="space-y-1">
                    <Label>Email do destinatário</Label>
                    <Input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} placeholder="email@cliente.pt" className="w-56" />
                  </div>
                  <div className="space-y-1">
                    <Label>Nome (opcional)</Label>
                    <Input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Dr. João Silva" className="w-44" />
                  </div>
                  <Button
                    disabled={generating || sendingEmail || !recipientEmail}
                    onClick={async () => {
                      if (!recipientEmail) { toast.error("Introduz o email do destinatário."); return; }
                      setSendingEmail(true);
                      try {
                        const { data: session } = await supabase.auth.getSession();
                        const token = session.session?.access_token;
                        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-monthly-report`, {
                          method: "POST",
                          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                          body: JSON.stringify({ clientId, periodStart: reportStart, periodEnd: reportEnd, recipientEmail, recipientName }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error);
                        toast.success(`Relatório enviado para ${recipientEmail}`);
                      } catch (e: any) {
                        toast.error(e.message || "Erro ao enviar.");
                      } finally {
                        setSendingEmail(false);
                      }
                    }}
                  >
                    {sendingEmail ? "A enviar..." : "Enviar por email"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: registar evidência */}
      <Dialog open={evOpen} onOpenChange={open => !saving && (open ? setEvOpen(true) : resetEvForm())}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Registar Evidência</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={evType} onValueChange={v => { setEvType(v); if (!evTitle) setEvTitle(EVIDENCE_TYPES.find(t=>t.value===v)?.label ?? ""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EVIDENCE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Resultado</Label>
                <Select value={evResult} onValueChange={setEvResult}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ok">✓ OK</SelectItem>
                    <SelectItem value="warning">⚠ Alerta</SelectItem>
                    <SelectItem value="fail">✗ Falha</SelectItem>
                    <SelectItem value="pending">… Pendente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Descrição / Título</Label>
              <Input value={evTitle} onChange={e => setEvTitle(e.target.value)} placeholder="ex: Backup SRV-001 — sem erros" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data</Label>
                <Input type="date" value={evDate} onChange={e => setEvDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Dossier (opcional)</Label>
                <Select value={evDossier} onValueChange={setEvDossier}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum</SelectItem>
                    {dossiers.map(d => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea rows={3} value={evNotes} onChange={e => setEvNotes(e.target.value)} placeholder="Detalhes, alertas encontrados, acção tomada..." />
            </div>
            <div className="space-y-1">
              <Label>Ficheiro de evidência (screenshot, log, relatório)</Label>
              <input ref={fileRef} type="file" className="hidden" onChange={e => setEvFile(e.target.files?.[0] ?? null)} />
              {evFile ? (
                <div className="flex items-center gap-2 text-sm">
                  <Paperclip className="h-4 w-4" /> {evFile.name}
                  <button onClick={() => setEvFile(null)}><X className="h-3 w-3" /></button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <Paperclip className="h-4 w-4 mr-2" /> Anexar ficheiro
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetEvForm} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSaveEvidence} disabled={saving}>{saving ? "A guardar..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: criar tarefa */}
      <Dialog open={taskOpen} onOpenChange={open => !savingTask && setTaskOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova Tarefa Recorrente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={taskType} onValueChange={v => { setTaskType(v); if (!taskTitle) setTaskTitle(EVIDENCE_TYPES.find(t=>t.value===v)?.label ?? ""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EVIDENCE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Título</Label>
              <Input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="ex: Verificação backup SRV-001" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Frequência</Label>
                <Select value={taskFreq} onValueChange={setTaskFreq}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Próxima data</Label>
                <Input type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notas (opcional)</Label>
              <Textarea rows={2} value={taskNotes} onChange={e => setTaskNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskOpen(false)} disabled={savingTask}>Cancelar</Button>
            <Button onClick={handleSaveTask} disabled={savingTask}>{savingTask ? "A criar..." : "Criar tarefa"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
