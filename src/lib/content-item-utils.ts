/**
 * Shared utilities for content_items data contracts.
 *
 * The DB enforces: asset_type IN ('static', 'video')  (nullable)
 */

const VIDEO_MIME_PREFIXES = ['video/'];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.avi', '.mkv'];

/**
 * Normalise any media/asset type string into a valid content_items.asset_type value.
 * Returns null when no media is attached.
 */
export function normalizeContentAssetType(
  hint?: string | null,
  mimeType?: string | null,
  fileName?: string | null,
): 'static' | 'video' | null {
  // No media → null (column is nullable)
  if (!hint && !mimeType && !fileName) return null;

  // Check mime type first — most reliable signal
  if (mimeType) {
    if (VIDEO_MIME_PREFIXES.some((p) => mimeType.startsWith(p))) return 'video';
    return 'static';
  }

  // Check file extension
  if (fileName) {
    const lower = fileName.toLowerCase();
    if (VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'video';
    return 'static';
  }

  // Check hint keywords
  if (hint) {
    const lower = hint.toLowerCase();
    if (['video', 'reel', 'reels', 'clip', 'animation'].some((k) => lower.includes(k))) {
      return 'video';
    }
    return 'static';
  }

  return null;
}
