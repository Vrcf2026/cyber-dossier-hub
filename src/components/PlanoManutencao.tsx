// Perfil do plano de manutenção periódica do cliente.
// Guardar atualiza clients.dados_sensiveis / opcoes_plano e a base de dados ajusta as
// tarefas do plano sozinha (trigger aplicar_plano_on_client_update). Tarefas manuais não mexem.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const OPCIONAIS = [
  { tipo: "phishing_campaign", label: "Campanha de phishing", padrao: "semiannual" },
  { tipo: "training_session", label: "Formação dos colaboradores", padrao: "annual" },
  { tipo: "physical_access_review", label: "Revisão de chaves e códigos de alarme", padrao: "annual" },
] as const;

const ESCOLHAS = [
  { value: "na", label: "Não se aplica" },
  { value: "once", label: "Uma vez" },
  { value: "semiannual", label: "Semestral" },
  { value: "annual", label: "Anual" },
];

export default function PlanoManutencao({ clientId, onAplicado }: { clientId: string; onAplicado: () => void }) {
  const [sensiveis, setSensiveis] = useState(false);
  const [opcoes, setOpcoes] = useState<Record<string, string>>({});
  const [inicial, setInicial] = useState("");
  const [aGuardar, setAGuardar] = useState(false);

  useEffect(() => {
    (supabase.from("clients") as any).select("dados_sensiveis, opcoes_plano").eq("id", clientId).single()
      .then(({ data }: any) => {
        const s = !!data?.dados_sensiveis;
        const o = (data?.opcoes_plano ?? {}) as Record<string, string>;
        setSensiveis(s); setOpcoes(o); setInicial(JSON.stringify([s, o]));
      });
  }, [clientId]);

  const alterado = JSON.stringify([sensiveis, opcoes]) !== inicial;

  const guardar = async () => {
    setAGuardar(true);
    try {
      const completo = Object.fromEntries(OPCIONAIS.map((o) => [o.tipo, opcoes[o.tipo] ?? o.padrao]));
      const { error } = await (supabase.from("clients") as any)
        .update({ dados_sensiveis: sensiveis, opcoes_plano: completo }).eq("id", clientId);
      if (error) throw error;
      // Garante também as tarefas em falta (ex.: cliente antigo sem plano)
      await supabase.rpc("seed_default_client_tasks" as any, { p_client_id: clientId });
      setOpcoes(completo); setInicial(JSON.stringify([sensiveis, completo]));
      toast.success("Plano atualizado.");
      onAplicado();
    } catch (e: any) {
      toast.error(e.message || "Erro ao guardar o plano.");
    } finally {
      setAGuardar(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Plano de manutenção periódica</CardTitle>
        <p className="text-xs text-muted-foreground">
          É o que te compromete com o cliente (Anexo III da adenda). Põe só o que cumpres sempre.
          Cada tarefa tem uma janela de ±15 dias; a data seguinte conta a partir da data prevista.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>Tem servidores ou PCs com dados sensíveis?</Label>
            <p className="text-xs text-muted-foreground">Sim → revisão de registos e patches mensais. Não → trimestrais.</p>
          </div>
          <Switch checked={sensiveis} onCheckedChange={setSensiveis} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {OPCIONAIS.map((o) => (
            <div key={o.tipo} className="space-y-1">
              <Label className="text-xs">{o.label}</Label>
              <Select value={opcoes[o.tipo] ?? o.padrao} onValueChange={(v) => setOpcoes({ ...opcoes, [o.tipo]: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ESCOLHAS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Sempre incluído: backups (mensal), restauro (trimestral), configuração de segurança (trimestral), parque informático (semestral),
          acessos, fornecedores, contactos de emergência e revisão do dossier pela gerência (anual).
          Backups, registos, configuração e parque chegam sozinhos do VRCF Sentinela.
        </p>
        <div className="flex justify-end">
          <Button onClick={guardar} disabled={aGuardar}>{aGuardar ? "A aplicar..." : alterado ? "Guardar e aplicar plano" : "Aplicar plano"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
