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
      admin_impersonations: {
        Row: {
          admin_user_id: string
          created_at: string
          expires_at: string
          shop_id: string
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          expires_at?: string
          shop_id: string
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          expires_at?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_impersonations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      ads: {
        Row: {
          created_at: string
          frequency: number
          id: string
          is_active: boolean
          link_url: string
          media_type: string
          media_url: string
          poster_url: string | null
          title: string
        }
        Insert: {
          created_at?: string
          frequency?: number
          id?: string
          is_active?: boolean
          link_url: string
          media_type: string
          media_url: string
          poster_url?: string | null
          title: string
        }
        Update: {
          created_at?: string
          frequency?: number
          id?: string
          is_active?: boolean
          link_url?: string
          media_type?: string
          media_url?: string
          poster_url?: string | null
          title?: string
        }
        Relationships: []
      }
      ai_review_config: {
        Row: {
          auto_apply_enabled: boolean
          min_confidence_threshold: number
          target_type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_apply_enabled?: boolean
          min_confidence_threshold?: number
          target_type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_apply_enabled?: boolean
          min_confidence_threshold?: number
          target_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_review_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["user_id"]
          },
        ]
      }
      applicants: {
        Row: {
          created_at: string
          dob: string | null
          id: string
          last_check_hit_count: number | null
          last_check_match_level: string | null
          last_checked_at: string | null
          name: string
          phone: string
          shop_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dob?: string | null
          id?: string
          last_check_hit_count?: number | null
          last_check_match_level?: string | null
          last_checked_at?: string | null
          name: string
          phone: string
          shop_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dob?: string | null
          id?: string
          last_check_hit_count?: number | null
          last_check_match_level?: string | null
          last_checked_at?: string | null
          name?: string
          phone?: string
          shop_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applicants_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      area_photo_admins: {
        Row: {
          created_at: string
          wp_user_id: number
        }
        Insert: {
          created_at?: string
          wp_user_id: number
        }
        Update: {
          created_at?: string
          wp_user_id?: number
        }
        Relationships: []
      }
      area_photo_follows: {
        Row: {
          created_at: string
          followee_member_id: string
          follower_member_id: string
          id: number
        }
        Insert: {
          created_at?: string
          followee_member_id: string
          follower_member_id: string
          id?: never
        }
        Update: {
          created_at?: string
          followee_member_id?: string
          follower_member_id?: string
          id?: never
        }
        Relationships: []
      }
      area_photo_likes: {
        Row: {
          created_at: string
          id: string
          member_id: string
          post_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          post_id: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "area_photo_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "area_photo_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      area_photo_posts: {
        Row: {
          address: string | null
          avatar_url: string | null
          comment: string | null
          created_at: string
          id: string
          image_url: string
          latitude: number
          longitude: number
          member_id: string | null
          site: string
          spot_name: string
          tags: Json
          user_name: string
          venue_id: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          image_url: string
          latitude: number
          longitude: number
          member_id?: string | null
          site?: string
          spot_name: string
          tags?: Json
          user_name: string
          venue_id?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          image_url?: string
          latitude?: number
          longitude?: number
          member_id?: string | null
          site?: string
          spot_name?: string
          tags?: Json
          user_name?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "area_photo_posts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "locapass_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      area_photo_routes: {
        Row: {
          created_at: string
          creator_avatar_url: string | null
          creator_name: string | null
          id: string
          is_public: boolean
          member_id: string | null
          memo: string | null
          name: string
          share_id: string | null
          site: string
          spot_ids: Json
        }
        Insert: {
          created_at?: string
          creator_avatar_url?: string | null
          creator_name?: string | null
          id?: string
          is_public?: boolean
          member_id?: string | null
          memo?: string | null
          name: string
          share_id?: string | null
          site?: string
          spot_ids: Json
        }
        Update: {
          created_at?: string
          creator_avatar_url?: string | null
          creator_name?: string | null
          id?: string
          is_public?: boolean
          member_id?: string | null
          memo?: string | null
          name?: string
          share_id?: string | null
          site?: string
          spot_ids?: Json
        }
        Relationships: []
      }
      banned_users: {
        Row: {
          banned_by: string | null
          created_at: string
          reason: string | null
          user_id: string
        }
        Insert: {
          banned_by?: string | null
          created_at?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          banned_by?: string | null
          created_at?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      blacklist_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          ai_assessment: Json | null
          blacklist_id: string
          created_at: string
          dob_hash: string | null
          id: string
          name_hash: string | null
          new_risk_level: number | null
          new_status: string | null
          old_risk_level: number | null
          old_status: string | null
          phone_hash: string
          reason_category: string | null
          registered_by_shop_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type: string
          ai_assessment?: Json | null
          blacklist_id: string
          created_at?: string
          dob_hash?: string | null
          id?: string
          name_hash?: string | null
          new_risk_level?: number | null
          new_status?: string | null
          old_risk_level?: number | null
          old_status?: string | null
          phone_hash: string
          reason_category?: string | null
          registered_by_shop_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          ai_assessment?: Json | null
          blacklist_id?: string
          created_at?: string
          dob_hash?: string | null
          id?: string
          name_hash?: string | null
          new_risk_level?: number | null
          new_status?: string | null
          old_risk_level?: number | null
          old_status?: string | null
          phone_hash?: string
          reason_category?: string | null
          registered_by_shop_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      blacklist_registration_notes: {
        Row: {
          blacklist_id: string
          created_at: string
          created_by_shop_id: string
          id: string
          note: string
        }
        Insert: {
          blacklist_id: string
          created_at?: string
          created_by_shop_id: string
          id?: string
          note: string
        }
        Update: {
          blacklist_id?: string
          created_at?: string
          created_by_shop_id?: string
          id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "blacklist_registration_notes_created_by_shop_id_fkey"
            columns: ["created_by_shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      blacklists: {
        Row: {
          created_at: string
          dob_hash: string | null
          id: string
          name_hash: string | null
          phone_hash: string
          reason_category: string | null
          registered_by_shop_id: string
          resolved_at: string | null
          resolved_reason: string | null
          risk_level: number
          status: string
          target_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dob_hash?: string | null
          id?: string
          name_hash?: string | null
          phone_hash: string
          reason_category?: string | null
          registered_by_shop_id: string
          resolved_at?: string | null
          resolved_reason?: string | null
          risk_level: number
          status?: string
          target_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dob_hash?: string | null
          id?: string
          name_hash?: string | null
          phone_hash?: string
          reason_category?: string | null
          registered_by_shop_id?: string
          resolved_at?: string | null
          resolved_reason?: string | null
          risk_level?: number
          status?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blacklists_registered_by_shop_id_fkey"
            columns: ["registered_by_shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      cast_blocked_users: {
        Row: {
          blocked_user_id: string
          cast_id: string
          created_at: string
        }
        Insert: {
          blocked_user_id: string
          cast_id: string
          created_at?: string
        }
        Update: {
          blocked_user_id?: string
          cast_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cast_blocked_users_cast_id_fkey"
            columns: ["cast_id"]
            isOneToOne: false
            referencedRelation: "cast_members"
            referencedColumns: ["id"]
          },
        ]
      }
      cast_diary_entries: {
        Row: {
          body: string
          cast_id: string
          created_at: string
          id: string
          shop_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          body: string
          cast_id: string
          created_at?: string
          id?: string
          shop_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          cast_id?: string
          created_at?: string
          id?: string
          shop_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cast_diary_entries_cast_id_fkey"
            columns: ["cast_id"]
            isOneToOne: false
            referencedRelation: "cast_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cast_diary_entries_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      cast_login_recovery_attempts: {
        Row: {
          attempted_at: string
          id: number
          phone_key: string
          succeeded: boolean
        }
        Insert: {
          attempted_at?: string
          id?: never
          phone_key: string
          succeeded: boolean
        }
        Update: {
          attempted_at?: string
          id?: never
          phone_key?: string
          succeeded?: boolean
        }
        Relationships: []
      }
      cast_login_tokens: {
        Row: {
          cast_id: string
          created_at: string
          shop_id: string
          token: string
        }
        Insert: {
          cast_id: string
          created_at?: string
          shop_id: string
          token?: string
        }
        Update: {
          cast_id?: string
          created_at?: string
          shop_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "cast_login_tokens_cast_id_fkey"
            columns: ["cast_id"]
            isOneToOne: true
            referencedRelation: "cast_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cast_login_tokens_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      cast_members: {
        Row: {
          address: string | null
          age: number | null
          avatar_url: string | null
          birth_date: string | null
          cast_code: string
          created_at: string
          id: string
          id_check_hit_count: number | null
          id_check_match_level: string | null
          id_checked_at: string | null
          id_document_path: string | null
          legal_name: string | null
          legal_name_kana: string | null
          metadata: Json
          name: string
          phone: string | null
          pr_text: string | null
          shop_id: string
          sizes: Json | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          age?: number | null
          avatar_url?: string | null
          birth_date?: string | null
          cast_code?: string
          created_at?: string
          id?: string
          id_check_hit_count?: number | null
          id_check_match_level?: string | null
          id_checked_at?: string | null
          id_document_path?: string | null
          legal_name?: string | null
          legal_name_kana?: string | null
          metadata?: Json
          name: string
          phone?: string | null
          pr_text?: string | null
          shop_id: string
          sizes?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          age?: number | null
          avatar_url?: string | null
          birth_date?: string | null
          cast_code?: string
          created_at?: string
          id?: string
          id_check_hit_count?: number | null
          id_check_match_level?: string | null
          id_checked_at?: string | null
          id_document_path?: string | null
          legal_name?: string | null
          legal_name_kana?: string | null
          metadata?: Json
          name?: string
          phone?: string | null
          pr_text?: string | null
          shop_id?: string
          sizes?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cast_members_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      line_identities: {
        Row: {
          created_at: string
          line_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          line_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          line_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      locapass_checkins: {
        Row: {
          checkin_date: string
          created_at: string
          distance_m: number
          id: string
          lat: number
          lng: number
          member_id: string
          shop_id: string
        }
        Insert: {
          checkin_date?: string
          created_at?: string
          distance_m: number
          id?: string
          lat: number
          lng: number
          member_id: string
          shop_id: string
        }
        Update: {
          checkin_date?: string
          created_at?: string
          distance_m?: number
          id?: string
          lat?: number
          lng?: number
          member_id?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locapass_checkins_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "locapass_shops"
            referencedColumns: ["id"]
          },
        ]
      }
      locapass_member_favorite_reels: {
        Row: {
          created_at: string
          member_id: string
          reel_id: string
        }
        Insert: {
          created_at?: string
          member_id: string
          reel_id: string
        }
        Update: {
          created_at?: string
          member_id?: string
          reel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locapass_member_favorite_reels_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "locapass_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locapass_member_favorite_reels_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "locapass_reels"
            referencedColumns: ["id"]
          },
        ]
      }
      locapass_member_favorite_shops: {
        Row: {
          author_icon_url: string | null
          author_name: string | null
          author_url: string
          created_at: string
          member_id: string
          site_id: number
        }
        Insert: {
          author_icon_url?: string | null
          author_name?: string | null
          author_url: string
          created_at?: string
          member_id: string
          site_id: number
        }
        Update: {
          author_icon_url?: string | null
          author_name?: string | null
          author_url?: string
          created_at?: string
          member_id?: string
          site_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "locapass_member_favorite_shops_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "locapass_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locapass_member_favorite_shops_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "locapass_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      locapass_members: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          last_login_at: string
          nickname: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          last_login_at?: string
          nickname: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          last_login_at?: string
          nickname?: string
        }
        Relationships: []
      }
      locapass_reels: {
        Row: {
          action_label: string | null
          action_url: string | null
          author_icon_url: string | null
          author_name: string | null
          author_url: string | null
          caption: string | null
          caption_en: string | null
          created_by: string | null
          expires_at: string | null
          genres: string[]
          id: string
          images: Json
          like_count: number
          poster_url: string | null
          published_at: string | null
          reel_type: string
          shop_id: string | null
          site_id: number
          status: string
          title: string | null
          title_en: string | null
          updated_at: string
          video_url: string | null
          wp_created_at: string | null
          wp_post_id: number | null
        }
        Insert: {
          action_label?: string | null
          action_url?: string | null
          author_icon_url?: string | null
          author_name?: string | null
          author_url?: string | null
          caption?: string | null
          caption_en?: string | null
          created_by?: string | null
          expires_at?: string | null
          genres?: string[]
          id?: string
          images?: Json
          like_count?: number
          poster_url?: string | null
          published_at?: string | null
          reel_type?: string
          shop_id?: string | null
          site_id: number
          status?: string
          title?: string | null
          title_en?: string | null
          updated_at?: string
          video_url?: string | null
          wp_created_at?: string | null
          wp_post_id?: number | null
        }
        Update: {
          action_label?: string | null
          action_url?: string | null
          author_icon_url?: string | null
          author_name?: string | null
          author_url?: string | null
          caption?: string | null
          caption_en?: string | null
          created_by?: string | null
          expires_at?: string | null
          genres?: string[]
          id?: string
          images?: Json
          like_count?: number
          poster_url?: string | null
          published_at?: string | null
          reel_type?: string
          shop_id?: string | null
          site_id?: number
          status?: string
          title?: string | null
          title_en?: string | null
          updated_at?: string
          video_url?: string | null
          wp_created_at?: string | null
          wp_post_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "locapass_reels_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "locapass_shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locapass_reels_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "locapass_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      locapass_root_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      locapass_shop_events: {
        Row: {
          body: string | null
          created_at: string
          ends_at: string | null
          gallery_image_urls: string[]
          id: string
          image_url: string | null
          shop_id: string
          starts_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          ends_at?: string | null
          gallery_image_urls?: string[]
          id?: string
          image_url?: string | null
          shop_id: string
          starts_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          ends_at?: string | null
          gallery_image_urls?: string[]
          id?: string
          image_url?: string | null
          shop_id?: string
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locapass_shop_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "locapass_shops"
            referencedColumns: ["id"]
          },
        ]
      }
      locapass_shop_favorites: {
        Row: {
          created_at: string
          member_id: string
          shop_id: string
        }
        Insert: {
          created_at?: string
          member_id: string
          shop_id: string
        }
        Update: {
          created_at?: string
          member_id?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locapass_shop_favorites_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "locapass_shops"
            referencedColumns: ["id"]
          },
        ]
      }
      locapass_shop_members: {
        Row: {
          created_at: string
          role: string
          shop_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          shop_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          shop_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locapass_shop_members_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "locapass_shops"
            referencedColumns: ["id"]
          },
        ]
      }
      locapass_shops: {
        Row: {
          address: string | null
          business_hours: string | null
          category: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          icon_url: string | null
          id: string
          lat: number | null
          line_url: string | null
          lng: number | null
          name: string
          plan: string
          site_id: number
          slug: string
          status: string
          tagline: string | null
          tel: string | null
          updated_at: string
          url: string | null
          venue_id: string | null
          wp_author_url: string | null
        }
        Insert: {
          address?: string | null
          business_hours?: string | null
          category?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          lat?: number | null
          line_url?: string | null
          lng?: number | null
          name: string
          plan?: string
          site_id: number
          slug: string
          status?: string
          tagline?: string | null
          tel?: string | null
          updated_at?: string
          url?: string | null
          venue_id?: string | null
          wp_author_url?: string | null
        }
        Update: {
          address?: string | null
          business_hours?: string | null
          category?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          lat?: number | null
          line_url?: string | null
          lng?: number | null
          name?: string
          plan?: string
          site_id?: number
          slug?: string
          status?: string
          tagline?: string | null
          tel?: string | null
          updated_at?: string
          url?: string | null
          venue_id?: string | null
          wp_author_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locapass_shops_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "locapass_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locapass_shops_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "locapass_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      locapass_site_admins: {
        Row: {
          created_at: string
          site_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          site_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          site_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locapass_site_admins_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "locapass_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      locapass_sites: {
        Row: {
          cover_image_url: string | null
          created_at: string
          home_url: string | null
          id: number
          name: string
          name_en: string | null
          slug: string
          tagline: string | null
          wp_blog_id: number
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          home_url?: string | null
          id?: number
          name: string
          name_en?: string | null
          slug: string
          tagline?: string | null
          wp_blog_id: number
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          home_url?: string | null
          id?: number
          name?: string
          name_en?: string | null
          slug?: string
          tagline?: string | null
          wp_blog_id?: number
        }
        Relationships: []
      }
      locapass_ugc_photos: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          image_url: string
          lat: number
          lng: number
          member_id: string
          shop_id: string | null
          site_id: number
          status: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          image_url: string
          lat: number
          lng: number
          member_id: string
          shop_id?: string | null
          site_id: number
          status?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          image_url?: string
          lat?: number
          lng?: number
          member_id?: string
          shop_id?: string | null
          site_id?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "locapass_ugc_photos_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "locapass_shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locapass_ugc_photos_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "locapass_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      locapass_vehicles: {
        Row: {
          description: string | null
          displacement: string | null
          drive_system: string | null
          features: string[]
          id: string
          images: Json
          inspection_date: string | null
          line_contact_url: string | null
          mileage_km: number | null
          model_code: string | null
          price_body: number | null
          price_total: number | null
          repair_history: boolean | null
          site_id: number
          sold: boolean
          status: string
          stripe_payment_url: string | null
          thumbnail_url: string | null
          title: string | null
          transmission: string | null
          updated_at: string
          vehicle_maker: string | null
          vehicle_type: string | null
          video_url: string | null
          wp_created_at: string | null
          wp_post_id: number
          year: number | null
        }
        Insert: {
          description?: string | null
          displacement?: string | null
          drive_system?: string | null
          features?: string[]
          id?: string
          images?: Json
          inspection_date?: string | null
          line_contact_url?: string | null
          mileage_km?: number | null
          model_code?: string | null
          price_body?: number | null
          price_total?: number | null
          repair_history?: boolean | null
          site_id: number
          sold?: boolean
          status?: string
          stripe_payment_url?: string | null
          thumbnail_url?: string | null
          title?: string | null
          transmission?: string | null
          updated_at?: string
          vehicle_maker?: string | null
          vehicle_type?: string | null
          video_url?: string | null
          wp_created_at?: string | null
          wp_post_id: number
          year?: number | null
        }
        Update: {
          description?: string | null
          displacement?: string | null
          drive_system?: string | null
          features?: string[]
          id?: string
          images?: Json
          inspection_date?: string | null
          line_contact_url?: string | null
          mileage_km?: number | null
          model_code?: string | null
          price_body?: number | null
          price_total?: number | null
          repair_history?: boolean | null
          site_id?: number
          sold?: boolean
          status?: string
          stripe_payment_url?: string | null
          thumbnail_url?: string | null
          title?: string | null
          transmission?: string | null
          updated_at?: string
          vehicle_maker?: string | null
          vehicle_type?: string | null
          video_url?: string | null
          wp_created_at?: string | null
          wp_post_id?: number
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "locapass_vehicles_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "locapass_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      locapass_venues: {
        Row: {
          address: string | null
          category: string | null
          category_en: string | null
          category_parent: string | null
          category_parent_en: string | null
          detail_url: string | null
          holiday: string | null
          hours: string | null
          id: string
          lat: number | null
          lng: number | null
          maps_url: string | null
          name: string
          name_en: string | null
          photo_url: string | null
          site_id: number
          status: string
          tagline: string | null
          tagline_en: string | null
          tel: string | null
          updated_at: string
          url: string | null
          wp_created_at: string | null
          wp_post_id: number
        }
        Insert: {
          address?: string | null
          category?: string | null
          category_en?: string | null
          category_parent?: string | null
          category_parent_en?: string | null
          detail_url?: string | null
          holiday?: string | null
          hours?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          maps_url?: string | null
          name: string
          name_en?: string | null
          photo_url?: string | null
          site_id: number
          status?: string
          tagline?: string | null
          tagline_en?: string | null
          tel?: string | null
          updated_at?: string
          url?: string | null
          wp_created_at?: string | null
          wp_post_id: number
        }
        Update: {
          address?: string | null
          category?: string | null
          category_en?: string | null
          category_parent?: string | null
          category_parent_en?: string | null
          detail_url?: string | null
          holiday?: string | null
          hours?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          maps_url?: string | null
          name?: string
          name_en?: string | null
          photo_url?: string | null
          site_id?: number
          status?: string
          tagline?: string | null
          tagline_en?: string | null
          tel?: string | null
          updated_at?: string
          url?: string | null
          wp_created_at?: string | null
          wp_post_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "locapass_venues_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "locapass_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      media: {
        Row: {
          cast_id: string | null
          display_order: number
          id: string
          shop_id: string
          url: string
        }
        Insert: {
          cast_id?: string | null
          display_order?: number
          id?: string
          shop_id: string
          url: string
        }
        Update: {
          cast_id?: string | null
          display_order?: number
          id?: string
          shop_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_cast_id_fkey"
            columns: ["cast_id"]
            isOneToOne: false
            referencedRelation: "cast_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          new_cast: boolean
          new_cast_reel: boolean
          new_event: boolean
          new_shop_reel: boolean
          shop_message: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          new_cast?: boolean
          new_cast_reel?: boolean
          new_event?: boolean
          new_shop_reel?: boolean
          shop_message?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          new_cast?: boolean
          new_cast_reel?: boolean
          new_event?: boolean
          new_shop_reel?: boolean
          shop_message?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          push_dispatched_at: string | null
          read_at: string | null
          shop_id: string | null
          title: string
          type: string
          url: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          push_dispatched_at?: string | null
          read_at?: string | null
          shop_id?: string | null
          title: string
          type: string
          url?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          push_dispatched_at?: string | null
          read_at?: string | null
          shop_id?: string | null
          title?: string
          type?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      operators: {
        Row: {
          created_at: string | null
          id: string
          name: string | null
          staff_id: string | null
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name?: string | null
          staff_id?: string | null
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string | null
          staff_id?: string | null
          store_id?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          featured_section_enabled: boolean
          id: boolean
          updated_at: string
        }
        Insert: {
          featured_section_enabled?: boolean
          id?: boolean
          updated_at?: string
        }
        Update: {
          featured_section_enabled?: boolean
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          display_name: string | null
          email: string | null
          id: string
          is_primary_admin: boolean | null
          secondary_phone: string | null
          updated_at: string
        }
        Insert: {
          display_name?: string | null
          email?: string | null
          id: string
          is_primary_admin?: boolean | null
          secondary_phone?: string | null
          updated_at?: string
        }
        Update: {
          display_name?: string | null
          email?: string | null
          id?: string
          is_primary_admin?: boolean | null
          secondary_phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reel_comments: {
        Row: {
          author_type: string
          body: string
          cast_id: string | null
          created_at: string
          id: string
          is_deleted: boolean
          parent_comment_id: string | null
          reel_id: string
          staff_member_id: string | null
          user_id: string | null
          viewer_id: string | null
        }
        Insert: {
          author_type: string
          body: string
          cast_id?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean
          parent_comment_id?: string | null
          reel_id: string
          staff_member_id?: string | null
          user_id?: string | null
          viewer_id?: string | null
        }
        Update: {
          author_type?: string
          body?: string
          cast_id?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean
          parent_comment_id?: string | null
          reel_id?: string
          staff_member_id?: string | null
          user_id?: string | null
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reel_comments_cast_id_fkey"
            columns: ["cast_id"]
            isOneToOne: false
            referencedRelation: "cast_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "reel_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_comments_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_comments_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "shop_staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_likes: {
        Row: {
          created_at: string
          reel_id: string
          user_id: string | null
          viewer_id: string
        }
        Insert: {
          created_at?: string
          reel_id: string
          user_id?: string | null
          viewer_id: string
        }
        Update: {
          created_at?: string
          reel_id?: string
          user_id?: string | null
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_likes_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      reels: {
        Row: {
          caption: string | null
          cast_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          is_comments_enabled: boolean
          likes_count: number
          link_url: string | null
          media: Json
          pinned_at: string | null
          post_type: string
          posted_by_staff_id: string | null
          preview_url: string | null
          shop_id: string
          status: string
        }
        Insert: {
          caption?: string | null
          cast_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_comments_enabled?: boolean
          likes_count?: number
          link_url?: string | null
          media?: Json
          pinned_at?: string | null
          post_type?: string
          posted_by_staff_id?: string | null
          preview_url?: string | null
          shop_id: string
          status?: string
        }
        Update: {
          caption?: string | null
          cast_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_comments_enabled?: boolean
          likes_count?: number
          link_url?: string | null
          media?: Json
          pinned_at?: string | null
          post_type?: string
          posted_by_staff_id?: string | null
          preview_url?: string | null
          shop_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reels_cast_id_fkey"
            columns: ["cast_id"]
            isOneToOne: false
            referencedRelation: "cast_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reels_posted_by_staff_id_fkey"
            columns: ["posted_by_staff_id"]
            isOneToOne: false
            referencedRelation: "shop_staff_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reels_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          cast_id: string
          date: string
          end_time: string | null
          id: string
          is_working_today: boolean
          start_time: string | null
        }
        Insert: {
          cast_id: string
          date: string
          end_time?: string | null
          id?: string
          is_working_today?: boolean
          start_time?: string | null
        }
        Update: {
          cast_id?: string
          date?: string
          end_time?: string | null
          id?: string
          is_working_today?: boolean
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedules_cast_id_fkey"
            columns: ["cast_id"]
            isOneToOne: false
            referencedRelation: "cast_members"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_events: {
        Row: {
          body: string | null
          created_at: string
          created_by_staff_id: string | null
          ends_at: string | null
          gallery_image_urls: string[]
          id: string
          image_url: string | null
          shop_id: string
          starts_at: string | null
          title: string
          translations: Json
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by_staff_id?: string | null
          ends_at?: string | null
          gallery_image_urls?: string[]
          id?: string
          image_url?: string | null
          shop_id: string
          starts_at?: string | null
          title: string
          translations?: Json
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by_staff_id?: string | null
          ends_at?: string | null
          gallery_image_urls?: string[]
          id?: string
          image_url?: string | null
          shop_id?: string
          starts_at?: string | null
          title?: string
          translations?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_events_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "shop_staff_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_inquiries: {
        Row: {
          contact: string | null
          created_at: string
          customer_name: string | null
          id: string
          shop_id: string
          status: string
          updated_at: string
          viewer_id: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          customer_name?: string | null
          id?: string
          shop_id: string
          status?: string
          updated_at?: string
          viewer_id: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          customer_name?: string | null
          id?: string
          shop_id?: string
          status?: string
          updated_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_inquiries_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_inquiry_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          inquiry_id: string
          sender_type: string
          shop_staff_id: string | null
          staff_member_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          inquiry_id: string
          sender_type: string
          shop_staff_id?: string | null
          staff_member_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          inquiry_id?: string
          sender_type?: string
          shop_staff_id?: string | null
          staff_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_inquiry_messages_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "shop_inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_inquiry_messages_shop_staff_id_fkey"
            columns: ["shop_staff_id"]
            isOneToOne: false
            referencedRelation: "shop_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_inquiry_messages_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "shop_staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_login_recovery_attempts: {
        Row: {
          attempt_key: string
          attempted_at: string
          id: number
          succeeded: boolean
        }
        Insert: {
          attempt_key: string
          attempted_at?: string
          id?: never
          succeeded: boolean
        }
        Update: {
          attempt_key?: string
          attempted_at?: string
          id?: never
          succeeded?: boolean
        }
        Relationships: []
      }
      shop_price_items: {
        Row: {
          created_at: string
          display_order: number
          duration_minutes: number | null
          id: string
          name: string
          name_translations: Json
          price: number
          shop_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          duration_minutes?: number | null
          id?: string
          name: string
          name_translations?: Json
          price: number
          shop_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          duration_minutes?: number | null
          id?: string
          name?: string
          name_translations?: Json
          price?: number
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_price_items_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_staff: {
        Row: {
          created_at: string
          id: string
          login_email: string | null
          role: string
          shop_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          login_email?: string | null
          role?: string
          shop_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          login_email?: string | null
          role?: string
          shop_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_staff_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_staff_members: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          id: string
          name: string
          shop_id: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          name: string
          shop_id: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          name?: string
          shop_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_staff_members_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          address: string | null
          address_en: string | null
          area: string | null
          building_name: string | null
          business_hours: string | null
          cover_image_url: string | null
          created_at: string
          description: string | null
          featured_rank: number | null
          floor: string | null
          genre: string | null
          geocode_source: string | null
          geocoded_at: string | null
          hero_media_type: string
          hero_media_url: string | null
          id: string
          is_sponsored: boolean
          is_verified: boolean
          lat: number | null
          line_qr_image_url: string | null
          line_url: string | null
          lng: number | null
          map_preview_reel_id: string | null
          map_video_enabled: boolean
          metadata: Json
          name: string
          phone: string | null
          plan: string
          price_info: string | null
          shop_code: string
          sns_links: Json
          sponsored_rank: number | null
          status: string
          supports_english: boolean
          tagline: string | null
          translations: Json
          usage_notes: string | null
          website_url: string | null
        }
        Insert: {
          address?: string | null
          address_en?: string | null
          area?: string | null
          building_name?: string | null
          business_hours?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          featured_rank?: number | null
          floor?: string | null
          genre?: string | null
          geocode_source?: string | null
          geocoded_at?: string | null
          hero_media_type?: string
          hero_media_url?: string | null
          id?: string
          is_sponsored?: boolean
          is_verified?: boolean
          lat?: number | null
          line_qr_image_url?: string | null
          line_url?: string | null
          lng?: number | null
          map_preview_reel_id?: string | null
          map_video_enabled?: boolean
          metadata?: Json
          name: string
          phone?: string | null
          plan?: string
          price_info?: string | null
          shop_code: string
          sns_links?: Json
          sponsored_rank?: number | null
          status?: string
          supports_english?: boolean
          tagline?: string | null
          translations?: Json
          usage_notes?: string | null
          website_url?: string | null
        }
        Update: {
          address?: string | null
          address_en?: string | null
          area?: string | null
          building_name?: string | null
          business_hours?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          featured_rank?: number | null
          floor?: string | null
          genre?: string | null
          geocode_source?: string | null
          geocoded_at?: string | null
          hero_media_type?: string
          hero_media_url?: string | null
          id?: string
          is_sponsored?: boolean
          is_verified?: boolean
          lat?: number | null
          line_qr_image_url?: string | null
          line_url?: string | null
          lng?: number | null
          map_preview_reel_id?: string | null
          map_video_enabled?: boolean
          metadata?: Json
          name?: string
          phone?: string | null
          plan?: string
          price_info?: string | null
          shop_code?: string
          sns_links?: Json
          sponsored_rank?: number | null
          status?: string
          supports_english?: boolean
          tagline?: string | null
          translations?: Json
          usage_notes?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shops_map_preview_reel_id_fkey"
            columns: ["map_preview_reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      sos_sessions: {
        Row: {
          created_at: string
          id: string
          last_notified_at: string | null
          retry_count: number | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_notified_at?: string | null
          retry_count?: number | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_notified_at?: string | null
          retry_count?: number | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      staff_login_tokens: {
        Row: {
          created_at: string
          shop_id: string
          staff_member_id: string
          token: string
        }
        Insert: {
          created_at?: string
          shop_id: string
          staff_member_id: string
          token?: string
        }
        Update: {
          created_at?: string
          shop_id?: string
          staff_member_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_login_tokens_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_login_tokens_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: true
            referencedRelation: "shop_staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      user_cast_follows: {
        Row: {
          cast_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          cast_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          cast_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_cast_follows_cast_id_fkey"
            columns: ["cast_id"]
            isOneToOne: false
            referencedRelation: "cast_members"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          nickname: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          nickname?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          nickname?: string
        }
        Relationships: []
      }
      user_shop_favorites: {
        Row: {
          created_at: string
          shop_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          shop_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          shop_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_shop_favorites_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_inquiry_message: {
        Args: { p_body: string; p_inquiry_id: string; p_viewer_id: string }
        Returns: undefined
      }
      admin_create_login_for_shop: {
        Args: { p_email?: string; p_password?: string; p_shop_id: string }
        Returns: {
          initial_password: string
          login_email: string
        }[]
      }
      admin_issue_shop_login: {
        Args: { p_shop_id: string }
        Returns: {
          initial_password: string
          login_email: string
        }[]
      }
      admin_provision_shop:
        | {
            Args: {
              p_area: string
              p_genre: string
              p_name: string
              p_owner_email: string
              p_owner_password?: string
              p_plan: string
            }
            Returns: {
              initial_password: string
              login_email: string
              shop_id: string
            }[]
          }
        | {
            Args: {
              p_address?: string
              p_area: string
              p_genre: string
              p_name: string
              p_owner_email: string
              p_owner_password?: string
              p_plan: string
            }
            Returns: {
              initial_password: string
              login_email: string
              shop_id: string
            }[]
          }
      admin_reset_shop_login_password: {
        Args: { p_password?: string; p_shop_staff_id: string }
        Returns: {
          login_email: string
          new_password: string
        }[]
      }
      admin_start_impersonation: {
        Args: { p_shop_id: string }
        Returns: undefined
      }
      admin_stop_impersonation: { Args: never; Returns: undefined }
      cast_has_replied_to_comment: {
        Args: { p_parent_comment_id: string }
        Returns: boolean
      }
      cast_ids_with_active_story: {
        Args: { p_cast_ids: string[] }
        Returns: string[]
      }
      check_person_risk: {
        Args: {
          p_dob_hash: string
          p_name_hash: string
          p_phone_hash: string
          p_target_type?: string
        }
        Returns: {
          hit_count: number
          match_level: string
          max_risk_level: number
        }[]
      }
      count_cast_followers: { Args: { p_cast_id: string }; Returns: number }
      count_shop_favorites: { Args: { p_shop_id: string }; Returns: number }
      create_cast_invite: {
        Args: { p_cast_id: string }
        Returns: {
          initial_password: string
          login_email: string
        }[]
      }
      create_shop_inquiry: {
        Args: {
          p_body: string
          p_contact: string
          p_customer_name: string
          p_shop_id: string
          p_viewer_id: string
        }
        Returns: string
      }
      create_staff_invite: {
        Args: { p_staff_member_id: string }
        Returns: {
          initial_password: string
          login_email: string
        }[]
      }
      current_cast_id: { Args: never; Returns: string }
      current_shop_ids: { Args: never; Returns: string[] }
      current_staff_member_id: { Args: never; Returns: string }
      current_staff_shop_id: { Args: never; Returns: string }
      customer_has_commented_on_reel: {
        Args: { p_reel_id: string; p_user_id: string }
        Returns: boolean
      }
      generate_cast_code: { Args: never; Returns: string }
      generate_shop_code: { Args: never; Returns: string }
      get_inquiry_thread: {
        Args: { p_inquiry_id: string; p_viewer_id: string }
        Returns: {
          created_at: string
          id: string
          messages: Json
          shop_id: string
          shop_name: string
          status: string
        }[]
      }
      get_user_id_by_email: { Args: { p_email: string }; Returns: string }
      is_area_photo_admin: { Args: never; Returns: boolean }
      is_own_reel_customer_comment: {
        Args: { p_comment_id: string; p_reel_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      locapass_add_shop_member: {
        Args: { p_email: string; p_role: string; p_shop_id: string }
        Returns: undefined
      }
      locapass_add_site_admin: {
        Args: { p_email: string; p_site_id: number }
        Returns: undefined
      }
      locapass_can_manage_shop: {
        Args: { p_shop_id: string }
        Returns: boolean
      }
      locapass_checkin: {
        Args: { p_lat: number; p_lng: number; p_shop_id: string }
        Returns: {
          checkin_date: string
          created_at: string
          distance_m: number
          id: string
          lat: number
          lng: number
          member_id: string
          shop_id: string
        }
        SetofOptions: {
          from: "*"
          to: "locapass_checkins"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      locapass_haversine_meters: {
        Args: { p_lat1: number; p_lat2: number; p_lng1: number; p_lng2: number }
        Returns: number
      }
      locapass_is_root_admin: { Args: never; Returns: boolean }
      locapass_is_shop_owner: { Args: { p_shop_id: string }; Returns: boolean }
      locapass_is_site_admin: { Args: { p_site_id: number }; Returns: boolean }
      locapass_list_shop_members: {
        Args: { p_shop_id: string }
        Returns: {
          created_at: string
          email: string
          role: string
          user_id: string
        }[]
      }
      locapass_list_site_admins: {
        Args: { p_site_id: number }
        Returns: {
          created_at: string
          email: string
          user_id: string
        }[]
      }
      locapass_list_site_shop_owners: {
        Args: { p_site_id: number }
        Returns: {
          owner_emails: string
          shop_id: string
        }[]
      }
      locapass_my_roles: { Args: never; Returns: Json }
      recover_cast_login: {
        Args: { p_birth_date: string; p_phone: string }
        Returns: {
          login_email: string
          one_time_password: string
        }[]
      }
      recover_shop_login: {
        Args: { p_phone: string; p_shop_code: string }
        Returns: {
          login_email: string
          one_time_password: string
        }[]
      }
      redeem_cast_login_token: {
        Args: { p_token: string }
        Returns: {
          login_email: string
          one_time_password: string
        }[]
      }
      redeem_staff_login_token: {
        Args: { p_token: string }
        Returns: {
          login_email: string
          one_time_password: string
        }[]
      }
      regenerate_cast_login_token: {
        Args: { p_cast_id: string }
        Returns: string
      }
      regenerate_staff_login_token: {
        Args: { p_staff_member_id: string }
        Returns: string
      }
      update_own_cast_profile: {
        Args: { p_avatar_url?: string; p_name: string; p_pr_text: string }
        Returns: undefined
      }
      update_own_staff_profile: {
        Args: { p_avatar_url?: string; p_bio: string; p_name: string }
        Returns: undefined
      }
      venue_card_reels: {
        Args: { p_shop_ids: string[] }
        Returns: {
          latest_preview_url: string
          latest_video_url: string
          reel_count: number
          shop_id: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
