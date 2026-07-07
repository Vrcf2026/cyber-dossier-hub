import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldAlert } from "lucide-react";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "secondary" },
  em_progresso: { label: "Em Progresso", variant: "default" },
  concluido: { label: "Concluído", variant: "outline" },
};

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState<any>(null);
  const [dossiers, setDossiers] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    supabase.from("clients").select("*").eq("id", id).single().then(({ data }) => setClient(data));
    supabase.from("dossiers").select("*").eq("client_id", id).order("created_at", { ascending: false }).then(({ data }) => setDossiers(data ?? []));
  }, [id]);

  if (!client) return <p className="text-muted-foreground">A carregar...</p>;

  const formatDate = (d: string) => new Date(d).toLocaleDateString("pt-PT");

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate("/clientes")} className="mb-2">
        <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
      </Button>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{client.name}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => navigate(`/clientes/${id}/phishing`)}>
            <ShieldAlert className="h-4 w-4 mr-2" /> Teste de Phishing
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          {client.nif && <div><span className="text-muted-foreground">NIF:</span> {client.nif}</div>}
          {client.sector && <div><span className="text-muted-foreground">Setor:</span> {client.sector}</div>}
          {client.email && <div><span className="text-muted-foreground">Email:</span> {client.email}</div>}
          {client.phone && <div><span className="text-muted-foreground">Telefone:</span> {client.phone}</div>}
          {client.address && <div className="col-span-2"><span className="text-muted-foreground">Morada:</span> {client.address}</div>}
          {client.contact_person && <div><span className="text-muted-foreground">Contacto:</span> {client.contact_person}</div>}
          {client.num_employees && <div><span className="text-muted-foreground">Colaboradores:</span> {client.num_employees}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dossiers do Cliente</CardTitle>
        </CardHeader>
        <CardContent>
          {dossiers.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sem dossiers.</p>
          ) : (
            <div className="space-y-3">
              {dossiers.map((d) => {
                const cfg = statusConfig[d.status] || statusConfig.rascunho;
                return (
                  <div
                    key={d.id}
                    className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/dossiers/${d.id}`)}
                  >
                    <div>
                      <p className="font-medium">{d.title}</p>
                      <p className="text-sm text-muted-foreground">{formatDate(d.created_at)}</p>
                    </div>
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
