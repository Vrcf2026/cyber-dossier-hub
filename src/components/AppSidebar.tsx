import { LayoutDashboard, Users, FolderOpen, Building2, LogOut, Sun, Moon, ShieldCheck, FileText, ScrollText, HardDrive, ClipboardCheck } from "lucide-react";
import { forwardRef } from "react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "next-themes";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Marca } from "@/components/Marca";

const staffItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, end: true },
  { title: "Clientes", url: "/clientes", icon: Users },
  { title: "Dossiers", url: "/dossiers", icon: FolderOpen },
  { title: "Continuidade", url: "/continuidade", icon: ClipboardCheck },
];

const adminItems = [
  { title: "Empresa", url: "/empresa", icon: Building2 },
  { title: "Utilizadores", url: "/utilizadores", icon: ShieldCheck },
  { title: "Auditoria", url: "/auditoria", icon: ScrollText },
  { title: "Backups", url: "/backups", icon: HardDrive },
];

const clientItems = [
  { title: "Os meus relatórios", url: "/portal", icon: FileText },
];

export const AppSidebar = forwardRef<HTMLDivElement>((_, ref) => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { isAdmin, isCliente, signOut, user } = useAuth();
  const { theme, setTheme } = useTheme();

  const items = isCliente ? clientItems : [...staffItems, ...(isAdmin ? adminItems : [])];

  return (
    <Sidebar ref={ref} collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <div className={collapsed ? "flex justify-center py-3" : "px-2 pb-5 pt-3"}>
            <Marca escuro compacto={collapsed} />
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={"end" in item ? (item as any).end : undefined}
                      className="relative rounded-lg text-sidebar-foreground/75 transition-all duration-200 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground before:absolute before:left-0 before:top-1/2 before:h-0 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-sidebar-primary before:transition-all before:duration-200"
                      activeClassName="bg-sidebar-accent font-medium !text-sidebar-accent-foreground [&_svg]:text-sidebar-primary before:h-5"
                    >
                      <item.icon className="mr-2 h-4 w-4 shrink-0 transition-colors duration-200" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        {!collapsed && (
          <div className="mb-1 flex items-center gap-2.5 px-2 py-1.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/15 text-xs font-semibold text-sidebar-primary ring-1 ring-sidebar-primary/30">
              {(user?.email ?? "?").charAt(0).toUpperCase()}
            </div>
            <p className="min-w-0 truncate text-xs text-sidebar-foreground/70">{user?.email}</p>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-full justify-start rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
        >
          {theme === "dark" ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
          {!collapsed && (theme === "dark" ? "Tema claro" : "Tema escuro")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4 mr-2" />
          {!collapsed && "Terminar sessão"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
});

AppSidebar.displayName = "AppSidebar";
