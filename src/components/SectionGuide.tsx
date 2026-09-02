import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { getSectionGuide } from "@/lib/sectionGuide";
import { CheckCircle2, XCircle, AlertTriangle, BookOpen, ExternalLink } from "lucide-react";

interface SectionGuideProps {
  sectionNumber: number | null;
  open: boolean;
  onClose: () => void;
}

export function SectionGuide({ sectionNumber, open, onClose }: SectionGuideProps) {
  const guide = sectionNumber ? getSectionGuide(sectionNumber) : null;

  if (!guide) return null;

  const renderMarkdownTable = (text: string) => {
    const lines = text.split("\n");
    const tableLines = lines.filter(l => l.trim().startsWith("|"));
    if (tableLines.length < 2) return <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/50 p-2 rounded">{text}</pre>;

    const headers = tableLines[0].split("|").map(c => c.trim()).filter(Boolean);
    const rows = tableLines.slice(2).map(l => l.split("|").map(c => c.trim()).filter(Boolean));

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/50">
              {headers.map((h, i) => <th key={i} className="border px-2 py-1 text-left font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b">
                {row.map((cell, j) => <td key={j} className="border px-2 py-1 whitespace-nowrap">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const hasTable = guide.example.includes("|---|");

  return (
    <Sheet open={open} onOpenChange={open => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Secção {guide.number} — Guia de Preenchimento
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 pt-4 pb-8">
          {/* O que é */}
          <div>
            <p className="text-sm text-muted-foreground leading-relaxed">{guide.what}</p>
          </div>

          {/* Obrigatório */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground mb-2">O que não pode faltar</p>
            <ul className="space-y-1">
              {guide.mandatory.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Opcional */}
          {guide.optional.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground mb-2">Recomendado mas opcional</p>
              <ul className="space-y-1">
                {guide.optional.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="w-4 h-4 shrink-0 mt-0.5 text-center text-xs">○</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Exemplo */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground mb-2">Exemplo real</p>
            <div className="bg-muted/30 border rounded-lg p-3 space-y-2">
              {hasTable ? renderMarkdownTable(guide.example) : (
                <pre className="text-xs whitespace-pre-wrap leading-relaxed font-mono">{guide.example}</pre>
              )}
            </div>
          </div>

          {/* Erros comuns */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground mb-2">Erros comuns a evitar</p>
            <ul className="space-y-1">
              {guide.mistakes.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Referências normativas */}
          {(guide.nis2ref || guide.rgpdref) && (
            <div className="border-t pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground mb-2">Referências normativas</p>
              <div className="space-y-1">
                {guide.nis2ref && (
                  <div className="flex items-start gap-2">
                    <Badge variant="secondary" className="text-xs shrink-0">NIS2</Badge>
                    <span className="text-xs text-muted-foreground">{guide.nis2ref}</span>
                  </div>
                )}
                {guide.rgpdref && (
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="text-xs shrink-0">RGPD</Badge>
                    <span className="text-xs text-muted-foreground">{guide.rgpdref}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
