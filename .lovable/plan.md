

## Layout Sizing Fix — All Pages, All Viewports

### Problem
The main content area in `AppLayout.tsx` (line 497) renders as:
```html
<div className="flex-1 p-6 lg:p-8">{children}</div>
```
Within a flex parent (`<main className="flex-1 ...">`) — but neither the `<main>` nor the content div have `min-w-0` or `overflow-x` constraints. In flexbox, children default to `min-width: auto`, which allows wide content (tables, grids) to push beyond the viewport, causing horizontal scroll.

### Fix (2 changes in AppLayout.tsx)

**1. Add `min-w-0 overflow-x-hidden` to `<main>`** (line 473):
```
<main className="flex-1 pt-14 lg:pt-0 min-h-screen flex flex-col min-w-0">
```

**2. Add `min-w-0 overflow-x-hidden` to the content wrapper** (line 497):
```
<div className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0 overflow-x-hidden">{children}</div>
```
Also reduces mobile padding from `p-6` to `p-4` for better use of small screens.

**3. Wrap all data tables in horizontal scroll containers** — search for `<Table>` usage across pages and ensure each is wrapped in `<div className="overflow-x-auto">`. Key files:
- `src/pages/growth/PartnersPage.tsx`
- `src/pages/growth/ReferralsPage.tsx`
- `src/pages/growth/PayoutsPage.tsx`
- `src/pages/growth/OffersPage.tsx`
- `src/pages/growth/ReferralDashboard.tsx`
- `src/pages/Team.tsx`
- Any other page using `<Table>`

**4. Fix grid breakpoints on Home.tsx** — the 4-column grid (`lg:grid-cols-4`) is fine, but ensure cards use `min-w-0` to prevent overflow:
```
<section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
```
(Already uses `md:grid-cols-2` — change to `sm:` for earlier stacking on tablets.)

**5. Partner portal layout** — check `PartnerLayout.tsx` for the same flex overflow issue and apply `min-w-0 overflow-x-hidden` to its main content area.

### Summary of files to edit
- `src/components/layout/AppLayout.tsx` — core fix (min-w-0, overflow, mobile padding)
- `src/components/partner/PartnerLayout.tsx` — same flex fix
- `src/pages/growth/PartnersPage.tsx` — wrap table
- `src/pages/growth/ReferralsPage.tsx` — wrap table
- `src/pages/growth/PayoutsPage.tsx` — wrap table
- `src/pages/growth/OffersPage.tsx` — wrap table if using Table
- `src/pages/growth/ReferralDashboard.tsx` — wrap tables
- `src/pages/Team.tsx` — wrap table
- `src/pages/Home.tsx` — grid breakpoint tweak
- `src/components/home/ReferralHomeCards.tsx` — ensure grid doesn't overflow on small screens

