import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2, Lock, Download } from "lucide-react";
import { toast } from "sonner";

interface CredentialEntry {
  sistema: string;
  ip_url: string;
  utilizador: string;
  password: string;
  observacoes: string;
}

const emptyEntry: CredentialEntry = { sistema: "", ip_url: "", utilizador: "", password: "", observacoes: "" };

export default function DossierCredentials() {
  const { id } = useParams(); // dossier id
  const navigate = useNavigate();
  const [entries, setEntries] = useState<CredentialEntry[]>([]);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("dossier_credentials")
      .select("*")
      .eq("dossier_id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setRecordId(data.id);
          setEntries((data.entries as unknown as CredentialEntry[]) ?? []);
        }
      });
  }, [id]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dossier-export?dossierId=${id}&variant=credenciais`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Falha ao gerar documento");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Folha_Credenciais.docx";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Documento gerado.");
    } catch {
      toast.error("Erro ao gerar o documento.");
    } finally {
      setExporting(false);
    }
  };

  const addEntry = () => setEntries([...entries, { ...emptyEntry }]);
  const removeEntry = (index: number) => setEntries(entries.filter((_, i) => i !== index));
  const updateEntry = (index: number, field: keyof CredentialEntry, value: string) => {
    const next = [...entries];
    next[index] = { ...next[index], [field]: value };
    setEntries(next);
  };

  const handleSave = async () => {
    setSaving(true);
    if (recordId) {
      await supabase.from("dossier_credentials").update({ entries: entries as any }).eq("id", recordId);
    } else {
      const { data } = await supabase
        .from("dossier_credentials")
        .insert({ dossier_id: id, entries: entries as any })
        .select()
        .single();
      if (data) setRecordId(data.id);
    }
    setSaving(false);
    toast.success("Folha de credenciais guardada.");
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate(`/dossiers/${id}`)}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao dossier
      </Button>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Lock className="h-5 w-5" /> Folha de Credenciais — Confidencial
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Este documento nunca sai junto com o dossier do cliente nem com o técnico. Só é exportado à parte,
            quando explicitamente pedido, para uso exclusivo do administrador.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {entries.map((entry, i) => (
            <div key={i} className="grid grid-cols-5 gap-2 items-start p-3 border rounded-lg">
              <Input placeholder="Sistema/Serviço" value={entry.sistema} onChange={(e) => updateEntry(i, "sistema", e.target.value)} />
              <Input placeholder="IP / URL" value={entry.ip_url} onChange={(e) => updateEntry(i, "ip_url", e.target.value)} />
              <Input placeholder="Utilizador" value={entry.utilizador} onChange={(e) => updateEntry(i, "utilizador", e.target.value)} />
              <Input placeholder="Password" type="password" value={entry.password} onChange={(e) => updateEntry(i, "password", e.target.value)} />
              <div className="flex gap-1">
                <Input placeholder="Observações" value={entry.observacoes} onChange={(e) => updateEntry(i, "observacoes", e.target.value)} />
                <Button variant="ghost" size="icon" onClick={() => removeEntry(i)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}

          <Button variant="outline" onClick={addEntry}>
            <Plus className="h-4 w-4 mr-2" /> Adicionar linha
          </Button>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "A guardar..." : "Guardar"}
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              <Download className="h-4 w-4 mr-2" /> {exporting ? "A gerar..." : "Exportar (.docx)"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
