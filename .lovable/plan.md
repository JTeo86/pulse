

## Root Cause: OpenTable Rating Structure Mismatch

The issue is in the `ingest-reviews` function at line 230. OpenTable returns ratings as a complex JSON object with multiple dimensions:

```json
{
  "overall": 4,
  "food": 5,
  "service": 5,
  "ambience": 5,
  "value": 5,
  "noise": "Quiet"
}
```

But the code tries to insert this directly into the database's `rating` column, which is defined as `numeric` and expects a single number.

## The Fix: Extract Overall Rating

Change the OpenTable upsert logic to extract the `overall` rating from the rating object instead of passing the entire object:

**File**: `supabase/functions/ingest-reviews/index.ts`
**Line**: 230

**Current code**:
```typescript
rating: r.rating || r.overall_rating || null,
```

**Fixed code**:
```typescript
rating: (typeof r.rating === 'object' && r.rating?.overall) 
  ? r.rating.overall 
  : (r.rating || r.overall_rating || null),
```

This will:
1. Check if `r.rating` is an object with an `overall` property
2. If so, extract the `overall` value as the rating
3. Otherwise, fall back to the existing logic

## Alternative Storage Strategy

Optionally, we could also store the full rating breakdown in the `raw_payload` for future analysis while using the overall rating for the main `rating` field (which the current code already does).

## Testing

After the fix, re-run "Fetch latest reviews" and the OpenTable reviews should successfully save to the database and appear in the reviews feed.

