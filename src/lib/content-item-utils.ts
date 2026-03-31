/**
 * Shared utilities for content_items data contracts.
 *
 * The DB enforces: asset_type IN ('static', 'video')  (nullable)
 */

const VIDEO_MIME_PREFIXES = ['video/'];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.avi', '.mkv'];

/**
 * Known direct mappings — values that should be treated as video.
 * Everything else maps to 'static'.
 */
const VIDEO_HINT_KEYWORDS = ['video', 'reel', 'reels', 'clip', 'animation'];

/**
 * Normalise any media/asset type string into a valid content_items.asset_type value.
 *
 * The DB constraint allows: 'static', 'video', or null.
 *
 * Common source values that are NOT valid DB values:
 *   'image', 'pro_photo', 'asset', 'generated_image', 'upload', 'variation', 'generated', 'photo'
 * All of these map to → 'static'.
 *
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

  // Check hint — map known values and keywords
  if (hint) {
    // Already a valid DB value — pass through
    if (hint === 'static' || hint === 'video') return hint;

    const lower = hint.toLowerCase();
    if (VIDEO_HINT_KEYWORDS.some((k) => lower.includes(k))) {
      return 'video';
    }
    // Everything else (image, pro_photo, asset, generated, upload, etc.) → static
    return 'static';
  }

  return null;
}
