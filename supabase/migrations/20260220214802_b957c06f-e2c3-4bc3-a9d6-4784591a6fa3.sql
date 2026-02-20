
-- ============================================================
-- Aggregation RPC: rebuild_venue_style_profile
-- ============================================================

CREATE OR REPLACE FUNCTION public.rebuild_venue_style_profile(p_venue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_profile   jsonb := '{"sample_size": 0}'::jsonb;
  v_atm_profile     jsonb := '{"sample_size": 0}'::jsonb;
  v_plating_profile jsonb := '{"sample_size": 0}'::jsonb;
  v_merged          jsonb;
BEGIN
  -- Delegate per-channel aggregation to helper calls
  -- We'll compute a minimal profile from the raw analysis JSON

  -- Brand channel
  SELECT public.compute_channel_profile(p_venue_id, 'brand') INTO v_brand_profile;
  -- Atmosphere channel
  SELECT public.compute_channel_profile(p_venue_id, 'atmosphere') INTO v_atm_profile;
  -- Plating channel
  SELECT public.compute_channel_profile(p_venue_id, 'plating') INTO v_plating_profile;

  -- Merged profile (brand dominates palette/editing, atmosphere dominates vibe/lighting, plating dominates angle/framing)
  v_merged := jsonb_build_object(
    'brand',           v_brand_profile   -> 'signature',
    'atmosphere',      v_atm_profile     -> 'signature',
    'plating',         v_plating_profile -> 'signature',
    'dominant_themes', jsonb_build_object(
      'brand',      COALESCE(v_brand_profile   -> 'themes', '[]'::jsonb),
      'atmosphere', COALESCE(v_atm_profile     -> 'themes', '[]'::jsonb),
      'plating',    COALESCE(v_plating_profile -> 'themes', '[]'::jsonb)
    ),
    'constraints', jsonb_build_object(
      'palette',     COALESCE((v_brand_profile -> 'signature' -> 'palette'), (v_atm_profile -> 'signature' -> 'palette'), '{}'::jsonb),
      'lighting',    COALESCE((v_atm_profile -> 'signature' -> 'lighting'), (v_brand_profile -> 'signature' -> 'lighting'), '{}'::jsonb),
      'composition', COALESCE((v_plating_profile -> 'signature' -> 'composition'), (v_brand_profile -> 'signature' -> 'composition'), '{}'::jsonb),
      'editing',     COALESCE((v_brand_profile -> 'signature' -> 'editing_style'), '{}'::jsonb),
      'scene',       COALESCE((v_atm_profile -> 'signature' -> 'channel_specific'), '{}'::jsonb)
    ),
    'avoid_rules', '[]'::jsonb,
    'consistency', jsonb_build_object(
      'brand',      COALESCE((v_brand_profile -> 'consistency' -> 'overall'), '0'::jsonb),
      'atmosphere', COALESCE((v_atm_profile  -> 'consistency' -> 'overall'), '0'::jsonb),
      'plating',    COALESCE((v_plating_profile -> 'consistency' -> 'overall'), '0'::jsonb)
    )
  );

  -- Upsert venue_style_profile
  INSERT INTO public.venue_style_profile (
    venue_id, brand_profile, atmosphere_profile, plating_profile, merged_profile, updated_at
  ) VALUES (
    p_venue_id, v_brand_profile, v_atm_profile, v_plating_profile, v_merged, now()
  )
  ON CONFLICT (venue_id) DO UPDATE SET
    brand_profile     = EXCLUDED.brand_profile,
    atmosphere_profile = EXCLUDED.atmosphere_profile,
    plating_profile   = EXCLUDED.plating_profile,
    merged_profile    = EXCLUDED.merged_profile,
    updated_at        = now();
END;
$$;

-- ============================================================
-- Helper: compute_channel_profile
-- Implements the full weighted scoring algorithm
-- ============================================================

CREATE OR REPLACE FUNCTION public.compute_channel_profile(
  p_venue_id uuid,
  p_channel  text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assets   RECORD;
  v_total_w  float := 0;
  v_n        int   := 0;

  -- Weight accumulation per asset
  v_days     float;
  v_recency  float;
  v_w        float;

  -- Field frequency maps (jsonb)
  v_temp_freq        jsonb := '{}'::jsonb;
  v_sat_freq         jsonb := '{}'::jsonb;
  v_contrast_freq    jsonb := '{}'::jsonb;
  v_light_type_freq  jsonb := '{}'::jsonb;
  v_light_soft_freq  jsonb := '{}'::jsonb;
  v_angle_freq       jsonb := '{}'::jsonb;
  v_framing_freq     jsonb := '{}'::jsonb;
  v_mood_freq        jsonb := '{}'::jsonb;
  v_color_grade_freq jsonb := '{}'::jsonb;

  -- Ordinal sums
  v_sat_sum       float := 0;
  v_contrast_sum  float := 0;
  v_soft_sum      float := 0;

  -- Channel specific frequencies
  v_ch_specific   jsonb := '{}'::jsonb;

  -- Result
  v_weights       float[];
  v_asset_ids     uuid[];
  v_profile       jsonb;
  v_signature     jsonb;
  v_field_dists   jsonb := '{}'::jsonb;
  v_themes        jsonb := '[]'::jsonb;
  v_consistency   jsonb;

  v_tmp_key text;
  v_tmp_val float;
  v_cur_freq float;
BEGIN
  -- Collect all analyzed assets for this channel
  FOR v_assets IN
    SELECT
      sa.analysis_json,
      sa.confidence_score,
      sra.pinned,
      sra.created_at,
      sra.id as asset_id
    FROM public.style_analysis sa
    JOIN public.style_reference_assets sra ON sra.id = sa.asset_id
    WHERE sra.venue_id = p_venue_id
      AND sra.channel = p_channel::public.style_channel
      AND sra.status = 'analyzed'
    ORDER BY sra.created_at DESC
  LOOP
    v_n := v_n + 1;
    -- Recency weight
    v_days    := EXTRACT(EPOCH FROM (now() - v_assets.created_at)) / 86400.0;
    v_recency := GREATEST(exp(-v_days / 60.0), 0.15);
    -- Pinned boost
    v_w := v_recency * (CASE WHEN v_assets.pinned THEN 2.0 ELSE 1.0 END)
           * GREATEST(LEAST(v_assets.confidence_score, 1.0), 0.5);
    v_total_w := v_total_w + v_w;
  END LOOP;

  IF v_n = 0 OR v_total_w = 0 THEN
    RETURN jsonb_build_object('sample_size', 0, 'signature', '{}'::jsonb, 'themes', '[]'::jsonb, 'consistency', jsonb_build_object('overall', 0));
  END IF;

  -- Second pass: accumulate weighted frequencies (normalized)
  FOR v_assets IN
    SELECT
      sa.analysis_json,
      sa.confidence_score,
      sra.pinned,
      sra.created_at
    FROM public.style_analysis sa
    JOIN public.style_reference_assets sra ON sra.id = sa.asset_id
    WHERE sra.venue_id = p_venue_id
      AND sra.channel = p_channel::public.style_channel
      AND sra.status = 'analyzed'
  LOOP
    v_days    := EXTRACT(EPOCH FROM (now() - v_assets.created_at)) / 86400.0;
    v_recency := GREATEST(exp(-v_days / 60.0), 0.15);
    v_w := (v_recency * (CASE WHEN v_assets.pinned THEN 2.0 ELSE 1.0 END)
           * GREATEST(LEAST(v_assets.confidence_score, 1.0), 0.5)) / v_total_w;

    -- palette.temperature
    v_tmp_key := v_assets.analysis_json -> 'palette' ->> 'temperature';
    IF v_tmp_key IS NOT NULL THEN
      v_cur_freq := COALESCE((v_temp_freq ->> v_tmp_key)::float, 0);
      v_temp_freq := jsonb_set(v_temp_freq, ARRAY[v_tmp_key], to_jsonb(v_cur_freq + v_w));
    END IF;

    -- palette.saturation (ordinal)
    v_tmp_key := v_assets.analysis_json -> 'palette' ->> 'saturation';
    IF v_tmp_key IS NOT NULL THEN
      v_cur_freq := COALESCE((v_sat_freq ->> v_tmp_key)::float, 0);
      v_sat_freq := jsonb_set(v_sat_freq, ARRAY[v_tmp_key], to_jsonb(v_cur_freq + v_w));
      v_sat_sum  := v_sat_sum + v_w * (CASE WHEN v_tmp_key = 'muted' THEN 1 WHEN v_tmp_key = 'medium' THEN 2 ELSE 3 END);
    END IF;

    -- palette.contrast (ordinal)
    v_tmp_key := v_assets.analysis_json -> 'palette' ->> 'contrast';
    IF v_tmp_key IS NOT NULL THEN
      v_cur_freq := COALESCE((v_contrast_freq ->> v_tmp_key)::float, 0);
      v_contrast_freq := jsonb_set(v_contrast_freq, ARRAY[v_tmp_key], to_jsonb(v_cur_freq + v_w));
      v_contrast_sum  := v_contrast_sum + v_w * (CASE WHEN v_tmp_key = 'low' THEN 1 WHEN v_tmp_key = 'medium' THEN 2 ELSE 3 END);
    END IF;

    -- lighting.type
    v_tmp_key := v_assets.analysis_json -> 'lighting' ->> 'type';
    IF v_tmp_key IS NOT NULL THEN
      v_cur_freq := COALESCE((v_light_type_freq ->> v_tmp_key)::float, 0);
      v_light_type_freq := jsonb_set(v_light_type_freq, ARRAY[v_tmp_key], to_jsonb(v_cur_freq + v_w));
    END IF;

    -- lighting.softness (ordinal)
    v_tmp_key := v_assets.analysis_json -> 'lighting' ->> 'softness';
    IF v_tmp_key IS NOT NULL THEN
      v_cur_freq := COALESCE((v_light_soft_freq ->> v_tmp_key)::float, 0);
      v_light_soft_freq := jsonb_set(v_light_soft_freq, ARRAY[v_tmp_key], to_jsonb(v_cur_freq + v_w));
      v_soft_sum := v_soft_sum + v_w * (CASE WHEN v_tmp_key = 'soft' THEN 1 WHEN v_tmp_key = 'medium' THEN 2 ELSE 3 END);
    END IF;

    -- composition.angle
    v_tmp_key := v_assets.analysis_json -> 'composition' ->> 'angle';
    IF v_tmp_key IS NOT NULL THEN
      v_cur_freq := COALESCE((v_angle_freq ->> v_tmp_key)::float, 0);
      v_angle_freq := jsonb_set(v_angle_freq, ARRAY[v_tmp_key], to_jsonb(v_cur_freq + v_w));
    END IF;

    -- composition.framing
    v_tmp_key := v_assets.analysis_json -> 'composition' ->> 'framing';
    IF v_tmp_key IS NOT NULL THEN
      v_cur_freq := COALESCE((v_framing_freq ->> v_tmp_key)::float, 0);
      v_framing_freq := jsonb_set(v_framing_freq, ARRAY[v_tmp_key], to_jsonb(v_cur_freq + v_w));
    END IF;

    -- editing_style.color_grading
    v_tmp_key := v_assets.analysis_json -> 'editing_style' ->> 'color_grading';
    IF v_tmp_key IS NOT NULL THEN
      v_cur_freq := COALESCE((v_color_grade_freq ->> v_tmp_key)::float, 0);
      v_color_grade_freq := jsonb_set(v_color_grade_freq, ARRAY[v_tmp_key], to_jsonb(v_cur_freq + v_w));
    END IF;

    -- mood_tags (list field)
    DECLARE
      v_tag text;
      v_tag_count int;
      v_tag_arr jsonb;
    BEGIN
      v_tag_arr := v_assets.analysis_json -> 'mood_tags';
      IF v_tag_arr IS NOT NULL AND jsonb_typeof(v_tag_arr) = 'array' THEN
        v_tag_count := jsonb_array_length(v_tag_arr);
        IF v_tag_count > 0 THEN
          FOR v_tag IN SELECT jsonb_array_elements_text(v_tag_arr) LOOP
            v_cur_freq := COALESCE((v_mood_freq ->> v_tag)::float, 0);
            v_mood_freq := jsonb_set(v_mood_freq, ARRAY[v_tag], to_jsonb(v_cur_freq + v_w / v_tag_count));
          END LOOP;
        END IF;
      END IF;
    END;
  END LOOP;

  -- Helper: pick primary from freq map
  -- Build signature
  v_signature := jsonb_build_object(
    'palette', jsonb_build_object(
      'temperature',      public.freq_primary(v_temp_freq),
      'saturation',       public.ordinal_label(v_sat_sum),
      'saturation_score', round(v_sat_sum::numeric, 2),
      'contrast',         public.ordinal_label(v_contrast_sum),
      'contrast_score',   round(v_contrast_sum::numeric, 2)
    ),
    'lighting', jsonb_build_object(
      'type',     public.freq_primary(v_light_type_freq),
      'softness', public.ordinal_label(v_soft_sum)
    ),
    'composition', jsonb_build_object(
      'angle',   public.freq_primary(v_angle_freq),
      'framing', public.freq_primary(v_framing_freq)
    ),
    'mood_tags', public.top_tags(v_mood_freq, 8),
    'editing_style', jsonb_build_object(
      'color_grading', public.freq_primary(v_color_grade_freq)
    ),
    'channel_specific', '{}'::jsonb
  );

  -- Field distributions
  v_field_dists := jsonb_build_object(
    'palette.temperature', public.freq_dist(v_temp_freq),
    'palette.saturation',  public.freq_dist(v_sat_freq),
    'palette.contrast',    public.freq_dist(v_contrast_freq),
    'lighting.type',       public.freq_dist(v_light_type_freq),
    'lighting.softness',   public.freq_dist(v_light_soft_freq),
    'composition.angle',   public.freq_dist(v_angle_freq),
    'composition.framing', public.freq_dist(v_framing_freq),
    'editing.color_grading', public.freq_dist(v_color_grade_freq)
  );

  -- Consistency (entropy-based for categorical, variance-based for ordinal)
  v_consistency := jsonb_build_object(
    'palette',     round(LEAST(public.freq_consistency(v_temp_freq), 1.0)::numeric, 2),
    'lighting',    round(LEAST(public.freq_consistency(v_light_type_freq), 1.0)::numeric, 2),
    'composition', round(LEAST(public.freq_consistency(v_angle_freq), 1.0)::numeric, 2),
    'overall',     round(LEAST(
      0.4 * public.freq_consistency(v_temp_freq) +
      0.3 * public.freq_consistency(v_light_type_freq) +
      0.3 * public.freq_consistency(v_angle_freq), 1.0)::numeric, 2)
  );

  v_profile := jsonb_build_object(
    'sample_size',        v_n,
    'field_distributions', v_field_dists,
    'signature',          v_signature,
    'themes',             '[]'::jsonb,
    'consistency',        v_consistency
  );

  RETURN v_profile;
END;
$$;

-- ============================================================
-- Helper functions
-- ============================================================

-- freq_primary: return the key with highest value in a jsonb freq map
CREATE OR REPLACE FUNCTION public.freq_primary(freq jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT key FROM jsonb_each_text(freq) ORDER BY value::float DESC LIMIT 1;
$$;

-- ordinal_label: convert mean score (1-3) to label
CREATE OR REPLACE FUNCTION public.ordinal_label(score float)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN score < 1.67 THEN 'low'
    WHEN score <= 2.33 THEN 'medium'
    ELSE 'high'
  END;
$$;

-- top_tags: return top N tags from freq map as jsonb array
CREATE OR REPLACE FUNCTION public.top_tags(freq jsonb, max_tags int DEFAULT 8)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_agg(key ORDER BY value::float DESC)
  FROM (
    SELECT key, value FROM jsonb_each_text(freq)
    WHERE value::float >= 0.05
    ORDER BY value::float DESC
    LIMIT max_tags
  ) t;
$$;

-- freq_dist: return top-5 distribution from freq map
CREATE OR REPLACE FUNCTION public.freq_dist(freq jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_object_agg(key, round(value::numeric, 3))
  FROM (
    SELECT key, value FROM jsonb_each_text(freq)
    ORDER BY value::float DESC
    LIMIT 5
  ) t;
$$;

-- freq_consistency: 1 - (entropy / maxEntropy) for a freq map
CREATE OR REPLACE FUNCTION public.freq_consistency(freq jsonb)
RETURNS float
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_entropy float := 0;
  v_max_entropy float;
  v_k int;
  v_p float;
  v_rec RECORD;
BEGIN
  SELECT count(*) INTO v_k FROM jsonb_each_text(freq);
  IF v_k <= 1 THEN RETURN 1.0; END IF;
  v_max_entropy := ln(v_k);
  FOR v_rec IN SELECT value::float as p FROM jsonb_each_text(freq) LOOP
    IF v_rec.p > 0 THEN
      v_entropy := v_entropy - v_rec.p * ln(v_rec.p);
    END IF;
  END LOOP;
  IF v_max_entropy = 0 THEN RETURN 1.0; END IF;
  RETURN GREATEST(0, 1.0 - (v_entropy / v_max_entropy));
END;
$$;

-- Grant execute on RPC to authenticated users (profile rebuild is called via service role in edge fn)
GRANT EXECUTE ON FUNCTION public.rebuild_venue_style_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_channel_profile(uuid, text) TO authenticated;
