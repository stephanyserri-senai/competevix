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
      allocations: {
        Row: {
          id: string;
          program_id: string;
          team_id: string | null;
          person_id: string;
          base_weekly_minutes: number;
          percent: number;
          planned_weekly_minutes: number | null;
          valid_from: string;
          valid_to: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          program_id: string;
          team_id?: string | null;
          person_id: string;
          base_weekly_minutes: number;
          percent?: number;
          planned_weekly_minutes?: number | null;
          valid_from: string;
          valid_to?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          program_id?: string;
          team_id?: string | null;
          person_id?: string;
          base_weekly_minutes?: number;
          percent?: number;
          planned_weekly_minutes?: number | null;
          valid_from?: string;
          valid_to?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "allocations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "allocations_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "allocations_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "allocations_team_fk";
            columns: ["team_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id", "program_id"];
          },
        ];
      };
      assessment_errors: {
        Row: {
          id: string;
          assessment_id: string;
          program_id: string;
          competency_id: string | null;
          description: string;
          root_cause: string | null;
          corrective_action: string | null;
          owner_person_id: string | null;
          due_date: string | null;
          status: Database["public"]["Enums"]["error_action_status"];
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          assessment_id: string;
          program_id: string;
          competency_id?: string | null;
          description: string;
          root_cause?: string | null;
          corrective_action?: string | null;
          owner_person_id?: string | null;
          due_date?: string | null;
          status?: Database["public"]["Enums"]["error_action_status"];
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          assessment_id?: string;
          program_id?: string;
          competency_id?: string | null;
          description?: string;
          root_cause?: string | null;
          corrective_action?: string | null;
          owner_person_id?: string | null;
          due_date?: string | null;
          status?: Database["public"]["Enums"]["error_action_status"];
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "assessment_errors_competency_fk";
            columns: ["competency_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "competencies";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "assessment_errors_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assessment_errors_fk";
            columns: ["assessment_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "assessments";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "assessment_errors_owner_person_id_fkey";
            columns: ["owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
        ];
      };
      assessment_results: {
        Row: {
          id: string;
          assessment_id: string;
          program_id: string;
          person_id: string | null;
          criterion: string | null;
          score: number;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          assessment_id: string;
          program_id: string;
          person_id?: string | null;
          criterion?: string | null;
          score: number;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          assessment_id?: string;
          program_id?: string;
          person_id?: string | null;
          criterion?: string | null;
          score?: number;
          created_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "assessment_results_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assessment_results_fk";
            columns: ["assessment_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "assessments";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "assessment_results_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
        ];
      };
      assessments: {
        Row: {
          id: string;
          program_id: string;
          team_id: string;
          occupation_id: string | null;
          type: Database["public"]["Enums"]["assessment_type"];
          title: string;
          test_version: string | null;
          criteria_version: string | null;
          held_on: string;
          scale: Database["public"]["Enums"]["score_scale"];
          scale_max: number;
          planned_minutes: number | null;
          actual_minutes: number | null;
          status: Database["public"]["Enums"]["assessment_status"];
          review_note: string | null;
          published_at: string | null;
          published_by: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          program_id: string;
          team_id: string;
          occupation_id?: string | null;
          type: Database["public"]["Enums"]["assessment_type"];
          title: string;
          test_version?: string | null;
          criteria_version?: string | null;
          held_on: string;
          scale: Database["public"]["Enums"]["score_scale"];
          scale_max: number;
          planned_minutes?: number | null;
          actual_minutes?: number | null;
          status?: Database["public"]["Enums"]["assessment_status"];
          review_note?: string | null;
          published_at?: string | null;
          published_by?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          program_id?: string;
          team_id?: string;
          occupation_id?: string | null;
          type?: Database["public"]["Enums"]["assessment_type"];
          title?: string;
          test_version?: string | null;
          criteria_version?: string | null;
          held_on?: string;
          scale?: Database["public"]["Enums"]["score_scale"];
          scale_max?: number;
          planned_minutes?: number | null;
          actual_minutes?: number | null;
          status?: Database["public"]["Enums"]["assessment_status"];
          review_note?: string | null;
          published_at?: string | null;
          published_by?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "assessments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assessments_occupation_fk";
            columns: ["occupation_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "occupations";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "assessments_published_by_fkey";
            columns: ["published_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assessments_team_fk";
            columns: ["team_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id", "program_id"];
          },
        ];
      };
      attendance: {
        Row: {
          session_id: string;
          program_id: string;
          person_id: string;
          status: Database["public"]["Enums"]["attendance_status"];
          attended_minutes: number;
          justification: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          session_id: string;
          program_id: string;
          person_id: string;
          status: Database["public"]["Enums"]["attendance_status"];
          attended_minutes: number;
          justification?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          session_id?: string;
          program_id?: string;
          person_id?: string;
          status?: Database["public"]["Enums"]["attendance_status"];
          attended_minutes?: number;
          justification?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_session_fk";
            columns: ["session_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "training_sessions";
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
      competencies: {
        Row: {
          id: string;
          program_id: string;
          occupation_id: string;
          name: string;
          weight: number | null;
          weight_source: string | null;
          position: number;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          program_id: string;
          occupation_id: string;
          name: string;
          weight?: number | null;
          weight_source?: string | null;
          position?: number;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          program_id?: string;
          occupation_id?: string;
          name?: string;
          weight?: number | null;
          weight_source?: string | null;
          position?: number;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "competencies_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "competencies_occupation_fk";
            columns: ["occupation_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "occupations";
            referencedColumns: ["id", "program_id"];
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
          target_scale: Database["public"]["Enums"]["score_scale"];
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
          target_scale?: Database["public"]["Enums"]["score_scale"];
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
          target_scale?: Database["public"]["Enums"]["score_scale"];
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
      panel_assignments: {
        Row: {
          id: string;
          panel_id: string;
          program_id: string;
          evaluator_id: string;
          status: Database["public"]["Enums"]["assignment_status"];
          submitted_at: string | null;
          general_comment: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          panel_id: string;
          program_id: string;
          evaluator_id: string;
          status?: Database["public"]["Enums"]["assignment_status"];
          submitted_at?: string | null;
          general_comment?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          panel_id?: string;
          program_id?: string;
          evaluator_id?: string;
          status?: Database["public"]["Enums"]["assignment_status"];
          submitted_at?: string | null;
          general_comment?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "panel_assignments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "panel_assignments_evaluator_id_fkey";
            columns: ["evaluator_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "panel_assignments_panel_fk";
            columns: ["panel_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "panels";
            referencedColumns: ["id", "program_id"];
          },
        ];
      };
      panel_scores: {
        Row: {
          assignment_id: string;
          program_id: string;
          criterion_id: string;
          score: number;
          comment: string | null;
          updated_at: string;
        };
        Insert: {
          assignment_id: string;
          program_id: string;
          criterion_id: string;
          score: number;
          comment?: string | null;
          updated_at?: string;
        };
        Update: {
          assignment_id?: string;
          program_id?: string;
          criterion_id?: string;
          score?: number;
          comment?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "panel_scores_assignment_fk";
            columns: ["assignment_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "panel_assignments";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "panel_scores_criterion_id_fkey";
            columns: ["criterion_id"];
            isOneToOne: false;
            referencedRelation: "rubric_criteria";
            referencedColumns: ["id"];
          },
        ];
      };
      panels: {
        Row: {
          id: string;
          program_id: string;
          project_id: string;
          rubric_version_id: string;
          title: string;
          held_on: string;
          version: number;
          supersedes_id: string | null;
          revision_note: string | null;
          status: Database["public"]["Enums"]["panel_status"];
          published_at: string | null;
          published_by: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          program_id: string;
          project_id: string;
          rubric_version_id: string;
          title: string;
          held_on: string;
          version?: number;
          supersedes_id?: string | null;
          revision_note?: string | null;
          status?: Database["public"]["Enums"]["panel_status"];
          published_at?: string | null;
          published_by?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          program_id?: string;
          project_id?: string;
          rubric_version_id?: string;
          title?: string;
          held_on?: string;
          version?: number;
          supersedes_id?: string | null;
          revision_note?: string | null;
          status?: Database["public"]["Enums"]["panel_status"];
          published_at?: string | null;
          published_by?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "panels_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "panels_project_fk";
            columns: ["project_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "panels_published_by_fkey";
            columns: ["published_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "panels_rubric_version_id_fkey";
            columns: ["rubric_version_id"];
            isOneToOne: false;
            referencedRelation: "rubric_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "panels_supersedes_fk";
            columns: ["supersedes_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "panels";
            referencedColumns: ["id", "program_id"];
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
      project_evidences: {
        Row: {
          id: string;
          project_id: string;
          program_id: string;
          stage: Database["public"]["Enums"]["project_stage"];
          kind: Database["public"]["Enums"]["project_evidence_kind"];
          description: string;
          document_id: string | null;
          url: string | null;
          created_at: string;
          created_by: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          program_id: string;
          stage: Database["public"]["Enums"]["project_stage"];
          kind: Database["public"]["Enums"]["project_evidence_kind"];
          description: string;
          document_id?: string | null;
          url?: string | null;
          created_at?: string;
          created_by?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          program_id?: string;
          stage?: Database["public"]["Enums"]["project_stage"];
          kind?: Database["public"]["Enums"]["project_evidence_kind"];
          description?: string;
          document_id?: string | null;
          url?: string | null;
          created_at?: string;
          created_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_evidences_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_evidences_document_fk";
            columns: ["document_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "project_evidences_project_fk";
            columns: ["project_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "program_id"];
          },
        ];
      };
      project_stage_history: {
        Row: {
          id: number;
          project_id: string;
          program_id: string;
          from_stage: Database["public"]["Enums"]["project_stage"];
          to_stage: Database["public"]["Enums"]["project_stage"];
          note: string | null;
          reviewer: string;
          evidence_count: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          project_id: string;
          program_id: string;
          from_stage: Database["public"]["Enums"]["project_stage"];
          to_stage: Database["public"]["Enums"]["project_stage"];
          note?: string | null;
          reviewer: string;
          evidence_count: number;
          created_at?: string;
        };
        Update: {
          id?: number;
          project_id?: string;
          program_id?: string;
          from_stage?: Database["public"]["Enums"]["project_stage"];
          to_stage?: Database["public"]["Enums"]["project_stage"];
          note?: string | null;
          reviewer?: string;
          evidence_count?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_stage_history_fk";
            columns: ["project_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "project_stage_history_reviewer_fkey";
            columns: ["reviewer"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          id: string;
          program_id: string;
          team_id: string;
          title: string;
          problem: string | null;
          solution: string | null;
          partner_company: string | null;
          value_proposition: string | null;
          differential: string | null;
          business_model: string | null;
          stage: Database["public"]["Enums"]["project_stage"];
          stage_changed_at: string;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          program_id: string;
          team_id: string;
          title: string;
          problem?: string | null;
          solution?: string | null;
          partner_company?: string | null;
          value_proposition?: string | null;
          differential?: string | null;
          business_model?: string | null;
          stage?: Database["public"]["Enums"]["project_stage"];
          stage_changed_at?: string;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          program_id?: string;
          team_id?: string;
          title?: string;
          problem?: string | null;
          solution?: string | null;
          partner_company?: string | null;
          value_proposition?: string | null;
          differential?: string | null;
          business_model?: string | null;
          stage?: Database["public"]["Enums"]["project_stage"];
          stage_changed_at?: string;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_team_fk";
            columns: ["team_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id", "program_id"];
          },
        ];
      };
      rubric_criteria: {
        Row: {
          id: string;
          version_id: string;
          parent_id: string | null;
          code: string;
          name: string;
          description: string | null;
          max_score: number;
          position: number;
        };
        Insert: {
          id?: string;
          version_id: string;
          parent_id?: string | null;
          code: string;
          name: string;
          description?: string | null;
          max_score: number;
          position?: number;
        };
        Update: {
          id?: string;
          version_id?: string;
          parent_id?: string | null;
          code?: string;
          name?: string;
          description?: string | null;
          max_score?: number;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "rubric_criteria_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "rubric_criteria";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rubric_criteria_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "rubric_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      rubric_versions: {
        Row: {
          id: string;
          rubric_id: string;
          version: number;
          status: Database["public"]["Enums"]["rubric_status"];
          settings: Json;
          notes: string | null;
          published_at: string | null;
          published_by: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          rubric_id: string;
          version: number;
          status?: Database["public"]["Enums"]["rubric_status"];
          settings?: Json;
          notes?: string | null;
          published_at?: string | null;
          published_by?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          rubric_id?: string;
          version?: number;
          status?: Database["public"]["Enums"]["rubric_status"];
          settings?: Json;
          notes?: string | null;
          published_at?: string | null;
          published_by?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "rubric_versions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rubric_versions_published_by_fkey";
            columns: ["published_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rubric_versions_rubric_id_fkey";
            columns: ["rubric_id"];
            isOneToOne: false;
            referencedRelation: "rubrics";
            referencedColumns: ["id"];
          },
        ];
      };
      rubrics: {
        Row: {
          id: string;
          competition_id: string;
          name: string;
          description: string | null;
          official: boolean;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          competition_id: string;
          name: string;
          description?: string | null;
          official?: boolean;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          competition_id?: string;
          name?: string;
          description?: string | null;
          official?: boolean;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "rubrics_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rubrics_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      score_targets: {
        Row: {
          id: string;
          program_id: string;
          occupation_id: string;
          month: string;
          target: number;
          scale: Database["public"]["Enums"]["score_scale"];
          status: Database["public"]["Enums"]["target_status"];
          source: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          program_id: string;
          occupation_id: string;
          month: string;
          target: number;
          scale?: Database["public"]["Enums"]["score_scale"];
          status?: Database["public"]["Enums"]["target_status"];
          source: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          program_id?: string;
          occupation_id?: string;
          month?: string;
          target?: number;
          scale?: Database["public"]["Enums"]["score_scale"];
          status?: Database["public"]["Enums"]["target_status"];
          source?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "score_targets_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "score_targets_occupation_fk";
            columns: ["occupation_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "occupations";
            referencedColumns: ["id", "program_id"];
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
      training_items: {
        Row: {
          id: string;
          plan_id: string;
          program_id: string;
          competency_id: string | null;
          objective: string;
          activity: string;
          planned_minutes: number;
          responsible_person_id: string | null;
          resource: string | null;
          expected_evidence: string | null;
          acceptance_criteria: string | null;
          due_date: string;
          status: Database["public"]["Enums"]["training_item_status"];
          status_note: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          plan_id: string;
          program_id: string;
          competency_id?: string | null;
          objective: string;
          activity: string;
          planned_minutes: number;
          responsible_person_id?: string | null;
          resource?: string | null;
          expected_evidence?: string | null;
          acceptance_criteria?: string | null;
          due_date: string;
          status?: Database["public"]["Enums"]["training_item_status"];
          status_note?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          plan_id?: string;
          program_id?: string;
          competency_id?: string | null;
          objective?: string;
          activity?: string;
          planned_minutes?: number;
          responsible_person_id?: string | null;
          resource?: string | null;
          expected_evidence?: string | null;
          acceptance_criteria?: string | null;
          due_date?: string;
          status?: Database["public"]["Enums"]["training_item_status"];
          status_note?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "training_items_competency_fk";
            columns: ["competency_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "competencies";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "training_items_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_items_plan_fk";
            columns: ["plan_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "training_plans";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "training_items_responsible_person_id_fkey";
            columns: ["responsible_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
        ];
      };
      training_plans: {
        Row: {
          id: string;
          program_id: string;
          team_id: string;
          family_id: string;
          version: number;
          title: string;
          period_start: string;
          period_end: string;
          status: Database["public"]["Enums"]["training_plan_status"];
          change_note: string | null;
          published_at: string | null;
          published_by: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          program_id: string;
          team_id: string;
          family_id?: string;
          version?: number;
          title: string;
          period_start: string;
          period_end: string;
          status?: Database["public"]["Enums"]["training_plan_status"];
          change_note?: string | null;
          published_at?: string | null;
          published_by?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          program_id?: string;
          team_id?: string;
          family_id?: string;
          version?: number;
          title?: string;
          period_start?: string;
          period_end?: string;
          status?: Database["public"]["Enums"]["training_plan_status"];
          change_note?: string | null;
          published_at?: string | null;
          published_by?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "training_plans_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_plans_published_by_fkey";
            columns: ["published_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_plans_team_fk";
            columns: ["team_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id", "program_id"];
          },
        ];
      };
      training_sessions: {
        Row: {
          id: string;
          program_id: string;
          team_id: string;
          training_item_id: string | null;
          competency_id: string | null;
          starts_at: string;
          ends_at: string;
          actual_minutes: number;
          location: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          program_id: string;
          team_id: string;
          training_item_id?: string | null;
          competency_id?: string | null;
          starts_at: string;
          ends_at: string;
          actual_minutes: number;
          location?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          program_id?: string;
          team_id?: string;
          training_item_id?: string | null;
          competency_id?: string | null;
          starts_at?: string;
          ends_at?: string;
          actual_minutes?: number;
          location?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "training_sessions_competency_fk";
            columns: ["competency_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "competencies";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "training_sessions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_sessions_item_fk";
            columns: ["training_item_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "training_items";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "training_sessions_team_fk";
            columns: ["team_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id", "program_id"];
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
      weekly_reports: {
        Row: {
          id: string;
          program_id: string;
          team_id: string;
          week_start: string;
          version: number;
          supersedes_id: string | null;
          planned_minutes: number;
          actual_minutes: number;
          outcomes: string | null;
          blockers: string | null;
          intervention: string | null;
          next_steps: string | null;
          status: Database["public"]["Enums"]["weekly_report_status"];
          submitted_at: string | null;
          submitted_by: string | null;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          program_id: string;
          team_id: string;
          week_start: string;
          version?: number;
          supersedes_id?: string | null;
          planned_minutes?: number;
          actual_minutes?: number;
          outcomes?: string | null;
          blockers?: string | null;
          intervention?: string | null;
          next_steps?: string | null;
          status?: Database["public"]["Enums"]["weekly_report_status"];
          submitted_at?: string | null;
          submitted_by?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          program_id?: string;
          team_id?: string;
          week_start?: string;
          version?: number;
          supersedes_id?: string | null;
          planned_minutes?: number;
          actual_minutes?: number;
          outcomes?: string | null;
          blockers?: string | null;
          intervention?: string | null;
          next_steps?: string | null;
          status?: Database["public"]["Enums"]["weekly_report_status"];
          submitted_at?: string | null;
          submitted_by?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "weekly_reports_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "weekly_reports_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "weekly_reports_submitted_by_fkey";
            columns: ["submitted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "weekly_reports_supersedes_fk";
            columns: ["supersedes_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "weekly_reports";
            referencedColumns: ["id", "program_id"];
          },
          {
            foreignKeyName: "weekly_reports_team_fk";
            columns: ["team_id", "program_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id", "program_id"];
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
      advance_project_stage: {
        Args: { p_project: string; p_to: Database["public"]["Enums"]["project_stage"]; p_note?: string };
        Returns: Database["public"]["Tables"]["projects"]["Row"];
      };
      complete_checklist_run: {
        Args: { p_run: string };
        Returns: Database["public"]["Tables"]["checklist_runs"]["Row"];
      };
      correct_weekly_report: {
        Args: { p_report: string };
        Returns: Database["public"]["Tables"]["weekly_reports"]["Row"];
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
      new_rubric_version: {
        Args: { p_version: string };
        Returns: Database["public"]["Tables"]["rubric_versions"]["Row"];
      };
      new_training_plan_version: {
        Args: { p_plan: string; p_note: string };
        Returns: Database["public"]["Tables"]["training_plans"]["Row"];
      };
      publish_assessment: {
        Args: { p_assessment: string };
        Returns: Database["public"]["Tables"]["assessments"]["Row"];
      };
      publish_checklist_template: {
        Args: { p_template: string };
        Returns: Database["public"]["Tables"]["checklist_templates"]["Row"];
      };
      publish_panel: {
        Args: { p_panel: string };
        Returns: Database["public"]["Tables"]["panels"]["Row"];
      };
      publish_rubric_version: {
        Args: { p_version: string };
        Returns: Database["public"]["Tables"]["rubric_versions"]["Row"];
      };
      publish_training_plan: {
        Args: { p_plan: string };
        Returns: Database["public"]["Tables"]["training_plans"]["Row"];
      };
      refresh_alerts: {
        Args: never;
        Returns: { created: number; resolved: number }[];
      };
      refresh_alerts_ws: {
        Args: never;
        Returns: { created: number; resolved: number }[];
      };
      revise_panel: {
        Args: { p_panel: string; p_note: string };
        Returns: Database["public"]["Tables"]["panels"]["Row"];
      };
      set_action_status: {
        Args: { p_action: string; p_status: Database["public"]["Enums"]["action_status"]; p_note?: string };
        Returns: Database["public"]["Tables"]["actions"]["Row"];
      };
      set_weekly_report_status: {
        Args: { p_report: string; p_status: Database["public"]["Enums"]["weekly_report_status"]; p_note?: string };
        Returns: Database["public"]["Tables"]["weekly_reports"]["Row"];
      };
      submit_panel_evaluation: {
        Args: { p_assignment: string; p_comment?: string };
        Returns: Database["public"]["Tables"]["panel_assignments"]["Row"];
      };
    };
    Enums: {
      action_history_kind: "criada" | "status" | "edicao" | "comentario" | "evidencia" | "dependencia";
      action_priority: "baixa" | "media" | "alta" | "critica";
      action_status: "aberta" | "em_andamento" | "bloqueada" | "concluida" | "cancelada";
      assessment_status: "rascunho" | "publicado";
      assessment_type: "parcial" | "completo" | "externo" | "diagnostico";
      assignment_status: "pendente" | "submetida";
      attendance_status: "presente" | "parcial" | "ausente" | "justificada";
      checklist_answer_value: "sim" | "nao" | "na";
      checklist_cadence: "semanal" | "mensal" | "avulsa";
      checklist_run_status: "aberto" | "concluido";
      checklist_scope: "programa" | "equipe";
      checklist_template_status: "rascunho" | "publicado" | "substituido";
      competition_kind: "worldskills" | "inova" | "frc" | "giaffone" | "ekart" | "outra";
      document_classification: "interno" | "restrito" | "confidencial";
      error_action_status: "aberta" | "em_andamento" | "concluida";
      event_exception_kind: "cancelada" | "alterada";
      event_type: "treino" | "reuniao" | "simulado" | "banca" | "visita" | "competicao" | "prazo" | "outro";
      membership_role: "supervisao" | "orientador" | "competidor" | "gestao" | "avaliador" | "napi";
      panel_status: "planejada" | "publicada" | "substituida";
      person_kind: "aluno" | "docente" | "colaborador" | "externo";
      program_status: "planejamento" | "ativo" | "encerrado";
      project_evidence_kind: "comparacao_mercado" | "diferencial_tecnico" | "validacao_industrial" | "teste_produtividade_custo_qualidade" | "viabilidade_financeira" | "modelo_negocio" | "anterioridade" | "prototipo_funcional" | "outro";
      project_stage: "prospeccao" | "selecao" | "anterioridade" | "validacao_problema" | "prototipo" | "validacao_tecnica_financeira" | "banca_pitch" | "prioritario";
      recurrence_freq: "diaria" | "semanal" | "mensal";
      rubric_status: "rascunho" | "publicada" | "substituida";
      score_scale: "worldskills" | "percentual" | "pontos_brutos";
      target_status: "proposta" | "aprovada";
      team_member_role: "competidor" | "suplente" | "orientador_titular" | "orientador_reserva";
      training_item_status: "previsto" | "concluido" | "cancelado";
      training_plan_status: "rascunho" | "publicado" | "substituido";
      weekly_report_status: "rascunho" | "enviado" | "em_revisao" | "aprovado" | "devolvido";
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
      assessment_status: ["rascunho", "publicado"],
      assessment_type: ["parcial", "completo", "externo", "diagnostico"],
      assignment_status: ["pendente", "submetida"],
      attendance_status: ["presente", "parcial", "ausente", "justificada"],
      checklist_answer_value: ["sim", "nao", "na"],
      checklist_cadence: ["semanal", "mensal", "avulsa"],
      checklist_run_status: ["aberto", "concluido"],
      checklist_scope: ["programa", "equipe"],
      checklist_template_status: ["rascunho", "publicado", "substituido"],
      competition_kind: ["worldskills", "inova", "frc", "giaffone", "ekart", "outra"],
      document_classification: ["interno", "restrito", "confidencial"],
      error_action_status: ["aberta", "em_andamento", "concluida"],
      event_exception_kind: ["cancelada", "alterada"],
      event_type: ["treino", "reuniao", "simulado", "banca", "visita", "competicao", "prazo", "outro"],
      membership_role: ["supervisao", "orientador", "competidor", "gestao", "avaliador", "napi"],
      panel_status: ["planejada", "publicada", "substituida"],
      person_kind: ["aluno", "docente", "colaborador", "externo"],
      program_status: ["planejamento", "ativo", "encerrado"],
      project_evidence_kind: ["comparacao_mercado", "diferencial_tecnico", "validacao_industrial", "teste_produtividade_custo_qualidade", "viabilidade_financeira", "modelo_negocio", "anterioridade", "prototipo_funcional", "outro"],
      project_stage: ["prospeccao", "selecao", "anterioridade", "validacao_problema", "prototipo", "validacao_tecnica_financeira", "banca_pitch", "prioritario"],
      recurrence_freq: ["diaria", "semanal", "mensal"],
      rubric_status: ["rascunho", "publicada", "substituida"],
      score_scale: ["worldskills", "percentual", "pontos_brutos"],
      target_status: ["proposta", "aprovada"],
      team_member_role: ["competidor", "suplente", "orientador_titular", "orientador_reserva"],
      training_item_status: ["previsto", "concluido", "cancelado"],
      training_plan_status: ["rascunho", "publicado", "substituido"],
      weekly_report_status: ["rascunho", "enviado", "em_revisao", "aprovado", "devolvido"],
    },
  },
} as const;
