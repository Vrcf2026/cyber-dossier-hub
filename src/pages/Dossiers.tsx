import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Search, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "secondary" },
  em_progresso: { label: "Em Progresso", variant: "default" },
  concluido: { label: "Concluído", variant: "outline" },
};

export default function Dossiers() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filterClient, setFilterClient] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newClientId, setNewClientId] = useState("");

  useEffect(() => {
    fetchDossiers();
    supabase.from("clients").select("id, name").order("name").then(({ data }) => setClients(data ?? []));
  }, []);

  const fetchDossiers = async () => {
    const { data } = await supabase.from("dossiers").select("*, clients(name)").order("created_at", { ascending: false });
    setDossiers(data ?? []);
  };

  const handleCreate = async () => {
    if (!newClientId || !newTitle.trim()) { toast.error("Cliente e título são obrigatórios."); return; }
    const { data, error } = await supabase.from("dossiers").insert({
      client_id: newClientId,
      title: newTitle,
      created_by: user?.id,
    }).select().single();
    if (error) { toast.error("Erro ao criar dossier."); return; }

    // Create 16 sections
    const sectionNames = [
      "Identificação do Cliente", "Inventário de Hardware", "Inventário de Software",
      "Topologia de Rede", "Políticas de Segurança", "Gestão de Acessos",
      "Avaliação de Riscos", "Plano de Backup", "Disaster Recovery Plan",
      "Resposta a Incidentes", "Conformidade e Regulação", "Proteção de Dados",
      "Formação e Sensibilização", "Monitorização e Logs", "Melhoria Contínua",
      "Declaração de Conformidade",
    ];
    const sections = sectionNames.map((name, i) => ({
      dossier_id: data.id,
      section_number: i + 1,
      section_name: name,
    }));
    await supabase.from("dossier_sections").insert(sections);

    toast.success("Dossier criado.");
    setOpen(false);
    setNewTitle("");
    setNewClientId("");
    navigate(`/dossiers/${data.id}`);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Tem a certeza que deseja apagar este dossier?")) return;
    const { error } = await supabase.from("dossiers").delete().eq("id", id);
    if (error) { toast.error("Erro ao apagar."); return; }
    toast.success("Dossier apagado.");
    fetchDossiers();
  };

  const filtered = dossiers.filter((d) => {
    const matchSearch = d.title.toLowerCase().includes(search.toLowerCase());
    const matchClient = filterClient === "all" || d.client_id === filterClient;
    const matchStatus = filterStatus === "all" || d.status === filterStatus;
    return matchSearch && matchClient && matchStatus;
  });

  const formatDate = (d: string) => new Date(d).toLocaleDateString("pt-PT");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Dossiers</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Novo Dossier</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Dossier</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Cliente *</Label>
                <Select value={newClientId} onValueChange={setNewClientId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ex: Auditoria Q1 2026" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate}>Criar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Pesquisar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Todos os clientes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os clientes</SelectItem>
            {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Todos os estados" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            <SelectItem value="rascunho">Rascunho</SelectItem>
            <SelectItem value="em_progresso">Em Progresso</SelectItem>
            <SelectItem value="concluido">Concluído</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3">
        {filtered.length === 0 ? (
          <p className="text-muted-foreground">Nenhum dossier encontrado.</p>
        ) : (
          filtered.map((d) => {
            const cfg = statusConfig[d.status] || statusConfig.rascunho;
            return (
              <Card key={d.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/dossiers/${d.id}`)}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-semibold">{d.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {(d.clients as any)?.name} · {formatDate(d.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    {isAdmin && (
                      <Button variant="ghost" size="icon" onClick={(e) => handleDelete(d.id, e)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
