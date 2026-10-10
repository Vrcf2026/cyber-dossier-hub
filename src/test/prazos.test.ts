import { describe, expect, it } from "vitest";
import { diasEmAtraso, diasEntre, fimDoPrazo, formatarData, hojeISO, textoProxima } from "@/lib/prazos";

describe("prazos das tarefas", () => {
  it("conta o atraso a partir do fim da janela, não da data prevista", () => {
    // Prevista a 1/10, prazo até 16/10: a 17/10 está 1 dia em atraso (não 16).
    expect(diasEmAtraso({ next_due: "2026-10-01", due_limit: "2026-10-16" }, "2026-10-17")).toBe(1);
    expect(diasEmAtraso({ next_due: "2026-10-01", due_limit: "2026-10-16" }, "2026-10-26")).toBe(10);
  });

  it("sem due_limit usa a data prevista + 15 dias", () => {
    expect(fimDoPrazo({ next_due: "2026-10-01", due_limit: null })).toBe("2026-10-16");
    expect(diasEmAtraso({ next_due: "2026-10-01" }, "2026-10-20")).toBe(4);
  });

  it("nunca mostra 0 ou negativo numa tarefa em atraso", () => {
    expect(diasEmAtraso({ next_due: "2026-10-01", due_limit: "2026-10-16" }, "2026-10-16")).toBe(1);
  });

  it("texto das próximas tarefas", () => {
    expect(textoProxima({ next_due: "2026-10-15" }, "2026-10-10")).toBe("em 5d");
    expect(textoProxima({ next_due: "2026-10-10" }, "2026-10-10")).toBe("hoje");
    // Já passou a data prevista mas ainda está dentro da janela: nada de "em -3d".
    expect(textoProxima({ next_due: "2026-10-07", due_limit: "2026-10-22" }, "2026-10-10")).toBe("prevista há 3d · prazo até 22/10/2026");
  });

  it("datas sem surpresas de fuso horário", () => {
    expect(diasEntre("2026-10-24", "2026-10-26")).toBe(2); // atravessa a mudança de hora (25/10)
    expect(formatarData("2026-03-05")).toBe("05/03/2026");
    expect(hojeISO(new Date(2026, 0, 2, 0, 30))).toBe("2026-01-02");
  });
});
