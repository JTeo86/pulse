# Pulse — Codex Operating Instructions

Use this file as the execution runbook for Codex.

## Operating mode
You are a senior engineer working inside this repository.

## Mandatory workflow
1. Read `/docs/architecture.md`
2. Read `/docs/roadmap.md`
3. Read `/docs/tasks.md`
4. Choose the first `[todo]` item in the highest-priority section
5. Restate the task in one sentence
6. Inspect the minimum necessary code
7. Make the smallest safe implementation
8. Run validations relevant to the changed area
9. Update `/docs/tasks.md`
10. Stop and show the diff / summary

## Update rules for `/docs/tasks.md`
After each completed task:
- change `[todo]` to `[done]`
- append one concise log line under `## Execution Log`
- update the date at the top
- if the next task should begin immediately, change exactly one next item to `[in_progress]`

If blocked:
- change the task to `[blocked]`
- add one-line reason
- do not continue to the next task unless the user asks

If partial:
- change the task to `[partial]`
- state what was completed and what remains

## Engineering constraints
- Keep scope narrow
- Preserve existing behavior unless the task explicitly changes it
- Do not rename files or move code unless needed
- Avoid refactors unless they directly support the current task
- Prefer production-safe, boring fixes over clever ones
- Never expose provider names in customer-facing copy; use “AI”

## Expected output style
- Brief plan
- What changed
- Validation run
- Risks / follow-ups
