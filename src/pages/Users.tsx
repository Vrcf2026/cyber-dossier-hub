import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type ManagedUser = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  is_approved: boolean;
  client_id: string | null;
  role: string;
  dossier_ids: string[];
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  tecnico: "Técnico",
  cliente: "Cliente",
  user: "Interno (legado)",
};

export default function Users() {
  const { user } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [dossiers, setDossiers] = useState<{ id: string; title: string; client_id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "tecnico", client_id: "" });

  const call = async (action: string, payload: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action, ...payload },
    });
    if (error) throw new Error(error.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    return data;
  };

  const load = async () => {
    try {
      const data: any = await call("list");
      setUsers(data.users ?? []);
    } catch (e: any) {
      toast.error(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    supabase.from("clients").select("id, name").order("name").then(({ data }) => setClients(data ?? []));
    supabase.from("dossiers").select("id, title, client_id").order("title").then(({ data }) => setDossiers(data ?? []));
  }, []);

  const handleCreate = async () => {
    try {
      await call("create", {
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        role: form.role,
        client_id: form.role === "cliente" ? form.client_id : null,
      });
      toast.success("Utilizador criado.");
      setOpen(false);
      setForm({ email: "", password: "", full_name: "", role: "tecnico", client_id: "" });
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const update = async (action: string, payload: Record<string, unknown>) => {
    try {
      await call(action, payload);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading) return <p className="text-muted-foreground">A carregar...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-primary">Utilizadores</h2>
          <p className="text-sm text-muted-foreground">
            Só o administrador cria contas. Técnicos veem apenas os dossiers atribuídos; clientes só o relatório final.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="h-4 w-4 mr-2" />Nova conta</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova conta</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Palavra-passe inicial</Label>
                <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Papel</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="tecnico">Técnico</SelectItem>
                    <SelectItem value="cliente">Cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.role === "cliente" && (
                <div className="space-y-1">
                  <Label>Cliente associado</Label>
                  <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={!form.email || form.password.length < 8}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {users.map((u) => (
          <Card key={u.user_id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex flex-wrap items-center gap-2">
                {u.full_name || u.email}
                <Badge variant="secondary">{ROLE_LABEL[u.role] ?? u.role}</Badge>
                {u.user_id === user?.id && <Badge variant="outline">Você</Badge>}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{u.email}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={u.is_approved}
                    disabled={u.user_id === user?.id}
                    onCheckedChange={(v) => update("set_approved", { user_id: u.user_id, is_approved: v })}
                  />
                  <span className="text-sm">Ativo</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">Papel</span>
                  <Select
                    value={u.role}
                    disabled={u.user_id === user?.id}
                    onValueChange={(v) => update("set_role", { user_id: u.user_id, role: v })}
                  >
                    <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="tecnico">Técnico</SelectItem>
                      <SelectItem value="cliente">Cliente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {u.role === "cliente" && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Cliente</span>
                    <Select
                      value={u.client_id ?? ""}
                      onValueChange={(v) => update("set_client", { user_id: u.user_id, client_id: v })}
                    >
                      <SelectTrigger className="w-[200px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {u.role === "tecnico" && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Dossiers a que tem acesso</p>
                  {dossiers.length === 0 && (
                    <p className="text-xs text-muted-foreground">Ainda não existem dossiers.</p>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {dossiers.map((d) => {
                      const granted = u.dossier_ids.includes(d.id);
                      return (
                        <label key={d.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={granted}
                            onCheckedChange={() =>
                              update(granted ? "revoke_dossier" : "grant_dossier", {
                                user_id: u.user_id,
                                dossier_id: d.id,
                              })
                            }
                          />
                          {d.title}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
