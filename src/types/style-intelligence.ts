// ============================================================
// Style Intelligence Engine V2 – TypeScript Types
// ============================================================

export type StyleChannel = 'brand' | 'atmosphere' | 'plating';
export type StyleAssetType = 'image' | 'video';
export type StyleAssetStatus = 'pending_analysis' | 'analyzed' | 'failed';

export interface StyleReferenceAsset {
  id: string;
  venue_id: string;
  channel: StyleChannel;
  type: StyleAssetType;
  storage_path: string;
  thumbnail_path: string | null;
  user_notes: string | null;
  pinned: boolean;
  status: StyleAssetStatus;
  created_by: string;
  created_at: string;
}

export interface StyleAnalysis {
  id: string;
  venue_id: string;
  asset_id: string;
  channel: StyleChannel;
  analysis_json: GeminiAnalysis;
  summary_text: string | null;
  embedding: string[] | null;
  confidence_score: number;
  created_at: string;
}

export interface GeminiAnalysis {
  palette: {
    dominant_colors: string[];
    temperature: string;
    saturation: string;
    contrast: string;
  };
  lighting: {
    type: string;
    direction: string;
    softness: string;
    intensity: string;
  };
  composition: {
    angle: string;
    framing: string;
    negative_space: string;
    depth_of_field: string;
  };
  mood_tags: string[];
  editing_style: {
    grain: string;
    sharpness: string;
    vignette: string;
    color_grading: string;
  };
  scene_context: string;
  channel_specific: Record<string, unknown>;
  confidence_score: number;
}

export interface ChannelProfile {
  sample_size: number;
  field_distributions: Record<string, FieldDistribution>;
  signature: {
    palette: Record<string, unknown>;
    lighting: Record<string, unknown>;
    composition: Record<string, unknown>;
    mood_tags: string[];
    editing_style: Record<string, unknown>;
    channel_specific: Record<string, unknown>;
  };
  themes: StyleTheme[];
  consistency: {
    palette: number;
    lighting: number;
    composition: number;
    overall: number;
  };
}

export interface FieldDistribution {
  primary: string;
  secondary?: string;
  distribution: Record<string, number>;
}

export interface StyleTheme {
  name: string;
  weight: number;
  tags: Record<string, string>;
}

export interface MergedProfile {
  brand: ChannelProfile['signature'] | null;
  atmosphere: ChannelProfile['signature'] | null;
  plating: ChannelProfile['signature'] | null;
  dominant_themes: {
    brand: StyleTheme[];
    atmosphere: StyleTheme[];
    plating: StyleTheme[];
  };
  constraints: {
    palette: Record<string, unknown>;
    lighting: Record<string, unknown>;
    composition: Record<string, unknown>;
    editing: Record<string, unknown>;
    scene: Record<string, unknown>;
  };
  avoid_rules: string[];
  consistency: Record<string, number>;
}

export interface VenueStyleProfile {
  venue_id: string;
  brand_profile: ChannelProfile | Record<string, never>;
  atmosphere_profile: ChannelProfile | Record<string, never>;
  plating_profile: ChannelProfile | Record<string, never>;
  merged_profile: MergedProfile | Record<string, never>;
  updated_at: string;
}

// Asset with its analysis joined
export interface StyleAssetWithAnalysis extends StyleReferenceAsset {
  analysis?: StyleAnalysis | null;
  publicUrl?: string;
  thumbnailUrl?: string;
}

// Upload state
export interface StyleUploadState {
  file: File;
  channel: StyleChannel;
  progress: number;
  status: 'uploading' | 'analyzing' | 'done' | 'error';
  error?: string;
}

export const CHANNEL_LABELS: Record<StyleChannel, string> = {
  brand: 'Brand Inspiration',
  atmosphere: 'Venue Atmosphere',
  plating: 'Presentation & Plating',
};

export const CHANNEL_BUCKETS: Record<StyleChannel, string> = {
  brand: 'brand_inspiration',
  atmosphere: 'venue_atmosphere',
  plating: 'plating_style',
};

export const CHANNEL_DESCRIPTIONS: Record<StyleChannel, string> = {
  brand: 'Brand campaigns, editorial shots, logos in context, and visual identity examples.',
  atmosphere: 'Interior shots, crowd scenes, ambiance photos, and venue environment.',
  plating: 'Dish photos, drink presentations, tableware, and plating style examples.',
};
