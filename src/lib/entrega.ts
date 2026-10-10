/**
 * Regras de entrega do dossier ao cliente (as mesmas do documento gerado em
 * supabase/functions/dossier-export/dossier.ts).
 */
import { getSectionDefinition } from "@/lib/dossierSections";

type Seccao = {
  section_number: number;
  section_name: string;
  section_status?: string | null;
  client_visible?: boolean | null;
  ai_generated_content?: string | null;
};

/** Secções visíveis ao cliente, sem texto e não marcadas como N/A. */
export function seccoesPorFechar(seccoes: Seccao[]): { numero: number; nome: string }[] {
  return seccoes
    .filter((s) => s.client_visible ?? getSectionDefinition(s.section_number)?.clientVisible ?? true)
    .filter((s) => s.section_status !== "not_applicable" && !(s.ai_generated_content ?? "").trim())
    .sort((a, b) => a.section_number - b.section_number)
    .map((s) => ({ numero: s.section_number, nome: s.section_name }));
}
