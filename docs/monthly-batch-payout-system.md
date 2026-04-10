# Monthly Batch Payout System (Stripe Connect)

## Schema

### `payout_periods`
- `id`
- `venue_id`
- `month`
- `status`: `open` → `locked` → `review_window` → `final` → `paid` (or `overdue` if unpaid)
- `total_commission`
- `total_platform_fee`
- lifecycle timestamps: `locked_at`, `review_window_ends_at`, `finalized_at`, `paid_at`, `due_at`
- Stripe linkage: `payment_intent_id`

### `commissions` additions
- `payout_period_id`
- `locked_commission_value`
- `locked_platform_fee`
- `locked_at`
- `paid_at`
- `status`: `pending` → `approved` → `locked` → (`adjusted`/`disputed`) → `final` → `paid`

### `commission_adjustments`
- Audit log for every correction made during review window.
- Captures `previous_amount`, `new_amount`, `adjustment_type`, `reason`, and actor metadata.

### `commission_disputes`
- Tracks dispute lifecycle: `open`, `resolved`, `rejected`, `escalated`.
- Open disputes keep a commission out of final batch until resolved.

### `referral_enforcement_signals`
- Lightweight admin signal table for future trust automation:
  - repeated unresolved disputes
  - repeated downward adjustments
  - unpaid finalised periods
  - repeated abuse

## Flow

1. **Accrual (`open`)**
   - New commissions are auto-linked into the current month `payout_period` via trigger.
2. **Month-end lock (`locked`)**
   - `lock_due_payout_periods()` freezes commission values and platform fee snapshots.
   - Commission status becomes `locked`.
3. **7-day review window (`review_window`)**
   - `begin_review_window_for_locked_periods()` moves locked periods into review.
   - During this window, venues can create adjustments and venues/partners can open disputes.
   - Every adjustment is logged in `commission_adjustments`.
4. **Finalization (`final`)**
   - `finalize_review_window_payout_periods()` runs when review window ends.
   - Undisputed + resolved items become `final`.
   - Open/escalated disputes stay `disputed`, are excluded from batch, and escalated for admin/manual follow-up.
5. **Payment initiation**
   - Venue clicks **Pay with Stripe** in Growth → Payouts.
   - `create-monthly-payout-intent` creates a Stripe PaymentIntent for monthly gross.
6. **Split payout + completion (`paid`)**
   - `stripe-payout-webhook` listens for `payment_intent.succeeded`.
   - Creates Stripe transfers per partner connected account.
   - Calls `mark_payout_period_paid()` to mark only `final` commissions as paid.
7. **Enforcement + trust**
   - `mark_overdue_payout_periods()` transitions unpaid final periods to `overdue`.
   - Data model now supports future automated trust policies without implementing full automation yet.

## Stripe logic

- **Charge amount** = `payout_period.total_commission` (final-ready rows only).
- **Platform fee** = frozen total in `payout_period.total_platform_fee` (derived from locked commission rows).
- **Partner transfer amount** per commission = `locked_commission_value - locked_platform_fee` for `final` rows only.
- Transfers are aggregated per `stripe_connect_account_id` and sent in batch with a shared `transfer_group`.

## UI outcomes

- **Venue UI**
  - Shows plain-English payout and commission labels:
    - Awaiting review
    - Included this month
    - Needs adjustment
    - In dispute
    - Finalised
    - Paid
  - Adds review-window controls to adjust an item or raise a dispute before finalization.
- **Partner UI**
  - Splits pending/final/under-review/paid earnings.
  - Keeps issue flow simple: raise issue + add note.
- **Admin UI/data**
  - Can monitor disputes, adjustment history, unresolved exclusions, and future enforcement signals.
