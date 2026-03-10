

## Fix: Visual Style Page Self-Refreshing

### Root Cause

The issue is in `src/lib/venue-context.tsx` (line 143):

```typescript
useEffect(() => {
  if (authLoading) return;
  refreshVenues();
}, [user, authLoading]);
```

The dependency is `user` — the full User **object**. Supabase's `onAuthStateChange` fires on every auth event, including periodic **token refreshes**. Each time it fires, `setUser(session?.user)` creates a new object reference even though the actual user hasn't changed. This triggers `refreshVenues()`, which calls `setCurrentVenue(venue)` with a new object, causing the entire page tree (including VisualStyle and all its data-fetching hooks) to re-render and refetch.

The cascade:
1. Token refresh → new `user` object reference
2. → venue-context `useEffect` re-runs → `refreshVenues()` 
3. → new `currentVenue` object → VisualStyle re-renders
4. → `fetchProfile`, `useStyleAssets`, `fetchApproved` all re-fire

### Fix

**`src/lib/venue-context.tsx`** — Change the useEffect dependency from `user` (object) to `user?.id` (stable string primitive):

```typescript
useEffect(() => {
  if (authLoading) return;
  refreshVenues();
}, [user?.id, authLoading]);
```

This ensures venues only reload when the user actually changes (login/logout), not on every token refresh cycle.

