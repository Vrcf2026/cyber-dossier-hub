import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Send, Paperclip, Sparkles, X, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Message { role: "user" | "assistant"; content: string; files?: string[] }

export default function DossierIntake() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [dossier, setDossier] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<{ name: string; mediaType: string; base64: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [filling, setFilling] = useState(false);
  const [readyToFill, setReadyToFill] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    supabase.from("dossiers").select("*, clients(name, sector, num_employees)").eq("id", id).single()
      .then(({ data }) => setDossier(data));
    // Carregar histórico existente
    supabase.from("dossier_intake_messages").select("role, content").eq("dossier_id", id).order("created_at")
      .then(({ data }) => {
        if (data && data.length > 0) {
          setMessages(data as Message[]);
        } else {
          // Mensagem de boas-vindas inicial
          setMessages([{
            role: "assistant",
            content: `Olá! Vou ajudar-te a preencher este dossier de cibersegurança.\n\nPodes fazer uma de três coisas — ou as três ao mesmo tempo:\n\n• **Escrever** livremente o que sabes sobre a empresa (equipamento, rede, utilizadores, políticas, o que viste na visita...)\n• **Anexar ficheiros** — CSV ou HTML exportado do Action1, PDF de relatórios, fotos do bastidor, screenshots de consolas\n• **Ambos**\n\nNão precisas de organizar nada — despeja tudo como tiveres. Vou fazer perguntas só sobre o que faltar.\n\nPor onde queres começar?`,
          }]);
        }
      });
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const readAsBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve((r.result as string).split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const MAX = 15 * 1024 * 1024;
    let total = attachments.reduce((s, a) => s + a.base64.length * 0.75, 0);
    const newOnes: typeof attachments = [];
    for (const file of Array.from(files)) {
      if (total + file.size > MAX) { toast.error(`"${file.name}" ignorado — limite de 15MB atingido.`); continue; }
      try {
        const base64 = await readAsBase64(file);
        newOnes.push({ name: file.name, mediaType: file.type || "application/octet-stream", base64 });
        total += file.size;
      } catch { toast.error(`Não foi possível ler "${file.name}".`); }
    }
    setAttachments(prev => [...prev, ...newOnes]);
  };

  const handleSend = async () => {
    if (!input.trim() && attachments.length === 0) return;
    setSending(true);

    const userMsg: Message = {
      role: "user",
      content: input.trim() + (attachments.length ? `\n[Ficheiros: ${attachments.map(a => a.name).join(", ")}]` : ""),
      files: attachments.map(a => a.name),
    };
    setMessages(prev => [...prev, userMsg]);
    const sentInput = input;
    const sentAttachments = [...attachments];
    setInput("");
    setAttachments([]);

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dossier-intake`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dossierId: id, mode: "chat", message: sentInput, attachments: sentAttachments }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro desconhecido");

      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      if (data.readyToFill) setReadyToFill(true);
    } catch (e: any) {
      toast.error(e.message || "Erro ao contactar a IA.");
      setMessages(prev => prev.filter(m => m !== userMsg));
    } finally {
      setSending(false);
    }
  };

  const handleFill = async () => {
    setFilling(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dossier-intake`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dossierId: id, mode: "fill" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao preencher");

      const missing = data.missingInfo?.length > 0
        ? `\n\nInformação que ficou por confirmar:\n${data.missingInfo.map((m: string) => `• ${m}`).join("\n")}`
        : "";

      toast.success(`${data.sectionsProcessed} de ${data.total} secções preenchidas.`);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `✅ Dossier preenchido com sucesso! (${data.sectionsProcessed}/${data.total} secções, ${data.progress}% completo)${missing}\n\nPodes agora ir ao editor para rever cada secção, corrigir o que precisar, e completar o que ficou marcado como "[A CONFIRMAR]".`,
      }]);

      setTimeout(() => navigate(`/dossiers/${id}`), 2500);
    } catch (e: any) {
      toast.error(e.message || "Erro ao preencher o dossier.");
    } finally {
      setFilling(false);
    }
  };

  const formatMessage = (text: string) => {
    return text.split("\n").map((line, i) => {
      if (line.startsWith("**") && line.endsWith("**"))
        return <p key={i} className="font-semibold">{line.slice(2, -2)}</p>;
      if (line.startsWith("• ") || line.startsWith("- "))
        return <p key={i} className="pl-3">• {line.slice(2)}</p>;
      if (line.startsWith("✅"))
        return <p key={i} className="text-green-600 font-medium">{line}</p>;
      if (!line.trim()) return <br key={i} />;
      // inline bold
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return <p key={i}>{parts.map((p, j) => j % 2 === 1 ? <strong key={j}>{p}</strong> : p)}</p>;
    });
  };

  if (!dossier) return <p className="text-muted-foreground p-6">A carregar...</p>;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 pb-4 border-b mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/dossiers/${id}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-foreground truncate">{dossier.title}</h2>
          <p className="text-xs text-muted-foreground">{dossier.clients?.name} — Intake de informação</p>
        </div>
        {readyToFill && !filling && (
          <Button onClick={handleFill} className="gap-2 shrink-0">
            <Sparkles className="h-4 w-4" /> Preencher dossier
          </Button>
        )}
        {filling && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
            <Loader2 className="h-4 w-4 animate-spin" /> A preencher as 15 secções...
          </div>
        )}
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm space-y-1 ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground rounded-br-sm"
                : "bg-muted text-foreground rounded-bl-sm"
            }`}>
              {formatMessage(msg.content)}
              {msg.files && msg.files.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {msg.files.map(f => (
                    <Badge key={f} variant="secondary" className="text-xs opacity-80">📎 {f}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1 items-center">
                <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Ficheiros anexados */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-3 pb-1">
          {attachments.map(a => (
            <Badge key={a.name} variant="secondary" className="gap-1 text-xs">
              📎 {a.name}
              <button onClick={() => setAttachments(prev => prev.filter(x => x.name !== a.name))}
                className="ml-1 hover:text-foreground text-muted-foreground">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="pt-3 border-t mt-3 space-y-2">
        {readyToFill && (
          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-950/20 rounded-lg px-3 py-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>A IA tem informação suficiente. Podes preencher o dossier agora ou continuar a acrescentar detalhes.</span>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <input ref={fileRef} type="file" multiple className="hidden"
            accept=".csv,.txt,.pdf,.png,.jpg,.jpeg,.json,.html"
            onChange={e => handleFiles(e.target.files)} />
          <Button variant="outline" size="icon" className="shrink-0"
            onClick={() => fileRef.current?.click()} title="Anexar ficheiro">
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            rows={2}
            className="resize-none flex-1"
            placeholder="Escreve o que sabes sobre a empresa, ou anexa um ficheiro — ou os dois..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />
          <Button size="icon" className="shrink-0" onClick={handleSend}
            disabled={sending || filling || (!input.trim() && attachments.length === 0)}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Enter para enviar · Shift+Enter para nova linha · Aceita CSV, PDF, imagens
        </p>
      </div>
    </div>
  );
}
