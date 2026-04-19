# Referral payouts: future external provider flow (manual today)

This project currently keeps payouts manual/ledger-based.

## What exists now
- Venues still review a monthly payout period, lock the month, and mark it as paid.
- No live payment execution is triggered from Pulse.
- Referral/commission tracking remains unchanged.

## Why the schema is now provider-ready
- `payout_periods` stores:
  - total commission owed by the venue
  - platform fee total retained by Pulse
  - partner payout total (commission minus platform fee)
  - optional external payment status/reference fields for later reconciliation
- `payments` stores one venue-level payment record per payout period (future real money event).
- `payout_items` stores optional partner-level external payout references and payout timestamps.
- `referrers` stores generic payout account linkage/onboarding fields without provider-specific UI logic.

## Future flow (later, not implemented here)
1. Venue finalizes one monthly amount.
2. System creates/updates a `payments` record for that payout period.
3. Platform fee is retained from period totals.
4. Partner-level payout references are recorded on `payout_items`.
5. Period is finalized with auditable timestamps/references.
