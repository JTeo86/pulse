# Monthly Batch Payout System (Stripe Connect)

## Schema

### `payout_periods`
- `id`
- `venue_id`
- `month`
- `status`: `open` → `locked` → `final` → `paid` (or `overdue` if unpaid)
- `total_commission`
- `total_platform_fee`
- lifecycle timestamps: `locked_at`, `finalized_at`, `paid_at`, `due_at`
- Stripe linkage: `payment_intent_id`

### `commissions` additions
- `payout_period_id`
- `locked_commission_value`
- `locked_platform_fee`
- `locked_at`
- `paid_at`

## Flow

1. **Accrual (`open`)**
   - New commissions are auto-linked into the current month `payout_period` via trigger.
2. **Month-end lock (`locked`)**
   - `lock_due_payout_periods()` freezes commission values and platform fee snapshots.
   - Commission status becomes `payable` (unless already `paid`).
3. **Buffer window**
   - Buffer controlled by `due_at` (default 7 days) while period is `locked`.
   - Adjustments/disputes can be applied before finalization.
4. **Finalization (`final`)**
   - `finalize_locked_payout_periods()` marks period `final` after buffer expires.
5. **Payment initiation**
   - Venue clicks **Pay with Stripe** in Growth → Payouts.
   - `create-monthly-payout-intent` creates a Stripe PaymentIntent for monthly gross.
6. **Split payout + completion (`paid`)**
   - `stripe-payout-webhook` listens for `payment_intent.succeeded`.
   - Creates Stripe transfers per partner connected account.
   - Calls `mark_payout_period_paid()` to mark period and commissions as paid.
7. **Enforcement**
   - `mark_overdue_payout_periods()` transitions unpaid final periods to `overdue`.

## Stripe logic

- **Charge amount** = `payout_period.total_commission`.
- **Platform fee** = frozen total in `payout_period.total_platform_fee` (derived from locked commission rows).
- **Partner transfer amount** per commission = `locked_commission_value - locked_platform_fee`.
- Transfers are aggregated per `stripe_connect_account_id` and sent in batch with a shared `transfer_group`.

## UI outcomes

- **Venue UI** now surfaces monthly batch amount, status, and a one-click Stripe CTA.
- **Partner UI** now surfaces monthly earnings, expected payout date, and paid history.
