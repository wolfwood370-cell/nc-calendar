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
      availability_exceptions: {
        Row: {
          coach_id: string
          created_at: string
          date: string
          end_time: string | null
          id: string
          reason: string
          start_time: string | null
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          date: string
          end_time?: string | null
          id?: string
          reason?: string
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          date?: string
          end_time?: string | null
          id?: string
          reason?: string
          start_time?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      block_allocations: {
        Row: {
          block_id: string
          created_at: string
          event_type_id: string | null
          id: string
          quantity_assigned: number
          quantity_booked: number
          session_type: Database["public"]["Enums"]["session_type"]
          valid_until: string | null
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
          valid_until?: string | null
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
          valid_until?: string | null
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "block_allocations_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "client_block_status"
            referencedColumns: ["block_id"]
          },
          {
            foreignKeyName: "block_allocations_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "training_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_allocations_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "event_types"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          block_id: string | null
          buffer_min: number
          category: string
          client_id: string | null
          coach_id: string
          created_at: string
          deleted_at: string | null
          duration_min: number
          end_at: string
          event_type_id: string | null
          google_event_id: string | null
          id: string
          ignored: boolean
          ignored_by_clients: string[]
          is_personal: boolean
          meeting_link: string | null
          notes: string | null
          scheduled_at: string
          session_type: Database["public"]["Enums"]["session_type"]
          status: Database["public"]["Enums"]["booking_status"]
          title: string | null
          trainer_notes: string | null
          updated_at: string
        }
        Insert: {
          block_id?: string | null
          buffer_min?: number
          category?: string
          client_id?: string | null
          coach_id: string
          created_at?: string
          deleted_at?: string | null
          duration_min?: number
          end_at: string
          event_type_id?: string | null
          google_event_id?: string | null
          id?: string
          ignored?: boolean
          ignored_by_clients?: string[]
          is_personal?: boolean
          meeting_link?: string | null
          notes?: string | null
          scheduled_at: string
          session_type: Database["public"]["Enums"]["session_type"]
          status?: Database["public"]["Enums"]["booking_status"]
          title?: string | null
          trainer_notes?: string | null
          updated_at?: string
        }
        Update: {
          block_id?: string | null
          buffer_min?: number
          category?: string
          client_id?: string | null
          coach_id?: string
          created_at?: string
          deleted_at?: string | null
          duration_min?: number
          end_at?: string
          event_type_id?: string | null
          google_event_id?: string | null
          id?: string
          ignored?: boolean
          ignored_by_clients?: string[]
          is_personal?: boolean
          meeting_link?: string | null
          notes?: string | null
          scheduled_at?: string
          session_type?: Database["public"]["Enums"]["session_type"]
          status?: Database["public"]["Enums"]["booking_status"]
          title?: string | null
          trainer_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "client_block_status"
            referencedColumns: ["block_id"]
          },
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
            referencedRelation: "client_block_status"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_exhaustion_forecast"
            referencedColumns: ["client_id"]
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
            referencedRelation: "client_block_status"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "bookings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "client_exhaustion_forecast"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "bookings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "event_types"
            referencedColumns: ["id"]
          },
        ]
      }
      booster_packs: {
        Row: {
          active: boolean
          amount_cents: number
          created_at: string
          currency: string
          event_type_title: string
          id: string
          package_type: string
          quantity: number
        }
        Insert: {
          active?: boolean
          amount_cents: number
          created_at?: string
          currency?: string
          event_type_title: string
          id?: string
          package_type: string
          quantity?: number
        }
        Update: {
          active?: boolean
          amount_cents?: number
          created_at?: string
          currency?: string
          event_type_title?: string
          id?: string
          package_type?: string
          quantity?: number
        }
        Relationships: []
      }
      bug_reports: {
        Row: {
          coach_id: string | null
          created_at: string
          description: string
          id: string
          page_url: string | null
          reporter_id: string
          reporter_role: string
          resolved_at: string | null
          sentry_event_id: string | null
          severity: string
          status: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          coach_id?: string | null
          created_at?: string
          description: string
          id?: string
          page_url?: string | null
          reporter_id: string
          reporter_role?: string
          resolved_at?: string | null
          sentry_event_id?: string | null
          severity?: string
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          coach_id?: string | null
          created_at?: string
          description?: string
          id?: string
          page_url?: string | null
          reporter_id?: string
          reporter_role?: string
          resolved_at?: string | null
          sentry_event_id?: string | null
          severity?: string
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bug_reports_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "client_block_status"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "bug_reports_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "client_exhaustion_forecast"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "bug_reports_coach_id_fkey"
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
            referencedRelation: "client_block_status"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_invitations_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "client_exhaustion_forecast"
            referencedColumns: ["client_id"]
          },
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
          location_address: string | null
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
          location_address?: string | null
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
          location_address?: string | null
          location_type?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      extra_credits: {
        Row: {
          client_id: string
          created_at: string
          event_type_id: string | null
          expires_at: string
          id: string
          price_paid: number | null
          quantity: number
          quantity_booked: number
          stripe_payment_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          event_type_id?: string | null
          expires_at: string
          id?: string
          price_paid?: number | null
          quantity: number
          quantity_booked?: number
          stripe_payment_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          event_type_id?: string | null
          expires_at?: string
          id?: string
          price_paid?: number | null
          quantity?: number
          quantity_booked?: number
          stripe_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extra_credits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_block_status"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "extra_credits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_exhaustion_forecast"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "extra_credits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_credits_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "event_types"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_settings: {
        Row: {
          calendar_optimization_enabled: boolean
          coach_id: string
          created_at: string
          id: string
          stripe_account_id: string | null
          updated_at: string
          wa_access_token: string | null
          wa_enabled: boolean
          wa_phone_id: string | null
        }
        Insert: {
          calendar_optimization_enabled?: boolean
          coach_id: string
          created_at?: string
          id?: string
          stripe_account_id?: string | null
          updated_at?: string
          wa_access_token?: string | null
          wa_enabled?: boolean
          wa_phone_id?: string | null
        }
        Update: {
          calendar_optimization_enabled?: boolean
          coach_id?: string
          created_at?: string
          id?: string
          stripe_account_id?: string | null
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
            referencedRelation: "client_block_status"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "integration_settings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "client_exhaustion_forecast"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "integration_settings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          payload: Json
          read_at: string | null
          recipient_id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          recipient_id: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          recipient_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "client_block_status"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "client_exhaustion_forecast"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auto_renew: boolean
          auto_renew_blocks: boolean
          coach_id: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          email_notifications: boolean
          full_name: string | null
          id: string
          next_billing_date: string | null
          pack_label: string | null
          path_start_date: string | null
          path_type: string
          phone: string | null
          status: string
        }
        Insert: {
          auto_renew?: boolean
          auto_renew_blocks?: boolean
          coach_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          email_notifications?: boolean
          full_name?: string | null
          id: string
          next_billing_date?: string | null
          pack_label?: string | null
          path_start_date?: string | null
          path_type?: string
          phone?: string | null
          status?: string
        }
        Update: {
          auto_renew?: boolean
          auto_renew_blocks?: boolean
          coach_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          email_notifications?: boolean
          full_name?: string | null
          id?: string
          next_billing_date?: string | null
          pack_label?: string | null
          path_start_date?: string | null
          path_type?: string
          phone?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "client_block_status"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "client_exhaustion_forecast"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string | null
          id: string
          profile_id: string
          subscription: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          endpoint?: string | null
          id?: string
          profile_id: string
          subscription: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          endpoint?: string | null
          id?: string
          profile_id?: string
          subscription?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "client_block_status"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "client_exhaustion_forecast"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      send_email_rate_limit: {
        Row: {
          id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          id?: string
          sent_at?: string
          user_id: string
        }
        Update: {
          id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
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
            referencedRelation: "client_block_status"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "trainer_availability_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "client_exhaustion_forecast"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "trainer_availability_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_settings: {
        Row: {
          booking_horizon_days: number
          buffer_minutes: number
          coach_id: string
          created_at: string
          id: string
          min_notice_hours: number
          updated_at: string
        }
        Insert: {
          booking_horizon_days?: number
          buffer_minutes?: number
          coach_id: string
          created_at?: string
          id?: string
          min_notice_hours?: number
          updated_at?: string
        }
        Update: {
          booking_horizon_days?: number
          buffer_minutes?: number
          coach_id?: string
          created_at?: string
          id?: string
          min_notice_hours?: number
          updated_at?: string
        }
        Relationships: []
      }
      training_blocks: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string
          deleted_at: string | null
          duration_days: number
          end_date: string
          grace_days: number
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
          duration_days?: number
          end_date: string
          grace_days?: number
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
          duration_days?: number
          end_date?: string
          grace_days?: number
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
            referencedRelation: "client_block_status"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "training_blocks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_exhaustion_forecast"
            referencedColumns: ["client_id"]
          },
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
            referencedRelation: "client_block_status"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "training_blocks_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "client_exhaustion_forecast"
            referencedColumns: ["client_id"]
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
      weekly_schedule: {
        Row: {
          block_number: number
          client_id: string
          coach_id: string
          created_at: string
          id: string
          monday_date: string
          shifted: boolean
          updated_at: string
          week_number: number
        }
        Insert: {
          block_number: number
          client_id: string
          coach_id: string
          created_at?: string
          id?: string
          monday_date: string
          shifted?: boolean
          updated_at?: string
          week_number: number
        }
        Update: {
          block_number?: number
          client_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          monday_date?: string
          shifted?: boolean
          updated_at?: string
          week_number?: number
        }
        Relationships: []
      }
    }
    Views: {
      client_block_status: {
        Row: {
          auto_renew_blocks: boolean | null
          block_id: string | null
          client_id: string | null
          client_name: string | null
          coach_id: string | null
          end_date: string | null
          expired_beyond_grace: boolean | null
          grace_until: string | null
          in_grace: boolean | null
          residuals: number | null
          sequence_order: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["block_status"] | null
          total_assigned: number | null
          total_booked: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "client_block_status"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "client_exhaustion_forecast"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_exhaustion_forecast: {
        Row: {
          client_id: string | null
          coach_id: string | null
          days_until_exhaustion: number | null
          predicted_exhaustion_date: string | null
          remaining_credits: number | null
          sessions_last_30d: number | null
          weekly_avg: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "client_block_status"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "client_exhaustion_forecast"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _auto_renew_cron_run: { Args: never; Returns: number }
      admin_delete_client: { Args: { p_client_id: string }; Returns: undefined }
      audit_misaligned_blocks: {
        Args: { p_coach_id: string }
        Returns: {
          actual_block1_start: string
          client_id: string
          client_name: string
          contiguous: boolean
          drift_days: number
          expected_block1_start: string
          path_start_date: string
          total_blocks: number
        }[]
      }
      cancel_booking: {
        Args: { p_booking_id: string }
        Returns: {
          status: Database["public"]["Enums"]["booking_status"]
          was_late: boolean
        }[]
      }
      check_email_rate_limit: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: boolean
      }
      ensure_all_recurring_for_coach: {
        Args: { p_coach_id: string }
        Returns: number
      }
      ensure_client_block_state: {
        Args: { p_client_id: string }
        Returns: {
          current_block_id: string
          in_grace_period: boolean
          next_renewal_date: string
          previous_block_id: string
          residuals_from_previous: number
        }[]
      }
      get_coach_busy: {
        Args: { p_coach_id: string; p_from: string; p_to: string }
        Returns: {
          buffer_minutes: number
          duration: number
          event_type_id: string
          scheduled_at: string
        }[]
      }
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
      mark_all_notifications_read: { Args: never; Returns: undefined }
      mark_booking_special: {
        Args: { p_booking_id: string; p_category?: string }
        Returns: undefined
      }
      mark_notification_read: { Args: { p_id: string }; Returns: undefined }
      repair_blocks_alignment: {
        Args: { p_client_id: string }
        Returns: {
          action: string
          block_id: string
          new_end: string
          new_start: string
          old_end: string
          old_start: string
          sequence_order: number
        }[]
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
