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
      block_allocations: {
        Row: {
          block_id: string
          created_at: string
          event_type_id: string | null
          id: string
          quantity_assigned: number
          quantity_booked: number
          session_type: Database["public"]["Enums"]["session_type"]
          week_number: number
        }
        Insert: {
          block_id: string
          created_at?: string
          event_type_id?: string | null
          id?: string
          quantity_assigned?: number
          quantity_booked?: number
          session_type: Database["public"]["Enums"]["session_type"]
          week_number: number
        }
        Update: {
          block_id?: string
          created_at?: string
          event_type_id?: string | null
          id?: string
          quantity_assigned?: number
          quantity_booked?: number
          session_type?: Database["public"]["Enums"]["session_type"]
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "block_allocations_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "training_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          block_id: string | null
          client_id: string
          coach_id: string
          created_at: string
          deleted_at: string | null
          event_type_id: string | null
          google_event_id: string | null
          id: string
          meeting_link: string | null
          notes: string | null
          scheduled_at: string
          session_type: Database["public"]["Enums"]["session_type"]
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
        }
        Insert: {
          block_id?: string | null
          client_id: string
          coach_id: string
          created_at?: string
          deleted_at?: string | null
          event_type_id?: string | null
          google_event_id?: string | null
          id?: string
          meeting_link?: string | null
          notes?: string | null
          scheduled_at: string
          session_type: Database["public"]["Enums"]["session_type"]
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Update: {
          block_id?: string | null
          client_id?: string
          coach_id?: string
          created_at?: string
          deleted_at?: string | null
          event_type_id?: string | null
          google_event_id?: string | null
          id?: string
          meeting_link?: string | null
          notes?: string | null
          scheduled_at?: string
          session_type?: Database["public"]["Enums"]["session_type"]
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "training_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invitations: {
        Row: {
          accepted_at: string | null
          coach_id: string
          created_at: string
          email: string
          full_name: string | null
          id: string
          phone: string | null
          status: string
        }
        Insert: {
          accepted_at?: string | null
          coach_id: string
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          phone?: string | null
          status?: string
        }
        Update: {
          accepted_at?: string | null
          coach_id?: string
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_invitations_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_types: {
        Row: {
          base_type: Database["public"]["Enums"]["session_type"]
          buffer_minutes: number
          coach_id: string
          color: string
          created_at: string
          description: string | null
          duration: number
          id: string
          location_type: string
          name: string
          updated_at: string
        }
        Insert: {
          base_type?: Database["public"]["Enums"]["session_type"]
          buffer_minutes?: number
          coach_id: string
          color?: string
          created_at?: string
          description?: string | null
          duration?: number
          id?: string
          location_type?: string
          name: string
          updated_at?: string
        }
        Update: {
          base_type?: Database["public"]["Enums"]["session_type"]
          buffer_minutes?: number
          coach_id?: string
          color?: string
          created_at?: string
          description?: string | null
          duration?: number
          id?: string
          location_type?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_settings: {
        Row: {
          coach_id: string
          created_at: string
          gcal_calendar_id: string | null
          gcal_enabled: boolean
          gcal_service_account_json: string | null
          gcal_webhook_url: string | null
          id: string
          updated_at: string
          wa_access_token: string | null
          wa_enabled: boolean
          wa_phone_id: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string
          gcal_calendar_id?: string | null
          gcal_enabled?: boolean
          gcal_service_account_json?: string | null
          gcal_webhook_url?: string | null
          id?: string
          updated_at?: string
          wa_access_token?: string | null
          wa_enabled?: boolean
          wa_phone_id?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string
          gcal_calendar_id?: string | null
          gcal_enabled?: boolean
          gcal_service_account_json?: string | null
          gcal_webhook_url?: string | null
          id?: string
          updated_at?: string
          wa_access_token?: string | null
          wa_enabled?: boolean
          wa_phone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_settings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          coach_id: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          coach_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          coach_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_availability: {
        Row: {
          coach_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          start_time: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          start_time: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_availability_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_blocks: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string
          deleted_at: string | null
          end_date: string
          id: string
          sequence_order: number
          start_date: string
          status: Database["public"]["Enums"]["block_status"]
          updated_at: string
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string
          deleted_at?: string | null
          end_date: string
          id?: string
          sequence_order?: number
          start_date: string
          status?: Database["public"]["Enums"]["block_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string
          deleted_at?: string | null
          end_date?: string
          id?: string
          sequence_order?: number
          start_date?: string
          status?: Database["public"]["Enums"]["block_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_blocks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_blocks_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          role: Database["public"]["Enums"]["app_role"]
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
      [_ in never]: never
    }
    Functions: {
      get_coach_for: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "coach" | "client"
      block_status: "active" | "completed" | "cancelled"
      booking_status:
        | "scheduled"
        | "completed"
        | "cancelled"
        | "late_cancelled"
        | "no_show"
      session_type: "PT Session" | "BIA" | "Functional Test"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "coach", "client"],
      block_status: ["active", "completed", "cancelled"],
      booking_status: [
        "scheduled",
        "completed",
        "cancelled",
        "late_cancelled",
        "no_show",
      ],
      session_type: ["PT Session", "BIA", "Functional Test"],
    },
  },
} as const
