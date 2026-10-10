import { describe, expect, it } from "vitest";
import { seccoesPorFechar } from "@/lib/entrega";

describe("entrega do dossier", () => {
  it("só conta secções visíveis ao cliente, sem texto e não N/A", () => {
    const r = seccoesPorFechar([
      { section_number: 2, section_name: "Inventário", client_visible: true, ai_generated_content: "  " },
      { section_number: 1, section_name: "Âmbito", client_visible: true, ai_generated_content: "texto" },
      { section_number: 8, section_name: "Incidentes", client_visible: true, section_status: "not_applicable", ai_generated_content: "" },
      { section_number: 13, section_name: "Plano de Ação", client_visible: false, ai_generated_content: null },
      { section_number: 11, section_name: "Conformidade", client_visible: true, ai_generated_content: null },
    ]);
    expect(r).toEqual([{ numero: 2, nome: "Inventário" }, { numero: 11, nome: "Conformidade" }]);
  });
});
