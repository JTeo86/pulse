
Diagnosis

- The broken image is coming from the data resolver in `src/hooks/use-todays-actions.ts`, not from the Home card UI.
- `TodaysActionsPanel` simply renders `action.media_url` in an `<img>` tag. If that URL is bad, the image breaks.
- In `use-todays-actions`, asset URLs are regenerated with:
  - `supabase.storage.from('content-assets').createSignedUrl(...)`
- But this project’s actual media bucket is `venue-assets`, and the migrations show that bucket was later made private.
- There is no `content-assets` bucket in the current backend config, so this signed URL generation path is wrong.
- The same project already uses the correct bucket elsewhere:
  - `src/hooks/use-content-assets.ts` → `from('venue-assets')`
  - `src/hooks/use-plan-publish.ts` → `from('venue-assets')`
- Result:
  - if `public_url` / `thumbnail_url` is stale or missing, `use-todays-actions` tries to refresh from the wrong bucket
  - that refresh fails silently
  - `media_url` ends up empty or stale
  - Home shows a broken/blank thumbnail

Why it happens specifically in Today’s Actions

- This module has its own asset-resolution logic instead of reusing the working planner/calendar resolver.
- It also falls back to `metadata.media_url`, which may itself be an expired signed URL from an earlier session.
- So Home is using an inconsistent media contract compared with the working Planner/Content Calendar flow.

Fix plan

1. Update `use-todays-actions` to use the correct storage bucket: `venue-assets`.
2. Reuse the same signed-URL rules already used elsewhere:
   - prefer stable `public_url`
   - otherwise prefer stable `thumbnail_url`
   - if URL is signed or missing, regenerate from `storage_path`
3. Treat `metadata.media_url` as a weak fallback only, and refresh it if it looks like an expired signed URL.
4. Optionally centralize asset URL resolution into a shared helper so Home, Planner, and Content Calendar cannot drift again.
5. Add a safe image fallback in `TodaysActionsPanel` so broken URLs degrade to the channel icon instead of a broken image.

Most likely root cause

- Wrong storage bucket name in `use-todays-actions`:
  - current: `content-assets`
  - should be: `venue-assets`

That is the main reason the scheduled post image under “Today’s Actions” is broken.