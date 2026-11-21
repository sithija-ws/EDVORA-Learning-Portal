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
        Relationships: [];
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
          student_id: string;
          batch_id: string;
          created_at: string;
        };
        Insert: {
          student_id: string;
          batch_id: string;
          created_at?: string;
        };
        Update: {
          student_id?: string;
          batch_id?: string;
          created_at?: string;
        };
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
    };
    Enums: Record<string, never>;
  };
}
