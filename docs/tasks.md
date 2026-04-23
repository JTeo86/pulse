# Pulse — Tasks

Last updated: 2026-04-22
Project mode: active
Source of truth: this file

## Rules for Codex
- Read `/docs/architecture.md`, `/docs/roadmap.md`, and this file before making changes.
- Work on exactly one task at a time, starting from the first `[todo]` item in the highest-priority section unless the user says otherwise.
- After each task:
  1. update the task status in this file
  2. add a short note in `## Execution Log`
  3. move the next task to `[in_progress]` only when the previous one is complete
  4. update `Last updated`
- Keep diffs scoped. Do not silently add extra features.
- If blocked, mark the task `[blocked]` and explain why in one sentence.
- If work is partly done, mark `[partial]` and note exactly what remains.
- Never leave more than one task marked `[in_progress]`.

## Status legend
- [todo]
- [in_progress]
- [blocked]
- [partial]
- [done]

## Priority 1 — Critical
- [todo] Fix Buffer scheduling bug
  - Goal: Posts should not be scheduled at random times.
  - Success criteria:
    - follows Buffer posting slots if available
    - otherwise schedules on the next available day after the latest scheduled post
    - correct timezone handling is validated
  - Validation:
    - inspect scheduling code path
    - run relevant tests or smoke checks
    - document final behavior in Execution Log

- [todo] Ensure `send-to-buffer` respects `scheduled_for` correctly
  - Goal: timestamps are passed in the right format and timezone
  - Success criteria:
    - no accidental UTC/local mismatch
    - payload format matches the integration expectation
  - Validation:
    - confirm input/output examples
    - verify with local test or safe dry-run path

- [todo] Improve `sync-buffer-status` reliability
  - Goal: all update IDs are tracked and aggregate status is correct
  - Success criteria:
    - `buffer_payload.update_ids` handled safely
    - single canonical Pulse status per content item
  - Validation:
    - inspect multi-update logic
    - run a representative sync test

## Priority 2 — UX
- [todo] Add consistent back navigation across all relevant pages
- [todo] Split Content page into tabs: Content Feed, Content Pipeline, Library & Uploads
- [todo] Simplify approval flow to one clear approval point

## Priority 3 — Pro Photo
- [todo] Add manual “Generate Image” button in the right intentional planning surfaces
- [todo] Fix tabletop mode so outputs are truly top-down
- [todo] Fix angle shot mode so there is no split wall/background effect
- [todo] Improve realism and reduce obvious AI look

## Priority 4 — Performance
- [todo] Compress images before storage where appropriate
- [todo] Add thumbnail generation
- [todo] Improve load speed across content pages

## Future Prep
- [todo] Prepare schema for referral tracking
- [todo] Prepare Stripe Connect integration structure

## Execution Log
- 2026-04-22 — System initialized. No tasks started yet.
