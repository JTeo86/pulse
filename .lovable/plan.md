

## Remove Make.com References

Simple cleanup across 3 files:

### Changes

**1. `src/pages/Integrations.tsx`** (lines 77-104)
- Delete the entire Make.com card section

**2. `src/pages/Publishing.tsx`** (line 67)
- Remove the Make.com comment, replace with generic comment or remove

**3. `supabase/functions/check-key-health/index.ts`** (lines ~222-226)
- Remove Make.com domain validation logic from the health checker

