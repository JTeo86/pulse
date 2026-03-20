

## Diagnosis

The "Approve 6 marketing tasks" count on Home comes from `marketing_plans.plan_data` — the **Marketing Autopilot** weekly plan, which stores tasks as JSON with a `status` field. The count filters for `status === 'pending'`.

But the CTA routes to `/content/planner`, which lands on the **Planner page** showing **Lily's Recommendations** — a completely different system driven by `events_catalog` and `venue_event_plans`.

These are two separate features:
- **Marketing Autopilot** = auto-generated weekly tasks stored in `marketing_plans.plan_data`
- **Lily's Recommendations** = event-driven campaign suggestions from `LilyRecommendations` component

The count comes from system A, but the link goes to system B. That's why the numbers don't match.

## Fix

**In `TodaysOpportunities.tsx`**, update the marketing tasks opportunity to route to the correct destination. Since the Marketing Autopilot weekly plan was previously rendered by `WeeklyMarketingPlan` (which was removed from Home), the CTA should either:

1. **Route back to a working review surface** — if `WeeklyMarketingPlan` still exists as a component, re-expose it at a reachable route or re-add it to Home as a collapsible section
2. **Simpler fix**: Since `WeeklyMarketingPlan` is a standalone component that was removed from Home for simplicity, the cleanest approach is to **remove the marketing tasks opportunity card entirely** from `TodaysOpportunities` — it references a workflow that no longer has a visible review surface

**Recommended approach**: Remove the marketing plan opportunity from `TodaysOpportunities.tsx` (lines 108-117) since there is currently no destination page that shows those Autopilot tasks for review. This eliminates the misleading count and broken routing.

If the Autopilot weekly plan should remain reviewable, an alternative is to re-add the `WeeklyMarketingPlan` component back to Home (below Today's Actions) so users can review and approve those tasks inline — then keep the opportunity card but change its route to scroll/link to that section on Home.

## Changes

**File: `src/components/home/TodaysOpportunities.tsx`**
- Remove the `marketing` opportunity block (the one that counts `pendingPlanTasks` from `marketing_plans.plan_data`) since its destination doesn't match its data source
- Optionally remove the `marketing_plans` query too since nothing else uses it

This is a ~15-line deletion. No other files need changes.

