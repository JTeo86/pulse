import { supabase } from '@/integrations/supabase/client';

const DEFAULT_BUCKET = 'venue-assets';
const SIGNED_TTL = 3600; // 1 hour

// In-memory cache: storagePath → { url, expiresAt }
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/** Returns true if a URL looks like a Supabase signed URL (temporary) */
export function isSignedUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes('?token=') || url.includes('/object/sign/');
}

/** Returns true if a cached signed URL is still valid (with 5 min buffer) */
function isCacheValid(entry: { url: string; expiresAt: number }): boolean {
  return Date.now() < entry.expiresAt - 5 * 60 * 1000;
}

/**
 * Resolve the best display URL for an asset.
 * Priority:
 *  1. stable public_url (non-signed)
 *  2. stable thumbnail_url (non-signed)
 *  3. cached signed URL from storage_path
 *  4. fresh signed URL from storage_path
 *  5. fallback to whatever URL is available
 */
export function resolveAssetUrl(asset: {
  public_url?: string | null;
  thumbnail_url?: string | null;
  storage_path?: string | null;
}): string | null {
  // Prefer stable (non-signed) URLs
  if (asset.public_url && !isSignedUrl(asset.public_url)) return asset.public_url;
  if (asset.thumbnail_url && !isSignedUrl(asset.thumbnail_url)) return asset.thumbnail_url;

  // Check cache for storage_path
  if (asset.storage_path) {
    const cached = signedUrlCache.get(asset.storage_path);
    if (cached && isCacheValid(cached)) return cached.url;
  }

  // Return whatever we have as a weak fallback (may be stale signed URL)
  return asset.public_url || asset.thumbnail_url || null;
}

/**
 * Batch-resolve signed URLs for multiple storage paths.
 * Uses cache and only generates fresh URLs for missing/expired entries.
 */
export async function batchResolveSignedUrls(
  storagePaths: string[],
  bucket: string = DEFAULT_BUCKET,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const toResolve: string[] = [];

  for (const path of storagePaths) {
    const cached = signedUrlCache.get(path);
    if (cached && isCacheValid(cached)) {
      result.set(path, cached.url);
    } else {
      toResolve.push(path);
    }
  }

  if (toResolve.length > 0) {
    // Supabase doesn't have a batch signed URL API, so we parallelize
    // but cap concurrency to avoid flooding
    const BATCH_SIZE = 10;
    for (let i = 0; i < toResolve.length; i += BATCH_SIZE) {
      const batch = toResolve.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (path) => {
          const { data } = await supabase.storage
            .from(bucket)
            .createSignedUrl(path, SIGNED_TTL);
          return { path, url: data?.signedUrl || '' };
        })
      );

      const expiresAt = Date.now() + SIGNED_TTL * 1000;
      for (const { path, url } of results) {
        if (url) {
          signedUrlCache.set(path, { url, expiresAt });
          result.set(path, url);
        }
      }
    }
  }

  return result;
}

/**
 * Resolve a single signed URL with caching.
 */
export async function resolveSignedUrl(storagePath: string): Promise<string> {
  const cached = signedUrlCache.get(storagePath);
  if (cached && isCacheValid(cached)) return cached.url;

  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_TTL);

  const url = data?.signedUrl || '';
  if (url) {
    signedUrlCache.set(storagePath, {
      url,
      expiresAt: Date.now() + SIGNED_TTL * 1000,
    });
  }
  return url;
}

/**
 * Full resolution for an asset record: returns the best available URL,
 * generating a signed URL if needed.
 */
export async function resolveAssetMediaUrl(asset: {
  public_url?: string | null;
  thumbnail_url?: string | null;
  storage_path?: string | null;
}): Promise<string> {
  // Try stable URL first
  const stable = resolveAssetUrl(asset);
  if (stable && !isSignedUrl(stable)) return stable;

  // Generate fresh signed URL from storage_path
  if (asset.storage_path) {
    return resolveSignedUrl(asset.storage_path);
  }

  return stable || '';
}
