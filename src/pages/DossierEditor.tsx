import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Lock, Sparkles, Download } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { getSectionDefinition } from "@/lib/dossierSections";

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
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [contentDraft, setContentDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  const handleExport = async (variant: "cliente" | "tecnico") => {
    setExporting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dossier-export?dossierId=${id}&variant=${variant}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Falha ao gerar documento");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Dossier_${variant === "tecnico" ? "Tecnico" : "Cliente"}_${client?.name ?? ""}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Documento gerado.");
    } catch {
      toast.error("Erro ao gerar o documento.");
    } finally {
      setExporting(false);
    }
  };

  const updateStatus = async (status: string) => {
    await supabase.from("dossiers").update({ status }).eq("id", id!);
    setDossier({ ...dossier, status });
  };

  const openSection = (section: any) => {
    setActiveSectionId(section.id);
    setNotesDraft(section.data?.notes ?? "");
    setContentDraft(section.ai_generated_content ?? "");
  };

  const handleGenerate = async () => {
    const section = sections.find((s) => s.id === activeSectionId);
    if (!section) return;
    if (!notesDraft.trim()) {
      toast.error("Cola aqui as tuas notas soltas primeiro.");
      return;
    }
    setGenerating(true);
    const { data, error } = await supabase.functions.invoke("dossier-section-fill", {
      body: {
        dossierId: id,
        sectionId: section.id,
        sectionName: section.section_name,
        notes: notesDraft,
        clientName: client?.name,
      },
    });
    setGenerating(false);
    if (error || !data?.content) {
      toast.error("Erro ao gerar texto.");
      return;
    }
    setContentDraft(data.content);
    toast.success("Texto gerado — revê e ajusta antes de guardar.");
    fetchDossier();
  };

  const handleSaveAndComplete = async (markCompleted: boolean) => {
    const section = sections.find((s) => s.id === activeSectionId);
    if (!section) return;
    setSaving(true);
    await supabase
      .from("dossier_sections")
      .update({
        ai_generated_content: contentDraft,
        data: { notes: notesDraft },
        is_completed: markCompleted,
      })
      .eq("id", section.id);
    setSaving(false);
    toast.success(markCompleted ? "Secção marcada como concluída." : "Guardado.");
    setActiveSectionId(null);
    fetchDossier();
  };

  if (!dossier) return <p className="text-muted-foreground">A carregar...</p>;

  const completedSections = sections.filter((s) => s.is_completed).length;
  const progress = sections.length > 0 ? Math.round((completedSections / sections.length) * 100) : 0;
  const cfg = statusConfig[dossier.status] || statusConfig.rascunho;
  const activeSection = sections.find((s) => s.id === activeSectionId);
  const activeDef = activeSection ? getSectionDefinition(activeSection.section_number) : null;

  if (activeSection) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setActiveSectionId(null)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar às secções
        </Button>

        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-foreground">
              {activeSection.section_number}. {activeSection.section_name}
            </h2>
            {activeDef && !activeDef.clientVisible && (
              <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" /> Interno</Badge>
            )}
          </div>
          {activeDef && <p className="text-sm text-muted-foreground mt-1">{activeDef.helpText}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">As tuas notas soltas</label>
          <Textarea
            rows={6}
            placeholder="Cola aqui apontamentos da visita, mesmo desorganizados — a IA estrutura no formato certo desta secção."
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
          />
          <Button onClick={handleGenerate} disabled={generating} variant="secondary" size="sm">
            <Sparkles className="h-4 w-4 mr-2" />
            {generating ? "A estruturar..." : "Estruturar com IA"}
          </Button>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Texto final da secção (revê e ajusta à vontade)</label>
          <Textarea
            rows={14}
            value={contentDraft}
            onChange={(e) => setContentDraft(e.target.value)}
            placeholder="Podes também escrever/colar o texto final diretamente aqui, sem passar pela IA."
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={() => handleSaveAndComplete(false)} disabled={saving} variant="outline">
            Guardar rascunho
          </Button>
          <Button onClick={() => handleSaveAndComplete(true)} disabled={saving}>
            Guardar e marcar como concluída
          </Button>
        </div>
      </div>
    );
  }

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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={exporting}>
                <Download className="h-4 w-4 mr-2" /> {exporting ? "A gerar..." : "Exportar"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleExport("cliente")}>Versão Cliente</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("tecnico")}>Versão Técnica</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
        {sections.map((section) => {
          const def = getSectionDefinition(section.section_number);
          return (
            <div
              key={section.id}
              onClick={() => openSection(section)}
              className={`p-4 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors flex items-center justify-between ${
                section.is_completed ? "border-success/30 bg-success/5" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono text-muted-foreground w-6">{section.section_number}.</span>
                <span className="font-medium">{section.section_name}</span>
                {def && !def.clientVisible && (
                  <Badge variant="secondary" className="gap-1 text-xs"><Lock className="h-3 w-3" /> Interno</Badge>
                )}
              </div>
              {section.is_completed && (
                <Badge variant="outline" className="text-success border-success/30">Preenchido</Badge>
              )}
            </div>
          );
        })}
      </div>

      <Button variant="outline" className="w-full" onClick={() => navigate(`/dossiers/${id}/credenciais`)}>
        <Lock className="h-4 w-4 mr-2" /> Folha de Credenciais (confidencial, à parte)
      </Button>
    </div>
  );
}
