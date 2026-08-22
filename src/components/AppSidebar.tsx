import { LayoutDashboard, Users, FolderOpen, Building2, LogOut, Sun, Moon, ShieldCheck, FileText } from "lucide-react";
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

const staffItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, end: true },
  { title: "Clientes", url: "/clientes", icon: Users },
  { title: "Dossiers", url: "/dossiers", icon: FolderOpen },
];

const adminItems = [
  { title: "Empresa", url: "/empresa", icon: Building2 },
  { title: "Utilizadores", url: "/utilizadores", icon: ShieldCheck },
];

const clientItems = [
  { title: "Os meus relatórios", url: "/portal", icon: FileText },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { isAdmin, isCliente, signOut, user } = useAuth();
  const { theme, setTheme } = useTheme();

  const items = isCliente ? clientItems : [...staffItems, ...(isAdmin ? adminItems : [])];

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-primary font-bold text-lg px-4 py-3">
            {!collapsed && "🛡️ CyberDossier"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={"end" in item ? (item as any).end : undefined}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-2">
        {!collapsed && (
          <p className="text-xs text-sidebar-foreground/60 px-2 mb-1 truncate">
            {user?.email}
          </p>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {theme === "dark" ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
          {!collapsed && (theme === "dark" ? "Tema claro" : "Tema escuro")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <LogOut className="h-4 w-4 mr-2" />
          {!collapsed && "Terminar sessão"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
