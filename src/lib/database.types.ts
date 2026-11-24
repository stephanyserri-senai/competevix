// ARQUIVO GERADO — não editar à mão. Fonte: supabase/migrations. Regerar: npm run db:types
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      action_dependencies: {
        Row: {
          action_id: string;
          depends_on_id: string;
          program_id: string;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          action_id: string;
          depends_on_id: string;
          program_id: string;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          action_id?: string;
          depends_on_id?: string;
          program_id?: string;
          created_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "action_dependencies_action_fk";
            columns: ["action_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "action_dependencies_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_dependencies_dep_fk";
            columns: ["depends_on_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id", "program_id"];
          },
        ];
      };
      action_evidences: {
        Row: {
          id: string;
          action_id: string;
          program_id: string;
          document_id: string | null;
          url: string | null;
          note: string | null;
          created_at: string;
          created_by: string;
        };
        Insert: {
          id?: string;
          action_id: string;
          program_id: string;
          document_id?: string | null;
          url?: string | null;
          note?: string | null;
          created_at?: string;
          created_by?: string;
        };
        Update: {
          id?: string;
          action_id?: string;
          program_id?: string;
          document_id?: string | null;
          url?: string | null;
          note?: string | null;
          created_at?: string;
          created_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "action_evidences_action_fk";
            columns: ["action_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "action_evidences_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_evidences_document_fk";
            columns: ["document_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id", "program_id"];
          },
        ];
      };
      action_history: {
        Row: {
          id: number;
          action_id: string;
          program_id: string;
          kind: Database["public"]["Enums"]["action_history_kind"];
          from_status: Database["public"]["Enums"]["action_status"] | null;
          to_status: Database["public"]["Enums"]["action_status"] | null;
          note: string | null;
          changes: Json | null;
          actor: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          action_id: string;
          program_id: string;
          kind: Database["public"]["Enums"]["action_history_kind"];
          from_status?: Database["public"]["Enums"]["action_status"] | null;
          to_status?: Database["public"]["Enums"]["action_status"] | null;
          note?: string | null;
          changes?: Json | null;
          actor?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          action_id?: string;
          program_id?: string;
          kind?: Database["public"]["Enums"]["action_history_kind"];
          from_status?: Database["public"]["Enums"]["action_status"] | null;
          to_status?: Database["public"]["Enums"]["action_status"] | null;
          note?: string | null;
          changes?: Json | null;
          actor?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "action_history_action_fk";
            columns: ["action_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "action_history_actor_fkey";
            columns: ["actor"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      actions: {
        Row: {
          id: string;
          program_id: string;
          team_id: string | null;
          title: string;
          description: string | null;
          owner_person_id: string | null;
          due_date: string | null;
          start_date: string | null;
          status: Database["public"]["Enums"]["action_status"];
          priority: Database["public"]["Enums"]["action_priority"];
          requires_evidence: boolean;
          completion_note: string | null;
          blocked_reason: string | null;
          completed_at: string | null;
          completed_by: string | null;
          origin: string | null;
          origin_key: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          program_id: string;
          team_id?: string | null;
          title: string;
          description?: string | null;
          owner_person_id?: string | null;
          due_date?: string | null;
          start_date?: string | null;
          status?: Database["public"]["Enums"]["action_status"];
          priority?: Database["public"]["Enums"]["action_priority"];
          requires_evidence?: boolean;
          completion_note?: string | null;
          blocked_reason?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          origin?: string | null;
          origin_key?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          program_id?: string;
          team_id?: string | null;
          title?: string;
          description?: string | null;
          owner_person_id?: string | null;
          due_date?: string | null;
          start_date?: string | null;
          status?: Database["public"]["Enums"]["action_status"];
          priority?: Database["public"]["Enums"]["action_priority"];
          requires_evidence?: boolean;
          completion_note?: string | null;
          blocked_reason?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          origin?: string | null;
          origin_key?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "actions_completed_by_fkey";
            columns: ["completed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "actions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "actions_owner_person_id_fkey";
            columns: ["owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "actions_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "actions_team_fk";
            columns: ["team_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id", "program_id"];
          },
        ];
      };
      audit_log: {
        Row: {
          id: number;
          occurred_at: string;
          actor: string | null;
          table_name: string;
          record_id: string | null;
          program_id: string | null;
          operation: string;
          changed: Json | null;
        };
        Insert: {
          id?: number;
          occurred_at?: string;
          actor?: string | null;
          table_name: string;
          record_id?: string | null;
          program_id?: string | null;
          operation: string;
          changed?: Json | null;
        };
        Update: {
          id?: number;
          occurred_at?: string;
          actor?: string | null;
          table_name?: string;
          record_id?: string | null;
          program_id?: string | null;
          operation?: string;
          changed?: Json | null;
        };
        Relationships: [
        ];
      };
      checklist_answer_evidences: {
        Row: {
          answer_id: string;
          document_id: string;
          program_id: string;
          created_at: string;
          created_by: string;
        };
        Insert: {
          answer_id: string;
          document_id: string;
          program_id: string;
          created_at?: string;
          created_by?: string;
        };
        Update: {
          answer_id?: string;
          document_id?: string;
          program_id?: string;
          created_at?: string;
          created_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "checklist_answer_evidences_answer_fk";
            columns: ["answer_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "checklist_answers";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "checklist_answer_evidences_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checklist_answer_evidences_document_fk";
            columns: ["document_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id", "program_id"];
          },
        ];
      };
      checklist_answers: {
        Row: {
          id: string;
          run_id: string;
          template_id: string;
          item_id: string;
          program_id: string;
          value: Database["public"]["Enums"]["checklist_answer_value"];
          note: string | null;
          answered_at: string;
          answered_by: string;
        };
        Insert: {
          id?: string;
          run_id: string;
          template_id: string;
          item_id: string;
          program_id: string;
          value: Database["public"]["Enums"]["checklist_answer_value"];
          note?: string | null;
          answered_at?: string;
          answered_by?: string;
        };
        Update: {
          id?: string;
          run_id?: string;
          template_id?: string;
          item_id?: string;
          program_id?: string;
          value?: Database["public"]["Enums"]["checklist_answer_value"];
          note?: string | null;
          answered_at?: string;
          answered_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "checklist_answers_answered_by_fkey";
            columns: ["answered_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checklist_answers_item_fk";
            columns: ["item_id", "template_id"];
            isOneToOne: false;
            referencedRelation: "checklist_items";
            referencedColumns: ["id", "template_id"];
          },
          {
            foreignKeyName: "checklist_answers_program_fk";
            columns: ["run_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "checklist_runs";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "checklist_answers_run_fk";
            columns: ["run_id", "template_id"];
            isOneToOne: false;
            referencedRelation: "checklist_runs";
            referencedColumns: ["id", "template_id"];
          },
        ];
      };
      checklist_items: {
        Row: {
          id: string;
          template_id: string;
          program_id: string;
          position: number;
          label: string;
          guidance: string | null;
          required: boolean;
          requires_evidence: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          program_id: string;
          position: number;
          label: string;
          guidance?: string | null;
          required?: boolean;
          requires_evidence?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          template_id?: string;
          program_id?: string;
          position?: number;
          label?: string;
          guidance?: string | null;
          required?: boolean;
          requires_evidence?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "checklist_items_template_fk";
            columns: ["template_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "checklist_templates";
            referencedColumns: ["id", "program_id"];
          },
        ];
      };
      checklist_runs: {
        Row: {
          id: string;
          template_id: string;
          program_id: string;
          team_id: string | null;
          period_start: string;
          period_end: string;
          status: Database["public"]["Enums"]["checklist_run_status"];
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          template_id: string;
          program_id: string;
          team_id?: string | null;
          period_start: string;
          period_end: string;
          status?: Database["public"]["Enums"]["checklist_run_status"];
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          template_id?: string;
          program_id?: string;
          team_id?: string | null;
          period_start?: string;
          period_end?: string;
          status?: Database["public"]["Enums"]["checklist_run_status"];
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "checklist_runs_completed_by_fkey";
            columns: ["completed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checklist_runs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checklist_runs_team_fk";
            columns: ["team_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "checklist_runs_template_fk";
            columns: ["template_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "checklist_templates";
            referencedColumns: ["id", "program_id"];
          },
        ];
      };
      checklist_templates: {
        Row: {
          id: string;
          program_id: string;
          family_id: string;
          version: number;
          name: string;
          description: string | null;
          cadence: Database["public"]["Enums"]["checklist_cadence"];
          scope: Database["public"]["Enums"]["checklist_scope"];
          status: Database["public"]["Enums"]["checklist_template_status"];
          published_at: string | null;
          published_by: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          program_id: string;
          family_id?: string;
          version?: number;
          name: string;
          description?: string | null;
          cadence: Database["public"]["Enums"]["checklist_cadence"];
          scope: Database["public"]["Enums"]["checklist_scope"];
          status?: Database["public"]["Enums"]["checklist_template_status"];
          published_at?: string | null;
          published_by?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          program_id?: string;
          family_id?: string;
          version?: number;
          name?: string;
          description?: string | null;
          cadence?: Database["public"]["Enums"]["checklist_cadence"];
          scope?: Database["public"]["Enums"]["checklist_scope"];
          status?: Database["public"]["Enums"]["checklist_template_status"];
          published_at?: string | null;
          published_by?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "checklist_templates_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checklist_templates_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checklist_templates_published_by_fkey";
            columns: ["published_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      competitions: {
        Row: {
          id: string;
          code: string;
          name: string;
          kind: Database["public"]["Enums"]["competition_kind"];
          description: string | null;
          active: boolean;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          kind?: Database["public"]["Enums"]["competition_kind"];
          description?: string | null;
          active?: boolean;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          kind?: Database["public"]["Enums"]["competition_kind"];
          description?: string | null;
          active?: boolean;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "competitions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      cycles: {
        Row: {
          id: string;
          code: string;
          name: string;
          start_date: string | null;
          end_date: string | null;
          active: boolean;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          start_date?: string | null;
          end_date?: string | null;
          active?: boolean;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          start_date?: string | null;
          end_date?: string | null;
          active?: boolean;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cycles_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          id: string;
          program_id: string;
          team_id: string | null;
          title: string;
          original_name: string;
          storage_path: string;
          mime_type: string;
          size_bytes: number;
          classification: Database["public"]["Enums"]["document_classification"];
          version: number;
          supersedes_id: string | null;
          uploaded_by: string;
          archived_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          program_id: string;
          team_id?: string | null;
          title: string;
          original_name: string;
          storage_path: string;
          mime_type: string;
          size_bytes: number;
          classification?: Database["public"]["Enums"]["document_classification"];
          version?: number;
          supersedes_id?: string | null;
          uploaded_by?: string;
          archived_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          program_id?: string;
          team_id?: string | null;
          title?: string;
          original_name?: string;
          storage_path?: string;
          mime_type?: string;
          size_bytes?: number;
          classification?: Database["public"]["Enums"]["document_classification"];
          version?: number;
          supersedes_id?: string | null;
          uploaded_by?: string;
          archived_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "documents_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_supersedes_fk";
            columns: ["supersedes_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "documents_team_fk";
            columns: ["team_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      event_exceptions: {
        Row: {
          id: string;
          event_id: string;
          program_id: string;
          occurrence_start: string;
          kind: Database["public"]["Enums"]["event_exception_kind"];
          new_starts_at: string | null;
          new_ends_at: string | null;
          new_title: string | null;
          new_location: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          event_id: string;
          program_id: string;
          occurrence_start: string;
          kind: Database["public"]["Enums"]["event_exception_kind"];
          new_starts_at?: string | null;
          new_ends_at?: string | null;
          new_title?: string | null;
          new_location?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          event_id?: string;
          program_id?: string;
          occurrence_start?: string;
          kind?: Database["public"]["Enums"]["event_exception_kind"];
          new_starts_at?: string | null;
          new_ends_at?: string | null;
          new_title?: string | null;
          new_location?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_exceptions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_exceptions_event_fk";
            columns: ["event_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id", "program_id"];
          },
        ];
      };
      event_participants: {
        Row: {
          event_id: string;
          program_id: string;
          person_id: string;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          event_id: string;
          program_id: string;
          person_id: string;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          event_id?: string;
          program_id?: string;
          person_id?: string;
          created_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_participants_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_participants_event_fk";
            columns: ["event_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "event_participants_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          id: string;
          program_id: string;
          team_id: string | null;
          title: string;
          description: string | null;
          type: Database["public"]["Enums"]["event_type"];
          location: string | null;
          starts_at: string;
          ends_at: string;
          all_day: boolean;
          owner_person_id: string | null;
          recurrence_freq: Database["public"]["Enums"]["recurrence_freq"] | null;
          recurrence_interval: number;
          recurrence_weekdays: number[] | null;
          recurrence_until: string | null;
          recurrence_count: number | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          program_id: string;
          team_id?: string | null;
          title: string;
          description?: string | null;
          type?: Database["public"]["Enums"]["event_type"];
          location?: string | null;
          starts_at: string;
          ends_at: string;
          all_day?: boolean;
          owner_person_id?: string | null;
          recurrence_freq?: Database["public"]["Enums"]["recurrence_freq"] | null;
          recurrence_interval?: number;
          recurrence_weekdays?: number[] | null;
          recurrence_until?: string | null;
          recurrence_count?: number | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          program_id?: string;
          team_id?: string | null;
          title?: string;
          description?: string | null;
          type?: Database["public"]["Enums"]["event_type"];
          location?: string | null;
          starts_at?: string;
          ends_at?: string;
          all_day?: boolean;
          owner_person_id?: string | null;
          recurrence_freq?: Database["public"]["Enums"]["recurrence_freq"] | null;
          recurrence_interval?: number;
          recurrence_weekdays?: number[] | null;
          recurrence_until?: string | null;
          recurrence_count?: number | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_owner_person_id_fkey";
            columns: ["owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_team_fk";
            columns: ["team_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id", "program_id"];
          },
        ];
      };
      memberships: {
        Row: {
          id: string;
          user_id: string;
          program_id: string | null;
          unit_id: string | null;
          role: Database["public"]["Enums"]["membership_role"];
          valid_from: string;
          valid_to: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          program_id?: string | null;
          unit_id?: string | null;
          role: Database["public"]["Enums"]["membership_role"];
          valid_from?: string;
          valid_to?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          program_id?: string | null;
          unit_id?: string | null;
          role?: Database["public"]["Enums"]["membership_role"];
          valid_from?: string;
          valid_to?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_revoked_by_fkey";
            columns: ["revoked_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          program_id: string | null;
          rule: string;
          entity_table: string;
          entity_id: string;
          period_key: string;
          title: string;
          link: string | null;
          dedupe_key: string;
          created_at: string;
          read_at: string | null;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          program_id?: string | null;
          rule: string;
          entity_table: string;
          entity_id: string;
          period_key: string;
          title: string;
          link?: string | null;
          dedupe_key: string;
          created_at?: string;
          read_at?: string | null;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          program_id?: string | null;
          rule?: string;
          entity_table?: string;
          entity_id?: string;
          period_key?: string;
          title?: string;
          link?: string | null;
          dedupe_key?: string;
          created_at?: string;
          read_at?: string | null;
          resolved_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      occupations: {
        Row: {
          id: string;
          program_id: string;
          code: string;
          name: string;
          target_score: number | null;
          target_source: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          program_id: string;
          code: string;
          name: string;
          target_score?: number | null;
          target_source?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          program_id?: string;
          code?: string;
          name?: string;
          target_score?: number | null;
          target_source?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "occupations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "occupations_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      people: {
        Row: {
          id: string;
          unit_id: string;
          full_name: string;
          kind: Database["public"]["Enums"]["person_kind"];
          email: string | null;
          user_id: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          unit_id: string;
          full_name: string;
          kind: Database["public"]["Enums"]["person_kind"];
          email?: string | null;
          user_id?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          unit_id?: string;
          full_name?: string;
          kind?: Database["public"]["Enums"]["person_kind"];
          email?: string | null;
          user_id?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "people_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "people_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "people_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_admins: {
        Row: {
          user_id: string;
          granted_at: string;
          granted_by: string | null;
        };
        Insert: {
          user_id: string;
          granted_at?: string;
          granted_by?: string | null;
        };
        Update: {
          user_id?: string;
          granted_at?: string;
          granted_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "platform_admins_granted_by_fkey";
            columns: ["granted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "platform_admins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          display_name: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      programs: {
        Row: {
          id: string;
          competition_id: string;
          cycle_id: string;
          unit_id: string;
          status: Database["public"]["Enums"]["program_status"];
          settings: Json;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          competition_id: string;
          cycle_id: string;
          unit_id: string;
          status?: Database["public"]["Enums"]["program_status"];
          settings?: Json;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          competition_id?: string;
          cycle_id?: string;
          unit_id?: string;
          status?: Database["public"]["Enums"]["program_status"];
          settings?: Json;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "programs_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "programs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "programs_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "programs_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      stages: {
        Row: {
          id: string;
          program_id: string;
          name: string;
          position: number;
          start_date: string | null;
          end_date: string | null;
          location: string | null;
          notes: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          program_id: string;
          name: string;
          position?: number;
          start_date?: string | null;
          end_date?: string | null;
          location?: string | null;
          notes?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          program_id?: string;
          name?: string;
          position?: number;
          start_date?: string | null;
          end_date?: string | null;
          location?: string | null;
          notes?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stages_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stages_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      team_members: {
        Row: {
          id: string;
          team_id: string;
          program_id: string;
          person_id: string;
          role: Database["public"]["Enums"]["team_member_role"];
          valid_from: string;
          valid_to: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          team_id: string;
          program_id: string;
          person_id: string;
          role: Database["public"]["Enums"]["team_member_role"];
          valid_from?: string;
          valid_to?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          team_id?: string;
          program_id?: string;
          person_id?: string;
          role?: Database["public"]["Enums"]["team_member_role"];
          valid_from?: string;
          valid_to?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "team_members_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_members_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_members_team_fk";
            columns: ["team_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id", "program_id"];
          },
        ];
      };
      teams: {
        Row: {
          id: string;
          program_id: string;
          occupation_id: string | null;
          name: string;
          notes: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          program_id: string;
          occupation_id?: string | null;
          name: string;
          notes?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          program_id?: string;
          occupation_id?: string | null;
          name?: string;
          notes?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "teams_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teams_occupation_fk";
            columns: ["occupation_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "occupations";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "teams_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      units: {
        Row: {
          id: string;
          code: string;
          name: string;
          active: boolean;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          active?: boolean;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          active?: boolean;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "units_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      actions_view: {
        Row: {
          id: string | null;
          program_id: string | null;
          team_id: string | null;
          title: string | null;
          description: string | null;
          owner_person_id: string | null;
          due_date: string | null;
          start_date: string | null;
          status: Database["public"]["Enums"]["action_status"] | null;
          priority: Database["public"]["Enums"]["action_priority"] | null;
          requires_evidence: boolean | null;
          completion_note: string | null;
          blocked_reason: string | null;
          completed_at: string | null;
          completed_by: string | null;
          origin: string | null;
          origin_key: string | null;
          archived_at: string | null;
          created_at: string | null;
          updated_at: string | null;
          created_by: string | null;
          is_overdue: boolean | null;
          days_to_due: number | null;
          evidence_count: number | null;
          open_dependencies: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      admin_list_users: {
        Args: never;
        Returns: { id: string; email: string; display_name: string; active: boolean; is_admin: boolean; created_at: string }[];
      };
      complete_checklist_run: {
        Args: { p_run: string };
        Returns: Database["public"]["Tables"]["checklist_runs"]["Row"];
      };
      link_person_to_user: {
        Args: { p_person: string; p_email: string };
        Returns: string;
      };
      my_access: {
        Args: never;
        Returns: { program_id: string; roles: Database["public"]["Enums"]["membership_role"][]; is_admin: boolean }[];
      };
      new_checklist_version: {
        Args: { p_template: string };
        Returns: Database["public"]["Tables"]["checklist_templates"]["Row"];
      };
      publish_checklist_template: {
        Args: { p_template: string };
        Returns: Database["public"]["Tables"]["checklist_templates"]["Row"];
      };
      refresh_alerts: {
        Args: never;
        Returns: { created: number; resolved: number }[];
      };
      set_action_status: {
        Args: { p_action: string; p_status: Database["public"]["Enums"]["action_status"]; p_note?: string };
        Returns: Database["public"]["Tables"]["actions"]["Row"];
      };
    };
    Enums: {
      action_history_kind: "criada" | "status" | "edicao" | "comentario" | "evidencia" | "dependencia";
      action_priority: "baixa" | "media" | "alta" | "critica";
      action_status: "aberta" | "em_andamento" | "bloqueada" | "concluida" | "cancelada";
      checklist_answer_value: "sim" | "nao" | "na";
      checklist_cadence: "semanal" | "mensal" | "avulsa";
      checklist_run_status: "aberto" | "concluido";
      checklist_scope: "programa" | "equipe";
      checklist_template_status: "rascunho" | "publicado" | "substituido";
      competition_kind: "worldskills" | "inova" | "frc" | "giaffone" | "ekart" | "outra";
      document_classification: "interno" | "restrito" | "confidencial";
      event_exception_kind: "cancelada" | "alterada";
      event_type: "treino" | "reuniao" | "simulado" | "banca" | "visita" | "competicao" | "prazo" | "outro";
      membership_role: "supervisao" | "orientador" | "competidor" | "gestao" | "avaliador" | "napi";
      person_kind: "aluno" | "docente" | "colaborador" | "externo";
      program_status: "planejamento" | "ativo" | "encerrado";
      recurrence_freq: "diaria" | "semanal" | "mensal";
      team_member_role: "competidor" | "suplente" | "orientador_titular" | "orientador_reserva";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];

export const Constants = {
  public: {
    Enums: {
      action_history_kind: ["criada", "status", "edicao", "comentario", "evidencia", "dependencia"],
      action_priority: ["baixa", "media", "alta", "critica"],
      action_status: ["aberta", "em_andamento", "bloqueada", "concluida", "cancelada"],
      checklist_answer_value: ["sim", "nao", "na"],
      checklist_cadence: ["semanal", "mensal", "avulsa"],
      checklist_run_status: ["aberto", "concluido"],
      checklist_scope: ["programa", "equipe"],
      checklist_template_status: ["rascunho", "publicado", "substituido"],
      competition_kind: ["worldskills", "inova", "frc", "giaffone", "ekart", "outra"],
      document_classification: ["interno", "restrito", "confidencial"],
      event_exception_kind: ["cancelada", "alterada"],
      event_type: ["treino", "reuniao", "simulado", "banca", "visita", "competicao", "prazo", "outro"],
      membership_role: ["supervisao", "orientador", "competidor", "gestao", "avaliador", "napi"],
      person_kind: ["aluno", "docente", "colaborador", "externo"],
      program_status: ["planejamento", "ativo", "encerrado"],
      recurrence_freq: ["diaria", "semanal", "mensal"],
      team_member_role: ["competidor", "suplente", "orientador_titular", "orientador_reserva"],
    },
  },
} as const;
