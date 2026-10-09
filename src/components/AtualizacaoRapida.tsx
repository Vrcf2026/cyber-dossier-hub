// Atualização rápida do dossier depois do intake: descreve-se a alteração (ou anexa-se
// um export) e a IA propõe o texto novo de cada secção afetada. O técnico vê as
// diferenças, escolhe o que aplicar e a gravação fica no histórico de cada secção.

import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Paperclip, Sparkles, X, AlertTriangle, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

type Alteracao = { section_id: string; secao: number; nome: string; motivo: string; antes: string; depois: string };
type Proposta = { resumo: string; alteracoes: Alteracao[]; avisos: string[]; perguntas: string[]; truncado?: boolean };

/** Diferenças por linhas (LCS) — chega para secções de dossier. */
function diferencas(a: string, b: string): { t: "=" | "-" | "+"; l: string }[] {
  const x = a.split("\n"), y = b.split("\n");
  const n = x.length, m = y.length;
  if (n * m > 400_000) return [...x.map((l) => ({ t: "-" as const, l })), ...y.map((l) => ({ t: "+" as const, l }))];
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: { t: "=" | "-" | "+"; l: string }[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { out.push({ t: "=", l: x[i] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: "-", l: x[i++] });
    else out.push({ t: "+", l: y[j++] });
  }
  while (i < n) out.push({ t: "-", l: x[i++] });
  while (j < m) out.push({ t: "+", l: y[j++] });
  return out;
}

/** Mostra só as linhas alteradas com 2 de contexto. */
function Diff({ antes, depois }: { antes: string; depois: string }) {
  const d = diferencas(antes, depois);
  const mostrar = d.map((x, k) => x.t !== "=" || d.slice(Math.max(0, k - 2), k + 3).some((y) => y.t !== "="));
  return (
    <pre className="text-xs whitespace-pre-wrap rounded border bg-muted/30 p-2 max-h-72 overflow-auto font-mono">
      {d.map((x, k) => !mostrar[k] ? (mostrar[k - 1] ? <div key={k} className="text-muted-foreground">⋯</div> : null) : (
        <div key={k} className={x.t === "+" ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200" : x.t === "-" ? "bg-red-100 text-red-900 line-through dark:bg-red-950 dark:text-red-200" : ""}>
          {x.t === "+" ? "+ " : x.t === "-" ? "− " : "  "}{x.l || " "}
        </div>
      ))}
    </pre>
  );
}

export default function AtualizacaoRapida({ dossierId, open, onOpenChange, onAplicado }: {
  dossierId: string; open: boolean; onOpenChange: (v: boolean) => void; onAplicado: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  const [anexos, setAnexos] = useState<{ name: string; mediaType: string; base64: string }[]>([]);
  const [aAnalisar, setAAnalisar] = useState(false);
  const [aAplicar, setAAplicar] = useState(false);
  const [proposta, setProposta] = useState<Proposta | null>(null);
  const [escolhidas, setEscolhidas] = useState<Record<string, boolean>>({});

  const limpar = () => { setTexto(""); setAnexos([]); setProposta(null); setEscolhidas({}); };

  const anexar = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      if (f.size > 8 * 1024 * 1024) { toast.error(`${f.name}: máximo 8 MB.`); continue; }
      const b = new Uint8Array(await f.arrayBuffer());
      let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      setAnexos((a) => [...a, { name: f.name, mediaType: f.type || "application/octet-stream", base64: btoa(s) }]);
    }
  };

  const analisar = async () => {
    setAAnalisar(true);
    try {
      const { data, error } = await supabase.functions.invoke("dossier-update", { body: { dossierId, texto, attachments: anexos } });
      if (error) throw new Error((await (error as any).context?.json?.().catch(() => null))?.error ?? error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      const p = data as Proposta;
      setProposta(p);
      setEscolhidas(Object.fromEntries(p.alteracoes.map((a) => [a.section_id, true])));
      if (!p.alteracoes.length) toast.info("A IA não encontrou nada a mudar no dossier.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao analisar.");
    } finally {
      setAAnalisar(false);
    }
  };

  const aplicar = async () => {
    if (!proposta) return;
    setAAplicar(true);
    try {
      const lista = proposta.alteracoes.filter((a) => escolhidas[a.section_id]);
      for (const a of lista) {
        const { error } = await supabase.from("dossier_sections")
          .update({ ai_generated_content: a.depois, data: { notes: `Atualização rápida (${new Date().toLocaleDateString("pt-PT")}): ${a.motivo}`.slice(0, 500) } } as any)
          .eq("id", a.section_id);
        if (error) throw error;
          logAudit("dossier_section_update", { dossierId, entityId: a.section_id, details: { origem: "atualizacao_rapida", motivo: a.motivo } });
      }
      toast.success(`${lista.length} secção(ões) atualizada(s). A versão anterior fica no histórico de cada secção.`);
      limpar();
      onOpenChange(false);
      onAplicado();
    } catch (e: any) {
      toast.error(e.message || "Erro ao aplicar.");
    } finally {
      setAAplicar(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!aAnalisar && !aAplicar) onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Atualização rápida do dossier</DialogTitle></DialogHeader>

        {!proposta ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Escreve o que mudou, como num apontamento. A IA encontra as secções afetadas e propõe o texto novo; nada é gravado sem confirmares.
            </p>
            <Textarea rows={6} value={texto} onChange={(e) => setTexto(e.target.value)}
              placeholder={"Ex.: Troquei os PCs RECECAO-01 e RECECAO-02 por dois HP ProDesk 400 G9 com Windows 11 Pro.\nRouter da MEO substituído por um TP-Link Omada ER605 com VLAN para convidados.\nA Ana Silva saiu a 30/09: contas desativadas."} />
            <div className="flex items-center gap-2 flex-wrap">
              <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { anexar(e.target.files); e.target.value = ""; }} />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Paperclip className="h-4 w-4 mr-2" /> Anexar (export Action1, CSV, PDF, foto)</Button>
              {anexos.map((a, i) => (
                <span key={i} className="text-xs flex items-center gap-1 border rounded px-2 py-0.5">{a.name}
                  <button onClick={() => setAnexos(anexos.filter((_, k) => k !== i))}><X className="h-3 w-3" /></button></span>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {proposta.resumo && <p className="text-sm">{proposta.resumo}</p>}
            {proposta.truncado && <p className="text-xs text-amber-700">A resposta da IA foi cortada por ser muito longa: confirma as secções antes de aplicar, ou divide a alteração em partes.</p>}
            {proposta.alteracoes.map((a) => (
              <div key={a.section_id} className="space-y-1">
                <label className="flex items-start gap-2 text-sm font-medium">
                  <Checkbox checked={!!escolhidas[a.section_id]} onCheckedChange={(v) => setEscolhidas({ ...escolhidas, [a.section_id]: !!v })} />
                  <span>{a.secao}. {a.nome}<span className="block text-xs font-normal text-muted-foreground">{a.motivo}</span></span>
                </label>
                <Diff antes={a.antes} depois={a.depois} />
              </div>
            ))}
            {proposta.avisos.length > 0 && (
              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
                <p className="font-medium flex items-center gap-1 mb-1"><AlertTriangle className="h-4 w-4" /> A fazer por causa desta alteração</p>
                <ul className="list-disc pl-5 space-y-0.5">{proposta.avisos.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
            {proposta.perguntas.length > 0 && (
              <div className="rounded border p-3 text-sm">
                <p className="font-medium flex items-center gap-1 mb-1"><HelpCircle className="h-4 w-4" /> Para completar</p>
                <ul className="list-disc pl-5 space-y-0.5">{proposta.perguntas.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {!proposta ? (
            <Button onClick={analisar} disabled={aAnalisar || (!texto.trim() && !anexos.length)}>
              <Sparkles className="h-4 w-4 mr-2" /> {aAnalisar ? "A analisar o dossier..." : "Propor alterações"}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setProposta(null)} disabled={aAplicar}>Voltar</Button>
              <Button onClick={aplicar} disabled={aAplicar || !proposta.alteracoes.some((a) => escolhidas[a.section_id])}>
                {aAplicar ? "A aplicar..." : `Aplicar ${proposta.alteracoes.filter((a) => escolhidas[a.section_id]).length} secção(ões)`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
