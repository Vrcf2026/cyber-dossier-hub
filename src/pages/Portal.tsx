import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, FileText } from "lucide-react";
import { logAudit } from "@/lib/audit";

type Dossier = { id: string; title: string; status: string; updated_at: string };
type Section = {
  id: string;
  section_number: number;
  section_name: string;
  ai_generated_content: string | null;
};

export default function Portal() {
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    supabase
      .from("dossiers")
      .select("id, title, status, updated_at")
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        setDossiers(data ?? []);
        setSelected(data?.[0]?.id ?? null);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selected) return;
    supabase
      .from("dossier_sections")
      .select("id, section_number, section_name, ai_generated_content")
      .eq("dossier_id", selected)
      .order("section_number")
      .then(({ data }) => setSections(data ?? []));
    logAudit("portal_view", { dossierId: selected, entityId: selected });
  }, [selected]);

  const handleDownload = async () => {
    if (!selected) return;
    setDownloading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dossier-export?dossierId=${selected}&variant=cliente`,
        { headers: { Authorization: `Bearer ${session?.access_token}` } }
      );
      if (!res.ok) throw new Error("Falha na exportação.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Dossier.docx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Não foi possível descarregar o relatório.");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <p className="text-muted-foreground">A carregar...</p>;

  if (dossiers.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Ainda não existe nenhum relatório disponível para consulta.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-primary">Os meus relatórios</h2>
        <p className="text-sm text-muted-foreground">
          Consulta apenas. Para alterações, contacte a equipa técnica.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {dossiers.map((d) => (
          <Button
            key={d.id}
            variant={selected === d.id ? "default" : "outline"}
            size="sm"
            onClick={() => setSelected(d.id)}
          >
            <FileText className="h-4 w-4 mr-2" />
            {d.title}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-lg">
            {dossiers.find((d) => d.id === selected)?.title}
            <Badge variant="secondary" className="ml-2 align-middle">
              {dossiers.find((d) => d.id === selected)?.status}
            </Badge>
          </CardTitle>
          <Button size="sm" onClick={handleDownload} disabled={downloading}>
            <Download className="h-4 w-4 mr-2" />
            {downloading ? "A gerar..." : "Descarregar"}
          </Button>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {sections.map((s) => (
              <AccordionItem key={s.id} value={s.id}>
                <AccordionTrigger className="text-left">
                  {s.section_number}. {s.section_name}
                </AccordionTrigger>
                <AccordionContent>
                  {s.ai_generated_content ? (
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {s.ai_generated_content}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      Secção ainda por preencher.
                    </p>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
