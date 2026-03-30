import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "secondary" },
  em_progresso: { label: "Em Progresso", variant: "default" },
  concluido: { label: "Concluído", variant: "outline" },
};

export default function DossierEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [dossier, setDossier] = useState<any>(null);
  const [sections, setSections] = useState<any[]>([]);
  const [client, setClient] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    fetchDossier();
  }, [id]);

  const fetchDossier = async () => {
    const { data: d } = await supabase.from("dossiers").select("*, clients(*)").eq("id", id).single();
    if (d) {
      setDossier(d);
      setClient((d as any).clients);
    }
    const { data: s } = await supabase.from("dossier_sections").select("*").eq("dossier_id", id!).order("section_number");
    setSections(s ?? []);
  };

  const updateStatus = async (status: string) => {
    await supabase.from("dossiers").update({ status }).eq("id", id!);
    setDossier({ ...dossier, status });
  };

  if (!dossier) return <p className="text-muted-foreground">A carregar...</p>;

  const completedSections = sections.filter((s) => s.is_completed).length;
  const progress = sections.length > 0 ? Math.round((completedSections / sections.length) * 100) : 0;
  const cfg = statusConfig[dossier.status] || statusConfig.rascunho;

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate("/dossiers")}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
      </Button>

      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{dossier.title}</h2>
          <p className="text-muted-foreground">{client?.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={dossier.status} onValueChange={updateStatus}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rascunho">Rascunho</SelectItem>
              <SelectItem value="em_progresso">Em Progresso</SelectItem>
              <SelectItem value="concluido">Concluído</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Progresso</span>
          <span className="font-medium">{completedSections}/{sections.length} secções</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <div className="grid gap-3">
        {sections.map((section) => (
          <div
            key={section.id}
            className={`p-4 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors flex items-center justify-between ${
              section.is_completed ? "border-success/30 bg-success/5" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-mono text-muted-foreground w-6">{section.section_number}.</span>
              <span className="font-medium">{section.section_name}</span>
            </div>
            {section.is_completed && (
              <Badge variant="outline" className="text-success border-success/30">Preenchido</Badge>
            )}
          </div>
        ))}
      </div>

      <p className="text-sm text-muted-foreground text-center">
        O editor completo de secções será implementado na próxima iteração.
      </p>
    </div>
  );
}
