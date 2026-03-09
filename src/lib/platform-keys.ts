import { supabase } from '@/integrations/supabase/client';

export type HealthStatus = 'healthy' | 'invalid' | 'missing' | 'untested';
export type KeyCategory = 'Reviews' | 'Editor' | 'Publishing' | 'Video' | 'Other';

export interface PlatformApiKey {
  id: string;
  key_name: string;
  key_value: string;
  description: string | null;
  category: KeyCategory;
  is_required: boolean;
  is_secret: boolean;
  is_configured: boolean;
  health_status: HealthStatus;
  last_checked_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Canonical allowlist of keys to show in admin UI.
 * Legacy keys remain in DB for audit but are hidden from the main admin panel.
 */
const ADMIN_VISIBLE_KEYS = new Set([
  'SERPAPI_API_KEY',
  'GEMINI_IMAGE_API_KEY',
  'KLING_API_KEY',
  'KLING_API_SECRET',
  'BUFFER_API_KEY',
]);

/** Fetch platform API keys visible in admin */
export async function getPlatformKeys(): Promise<PlatformApiKey[]> {
  const { data, error } = await supabase
    .from('platform_api_keys')
    .select('*')
    .order('category')
    .order('key_name');
  if (error) throw error;
  // Filter to canonical allowlist
  return ((data ?? []) as PlatformApiKey[]).filter(k => ADMIN_VISIBLE_KEYS.has(k.key_name));
}

/** Fetch keys grouped by category */
export async function getPlatformKeysByCategory(): Promise<Record<KeyCategory, PlatformApiKey[]>> {
  const keys = await getPlatformKeys();
  return keys.reduce((acc, key) => {
    const cat = key.category as KeyCategory;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(key);
    return acc;
  }, {} as Record<KeyCategory, PlatformApiKey[]>);
}

/** Update a single key value */
export async function updatePlatformKey(keyName: string, value: string): Promise<void> {
  const { error } = await supabase
    .from('platform_api_keys')
    .update({
      key_value: value.trim(),
      is_configured: value.trim().length > 0,
      health_status: 'untested',
      last_error: null,
    })
    .eq('key_name', keyName);
  if (error) throw error;
}

/** Manually update health status (used by edge function result) */
export async function updateKeyHealth(
  keyName: string,
  status: HealthStatus,
  errorMsg?: string | null
): Promise<void> {
  const { error } = await supabase
    .from('platform_api_keys')
    .update({
      health_status: status,
      last_checked_at: new Date().toISOString(),
      last_error: errorMsg ?? null,
    })
    .eq('key_name', keyName);
  if (error) throw error;
}
