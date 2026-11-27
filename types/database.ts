// types/database.ts
// Supabase database types for Edvora.
//
// In a production project, these would be auto-generated via:
//   npx supabase gen types typescript --project-id <ref> > types/database.ts
//
// Manually maintained to match migrations 00001 through 00005.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      batches: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          year: number;
          description: string | null;
          is_archived: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          year: number;
          description?: string | null;
          is_archived?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          year?: number;
          description?: string | null;
          is_archived?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "batches_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          }
        ];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: "teacher" | "student";
          is_active: boolean;
          phone: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          role: "teacher" | "student";
          is_active?: boolean;
          phone?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          role?: "teacher" | "student";
          is_active?: boolean;
          phone?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      enrollments: {
        Row: {
          tenant_id: string;
          student_id: string;
          batch_id: string;
          created_at: string;
        };
        Insert: {
          tenant_id: string;
          student_id: string;
          batch_id: string;
          created_at?: string;
        };
        Update: {
          tenant_id?: string;
          student_id?: string;
          batch_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "enrollments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          }
        ];
      };
      lessons: {
        Row: {
          id: string;
          tenant_id: string;
          title: string;
          description: string | null;
          youtube_id: string;
          thumbnail_url: string | null;
          sort_order: number;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          title: string;
          description?: string | null;
          youtube_id: string;
          thumbnail_url?: string | null;
          sort_order?: number;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          title?: string;
          description?: string | null;
          youtube_id?: string;
          thumbnail_url?: string | null;
          sort_order?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lessons_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          }
        ];
      };
      lesson_batches: {
        Row: {
          tenant_id: string;
          lesson_id: string;
          batch_id: string;
        };
        Insert: {
          tenant_id: string;
          lesson_id: string;
          batch_id: string;
        };
        Update: {
          tenant_id?: string;
          lesson_id?: string;
          batch_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_batches_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          }
        ];
      };
      announcements: {
        Row: {
          id: string;
          tenant_id: string;
          title: string;
          body: string;
          is_broadcast: boolean;
          is_pinned: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          title: string;
          body: string;
          is_broadcast?: boolean;
          is_pinned?: boolean;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          title?: string;
          body?: string;
          is_broadcast?: boolean;
          is_pinned?: boolean;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "announcements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          }
        ];
      };
      announcement_batches: {
        Row: {
          tenant_id: string;
          announcement_id: string;
          batch_id: string;
        };
        Insert: {
          tenant_id: string;
          announcement_id: string;
          batch_id: string;
        };
        Update: {
          tenant_id?: string;
          announcement_id?: string;
          batch_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "announcement_batches_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          }
        ];
      };
      notes: {
        Row: {
          id: string;
          tenant_id: string;
          title: string;
          description: string | null;
          file_url: string;
          file_name: string;
          file_size: number | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          title: string;
          description?: string | null;
          file_url: string;
          file_name: string;
          file_size?: number | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          title?: string;
          description?: string | null;
          file_url?: string;
          file_name?: string;
          file_size?: number | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notes_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          }
        ];
      };
      note_batches: {
        Row: {
          tenant_id: string;
          note_id: string;
          batch_id: string;
        };
        Insert: {
          tenant_id: string;
          note_id: string;
          batch_id: string;
        };
        Update: {
          tenant_id?: string;
          note_id?: string;
          batch_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "note_batches_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          }
        ];
      };
      tenants: {
        Row: {
          id: string;
          name: string;
          slug: string;
          owner_id: string;
          plan: string;
          max_students: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          owner_id: string;
          plan?: string;
          max_students?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          owner_id?: string;
          plan?: string;
          max_students?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenants_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      tenant_members: {
        Row: {
          id: string;
          tenant_id: string;
          user_id: string;
          role: "owner" | "admin" | "instructor" | "assistant";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          user_id: string;
          role?: "owner" | "admin" | "instructor" | "assistant";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          user_id?: string;
          role?: "owner" | "admin" | "instructor" | "assistant";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      student_identities: {
        Row: {
          id: string;
          tenant_id: string;
          student_id: string;
          username: string;
          auth_email: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          student_id: string;
          username: string;
          auth_email: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          student_id?: string;
          username?: string;
          auth_email?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_identities_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_identities_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      subscription_plans: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          price_lkr_monthly: number;
          price_lkr_annual: number | null;
          max_students: number;
          max_storage_bytes: number;
          features: Json;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          description?: string | null;
          price_lkr_monthly: number;
          price_lkr_annual?: number | null;
          max_students: number;
          max_storage_bytes?: number;
          features?: Json;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          description?: string | null;
          price_lkr_monthly?: number;
          price_lkr_annual?: number | null;
          max_students?: number;
          max_storage_bytes?: number;
          features?: Json;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenant_subscriptions: {
        Row: {
          id: string;
          tenant_id: string;
          plan_id: string;
          status: "pending" | "trialing" | "active" | "expired" | "suspended" | "pending_payment";
          billing_cycle: "monthly" | "annual";
          trial_started_at: string | null;
          trial_ends_at: string | null;
          current_period_start: string;
          current_period_end: string;
          cancel_at_period_end: boolean;
          custom_student_limit: number | null;
          custom_storage_limit_bytes: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          plan_id: string;
          status?: "pending" | "trialing" | "active" | "expired" | "suspended" | "pending_payment";
          billing_cycle?: "monthly" | "annual";
          trial_started_at?: string | null;
          trial_ends_at?: string | null;
          current_period_start?: string;
          current_period_end: string;
          cancel_at_period_end?: boolean;
          custom_student_limit?: number | null;
          custom_storage_limit_bytes?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          plan_id?: string;
          status?: "pending" | "trialing" | "active" | "expired" | "suspended" | "pending_payment";
          billing_cycle?: "monthly" | "annual";
          trial_started_at?: string | null;
          trial_ends_at?: string | null;
          current_period_start?: string;
          current_period_end?: string;
          cancel_at_period_end?: boolean;
          custom_student_limit?: number | null;
          custom_storage_limit_bytes?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "subscription_plans";
            referencedColumns: ["id"];
          }
        ];
      };
      subscription_payments: {
        Row: {
          id: string;
          tenant_id: string;
          subscription_id: string;
          plan_id: string;
          amount_lkr: number;
          billing_cycle: "monthly" | "annual";
          payment_method: "bank_transfer" | "online_gateway" | "manual_cash";
          status: "pending" | "verified" | "rejected" | "refunded";
          reference_number: string | null;
          slip_url: string | null;
          submitted_by: string;
          verified_by: string | null;
          verified_at: string | null;
          rejection_reason: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          subscription_id: string;
          plan_id: string;
          amount_lkr: number;
          billing_cycle?: "monthly" | "annual";
          payment_method?: "bank_transfer" | "online_gateway" | "manual_cash";
          status?: "pending" | "verified" | "rejected" | "refunded";
          reference_number?: string | null;
          slip_url?: string | null;
          submitted_by: string;
          verified_by?: string | null;
          verified_at?: string | null;
          rejection_reason?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          subscription_id?: string;
          plan_id?: string;
          amount_lkr?: number;
          billing_cycle?: "monthly" | "annual";
          payment_method?: "bank_transfer" | "online_gateway" | "manual_cash";
          status?: "pending" | "verified" | "rejected" | "refunded";
          reference_number?: string | null;
          slip_url?: string | null;
          submitted_by?: string;
          verified_by?: string | null;
          verified_at?: string | null;
          rejection_reason?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscription_payments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscription_payments_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "tenant_subscriptions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscription_payments_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "subscription_plans";
            referencedColumns: ["id"];
          }
        ];
      };
      teacher_trial_claims: {
        Row: {
          id: string;
          normalized_email_hash: string;
          user_id: string;
          tenant_id: string;
          claimed_at: string;
        };
        Insert: {
          id?: string;
          normalized_email_hash: string;
          user_id: string;
          tenant_id: string;
          claimed_at?: string;
        };
        Update: {
          id?: string;
          normalized_email_hash?: string;
          user_id?: string;
          tenant_id?: string;
          claimed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_trial_claims_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_trial_claims_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          }
        ];
      };
      platform_admins: {
        Row: {
          user_id: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_admins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      subscription_history: {
        Row: {
          id: string;
          tenant_id: string;
          event_type: string;
          old_status: string | null;
          new_status: string | null;
          old_plan_id: string | null;
          new_plan_id: string | null;
          actor_id: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          event_type: string;
          old_status?: string | null;
          new_status?: string | null;
          old_plan_id?: string | null;
          new_plan_id?: string | null;
          actor_id?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          event_type?: string;
          old_status?: string | null;
          new_status?: string | null;
          old_plan_id?: string | null;
          new_plan_id?: string | null;
          actor_id?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscription_history_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          }
        ];
      };
      teacher_applications: {
        Row: {
          id: string;
          user_id: string | null;
          email: string;
          canonical_email: string;
          canonical_email_hash: string;
          full_name: string;
          phone_number: string | null;
          institute_name: string;
          workspace_slug: string;
          status: "pending" | "approved" | "rejected";
          verification_method: string | null;
          verified_phone: string | null;
          review_notes: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          tenant_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          email: string;
          canonical_email: string;
          canonical_email_hash: string;
          full_name: string;
          phone_number?: string | null;
          institute_name: string;
          workspace_slug: string;
          status?: "pending" | "approved" | "rejected";
          verification_method?: string | null;
          verified_phone?: string | null;
          review_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          tenant_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          email?: string;
          canonical_email?: string;
          canonical_email_hash?: string;
          full_name?: string;
          phone_number?: string | null;
          institute_name?: string;
          workspace_slug?: string;
          status?: "pending" | "approved" | "rejected";
          verification_method?: string | null;
          verified_phone?: string | null;
          review_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          tenant_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_applications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_applications_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_applications_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_my_role: {
        Args: Record<string, never>;
        Returns: string;
      };
      is_teacher: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_student: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_enrolled_in_batch: {
        Args: {
          p_batch_id: string;
        };
        Returns: boolean;
      };
      admin_approve_teacher_application: {
        Args: {
          p_application_id: string;
          p_verification_mode: string;
          p_verified_phone: string;
          p_review_notes?: string | null;
        };
        Returns: {
          tenant_id: string;
          workspace_name: string;
          workspace_slug: string;
          trial_started_at: string;
          trial_ends_at: string;
        }[];
      };
      admin_reject_teacher_application: {
        Args: {
          p_application_id: string;
          p_review_notes: string;
        };
        Returns: void;
      };
      provision_tenant_workspace: {
        Args: {
          p_user_id: string;
          p_workspace_name: string;
          p_workspace_slug: string;
          p_canonical_email_hash: string;
        };
        Returns: {
          tenant_id: string;
          name: string;
          slug: string;
          role: string;
          subscription_status: string;
          is_trial: boolean;
          trial_ends_at: string | null;
        }[];
      };
      admin_verify_subscription_payment: {
        Args: {
          p_payment_id: string;
          p_approve: boolean;
          p_rejection_reason?: string | null;
          p_extension_days?: number | null;
        };
        Returns: boolean;
      };
      is_tenant_subscription_active: {
        Args: {
          p_tenant_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
  };
}
