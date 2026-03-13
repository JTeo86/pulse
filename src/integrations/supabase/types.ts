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
      action_feed_items: {
        Row: {
          action_type: string
          completed_at: string | null
          created_at: string
          cta_label: string
          cta_route: string
          description: string
          expires_at: string | null
          id: string
          priority: string
          source_data: Json | null
          status: string
          title: string
          venue_id: string
        }
        Insert: {
          action_type: string
          completed_at?: string | null
          created_at?: string
          cta_label: string
          cta_route: string
          description: string
          expires_at?: string | null
          id?: string
          priority: string
          source_data?: Json | null
          status?: string
          title: string
          venue_id: string
        }
        Update: {
          action_type?: string
          completed_at?: string | null
          created_at?: string
          cta_label?: string
          cta_route?: string
          description?: string
          expires_at?: string | null
          id?: string
          priority?: string
          source_data?: Json | null
          status?: string
          title?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_feed_items_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
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
      content_assets: {
        Row: {
          asset_type: string
          created_at: string
          created_by: string | null
          derived_from_editor_job_id: string | null
          duration_seconds: number | null
          generation_settings: Json | null
          height: number | null
          id: string
          is_favorite: boolean
          is_style_reference: boolean
          lineage_depth: number
          metadata: Json
          mime_type: string | null
          parent_asset_id: string | null
          prompt_snapshot: Json | null
          public_url: string | null
          root_asset_id: string | null
          source_job_id: string | null
          source_type: string
          status: string
          storage_path: string | null
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          venue_id: string
          width: number | null
        }
        Insert: {
          asset_type: string
          created_at?: string
          created_by?: string | null
          derived_from_editor_job_id?: string | null
          duration_seconds?: number | null
          generation_settings?: Json | null
          height?: number | null
          id?: string
          is_favorite?: boolean
          is_style_reference?: boolean
          lineage_depth?: number
          metadata?: Json
          mime_type?: string | null
          parent_asset_id?: string | null
          prompt_snapshot?: Json | null
          public_url?: string | null
          root_asset_id?: string | null
          source_job_id?: string | null
          source_type: string
          status?: string
          storage_path?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          venue_id: string
          width?: number | null
        }
        Update: {
          asset_type?: string
          created_at?: string
          created_by?: string | null
          derived_from_editor_job_id?: string | null
          duration_seconds?: number | null
          generation_settings?: Json | null
          height?: number | null
          id?: string
          is_favorite?: boolean
          is_style_reference?: boolean
          lineage_depth?: number
          metadata?: Json
          mime_type?: string | null
          parent_asset_id?: string | null
          prompt_snapshot?: Json | null
          public_url?: string | null
          root_asset_id?: string | null
          source_job_id?: string | null
          source_type?: string
          status?: string
          storage_path?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          venue_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_assets_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "content_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_assets_root_asset_id_fkey"
            columns: ["root_asset_id"]
            isOneToOne: false
            referencedRelation: "content_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_assets_venue_id_fkey"
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
          output_asset_id: string | null
          provider: string | null
          provider_job_id: string | null
          provider_settings: Json | null
          realism_mode: string
          replated_url: string | null
          source_asset_id: string | null
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
          output_asset_id?: string | null
          provider?: string | null
          provider_job_id?: string | null
          provider_settings?: Json | null
          realism_mode?: string
          replated_url?: string | null
          source_asset_id?: string | null
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
          output_asset_id?: string | null
          provider?: string | null
          provider_job_id?: string | null
          provider_settings?: Json | null
          realism_mode?: string
          replated_url?: string | null
          source_asset_id?: string | null
          status?: string
          style_preset?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "editor_jobs_output_asset_id_fkey"
            columns: ["output_asset_id"]
            isOneToOne: false
            referencedRelation: "content_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editor_jobs_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "content_assets"
            referencedColumns: ["id"]
          },
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
      guest_submissions: {
        Row: {
          created_at: string
          generated_caption: string | null
          guest_name: string | null
          id: string
          image_url: string
          processed_image_url: string | null
          status: string
          suggested_hashtags: string[] | null
          suggested_post_time: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          generated_caption?: string | null
          guest_name?: string | null
          id?: string
          image_url: string
          processed_image_url?: string | null
          status?: string
          suggested_hashtags?: string[] | null
          suggested_post_time?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string
          generated_caption?: string | null
          guest_name?: string | null
          id?: string
          image_url?: string
          processed_image_url?: string | null
          status?: string
          suggested_hashtags?: string[] | null
          suggested_post_time?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_submissions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_plans: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          plan_data: Json
          status: string
          venue_id: string
          week_start: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          plan_data?: Json
          status?: string
          venue_id: string
          week_start: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          plan_data?: Json
          status?: string
          venue_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_plans_venue_id_fkey"
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
      payout_batches: {
        Row: {
          approved_at: string | null
          batch_month: string
          created_at: string
          id: string
          net_payout: number
          paid_at: string | null
          pulse_fee: number
          status: string
          stripe_transfer_batch_id: string | null
          total_commission: number
          venue_id: string
        }
        Insert: {
          approved_at?: string | null
          batch_month: string
          created_at?: string
          id?: string
          net_payout?: number
          paid_at?: string | null
          pulse_fee?: number
          status?: string
          stripe_transfer_batch_id?: string | null
          total_commission?: number
          venue_id: string
        }
        Update: {
          approved_at?: string | null
          batch_month?: string
          created_at?: string
          id?: string
          net_payout?: number
          paid_at?: string | null
          pulse_fee?: number
          status?: string
          stripe_transfer_batch_id?: string | null
          total_commission?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_batches_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_items: {
        Row: {
          batch_id: string
          commission_amount: number
          created_at: string
          id: string
          net_amount: number
          pulse_fee: number
          referral_booking_id: string
          referrer_id: string
          status: string
          venue_id: string
        }
        Insert: {
          batch_id: string
          commission_amount?: number
          created_at?: string
          id?: string
          net_amount?: number
          pulse_fee?: number
          referral_booking_id: string
          referrer_id: string
          status?: string
          venue_id: string
        }
        Update: {
          batch_id?: string
          commission_amount?: number
          created_at?: string
          id?: string
          net_amount?: number
          pulse_fee?: number
          referral_booking_id?: string
          referrer_id?: string
          status?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payout_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_items_referral_booking_id_fkey"
            columns: ["referral_booking_id"]
            isOneToOne: false
            referencedRelation: "referral_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_items_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_items_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_asset_briefs: {
        Row: {
          asset_type: string
          brief: string
          created_at: string
          id: string
          intended_channel: string | null
          metadata: Json | null
          plan_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          asset_type: string
          brief?: string
          created_at?: string
          id?: string
          intended_channel?: string | null
          metadata?: Json | null
          plan_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          asset_type?: string
          brief?: string
          created_at?: string
          id?: string
          intended_channel?: string | null
          metadata?: Json | null
          plan_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_asset_briefs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "venue_event_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_assets: {
        Row: {
          asset_brief_id: string | null
          asset_type: string
          content_asset_id: string | null
          created_at: string
          id: string
          plan_id: string
          status: string
        }
        Insert: {
          asset_brief_id?: string | null
          asset_type: string
          content_asset_id?: string | null
          created_at?: string
          id?: string
          plan_id: string
          status?: string
        }
        Update: {
          asset_brief_id?: string | null
          asset_type?: string
          content_asset_id?: string | null
          created_at?: string
          id?: string
          plan_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_assets_asset_brief_id_fkey"
            columns: ["asset_brief_id"]
            isOneToOne: false
            referencedRelation: "plan_asset_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_assets_content_asset_id_fkey"
            columns: ["content_asset_id"]
            isOneToOne: false
            referencedRelation: "content_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_assets_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "venue_event_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_outputs: {
        Row: {
          content: string
          created_at: string
          id: string
          metadata: Json | null
          output_type: string
          plan_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          output_type: string
          plan_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          output_type?: string
          plan_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_outputs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "venue_event_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_workspace_snapshots: {
        Row: {
          plan_id: string
          snapshot: Json
          updated_at: string
          venue_id: string
        }
        Insert: {
          plan_id: string
          snapshot?: Json
          updated_at?: string
          venue_id: string
        }
        Update: {
          plan_id?: string
          snapshot?: Json
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_workspace_snapshots_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: true
            referencedRelation: "venue_event_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_workspace_snapshots_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          notes: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
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
      pulse_brain_contexts: {
        Row: {
          brand_context: Json
          updated_at: string
          venue_id: string
          venue_summary: string
          visual_context: Json
        }
        Insert: {
          brand_context?: Json
          updated_at?: string
          venue_id: string
          venue_summary?: string
          visual_context?: Json
        }
        Update: {
          brand_context?: Json
          updated_at?: string
          venue_id?: string
          venue_summary?: string
          visual_context?: Json
        }
        Relationships: [
          {
            foreignKeyName: "pulse_brain_contexts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_audit_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_payload: Json
          event_type: string
          id: string
          venue_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_payload?: Json
          event_type: string
          id?: string
          venue_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_payload?: Json
          event_type?: string
          id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_audit_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_beta_access: {
        Row: {
          access_type: string
          created_at: string
          email: string | null
          id: string
          invited_by: string | null
          status: string
          venue_id: string | null
        }
        Insert: {
          access_type: string
          created_at?: string
          email?: string | null
          id?: string
          invited_by?: string | null
          status?: string
          venue_id?: string | null
        }
        Update: {
          access_type?: string
          created_at?: string
          email?: string | null
          id?: string
          invited_by?: string | null
          status?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_beta_access_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_bookings: {
        Row: {
          bill_image_url: string | null
          booking_datetime: string | null
          booking_source: string
          booking_status: string
          commission_amount: number | null
          commission_status: string
          created_at: string
          guest_name: string | null
          id: string
          offer_id: string | null
          party_size: number | null
          referral_link_id: string | null
          referrer_id: string
          spend_verified: boolean
          venue_id: string
          verified_at: string | null
          verified_spend: number | null
        }
        Insert: {
          bill_image_url?: string | null
          booking_datetime?: string | null
          booking_source?: string
          booking_status?: string
          commission_amount?: number | null
          commission_status?: string
          created_at?: string
          guest_name?: string | null
          id?: string
          offer_id?: string | null
          party_size?: number | null
          referral_link_id?: string | null
          referrer_id: string
          spend_verified?: boolean
          venue_id: string
          verified_at?: string | null
          verified_spend?: number | null
        }
        Update: {
          bill_image_url?: string | null
          booking_datetime?: string | null
          booking_source?: string
          booking_status?: string
          commission_amount?: number | null
          commission_status?: string
          created_at?: string
          guest_name?: string | null
          id?: string
          offer_id?: string | null
          party_size?: number | null
          referral_link_id?: string | null
          referrer_id?: string
          spend_verified?: boolean
          venue_id?: string
          verified_at?: string | null
          verified_spend?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_bookings_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "venue_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_bookings_referral_link_id_fkey"
            columns: ["referral_link_id"]
            isOneToOne: false
            referencedRelation: "referral_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_bookings_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_clicks: {
        Row: {
          created_at: string
          id: string
          offer_id: string
          referral_link_id: string
          referrer_id: string
          source_type: string
          utm_data: Json | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          offer_id: string
          referral_link_id: string
          referrer_id: string
          source_type?: string
          utm_data?: Json | null
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          offer_id?: string
          referral_link_id?: string
          referrer_id?: string
          source_type?: string
          utm_data?: Json | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_clicks_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "venue_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_clicks_referral_link_id_fkey"
            columns: ["referral_link_id"]
            isOneToOne: false
            referencedRelation: "referral_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_clicks_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_clicks_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_links: {
        Row: {
          code: string
          created_at: string
          destination_url: string
          id: string
          offer_id: string
          qr_code_url: string | null
          referrer_id: string
          status: string
          venue_id: string
        }
        Insert: {
          code: string
          created_at?: string
          destination_url?: string
          id?: string
          offer_id: string
          qr_code_url?: string | null
          referrer_id: string
          status?: string
          venue_id: string
        }
        Update: {
          code?: string
          created_at?: string
          destination_url?: string
          id?: string
          offer_id?: string
          qr_code_url?: string | null
          referrer_id?: string
          status?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_links_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "venue_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_links_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_links_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      referrers: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          instagram_handle: string | null
          notes: string | null
          role_type: string
          status: string
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          instagram_handle?: string | null
          notes?: string | null
          role_type?: string
          status?: string
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          instagram_handle?: string | null
          notes?: string | null
          role_type?: string
          status?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrers_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_signals: {
        Row: {
          booking_signals: Json
          created_at: string
          engagement_metrics: Json
          id: string
          revenue_estimate: number | null
          source_id: string | null
          source_type: string
          venue_id: string
        }
        Insert: {
          booking_signals?: Json
          created_at?: string
          engagement_metrics?: Json
          id?: string
          revenue_estimate?: number | null
          source_id?: string | null
          source_type: string
          venue_id: string
        }
        Update: {
          booking_signals?: Json
          created_at?: string
          engagement_metrics?: Json
          id?: string
          revenue_estimate?: number | null
          source_id?: string | null
          source_type?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_signals_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      review_automation_runs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          status: string
          steps_completed: string[]
          updated_at: string
          venue_id: string
          week_end: string
          week_start: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          status?: string
          steps_completed?: string[]
          updated_at?: string
          venue_id: string
          week_end: string
          week_start: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          status?: string
          steps_completed?: string[]
          updated_at?: string
          venue_id?: string
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_automation_runs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      review_ingestion_runs: {
        Row: {
          created_at: string
          error_message: string | null
          fetched_count: number
          id: string
          raw_meta: Json | null
          source_id: string | null
          status: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          fetched_count?: number
          id?: string
          raw_meta?: Json | null
          source_id?: string | null
          status?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          fetched_count?: number
          id?: string
          raw_meta?: Json | null
          source_id?: string | null
          status?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_ingestion_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "review_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_ingestion_runs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      review_response_tasks: {
        Row: {
          ai_priority: string | null
          ai_reason: string | null
          approved_at: string | null
          approved_by_user_id: string | null
          author_name: string | null
          created_at: string
          draft_response: string | null
          final_response: string | null
          id: string
          post_status: string | null
          posted_at: string | null
          rating: number | null
          review_date: string | null
          review_id: string
          review_text: string | null
          source: string
          status: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          ai_priority?: string | null
          ai_reason?: string | null
          approved_at?: string | null
          approved_by_user_id?: string | null
          author_name?: string | null
          created_at?: string
          draft_response?: string | null
          final_response?: string | null
          id?: string
          post_status?: string | null
          posted_at?: string | null
          rating?: number | null
          review_date?: string | null
          review_id: string
          review_text?: string | null
          source: string
          status?: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          ai_priority?: string | null
          ai_reason?: string | null
          approved_at?: string | null
          approved_by_user_id?: string | null
          author_name?: string | null
          created_at?: string
          draft_response?: string | null
          final_response?: string | null
          id?: string
          post_status?: string | null
          posted_at?: string | null
          rating?: number | null
          review_date?: string | null
          review_id?: string
          review_text?: string | null
          source?: string
          status?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_response_tasks_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_response_tasks_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      review_sources: {
        Row: {
          created_at: string
          display_name: string | null
          external_domain: string | null
          external_id: string
          external_id_kind: string | null
          id: string
          is_enabled: boolean
          last_error_code: string | null
          last_error_message: string | null
          last_fetch_count: number | null
          last_fetch_status: string | null
          last_ingested_at: string | null
          last_response_meta: Json | null
          source: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          external_domain?: string | null
          external_id: string
          external_id_kind?: string | null
          id?: string
          is_enabled?: boolean
          last_error_code?: string | null
          last_error_message?: string | null
          last_fetch_count?: number | null
          last_fetch_status?: string | null
          last_ingested_at?: string | null
          last_response_meta?: Json | null
          source: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          external_domain?: string | null
          external_id?: string
          external_id_kind?: string | null
          id?: string
          is_enabled?: boolean
          last_error_code?: string | null
          last_error_message?: string | null
          last_fetch_count?: number | null
          last_fetch_status?: string | null
          last_ingested_at?: string | null
          last_response_meta?: Json | null
          source?: string
          updated_at?: string
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
      system_events: {
        Row: {
          created_at: string
          event_payload: Json
          event_type: string
          id: string
          processed_at: string | null
          status: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          event_payload?: Json
          event_type: string
          id?: string
          processed_at?: string | null
          status?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          event_payload?: Json
          event_type?: string
          id?: string
          processed_at?: string | null
          status?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      system_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          job_payload: Json
          job_type: string
          max_attempts: number
          payload: Json
          plan_id: string | null
          run_after: string
          started_at: string | null
          status: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_payload?: Json
          job_type: string
          max_attempts?: number
          payload?: Json
          plan_id?: string | null
          run_after?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_payload?: Json
          job_type?: string
          max_attempts?: number
          payload?: Json
          plan_id?: string | null
          run_after?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_jobs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "venue_event_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_jobs_venue_id_fkey"
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
      venue_insights: {
        Row: {
          city: string | null
          confidence_score: number
          cuisine_category: string | null
          generated_at: string
          id: string
          insight_data: Json
          insight_type: string
        }
        Insert: {
          city?: string | null
          confidence_score?: number
          cuisine_category?: string | null
          generated_at?: string
          id?: string
          insight_data?: Json
          insight_type: string
        }
        Update: {
          city?: string | null
          confidence_score?: number
          cuisine_category?: string | null
          generated_at?: string
          id?: string
          insight_data?: Json
          insight_type?: string
        }
        Relationships: []
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
      venue_offers: {
        Row: {
          commission_type: string
          commission_value: number
          created_at: string
          description: string
          end_date: string | null
          id: string
          start_date: string | null
          status: string
          title: string
          venue_id: string
        }
        Insert: {
          commission_type?: string
          commission_value?: number
          created_at?: string
          description?: string
          end_date?: string | null
          id?: string
          start_date?: string | null
          status?: string
          title: string
          venue_id: string
        }
        Update: {
          commission_type?: string
          commission_value?: number
          created_at?: string
          description?: string
          end_date?: string | null
          id?: string
          start_date?: string | null
          status?: string
          title?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_offers_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_style_feedback: {
        Row: {
          created_at: string
          created_by: string | null
          edited_asset_id: string
          feedback_notes: string | null
          feedback_reason: string | null
          feedback_type: string
          id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          edited_asset_id: string
          feedback_notes?: string | null
          feedback_reason?: string | null
          feedback_type: string
          id?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          edited_asset_id?: string
          feedback_notes?: string | null
          feedback_reason?: string | null
          feedback_type?: string
          id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_style_feedback_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_style_generation_logs: {
        Row: {
          created_at: string
          dish_lock_applied: boolean
          duration_ms: number | null
          edited_asset_id: string | null
          error_json: Json | null
          id: string
          model_name: string
          prompt_text: string | null
          reference_asset_ids: Json
          retry_count: number
          status: string
          style_sources_used: Json
          style_summary_used: string | null
          upload_id: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          dish_lock_applied?: boolean
          duration_ms?: number | null
          edited_asset_id?: string | null
          error_json?: Json | null
          id?: string
          model_name: string
          prompt_text?: string | null
          reference_asset_ids?: Json
          retry_count?: number
          status?: string
          style_sources_used?: Json
          style_summary_used?: string | null
          upload_id?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string
          dish_lock_applied?: boolean
          duration_ms?: number | null
          edited_asset_id?: string | null
          error_json?: Json | null
          id?: string
          model_name?: string
          prompt_text?: string | null
          reference_asset_ids?: Json
          retry_count?: number
          status?: string
          style_sources_used?: Json
          style_summary_used?: string | null
          upload_id?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_style_generation_logs_venue_id_fkey"
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
      venue_style_profiles: {
        Row: {
          background_preferences: Json
          brand_summary: string | null
          camera_style_preferences: Json
          colour_palette: Json
          composition_preferences: Json
          created_at: string
          cuisine_type: string | null
          dish_lock_rules: Json
          id: string
          key_selling_points: string | null
          lighting_mood: string | null
          luxury_level: string | null
          negative_prompt_rules: Json
          style_summary: string | null
          table_surface_preferences: Json
          target_audience: string | null
          updated_at: string
          venue_id: string
          venue_tone: string | null
        }
        Insert: {
          background_preferences?: Json
          brand_summary?: string | null
          camera_style_preferences?: Json
          colour_palette?: Json
          composition_preferences?: Json
          created_at?: string
          cuisine_type?: string | null
          dish_lock_rules?: Json
          id?: string
          key_selling_points?: string | null
          lighting_mood?: string | null
          luxury_level?: string | null
          negative_prompt_rules?: Json
          style_summary?: string | null
          table_surface_preferences?: Json
          target_audience?: string | null
          updated_at?: string
          venue_id: string
          venue_tone?: string | null
        }
        Update: {
          background_preferences?: Json
          brand_summary?: string | null
          camera_style_preferences?: Json
          colour_palette?: Json
          composition_preferences?: Json
          created_at?: string
          cuisine_type?: string | null
          dish_lock_rules?: Json
          id?: string
          key_selling_points?: string | null
          lighting_mood?: string | null
          luxury_level?: string | null
          negative_prompt_rules?: Json
          style_summary?: string | null
          table_surface_preferences?: Json
          target_audience?: string | null
          updated_at?: string
          venue_id?: string
          venue_tone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_style_profiles_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_style_reference_assets: {
        Row: {
          approved: boolean
          channel: string
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          metadata: Json
          notes: string | null
          pinned: boolean
          public_url: string | null
          sort_order: number
          source_type: string
          status: string
          storage_path: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          approved?: boolean
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          metadata?: Json
          notes?: string | null
          pinned?: boolean
          public_url?: string | null
          sort_order?: number
          source_type: string
          status?: string
          storage_path: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          approved?: boolean
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          metadata?: Json
          notes?: string | null
          pinned?: boolean
          public_url?: string | null
          sort_order?: number
          source_type?: string
          status?: string
          storage_path?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_style_reference_assets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
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
          instagram_handle: string | null
          lat: number | null
          lng: number | null
          name: string
          owner_user_id: string | null
          plan: string | null
          timezone: string
          website_url: string | null
        }
        Insert: {
          city?: string | null
          country_code?: string
          created_at?: string
          default_lead_time_days?: number
          id?: string
          instagram_handle?: string | null
          lat?: number | null
          lng?: number | null
          name: string
          owner_user_id?: string | null
          plan?: string | null
          timezone?: string
          website_url?: string | null
        }
        Update: {
          city?: string | null
          country_code?: string
          created_at?: string
          default_lead_time_days?: number
          id?: string
          instagram_handle?: string | null
          lat?: number | null
          lng?: number | null
          name?: string
          owner_user_id?: string | null
          plan?: string | null
          timezone?: string
          website_url?: string | null
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
