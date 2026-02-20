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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_models: {
        Row: {
          allow_in_production: boolean
          commercial_safe_status: Database["public"]["Enums"]["commercial_safe_status"]
          created_at: string
          display_name: string
          id: string
          license_summary: string | null
          license_url: string | null
          model_key: string
          provider_id: string
          task_types: string[]
        }
        Insert: {
          allow_in_production?: boolean
          commercial_safe_status?: Database["public"]["Enums"]["commercial_safe_status"]
          created_at?: string
          display_name: string
          id?: string
          license_summary?: string | null
          license_url?: string | null
          model_key: string
          provider_id: string
          task_types?: string[]
        }
        Update: {
          allow_in_production?: boolean
          commercial_safe_status?: Database["public"]["Enums"]["commercial_safe_status"]
          created_at?: string
          display_name?: string
          id?: string
          license_summary?: string | null
          license_url?: string | null
          model_key?: string
          provider_id?: string
          task_types?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "ai_models_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_providers: {
        Row: {
          commercial_use_allowed: boolean
          created_at: string
          docs_url: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          type: Database["public"]["Enums"]["ai_provider_type"]
        }
        Insert: {
          commercial_use_allowed?: boolean
          created_at?: string
          docs_url?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          type: Database["public"]["Enums"]["ai_provider_type"]
        }
        Update: {
          commercial_use_allowed?: boolean
          created_at?: string
          docs_url?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          type?: Database["public"]["Enums"]["ai_provider_type"]
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          meta: Json | null
          user_id: string
          venue_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          meta?: Json | null
          user_id: string
          venue_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          meta?: Json | null
          user_id?: string
          venue_id?: string
        }
        Relationships: []
      }
      background_assets: {
        Row: {
          allow_in_production: boolean
          category: string
          commercial_safe_status: Database["public"]["Enums"]["commercial_safe_status"]
          created_at: string
          file_url: string
          id: string
          license_proof_file_url: string | null
          license_type: Database["public"]["Enums"]["license_type"]
          license_url: string | null
          name: string
          storage_path: string | null
          uploaded_by: string | null
          venue_id: string | null
          vibe_tags: string[]
        }
        Insert: {
          allow_in_production?: boolean
          category: string
          commercial_safe_status?: Database["public"]["Enums"]["commercial_safe_status"]
          created_at?: string
          file_url: string
          id?: string
          license_proof_file_url?: string | null
          license_type?: Database["public"]["Enums"]["license_type"]
          license_url?: string | null
          name: string
          storage_path?: string | null
          uploaded_by?: string | null
          venue_id?: string | null
          vibe_tags?: string[]
        }
        Update: {
          allow_in_production?: boolean
          category?: string
          commercial_safe_status?: Database["public"]["Enums"]["commercial_safe_status"]
          created_at?: string
          file_url?: string
          id?: string
          license_proof_file_url?: string | null
          license_type?: Database["public"]["Enums"]["license_type"]
          license_url?: string | null
          name?: string
          storage_path?: string | null
          uploaded_by?: string | null
          venue_id?: string | null
          vibe_tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "background_assets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_assets: {
        Row: {
          bucket: string
          created_at: string
          id: string
          is_primary: boolean | null
          storage_path: string
          tags: Json | null
          uploaded_by: string
          venue_id: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: string
          is_primary?: boolean | null
          storage_path: string
          tags?: Json | null
          uploaded_by: string
          venue_id: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: string
          is_primary?: boolean | null
          storage_path?: string
          tags?: Json | null
          uploaded_by?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_assets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_kit_files: {
        Row: {
          category: string | null
          created_at: string
          file_name: string
          file_type: string
          id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string
          venue_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          file_name: string
          file_type: string
          id?: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by: string
          venue_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          file_name?: string
          file_type?: string
          id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_kit_files_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_kits: {
        Row: {
          created_at: string
          example_urls: Json | null
          id: string
          preset: string | null
          rules_text: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          example_urls?: Json | null
          id?: string
          preset?: string | null
          rules_text?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          example_urls?: Json | null
          id?: string
          preset?: string | null
          rules_text?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_kits_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_visual_presets: {
        Row: {
          created_at: string
          default_background_category: string | null
          grade_settings_json: Json
          id: string
          is_default: boolean
          overlay_style_json: Json
          preset_name: string
          updated_at: string
          venue_id: string
          vibe: Database["public"]["Enums"]["venue_vibe"]
        }
        Insert: {
          created_at?: string
          default_background_category?: string | null
          grade_settings_json?: Json
          id?: string
          is_default?: boolean
          overlay_style_json?: Json
          preset_name: string
          updated_at?: string
          venue_id: string
          vibe?: Database["public"]["Enums"]["venue_vibe"]
        }
        Update: {
          created_at?: string
          default_background_category?: string | null
          grade_settings_json?: Json
          id?: string
          is_default?: boolean
          overlay_style_json?: Json
          preset_name?: string
          updated_at?: string
          venue_id?: string
          vibe?: Database["public"]["Enums"]["venue_vibe"]
        }
        Relationships: [
          {
            foreignKeyName: "brand_visual_presets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          asset_type: string | null
          buffer_payload: Json | null
          buffer_update_id: string | null
          caption_draft: string | null
          caption_final: string | null
          change_reason: string | null
          created_at: string
          id: string
          intent: string | null
          media_master_url: string | null
          media_variants: Json | null
          scheduled_for: string | null
          status: string | null
          updated_at: string
          upload_id: string | null
          used_background_asset_ids: Json | null
          used_crockery_asset_ids: Json | null
          venue_id: string
        }
        Insert: {
          asset_type?: string | null
          buffer_payload?: Json | null
          buffer_update_id?: string | null
          caption_draft?: string | null
          caption_final?: string | null
          change_reason?: string | null
          created_at?: string
          id?: string
          intent?: string | null
          media_master_url?: string | null
          media_variants?: Json | null
          scheduled_for?: string | null
          status?: string | null
          updated_at?: string
          upload_id?: string | null
          used_background_asset_ids?: Json | null
          used_crockery_asset_ids?: Json | null
          venue_id: string
        }
        Update: {
          asset_type?: string | null
          buffer_payload?: Json | null
          buffer_update_id?: string | null
          caption_draft?: string | null
          caption_final?: string | null
          change_reason?: string | null
          created_at?: string
          id?: string
          intent?: string | null
          media_master_url?: string | null
          media_variants?: Json | null
          scheduled_for?: string | null
          status?: string | null
          updated_at?: string
          upload_id?: string | null
          used_background_asset_ids?: Json | null
          used_crockery_asset_ids?: Json | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_items_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      copy_outputs: {
        Row: {
          content: string
          created_at: string
          id: string
          project_id: string
          title: string | null
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          project_id: string
          title?: string | null
          version?: number
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          project_id?: string
          title?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "copy_outputs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "copy_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      copy_projects: {
        Row: {
          created_at: string
          created_by: string
          goal: string
          id: string
          inputs: Json
          module: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          goal: string
          id?: string
          inputs?: Json
          module: string
          venue_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          goal?: string
          id?: string
          inputs?: Json
          module?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copy_projects_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      edited_assets: {
        Row: {
          compliance_notes: string | null
          compliance_status: string | null
          created_at: string
          created_by: string
          engine_version: Database["public"]["Enums"]["engine_version"]
          id: string
          model_id: string | null
          output_types: string[]
          output_urls: string[]
          provider_id: string | null
          settings_json: Json
          source_asset_id: string | null
          source_url: string | null
          venue_id: string
        }
        Insert: {
          compliance_notes?: string | null
          compliance_status?: string | null
          created_at?: string
          created_by: string
          engine_version?: Database["public"]["Enums"]["engine_version"]
          id?: string
          model_id?: string | null
          output_types?: string[]
          output_urls?: string[]
          provider_id?: string | null
          settings_json?: Json
          source_asset_id?: string | null
          source_url?: string | null
          venue_id: string
        }
        Update: {
          compliance_notes?: string | null
          compliance_status?: string | null
          created_at?: string
          created_by?: string
          engine_version?: Database["public"]["Enums"]["engine_version"]
          id?: string
          model_id?: string | null
          output_types?: string[]
          output_urls?: string[]
          provider_id?: string | null
          settings_json?: Json
          source_asset_id?: string | null
          source_url?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "edited_assets_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "ai_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edited_assets_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edited_assets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      editor_jobs: {
        Row: {
          created_at: string
          created_by: string
          cutout_url: string | null
          error_message: string | null
          fidelity_confirmed: boolean
          fidelity_confirmed_at: string | null
          final_image_url: string | null
          final_image_variants: Json | null
          final_video_url: string | null
          hook_text: string | null
          id: string
          input_image_height: number | null
          input_image_url: string | null
          input_image_width: number | null
          mode: string
          realism_mode: string
          replated_url: string | null
          status: string
          style_preset: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          cutout_url?: string | null
          error_message?: string | null
          fidelity_confirmed?: boolean
          fidelity_confirmed_at?: string | null
          final_image_url?: string | null
          final_image_variants?: Json | null
          final_video_url?: string | null
          hook_text?: string | null
          id?: string
          input_image_height?: number | null
          input_image_url?: string | null
          input_image_width?: number | null
          mode?: string
          realism_mode?: string
          replated_url?: string | null
          status?: string
          style_preset?: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          cutout_url?: string | null
          error_message?: string | null
          fidelity_confirmed?: boolean
          fidelity_confirmed_at?: string | null
          final_image_url?: string | null
          final_image_variants?: Json | null
          final_video_url?: string | null
          hook_text?: string | null
          id?: string
          input_image_height?: number | null
          input_image_url?: string | null
          input_image_width?: number | null
          mode?: string
          realism_mode?: string
          replated_url?: string | null
          status?: string
          style_preset?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "editor_jobs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      editor_usage: {
        Row: {
          id: string
          month: string
          pro_photo_used: number
          reel_used: number
          venue_id: string
        }
        Insert: {
          id?: string
          month: string
          pro_photo_used?: number
          reel_used?: number
          venue_id: string
        }
        Update: {
          id?: string
          month?: string
          pro_photo_used?: number
          reel_used?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "editor_usage_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      event_plan_links: {
        Row: {
          content_item_id: string | null
          copy_project_id: string | null
          created_at: string
          id: string
          kind: string
          plan_id: string
          updated_at: string
        }
        Insert: {
          content_item_id?: string | null
          copy_project_id?: string | null
          created_at?: string
          id?: string
          kind: string
          plan_id: string
          updated_at?: string
        }
        Update: {
          content_item_id?: string | null
          copy_project_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_plan_links_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_plan_links_copy_project_id_fkey"
            columns: ["copy_project_id"]
            isOneToOne: false
            referencedRelation: "copy_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_plan_links_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "venue_event_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      event_plan_tasks: {
        Row: {
          created_at: string
          id: string
          is_done: boolean
          plan_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_done?: boolean
          plan_id: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_done?: boolean
          plan_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_plan_tasks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "venue_event_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      events_catalog: {
        Row: {
          category: string | null
          city: string | null
          country_code: string | null
          created_at: string
          ends_at: string | null
          id: string
          raw: Json | null
          source: string
          source_id: string | null
          starts_at: string
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          category?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          raw?: Json | null
          source: string
          source_id?: string | null
          starts_at: string
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          category?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          raw?: Json | null
          source?: string
          source_id?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          config_json: Json
          created_at: string
          flag_key: string
          id: string
          is_enabled: boolean
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          config_json?: Json
          created_at?: string
          flag_key: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          config_json?: Json
          created_at?: string
          flag_key?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      overlay_templates: {
        Row: {
          allow_in_production: boolean
          commercial_safe_status: Database["public"]["Enums"]["commercial_safe_status"]
          created_at: string
          id: string
          layout_schema: Json
          license_type: Database["public"]["Enums"]["license_type"]
          name: string
          preview_url: string | null
          style_tags: string[]
          venue_id: string | null
        }
        Insert: {
          allow_in_production?: boolean
          commercial_safe_status?: Database["public"]["Enums"]["commercial_safe_status"]
          created_at?: string
          id?: string
          layout_schema?: Json
          license_type?: Database["public"]["Enums"]["license_type"]
          name: string
          preview_url?: string | null
          style_tags?: string[]
          venue_id?: string | null
        }
        Update: {
          allow_in_production?: boolean
          commercial_safe_status?: Database["public"]["Enums"]["commercial_safe_status"]
          created_at?: string
          id?: string
          layout_schema?: Json
          license_type?: Database["public"]["Enums"]["license_type"]
          name?: string
          preview_url?: string | null
          style_tags?: string[]
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "overlay_templates_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_api_keys: {
        Row: {
          category: string
          created_at: string
          description: string | null
          health_status: string
          id: string
          is_configured: boolean
          is_required: boolean
          is_secret: boolean
          key_name: string
          key_value: string
          last_checked_at: string | null
          last_error: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          health_status?: string
          id?: string
          is_configured?: boolean
          is_required?: boolean
          is_secret?: boolean
          key_name: string
          key_value?: string
          last_checked_at?: string | null
          last_error?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          health_status?: string
          id?: string
          is_configured?: boolean
          is_required?: boolean
          is_secret?: boolean
          key_name?: string
          key_value?: string
          last_checked_at?: string | null
          last_error?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      review_sources: {
        Row: {
          created_at: string
          external_id: string
          id: string
          is_enabled: boolean
          source: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          is_enabled?: boolean
          source: string
          venue_id: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          is_enabled?: boolean
          source?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_sources_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_name: string | null
          created_at: string
          external_review_id: string
          id: string
          rating: number | null
          raw_payload: Json | null
          review_date: string | null
          review_text: string | null
          source: string
          venue_id: string
        }
        Insert: {
          author_name?: string | null
          created_at?: string
          external_review_id: string
          id?: string
          rating?: number | null
          raw_payload?: Json | null
          review_date?: string | null
          review_text?: string | null
          source: string
          venue_id: string
        }
        Update: {
          author_name?: string | null
          created_at?: string
          external_review_id?: string
          id?: string
          rating?: number | null
          raw_payload?: Json | null
          review_date?: string | null
          review_text?: string | null
          source?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      style_analysis: {
        Row: {
          analysis_json: Json
          asset_id: string
          channel: Database["public"]["Enums"]["style_channel"]
          confidence_score: number
          created_at: string
          embedding: Json | null
          id: string
          summary_text: string | null
          venue_id: string
        }
        Insert: {
          analysis_json?: Json
          asset_id: string
          channel: Database["public"]["Enums"]["style_channel"]
          confidence_score?: number
          created_at?: string
          embedding?: Json | null
          id?: string
          summary_text?: string | null
          venue_id: string
        }
        Update: {
          analysis_json?: Json
          asset_id?: string
          channel?: Database["public"]["Enums"]["style_channel"]
          confidence_score?: number
          created_at?: string
          embedding?: Json | null
          id?: string
          summary_text?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "style_analysis_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "style_reference_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "style_analysis_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      style_reference_assets: {
        Row: {
          channel: Database["public"]["Enums"]["style_channel"]
          created_at: string
          created_by: string
          id: string
          pinned: boolean
          status: Database["public"]["Enums"]["style_asset_status"]
          storage_path: string
          thumbnail_path: string | null
          type: Database["public"]["Enums"]["style_asset_type"]
          user_notes: string | null
          venue_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["style_channel"]
          created_at?: string
          created_by: string
          id?: string
          pinned?: boolean
          status?: Database["public"]["Enums"]["style_asset_status"]
          storage_path: string
          thumbnail_path?: string | null
          type?: Database["public"]["Enums"]["style_asset_type"]
          user_notes?: string | null
          venue_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["style_channel"]
          created_at?: string
          created_by?: string
          id?: string
          pinned?: boolean
          status?: Database["public"]["Enums"]["style_asset_status"]
          storage_path?: string
          thumbnail_path?: string | null
          type?: Database["public"]["Enums"]["style_asset_type"]
          user_notes?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "style_reference_assets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      uploads: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          status: string | null
          storage_path: string
          uploaded_by: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          status?: string | null
          storage_path: string
          uploaded_by: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          status?: string | null
          storage_path?: string
          uploaded_by?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uploads_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      venue_event_plans: {
        Row: {
          ai_recommendation: Json | null
          created_at: string
          decision: Json
          deployed_at: string | null
          ends_at: string | null
          event_id: string | null
          id: string
          skip_reason: string | null
          snoozed_until: string | null
          starts_at: string
          status: string
          title: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          ai_recommendation?: Json | null
          created_at?: string
          decision?: Json
          deployed_at?: string | null
          ends_at?: string | null
          event_id?: string | null
          id?: string
          skip_reason?: string | null
          snoozed_until?: string | null
          starts_at: string
          status?: string
          title: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          ai_recommendation?: Json | null
          created_at?: string
          decision?: Json
          deployed_at?: string | null
          ends_at?: string | null
          event_id?: string | null
          id?: string
          skip_reason?: string | null
          snoozed_until?: string | null
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_event_plans_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_event_plans_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
          last_sent_at: string | null
          role: string
          send_count: number
          venue_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string | null
          role?: string
          send_count?: number
          venue_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string | null
          role?: string
          send_count?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_invites_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_limits: {
        Row: {
          monthly_pro_photo_credits: number
          monthly_reel_credits: number
          reset_day: number
          venue_id: string
        }
        Insert: {
          monthly_pro_photo_credits?: number
          monthly_reel_credits?: number
          reset_day?: number
          venue_id: string
        }
        Update: {
          monthly_pro_photo_credits?: number
          monthly_reel_credits?: number
          reset_day?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_limits_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_members: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_members_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_style_profile: {
        Row: {
          atmosphere_profile: Json
          brand_profile: Json
          merged_profile: Json
          plating_profile: Json
          updated_at: string
          venue_id: string
        }
        Insert: {
          atmosphere_profile?: Json
          brand_profile?: Json
          merged_profile?: Json
          plating_profile?: Json
          updated_at?: string
          venue_id: string
        }
        Update: {
          atmosphere_profile?: Json
          brand_profile?: Json
          merged_profile?: Json
          plating_profile?: Json
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_style_profile_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          city: string | null
          country_code: string
          created_at: string
          default_lead_time_days: number
          id: string
          lat: number | null
          lng: number | null
          name: string
          owner_user_id: string | null
          plan: string | null
          timezone: string
        }
        Insert: {
          city?: string | null
          country_code?: string
          created_at?: string
          default_lead_time_days?: number
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          owner_user_id?: string | null
          plan?: string | null
          timezone?: string
        }
        Update: {
          city?: string | null
          country_code?: string
          created_at?: string
          default_lead_time_days?: number
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          owner_user_id?: string | null
          plan?: string | null
          timezone?: string
        }
        Relationships: []
      }
      waitlist_signups: {
        Row: {
          created_at: string
          email: string
          id: string
          venue_name: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          venue_name?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          venue_name?: string | null
        }
        Relationships: []
      }
      weekly_review_reports: {
        Row: {
          action_items: Json | null
          created_at: string
          id: string
          reply_templates: Json | null
          stats: Json | null
          summary_md: string | null
          venue_id: string
          week_end: string
          week_start: string
        }
        Insert: {
          action_items?: Json | null
          created_at?: string
          id?: string
          reply_templates?: Json | null
          stats?: Json | null
          summary_md?: string | null
          venue_id: string
          week_end: string
          week_start: string
        }
        Update: {
          action_items?: Json | null
          created_at?: string
          id?: string
          reply_templates?: Json | null
          stats?: Json | null
          summary_md?: string | null
          venue_id?: string
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_review_reports_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_venue_invites: { Args: never; Returns: number }
      can_manage_member: {
        Args: { p_target_user_id: string; p_venue_id: string }
        Returns: boolean
      }
      compute_channel_profile: {
        Args: { p_channel: string; p_venue_id: string }
        Returns: Json
      }
      freq_consistency: { Args: { freq: Json }; Returns: number }
      freq_dist: { Args: { freq: Json }; Returns: Json }
      freq_primary: { Args: { freq: Json }; Returns: string }
      get_my_venue_role: { Args: { p_venue_id: string }; Returns: string }
      is_platform_admin: { Args: { check_user_id: string }; Returns: boolean }
      is_venue_admin: {
        Args: { check_user_id: string; check_venue_id: string }
        Returns: boolean
      }
      is_venue_member: {
        Args: { check_user_id: string; check_venue_id: string }
        Returns: boolean
      }
      is_venue_owner: {
        Args: { p_user_id: string; p_venue_id: string }
        Returns: boolean
      }
      ordinal_label: { Args: { score: number }; Returns: string }
      rebuild_venue_style_profile: {
        Args: { p_venue_id: string }
        Returns: undefined
      }
      remove_member: {
        Args: { p_target_user_id: string; p_venue_id: string }
        Returns: undefined
      }
      role_rank: { Args: { p_role: string }; Returns: number }
      top_tags: { Args: { freq: Json; max_tags?: number }; Returns: Json }
      transfer_venue_ownership: {
        Args: { p_new_owner_id: string; p_venue_id: string }
        Returns: undefined
      }
    }
    Enums: {
      ai_provider_type: "image" | "video" | "text"
      commercial_safe_status: "approved" | "blocked" | "review_required"
      engine_version: "v1" | "v2"
      license_type:
        | "owned"
        | "commercial_stock"
        | "cc0"
        | "user_uploaded"
        | "other"
      style_asset_status: "pending_analysis" | "analyzed" | "failed"
      style_asset_type: "image" | "video"
      style_channel: "brand" | "atmosphere" | "plating"
      venue_vibe: "casual" | "premium" | "luxury" | "nightlife" | "family"
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
      ai_provider_type: ["image", "video", "text"],
      commercial_safe_status: ["approved", "blocked", "review_required"],
      engine_version: ["v1", "v2"],
      license_type: [
        "owned",
        "commercial_stock",
        "cc0",
        "user_uploaded",
        "other",
      ],
      style_asset_status: ["pending_analysis", "analyzed", "failed"],
      style_asset_type: ["image", "video"],
      style_channel: ["brand", "atmosphere", "plating"],
      venue_vibe: ["casual", "premium", "luxury", "nightlife", "family"],
    },
  },
} as const
