/**
 * Prazos das tarefas de manutenção.
 *
 * Uma tarefa tem uma data prevista (next_due) e uma janela de ±15 dias; só fica "em atraso"
 * depois do fim da janela (due_limit, calculado pela base de dados). Os dias de atraso contam-se
 * a partir desse fim, não da data prevista, para não exagerar o atraso (no primeiro dia fora do
 * prazo é "1d em atraso", não "16d").
 */

const DIA = 864e5;

/** Data de hoje (AAAA-MM-DD) no fuso local. */
export function hojeISO(agora: Date = new Date()): string {
  const y = agora.getFullYear();
  const m = String(agora.getMonth() + 1).padStart(2, "0");
  const d = String(agora.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Diferença em dias inteiros entre duas datas AAAA-MM-DD (b - a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / DIA);
}

/** Fim da janela da tarefa: due_limit, ou data prevista + 15 dias se ainda não estiver calculado. */
export function fimDoPrazo(t: { next_due: string; due_limit?: string | null }): string {
  if (t.due_limit) return t.due_limit.slice(0, 10);
  return new Date(Date.parse(t.next_due.slice(0, 10)) + 15 * DIA).toISOString().slice(0, 10);
}

/** Dias desde o fim do prazo (≥ 1 quando a tarefa está em atraso). */
export function diasEmAtraso(t: { next_due: string; due_limit?: string | null }, hoje: string = hojeISO()): number {
  return Math.max(1, diasEntre(fimDoPrazo(t), hoje));
}

/** Texto curto para uma tarefa ainda dentro do prazo: "em 5d", "hoje", "prevista há 3d · prazo até 20/10". */
export function textoProxima(t: { next_due: string; due_limit?: string | null }, hoje: string = hojeISO()): string {
  const faltam = diasEntre(hoje, t.next_due);
  if (faltam > 0) return `em ${faltam}d`;
  if (faltam === 0) return "hoje";
  const fim = fimDoPrazo(t);
  return `prevista há ${-faltam}d · prazo até ${formatarData(fim)}`;
}

/** AAAA-MM-DD → DD/MM/AAAA (sem passar por fusos horários). */
export function formatarData(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
