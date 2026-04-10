import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function createServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export function stripBearer(authHeader: string | null) {
  return authHeader?.replace('Bearer ', '') ?? '';
}

export async function getUserIdFromJwt(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.getClaims(stripBearer(authHeader));
  if (error) return null;
  return (data?.claims?.sub as string | undefined) ?? null;
}

export async function assertVenueOwner(venueId: string, userId: string) {
  const supabase = createServiceClient();
  const { data: venue, error } = await supabase
    .from('venues')
    .select('id, owner_user_id')
    .eq('id', venueId)
    .maybeSingle();

  if (error || !venue || venue.owner_user_id !== userId) {
    throw new Error('Forbidden: venue owner only');
  }
}

export async function getStripeSecretKey() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('platform_api_keys')
    .select('key_value')
    .eq('key_name', 'STRIPE_SECRET_KEY')
    .maybeSingle();

  if (error) throw error;
  const key = data?.key_value?.trim();
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return key;
}

export async function syncVenueEntitlements(venueId: string) {
  const supabase = createServiceClient();

  const { data: subscription, error: subError } = await supabase
    .from('venue_subscriptions')
    .select('subscription_tier_id, status')
    .eq('venue_id', venueId)
    .maybeSingle();

  if (subError) throw subError;

  const isActive = ['active', 'trialing', 'past_due'].includes(subscription?.status ?? 'inactive');

  let tier: any = null;
  if (subscription?.subscription_tier_id && isActive) {
    const { data: tierData, error: tierError } = await supabase
      .from('subscription_tiers')
      .select('id, monthly_image_quota, monthly_storage_mb, max_users_per_venue, marketplace_access_enabled, video_payg_enabled')
      .eq('id', subscription.subscription_tier_id)
      .maybeSingle();
    if (tierError) throw tierError;
    tier = tierData;
  }

  const entitlementsRow = {
    venue_id: venueId,
    subscription_tier_id: tier?.id ?? null,
    monthly_image_quota: tier?.monthly_image_quota ?? 0,
    monthly_storage_mb: tier?.monthly_storage_mb ?? 0,
    max_users_per_venue: tier?.max_users_per_venue ?? 1,
    marketplace_access_enabled: Boolean(tier?.marketplace_access_enabled),
    video_payg_enabled: Boolean(tier?.video_payg_enabled),
    source_type: 'tier' as const,
    updated_at: new Date().toISOString(),
  };

  const { error: entError } = await supabase
    .from('venue_entitlements')
    .upsert(entitlementsRow, { onConflict: 'venue_id' });
  if (entError) throw entError;

  const { error: limitsError } = await supabase
    .from('venue_limits')
    .upsert(
      {
        venue_id: venueId,
        monthly_pro_photo_credits: entitlementsRow.monthly_image_quota,
      },
      { onConflict: 'venue_id' },
    );

  if (limitsError) {
    console.warn('Could not sync venue_limits compatibility row:', limitsError.message);
  }
}
