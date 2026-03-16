

## Two Issues Found

### Issue 1: Blank Images in Library

**Root cause**: The edge function (`editor-generate-pro-photo`) saves signed URLs (with expiration tokens) into the `public_url` column of `content_assets`. These tokens expire after ~24 hours. The `useContentAssets` hook (line 63) trusts `public_url` first and returns it directly — never falling through to regenerate a fresh signed URL from `storage_path`.

**Fix** (two-part):

1. **`src/hooks/use-content-assets.ts`**: Change the URL resolution logic to detect signed URLs (contain `?token=` or `/object/sign/`) and skip them, always generating fresh signed URLs from `storage_path` instead. This makes all existing assets immediately display correctly.

```typescript
// Instead of trusting public_url blindly:
if (asset.public_url) return { ...asset, _resolvedUrl: asset.public_url };

// Check if it's a signed URL (which expires) — prefer storage_path
const isSignedUrl = asset.public_url?.includes('/object/sign/') || asset.public_url?.includes('?token=');
if (asset.public_url && !isSignedUrl) {
  return { ...asset, _resolvedUrl: asset.public_url };
}
if (asset.storage_path) {
  // generate fresh signed URL
}
```

2. **`supabase/functions/editor-generate-pro-photo/index.ts`**: Stop storing signed URLs in `public_url`. Either store nothing (let the client resolve from `storage_path`) or store the permanent public URL if the bucket is public. This prevents future assets from having the same problem.

3. **Same fix in `ProductionSection.tsx`** line 62: The same pattern exists there — it checks `public_url` first. Apply the same signed-URL detection.

### Issue 2: Production Section Button Layout

**Root cause**: The BriefCard buttons use `flex-1` which makes them stretch equally, but the three-button layout (Open / Approve / Detach) doesn't constrain properly at wider viewports. The "Attach Asset to Plan" button also lacks proper sizing.

**Fix in `src/components/planner/ProductionSection.tsx`**:

- Brief card action buttons: Use `flex-wrap` on the button container, constrain button widths with `min-w-0`, and ensure the Detach button doesn't stretch (`flex-none` instead of implicit flex).
- Make the button row responsive: stack vertically on small screens, row on medium+.
- For the "no brief" state buttons (Create in Studio / Attach Existing): ensure they don't overflow on narrow cards by adding `flex-wrap` and `min-w-0`.

### Files to change

1. `src/hooks/use-content-assets.ts` — Fix signed URL detection in URL resolution
2. `src/components/planner/ProductionSection.tsx` — Fix signed URL resolution + button layout
3. `supabase/functions/editor-generate-pro-photo/index.ts` — Stop persisting signed URLs as `public_url`

