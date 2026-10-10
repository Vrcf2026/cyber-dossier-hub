import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/** Símbolo e nome do CyberDossier (VRCF). `escuro`: sobre o fundo azul-tinta da barra lateral ou da entrada. */
export function Marca({ escuro = false, compacto = false, className }: { escuro?: boolean; compacto?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          escuro
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_0_0_4px_hsl(var(--sidebar-primary)/0.18)]"
            : "bg-primary text-primary-foreground shadow-cartao",
        )}
      >
        <ShieldCheck className="h-[18px] w-[18px]" />
      </div>
      {!compacto && (
        <div className="min-w-0 leading-tight">
          <div className={cn("truncate font-display text-[15px] font-semibold", escuro ? "text-sidebar-accent-foreground" : "text-foreground")}>
            CyberDossier
          </div>
          <div className={cn("truncate text-[11px]", escuro ? "text-sidebar-foreground/55" : "text-muted-foreground")}>
            VRCF Informática & Segurança
          </div>
        </div>
      )}
    </div>
  );
}
