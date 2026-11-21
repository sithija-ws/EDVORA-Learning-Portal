// types/database.ts
// Supabase database types for Edvora.
//
// In a production project, these would be auto-generated via:
//   npx supabase gen types typescript --project-id <ref> > types/database.ts
//
// For now, these are manually maintained to match the schema in
// docs/ARCHITECTURE.md. Run the generation command after the Supabase
// project is configured to keep them in sync.

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
          name: string;
          year: number;
          description: string | null;
          is_archived: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          year: number;
          description?: string | null;
          is_archived?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          year?: number;
          description?: string | null;
          is_archived?: boolean;
          created_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: "teacher" | "student";
          batch_id: string | null;
          is_active: boolean;
          phone: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          role: "teacher" | "student";
          batch_id?: string | null;
          is_active?: boolean;
          phone?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          role?: "teacher" | "student";
          batch_id?: string | null;
          is_active?: boolean;
          phone?: string | null;
          created_at?: string;
        };
      };
      lessons: {
        Row: {
          id: string;
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
          title?: string;
          description?: string | null;
          youtube_id?: string;
          thumbnail_url?: string | null;
          sort_order?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      lesson_batches: {
        Row: {
          lesson_id: string;
          batch_id: string;
        };
        Insert: {
          lesson_id: string;
          batch_id: string;
        };
        Update: {
          lesson_id?: string;
          batch_id?: string;
        };
      };
      announcements: {
        Row: {
          id: string;
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
          title?: string;
          body?: string;
          is_broadcast?: boolean;
          is_pinned?: boolean;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      announcement_batches: {
        Row: {
          announcement_id: string;
          batch_id: string;
        };
        Insert: {
          announcement_id: string;
          batch_id: string;
        };
        Update: {
          announcement_id?: string;
          batch_id?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_my_role: {
        Args: Record<string, never>;
        Returns: string;
      };
      get_my_batch_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      is_teacher: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
  };
}
