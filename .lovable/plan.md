

## Fix: OpenTable Reviews — Wrong Field Mappings

### Root Cause

The OpenTable reviews **are** being fetched successfully from SerpAPI, but the ingestion code maps the wrong field names when saving to the database. Confirmed by inspecting `raw_payload`:

```text
SerpAPI returns          Code expects
─────────────────        ─────────────
r.user.name        →    r.author         (gets "Anonymous")
r.content          →    r.text / r.comment (gets null)
r.submitted_at     →    r.date           (gets null)
r.id               →    r.id             (works)
r.rating.overall   →    r.rating.overall (works)
```

All 10 OpenTable reviews exist in the database but with null text, null dates, and "Anonymous" author — so they appear empty/broken in the UI.

### Fix (single file change)

**File: `supabase/functions/ingest-reviews/index.ts`** — lines 222-244

Update the OpenTable review field mappings inside the `ingestOpenTable` function:

1. **Author**: Change `r.author || "Anonymous"` → `r.user?.name || r.author || "Anonymous"`
2. **Review text**: Change `r.text || r.comment || null` → `r.content || r.text || r.comment || null`
3. **Review date**: Change `safeDateToISO(r.date)` → `safeDateToISO(r.submitted_at) || safeDateToISO(r.dined_at) || safeDateToISO(r.date)`
4. **External ID**: Already uses `r.id` which works, but tighten fallback to prefer `r.id` over random

After deploying, re-run ingestion once — the upsert on `(source, external_review_id)` will update existing rows with the correct data.

### Scope
- One edge function file change + redeploy
- No database migration needed
- No frontend changes needed — the UI already reads `author_name`, `review_text`, `review_date` correctly; they're just null right now

