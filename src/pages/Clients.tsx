import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Search, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";

const sectors = [
  "Tecnologia", "Saúde", "Finanças", "Educação", "Indústria",
  "Comércio", "Serviços", "Administração Pública", "Outro",
];

type Client = {
  id: string;
  name: string;
  nif: string | null;
  sector: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  contact_person: string | null;
  num_employees: number | null;
};

const emptyClient = {
  name: "", nif: "", sector: "", address: "", email: "", phone: "", contact_person: "", num_employees: 0,
};

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyClient);
  const navigate = useNavigate();

  useEffect(() => { fetchClients(); }, []);

  const fetchClients = async () => {
    const { data } = await supabase.from("clients").select("*").order("name");
    setClients((data as Client[]) ?? []);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("O nome é obrigatório."); return; }
    const payload = {
      name: form.name,
      nif: form.nif || null,
      sector: form.sector || null,
      address: form.address || null,
      email: form.email || null,
      phone: form.phone || null,
      contact_person: form.contact_person || null,
      num_employees: form.num_employees || null,
    };

    if (editingClient) {
      const { error } = await supabase.from("clients").update(payload).eq("id", editingClient.id);
      if (error) { toast.error("Erro ao atualizar cliente."); return; }
      toast.success("Cliente atualizado.");
    } else {
      const { error } = await supabase.from("clients").insert(payload);
      if (error) { toast.error("Erro ao criar cliente."); return; }
      toast.success("Cliente criado.");
    }
    setOpen(false);
    setEditingClient(null);
    setForm(emptyClient);
    fetchClients();
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    setForm({
      name: client.name,
      nif: client.nif || "",
      sector: client.sector || "",
      address: client.address || "",
      email: client.email || "",
      phone: client.phone || "",
      contact_person: client.contact_person || "",
      num_employees: client.num_employees || 0,
    });
    setOpen(true);
  };

  const openNew = () => {
    setEditingClient(null);
    setForm(emptyClient);
    setOpen(true);
  };

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.nif && c.nif.includes(search))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Clientes</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" /> Novo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingClient ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>NIF</Label>
                <Input value={form.nif} onChange={(e) => setForm({ ...form, nif: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Setor</Label>
                <Select value={form.sector} onValueChange={(v) => setForm({ ...form, sector: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {sectors.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nº Colaboradores</Label>
                <Input type="number" value={form.num_employees} onChange={(e) => setForm({ ...form, num_employees: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Morada</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Pessoa de Contacto</Label>
                <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave}>Guardar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar clientes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid gap-3">
        {filtered.length === 0 ? (
          <p className="text-muted-foreground">Nenhum cliente encontrado.</p>
        ) : (
          filtered.map((client) => (
            <Card key={client.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/clientes/${client.id}`)}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-semibold">{client.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {[client.sector, client.nif && `NIF: ${client.nif}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(client); }}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
