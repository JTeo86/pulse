
## Root Cause: Two Conflicting Unique Constraints + Silent Error Swallowing

### What's actually happening

1. **The `reviews` table has TWO overlapping unique constraints:**
   - Original (from initial migration): `UNIQUE (source, external_review_id)` — composite
   - Added later (migration `20260217001839`): `UNIQUE (external_review_id)` — single column

2. **The `ingest-reviews` edge function upserts with `onConflict: "external_review_id"`** — this targets the single-column constraint. When PostgREST tries to execute this against a table with two competing unique indexes involving the same column, the upsert fails.

3. **The failure is completely silent.** The Supabase JS client `.upsert()` never throws — it returns `{ data, error }`. The code ignores the error entirely:
   ```typescript
   await supabaseAdmin.from("reviews").upsert({...}, { onConflict: "external_review_id" });
   result.fetched_count++; // Always increments, even on failure
   ```
   So the function logs "Ingested 18 reviews" and the UI shows "success" — but OpenTable rows never land in the DB.

4. **Google works by accident** — Google reviews were written before the second unique constraint was added, so they got in. Subsequent Google upserts "succeed" silently because the upsert finds a conflict on the single-column index and updates in place.

---

## The Fix — Two changes only

### 1. Database migration
Drop the redundant single-column unique constraint:
```sql
ALTER TABLE public.reviews DROP CONSTRAINT reviews_external_review_id_unique;
```

The composite `(source, external_review_id)` is the correct and original constraint. The single-column one was incorrectly added later and conflicts with the upsert logic.

### 2. Fix the edge function upsert

**A. Change `onConflict` to match the composite constraint:**
```typescript
{ onConflict: "source,external_review_id" }
```

**B. Add proper error checking so failures are never silent:**
```typescript
const { error: upsertErr } = await supabaseAdmin.from("reviews").upsert({...}, { onConflict: "source,external_review_id" });
if (upsertErr) {
  console.error("OpenTable upsert error:", upsertErr.message);
  // don't increment fetched_count
} else {
  result.fetched_count++;
}
```

Apply the same error-check fix to the Google upsert loop too.

---

## Files to change

| File | Change |
|---|---|
| New migration SQL | `DROP CONSTRAINT reviews_external_review_id_unique` |
| `supabase/functions/ingest-reviews/index.ts` | Fix `onConflict` + add error checking in both Google and OpenTable loops |

No UI changes needed. Once the constraint is dropped and the function redeployed, re-running "Fetch latest reviews" will correctly persist the OpenTable reviews and they will appear in the feed.
