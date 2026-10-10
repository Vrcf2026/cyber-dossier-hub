export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json
          dossier_id: string | null
          entity_id: string | null
          entity_type: string
          id: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          dossier_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          dossier_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_settings: {
        Row: {
          auto_purge_enabled: boolean
          created_at: string
          id: string
          last_purge_at: string | null
          last_purge_deleted: number | null
          retention_months: number
          updated_at: string
        }
        Insert: {
          auto_purge_enabled?: boolean
          created_at?: string
          id?: string
          last_purge_at?: string | null
          last_purge_deleted?: number | null
          retention_months?: number
          updated_at?: string
        }
        Update: {
          auto_purge_enabled?: boolean
          created_at?: string
          id?: string
          last_purge_at?: string | null
          last_purge_deleted?: number | null
          retention_months?: number
          updated_at?: string
        }
        Relationships: []
      }
      backup_settings: {
        Row: {
          created_at: string
          drive_folder_id: string | null
          enabled: boolean
          id: string
          last_backup_at: string | null
          last_backup_error: string | null
          last_backup_status: string | null
          retention_weeks: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          drive_folder_id?: string | null
          enabled?: boolean
          id?: string
          last_backup_at?: string | null
          last_backup_error?: string | null
          last_backup_status?: string | null
          retention_weeks?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          drive_folder_id?: string | null
          enabled?: boolean
          id?: string
          last_backup_at?: string | null
          last_backup_error?: string | null
          last_backup_status?: string | null
          retention_weeks?: number
          updated_at?: string
        }
        Relationships: []
      }
      client_evidences: {
        Row: {
          client_id: string
          created_at: string
          dossier_id: string | null
          evidence_date: string
          evidence_type: Database["public"]["Enums"]["evidence_type"]
          external_id: string | null
          file_name: string | null
          file_path: string | null
          id: string
          notes: string | null
          performed_by: string | null
          result: Database["public"]["Enums"]["evidence_result"]
          source: string | null
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          dossier_id?: string | null
          evidence_date?: string
          evidence_type: Database["public"]["Enums"]["evidence_type"]
          external_id?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          result?: Database["public"]["Enums"]["evidence_result"]
          source?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          dossier_id?: string | null
          evidence_date?: string
          evidence_type?: Database["public"]["Enums"]["evidence_type"]
          external_id?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          result?: Database["public"]["Enums"]["evidence_result"]
          source?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_evidences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_evidences_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      client_staff: {
        Row: {
          active: boolean
          client_id: string
          confidentiality_signed_at: string | null
          created_at: string
          email: string | null
          id: string
          job_role: string | null
          last_training_at: string | null
          left_at: string | null
          name: string
          notes: string | null
          policy_ack_signed_at: string | null
          screening_checked: boolean
          start_date: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          client_id: string
          confidentiality_signed_at?: string | null
          created_at?: string
          email?: string | null
          id?: string
          job_role?: string | null
          last_training_at?: string | null
          left_at?: string | null
          name: string
          notes?: string | null
          policy_ack_signed_at?: string | null
          screening_checked?: boolean
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          client_id?: string
          confidentiality_signed_at?: string | null
          created_at?: string
          email?: string | null
          id?: string
          job_role?: string | null
          last_training_at?: string | null
          left_at?: string | null
          name?: string
          notes?: string | null
          policy_ack_signed_at?: string | null
          screening_checked?: boolean
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_staff_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tasks: {
        Row: {
          active: boolean
          client_id: string
          created_at: string
          due_limit: string | null
          evidence_type: Database["public"]["Enums"]["evidence_type"]
          frequency: Database["public"]["Enums"]["task_frequency"]
          id: string
          last_done: string | null
          next_due: string
          notes: string | null
          origem: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          client_id: string
          created_at?: string
          due_limit?: string | null
          evidence_type: Database["public"]["Enums"]["evidence_type"]
          frequency: Database["public"]["Enums"]["task_frequency"]
          id?: string
          last_done?: string | null
          next_due: string
          notes?: string | null
          origem?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          client_id?: string
          created_at?: string
          due_limit?: string | null
          evidence_type?: Database["public"]["Enums"]["evidence_type"]
          frequency?: Database["public"]["Enums"]["task_frequency"]
          id?: string
          last_done?: string | null
          next_due?: string
          notes?: string | null
          origem?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          dados_sensiveis: boolean
          email: string | null
          id: string
          name: string
          nif: string | null
          num_employees: string | null
          opcoes_plano: Json
          phone: string | null
          sector: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          dados_sensiveis?: boolean
          email?: string | null
          id?: string
          name: string
          nif?: string | null
          num_employees?: string | null
          opcoes_plano?: Json
          phone?: string | null
          sector?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          dados_sensiveis?: boolean
          email?: string | null
          id?: string
          name?: string
          nif?: string | null
          num_employees?: string | null
          opcoes_plano?: Json
          phone?: string | null
          sector?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          logo_url: string | null
          name: string | null
          nif: string | null
          phone: string | null
          signature_data: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string | null
          nif?: string | null
          phone?: string | null
          signature_data?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string | null
          nif?: string | null
          phone?: string | null
          signature_data?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      dossier_access: {
        Row: {
          created_at: string
          dossier_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dossier_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dossier_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossier_access_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_credentials: {
        Row: {
          dossier_id: string
          entries: Json
          id: string
          updated_at: string
        }
        Insert: {
          dossier_id: string
          entries?: Json
          id?: string
          updated_at?: string
        }
        Update: {
          dossier_id?: string
          entries?: Json
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossier_credentials_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: true
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_facts: {
        Row: {
          category: string
          created_at: string
          data: Json
          dossier_id: string
          id: string
          key: string
          label: string
          source: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          data?: Json
          dossier_id: string
          id?: string
          key: string
          label: string
          source?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          data?: Json
          dossier_id?: string
          id?: string
          key?: string
          label?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossier_facts_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_intake_messages: {
        Row: {
          content: string
          created_at: string
          dossier_id: string
          id: string
          role: string
        }
        Insert: {
          content: string
          created_at?: string
          dossier_id: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          created_at?: string
          dossier_id?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossier_intake_messages_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_sections: {
        Row: {
          ai_generated_content: string | null
          client_visible: boolean
          created_at: string
          data: Json
          dossier_id: string
          id: string
          is_completed: boolean
          section_name: string
          section_number: number
          section_status: string
          updated_at: string
        }
        Insert: {
          ai_generated_content?: string | null
          client_visible?: boolean
          created_at?: string
          data?: Json
          dossier_id: string
          id?: string
          is_completed?: boolean
          section_name: string
          section_number: number
          section_status?: string
          updated_at?: string
        }
        Update: {
          ai_generated_content?: string | null
          client_visible?: boolean
          created_at?: string
          data?: Json
          dossier_id?: string
          id?: string
          is_completed?: boolean
          section_name?: string
          section_number?: number
          section_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossier_sections_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_sections_history: {
        Row: {
          ai_generated_content: string | null
          changed_at: string
          changed_by: string | null
          data: Json | null
          dossier_id: string
          id: string
          is_completed: boolean | null
          section_id: string
          section_name: string
          section_number: number
        }
        Insert: {
          ai_generated_content?: string | null
          changed_at?: string
          changed_by?: string | null
          data?: Json | null
          dossier_id: string
          id?: string
          is_completed?: boolean | null
          section_id: string
          section_name: string
          section_number: number
        }
        Update: {
          ai_generated_content?: string | null
          changed_at?: string
          changed_by?: string | null
          data?: Json | null
          dossier_id?: string
          id?: string
          is_completed?: boolean | null
          section_id?: string
          section_name?: string
          section_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "dossier_sections_history_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "dossier_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      dossiers: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          intake_completed: boolean
          progress: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          intake_completed?: boolean
          progress?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          intake_completed?: boolean
          progress?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossiers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          alert_days_before: number
          alert_on_overdue: boolean
          created_at: string
          daily_digest: boolean
          email_alerts_enabled: boolean
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_days_before?: number
          alert_on_overdue?: boolean
          created_at?: string
          daily_digest?: boolean
          email_alerts_enabled?: boolean
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_days_before?: number
          alert_on_overdue?: boolean
          created_at?: string
          daily_digest?: boolean
          email_alerts_enabled?: boolean
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      phishing_campaigns: {
        Row: {
          bait_type: string | null
          body_html: string
          client_id: string | null
          created_at: string
          created_by: string | null
          dossier_id: string | null
          from_name: string | null
          id: string
          subject: string
          theme: string | null
        }
        Insert: {
          bait_type?: string | null
          body_html: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          dossier_id?: string | null
          from_name?: string | null
          id?: string
          subject: string
          theme?: string | null
        }
        Update: {
          bait_type?: string | null
          body_html?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          dossier_id?: string | null
          from_name?: string | null
          id?: string
          subject?: string
          theme?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phishing_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phishing_campaigns_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      phishing_clicks: {
        Row: {
          clicked_at: string
          id: string
          target_id: string
        }
        Insert: {
          clicked_at?: string
          id?: string
          target_id: string
        }
        Update: {
          clicked_at?: string
          id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phishing_clicks_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "phishing_campaign_results"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "phishing_clicks_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "phishing_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      phishing_targets: {
        Row: {
          campaign_id: string
          created_at: string
          email: string
          id: string
          sent_at: string | null
          token: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          email: string
          id?: string
          sent_at?: string | null
          token?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          email?: string
          id?: string
          sent_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "phishing_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "phishing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          client_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_approved: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_approved?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_approved?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      phishing_campaign_results: {
        Row: {
          attempts: number | null
          campaign_id: string | null
          email: string | null
          first_attempt_at: string | null
          last_attempt_at: string | null
          sent_at: string | null
          target_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phishing_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "phishing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      aplicar_plano_cliente: { Args: { p_client_id: string }; Returns: number }
      can_access_dossier: {
        Args: { _dossier_id: string; _user_id: string }
        Returns: boolean
      }
      cliente_da_conta: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      next_due_from_frequency: {
        Args: {
          base_date: string
          freq: Database["public"]["Enums"]["task_frequency"]
        }
        Returns: string
      }
      plano_cliente: {
        Args: { p_client_id: string }
        Returns: {
          automatico: boolean
          evidence_type: string
          frequency: string
          title: string
        }[]
      }
      purge_audit_logs: { Args: { _force?: boolean }; Returns: number }
      seed_default_client_tasks: {
        Args: { p_client_id: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "user" | "tecnico" | "cliente"
      evidence_result: "ok" | "warning" | "fail" | "pending"
      evidence_type:
        | "backup_check"
        | "restore_test"
        | "patch_update"
        | "log_review"
        | "vuln_scan"
        | "access_review"
        | "phishing_campaign"
        | "ssl_renewal"
        | "dossier_review"
        | "incident"
        | "other"
        | "physical_access_review"
        | "media_disposal"
        | "training_session"
        | "asset_review"
        | "config_review"
        | "supplier_review"
        | "contacts_review"
      task_frequency:
        | "weekly"
        | "biweekly"
        | "monthly"
        | "quarterly"
        | "semiannual"
        | "annual"
        | "once"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "tecnico", "cliente"],
      evidence_result: ["ok", "warning", "fail", "pending"],
      evidence_type: [
        "backup_check",
        "restore_test",
        "patch_update",
        "log_review",
        "vuln_scan",
        "access_review",
        "phishing_campaign",
        "ssl_renewal",
        "dossier_review",
        "incident",
        "other",
        "physical_access_review",
        "media_disposal",
        "training_session",
        "asset_review",
        "config_review",
        "supplier_review",
        "contacts_review",
      ],
      task_frequency: [
        "weekly",
        "biweekly",
        "monthly",
        "quarterly",
        "semiannual",
        "annual",
        "once",
      ],
    },
  },
} as const
