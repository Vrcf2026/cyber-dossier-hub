import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function Company() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<any>(null);
  const [form, setForm] = useState({
    name: "", nif: "", address: "", email: "", phone: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAdmin) { navigate("/"); return; }
    fetchSettings();
  }, [isAdmin]);

  const fetchSettings = async () => {
    const { data } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
    if (data) {
      setSettings(data);
      setForm({
        name: data.name || "",
        nif: data.nif || "",
        address: data.address || "",
        email: data.email || "",
        phone: data.phone || "",
      });
    }
  };

  const handleSave = async () => {
    setLoading(true);
    const payload = {
      name: form.name || null,
      nif: form.nif || null,
      address: form.address || null,
      email: form.email || null,
      phone: form.phone || null,
    };

    if (settings) {
      const { error } = await supabase.from("company_settings").update(payload).eq("id", settings.id);
      if (error) { toast.error("Erro ao guardar."); setLoading(false); return; }
    } else {
      const { error } = await supabase.from("company_settings").insert(payload);
      if (error) { toast.error("Erro ao guardar."); setLoading(false); return; }
    }
    toast.success("Definições guardadas.");
    setLoading(false);
    fetchSettings();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-2xl font-bold text-foreground">Empresa</h2>

      <Card>
        <CardHeader><CardTitle>Dados da Empresa Consultora</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome da Empresa</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>NIF</Label>
              <Input value={form.nif} onChange={(e) => setForm({ ...form, nif: e.target.value })} />
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
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Assistente IA</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            A chave API da Anthropic já não é gerida aqui — por segurança, vive apenas
            como secret da Edge Function <code>claude-assistant</code> no Supabase
            (nunca é enviada ao browser). Para a definir ou rodar, usa:
          </p>
          <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxx
          </pre>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={loading}>
        {loading ? "A guardar..." : "Guardar Definições"}
      </Button>
    </div>
  );
}
