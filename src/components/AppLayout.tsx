import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Marca } from "@/components/Marca";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/70">
            <SidebarTrigger className="rounded-lg" />
            <div className="h-5 w-px bg-border" aria-hidden />
            <Marca compacto className="md:hidden" />
            <span className="hidden font-display text-[15px] font-semibold md:inline">CyberDossier</span>
          </header>
          <main className="flex-1 overflow-auto px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
            <div className="mx-auto w-full max-w-[1400px]">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
