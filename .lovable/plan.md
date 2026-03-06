

## Problem

The "Offer terms" textarea calls `updateDecision` on every keystroke (`onChange`). This triggers a database update followed by `fetchAll()` which re-fetches the entire plan from the DB and re-renders. The result is:

- Each character typed triggers a network request
- The `fetchAll` response resets the component state, causing the cursor to jump or text to revert
- Typing feels broken/laggy — characters get swallowed or the field resets mid-typing

## Fix

Add local state for the offer terms textarea with **debounced saves** instead of saving on every keystroke.

### Changes in `src/pages/EventPlanDetail.tsx`

1. **Add local state** for the textarea value, initialized from `decision.offer_terms`
2. **Sync local state** when `decision.offer_terms` changes externally (e.g. after fetch), but only when the user isn't actively editing
3. **Add a `useEffect` debounce** (e.g. 800ms) that saves to DB after the user stops typing
4. **Replace the `onChange` handler** — update local state only, not the DB directly
5. Remove `handleOfferTerms` or repurpose it as the debounced save target

### Technical detail

```text
Current flow:
  keystroke → updateDecision(DB) → fetchAll → re-render (resets textarea)

Fixed flow:
  keystroke → setLocalOfferTerms (instant)
  ... 800ms idle ...
  → updateDecision(DB) → fetchAll → re-render (local state already matches)
```

Single file change, no backend or migration needed.

