

## Problem Analysis

From the edge function logs, the root cause is clear:

1. **AI background generation fails (404)** because `generateAIBackgroundImage` on line 221 uses model `google/gemini-2.5-flash` -- a text-only model that does NOT support image generation. The correct model should be `google/gemini-2.5-flash-image`.

2. Because background generation fails, PhotoRoom falls back to `background.prompt` (a text prompt), which produces a lower-quality result. Then Gemini retouch returns a PNG with transparency, the flatten step fires but `backgroundBlob` is `null` (since it was never generated), so it uses a solid color fallback `#F5F5F0` -- which still outputs PNG per the logs.

3. The final uploaded file is a `.png` with potential transparency artifacts, causing the black-background appearance in some viewers/contexts.

## Fix (single file: `supabase/functions/editor-generate-pro-photo/index.ts`)

### Change 1: Fix AI background generation model (line 221)
Change `google/gemini-2.5-flash` to `google/gemini-2.5-flash-image` so the image generation endpoint is actually hit and returns a real background image.

### Change 2: Persist backgroundBlob for reuse in flatten step
Currently `backgroundBlob` holds the generated background, but when AI background generation succeeds, it's saved to storage and then never re-downloaded for the flatten step. The variable is still available in scope, but need to verify it persists through to the flatten branch at line 721. (It does -- `backgroundBlob` is declared at line 360 and used at line 721.)

### Change 3: Force JPEG output in uploadResultBuffer for 'final' suffix
When `uploadResultBuffer` detects PNG for the `final` output, it currently saves as `.png`. Since the pipeline's goal is a flattened JPEG with no transparency, add a final safety net: if the buffer is PNG and suffix is `final`, route it back through PhotoRoom with `background.color` + `outputFormat=jpg` to force a true JPEG. 

Alternatively (simpler): since PhotoRoom may ignore `outputFormat` in some cases, update `uploadResultBuffer` to always save with the extension and content type that matches what was requested by the caller. Add an optional `forceFormat` parameter.

### Change 4: Add outputFormat to compose params explicitly
Ensure `outputFormat` param value is `jpg` (already present, but verify it's being respected). Add `background.scaling` param set to `fill` to ensure full coverage.

### Summary of changes
- Line 221: model `google/gemini-2.5-flash` → `google/gemini-2.5-flash-image`
- `uploadResultBuffer`: add optional `forceJpeg` parameter; when true, save as `.jpg`/`image/jpeg` regardless of magic bytes
- Flatten step (line 730): call `uploadResultBuffer` with `forceJpeg: true`
- Non-PNG Gemini output (line 743): call with `forceJpeg: true`
- Add log line noting the model used for background generation

