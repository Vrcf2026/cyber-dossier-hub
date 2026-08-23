import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "dossier_view"
  | "dossier_section_view"
  | "dossier_section_update"
  | "dossier_section_generate"
  | "dossier_status_update"
  | "dossier_export"
  | "credentials_view"
  | "portal_view"
  | "portal_export";

export const auditActionLabels: Record<string, string> = {
  dossier_view: "Abriu dossier",
  dossier_section_view: "Abriu secção",
  dossier_section_update: "Alterou secção",
  dossier_section_generate: "Gerou texto com IA",
  dossier_status_update: "Alterou estado do dossier",
  dossier_export: "Exportou documento",
  credentials_view: "Consultou credenciais",
  portal_view: "Consultou relatório (portal)",
  portal_export: "Descarregou relatório (portal)",
};

/**
 * Registo de auditoria. Nunca deve bloquear nem quebrar o fluxo do utilizador.
 */
export async function logAudit(
  action: AuditAction,
  opts: {
    dossierId?: string | null;
    entityType?: string;
    entityId?: string | null;
    details?: Record<string, unknown>;
  } = {}
) {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      user_email: user.email ?? null,
      action,
      entity_type: opts.entityType ?? "dossier",
      entity_id: opts.entityId ?? null,
      dossier_id: opts.dossierId ?? null,
      details: (opts.details ?? {}) as never,
    });
  } catch {
    // silencioso por design
  }
}
