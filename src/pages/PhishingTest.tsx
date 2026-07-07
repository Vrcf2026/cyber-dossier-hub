import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function PhishingTest() {
  const { id } = useParams(); // client id
  const navigate = useNavigate();

  const [client, setClient] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [results, setResults] = useState<Record<string, any[]>>({});

  const [theme, setTheme] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [senderPersona, setSenderPersona] = useState(""); // ex: "Dra. Sofia Martins"
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [emailsRaw, setEmailsRaw] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase.from("clients").select("*").eq("id", id).single().then(({ data }) => setClient(data));
    loadCampaigns();
  }, [id]);

  const loadCampaigns = async () => {
    const { data: camps } = await supabase
      .from("phishing_campaigns")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: false });
    setCampaigns(camps ?? []);

    if (camps && camps.length > 0) {
      const { data: res } = await supabase
        .from("phishing_campaign_results")
        .select("*")
        .in("campaign_id", camps.map((c) => c.id));
      const grouped: Record<string, any[]> = {};
      (res ?? []).forEach((r) => {
        grouped[r.campaign_id] = grouped[r.campaign_id] || [];
        grouped[r.campaign_id].push(r);
      });
      setResults(grouped);
    }
  };

  const handleGenerate = async () => {
    if (!theme.trim()) {
      toast.error("Indica um tema/pretexto primeiro.");
      return;
    }
    setGenerating(true);
    const { data, error } = await supabase.functions.invoke("phishing-generate", {
      body: {
        theme,
        clientName: client?.name,
        senderPersona: isInternal ? senderPersona : undefined,
      },
    });
    setGenerating(false);
    if (error || !data?.subject) {
      toast.error("Erro ao gerar texto.");
      return;
    }
    setSubject(data.subject);
    setBodyHtml(data.body_html);
    toast.success("Texto gerado — revê antes de enviar.");
  };

  const handleSend = async () => {
    const emails = emailsRaw.split(/[\n,;]+/).map((e) => e.trim()).filter(Boolean);
    if (emails.length === 0) {
      toast.error("Indica pelo menos um email.");
      return;
    }
    if (!subject || !bodyHtml) {
      toast.error("Gera ou escreve o texto do email primeiro.");
      return;
    }
    if (!bodyHtml.includes("{{LINK}}")) {
      toast.error("O corpo do email tem de conter o placeholder {{LINK}}.");
      return;
    }
    setSending(true);
    const { data, error } = await supabase.functions.invoke("phishing-send", {
      body: {
        clientId: id,
        theme,
        subject,
        bodyHtml,
        emails,
        fromName: isInternal ? senderPersona : undefined,
      },
    });
    setSending(false);
    if (error) {
      toast.error("Erro ao enviar campanha.");
      return;
    }
    const failed = (data?.results ?? []).filter((r: any) => !r.sent);
    if (failed.length > 0) {
      toast.warning(`Enviado, mas ${failed.length} email(s) falharam.`);
    } else {
      toast.success("Campanha enviada silenciosamente.");
    }
    setTheme(""); setSenderPersona(""); setIsInternal(false);
    setSubject(""); setBodyHtml(""); setEmailsRaw("");
    loadCampaigns();
  };

  if (!client) return <p className="text-muted-foreground">A carregar...</p>;

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate(`/clientes/${id}`)} className="mb-2">
        <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao cliente
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Teste de Phishing — {client.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Silencioso: quem clicar não recebe qualquer sinal. Os resultados servem para a formação seguinte.
          </p>

          <div className="space-y-2">
            <Label>Tema / pretexto</Label>
            <Input
              placeholder='ex: "fatura em atraso", "entrega CTT pendente"'
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isInternal"
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
            />
            <Label htmlFor="isInternal">Simular remetente interno (colega/chefia), em vez de entidade externa</Label>
          </div>

          {isInternal && (
            <div className="space-y-2">
              <Label>Nome a simular</Label>
              <Input
                placeholder='ex: "Dra. Sofia Martins"'
                value={senderPersona}
                onChange={(e) => setSenderPersona(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                O nome aparece como remetente. O endereço de envio continua a ser o teu domínio verificado —
                convincente sobretudo em telemóvel, onde só se vê o nome.
              </p>
            </div>
          )}

          <Button onClick={handleGenerate} disabled={generating} variant="secondary">
            {generating ? "A gerar..." : "Gerar texto com IA"}
          </Button>

          <div className="space-y-2">
            <Label>Assunto</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Corpo (HTML — mantém o placeholder {"{{LINK}}"})</Label>
            <Textarea rows={8} value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Emails-alvo (um por linha, ou separados por vírgula)</Label>
            <Textarea
              rows={4}
              placeholder={"sofia.martins@clinicasorriso.pt\npedro.costa@clinicasorriso.pt"}
              value={emailsRaw}
              onChange={(e) => setEmailsRaw(e.target.value)}
            />
          </div>

          <Button onClick={handleSend} disabled={sending}>
            {sending ? "A enviar..." : "Enviar campanha"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campanhas Anteriores</CardTitle>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sem campanhas ainda.</p>
          ) : (
            <div className="space-y-4">
              {campaigns.map((c) => {
                const camResults = results[c.id] ?? [];
                const totalSent = camResults.length;
                const totalClicked = camResults.filter((r) => r.attempts > 0).length;
                return (
                  <div key={c.id} className="p-3 rounded-lg border space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{c.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.theme} {c.from_name ? `· fingiu ser "${c.from_name}"` : "· entidade externa"} ·{" "}
                          {new Date(c.created_at).toLocaleDateString("pt-PT")}
                        </p>
                      </div>
                      <Badge variant={totalClicked > 0 ? "default" : "secondary"}>
                        {totalClicked}/{totalSent} caíram
                      </Badge>
                    </div>
                    {camResults.length > 0 && (
                      <table className="w-full text-sm">
                        <tbody>
                          {camResults.map((r) => (
                            <tr key={r.target_id} className="border-t">
                              <td className="py-1">{r.email}</td>
                              <td className="py-1 text-right text-muted-foreground">
                                {r.attempts > 0 ? `${r.attempts} tentativa(s)` : "não clicou"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
