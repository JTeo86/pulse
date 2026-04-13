-- Ensure new venues inherit a default subscription tier and synced entitlements.

INSERT INTO public.platform_settings (key, value)
VALUES ('default_new_venue_tier_slug', '')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.initialize_new_venue_subscription_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  configured_slug text;
  tier_row public.subscription_tiers%ROWTYPE;
BEGIN
  SELECT NULLIF(trim(value), '')
  INTO configured_slug
  FROM public.platform_settings
  WHERE key = 'default_new_venue_tier_slug'
  LIMIT 1;

  IF configured_slug IS NOT NULL THEN
    SELECT *
    INTO tier_row
    FROM public.subscription_tiers
    WHERE slug = configured_slug
      AND is_active = true
    ORDER BY sort_order, name
    LIMIT 1;
  END IF;

  IF tier_row.id IS NULL THEN
    SELECT *
    INTO tier_row
    FROM public.subscription_tiers
    WHERE is_active = true
    ORDER BY sort_order, name
    LIMIT 1;
  END IF;

  IF tier_row.id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.venue_subscriptions (
    venue_id,
    subscription_tier_id,
    status,
    pending_change_type
  )
  VALUES (
    NEW.id,
    tier_row.id,
    'inactive',
    'none'
  )
  ON CONFLICT (venue_id) DO UPDATE
    SET subscription_tier_id = EXCLUDED.subscription_tier_id;

  INSERT INTO public.venue_entitlements (
    venue_id,
    subscription_tier_id,
    monthly_image_quota,
    monthly_storage_mb,
    max_users_per_venue,
    marketplace_access_enabled,
    video_payg_enabled,
    source_type
  )
  VALUES (
    NEW.id,
    tier_row.id,
    tier_row.monthly_image_quota,
    tier_row.monthly_storage_mb,
    tier_row.max_users_per_venue,
    tier_row.marketplace_access_enabled,
    tier_row.video_payg_enabled,
    'tier'
  )
  ON CONFLICT (venue_id) DO UPDATE
    SET subscription_tier_id = EXCLUDED.subscription_tier_id,
        monthly_image_quota = EXCLUDED.monthly_image_quota,
        monthly_storage_mb = EXCLUDED.monthly_storage_mb,
        max_users_per_venue = EXCLUDED.max_users_per_venue,
        marketplace_access_enabled = EXCLUDED.marketplace_access_enabled,
        video_payg_enabled = EXCLUDED.video_payg_enabled,
        source_type = EXCLUDED.source_type;

  INSERT INTO public.venue_limits (venue_id, monthly_pro_photo_credits)
  VALUES (NEW.id, tier_row.monthly_image_quota)
  ON CONFLICT (venue_id) DO UPDATE
    SET monthly_pro_photo_credits = EXCLUDED.monthly_pro_photo_credits;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS initialize_new_venue_subscription_defaults_trigger ON public.venues;
CREATE TRIGGER initialize_new_venue_subscription_defaults_trigger
AFTER INSERT ON public.venues
FOR EACH ROW
EXECUTE FUNCTION public.initialize_new_venue_subscription_defaults();

-- Backfill existing venues that do not yet have entitlements by reusing tier defaults.
WITH default_slug AS (
  SELECT NULLIF(trim(value), '') AS slug
  FROM public.platform_settings
  WHERE key = 'default_new_venue_tier_slug'
  LIMIT 1
),
chosen_tier AS (
  SELECT st.*
  FROM public.subscription_tiers st
  WHERE st.is_active = true
  ORDER BY
    CASE WHEN st.slug = (SELECT slug FROM default_slug) THEN 0 ELSE 1 END,
    st.sort_order,
    st.name
  LIMIT 1
)
INSERT INTO public.venue_subscriptions (venue_id, subscription_tier_id, status, pending_change_type)
SELECT v.id, ct.id, 'inactive', 'none'
FROM public.venues v
CROSS JOIN chosen_tier ct
ON CONFLICT (venue_id) DO NOTHING;

WITH chosen_tier AS (
  SELECT st.*
  FROM public.subscription_tiers st
  WHERE st.is_active = true
  ORDER BY st.sort_order, st.name
  LIMIT 1
)
INSERT INTO public.venue_entitlements (
  venue_id,
  subscription_tier_id,
  monthly_image_quota,
  monthly_storage_mb,
  max_users_per_venue,
  marketplace_access_enabled,
  video_payg_enabled,
  source_type
)
SELECT
  v.id,
  ct.id,
  ct.monthly_image_quota,
  ct.monthly_storage_mb,
  ct.max_users_per_venue,
  ct.marketplace_access_enabled,
  ct.video_payg_enabled,
  'tier'
FROM public.venues v
CROSS JOIN chosen_tier ct
ON CONFLICT (venue_id) DO NOTHING;

WITH chosen_tier AS (
  SELECT st.monthly_image_quota
  FROM public.subscription_tiers st
  WHERE st.is_active = true
  ORDER BY st.sort_order, st.name
  LIMIT 1
)
INSERT INTO public.venue_limits (venue_id, monthly_pro_photo_credits)
SELECT v.id, ct.monthly_image_quota
FROM public.venues v
CROSS JOIN chosen_tier ct
ON CONFLICT (venue_id) DO NOTHING;
