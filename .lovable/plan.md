

## Problem

The edge function `editor-generate-pro-photo` returns the generated image URL in its HTTP response body, but **two things go wrong**:

1. **Edge function** never updates the `editor_jobs` row with the final image URL — it only inserts into `edited_assets`.
2. **`Editor.tsx`** (lines 189-201) ignores the direct response from `supabase.functions.invoke()` and instead queries `editor_jobs` for `final_image_url`, which is always `null`.

The `VisualEditorCanvas.tsx` (TheEditor page) handles this correctly — it reads `data.final_image_url` directly from the response. The bug is only in `Editor.tsx`.

## Fix (2 changes)

### 1. Edge function: update `editor_jobs` with the result

In `supabase/functions/editor-generate-pro-photo/index.ts`, after saving to `edited_assets` (around line 334), add an update to `editor_jobs` if a `job_id` was provided in the request body:

```typescript
// Update editor_jobs if job_id was provided
if (body.job_id) {
  await supabase.from('editor_jobs').update({
    status: 'done',
    final_image_url: polishedUrl,
    final_image_variants: finalImageVariants,
  }).eq('id', body.job_id);
}
```

### 2. Frontend: use the direct response instead of re-querying

In `src/pages/Editor.tsx` (lines 185-208), use the `data` returned from `supabase.functions.invoke()` directly to set the job result, instead of re-querying the `editor_jobs` table:

```typescript
const { data, error: fnError } = await supabase.functions.invoke(fnName, { body: payload });
if (fnError) throw fnError;

if (data?.final_image_url) {
  setJobResult({
    final_image_url: data.final_image_url,
    final_image_variants: data.final_image_variants || {},
    final_video_url: data.final_video_url || null,
  });
}
```

Remove the secondary `editor_jobs` SELECT query (lines 189-201) since it's redundant and returns stale data.

