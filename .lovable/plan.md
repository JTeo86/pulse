

## Remove Non-functional PanelLeft Button

The desktop top bar (lines 491-494) has a `PanelLeft` icon button that does nothing — it's wrapped in `asChild` with a plain `<span>`, so it has no click handler or sidebar toggle logic.

### Change

**`src/components/layout/AppLayout.tsx`** — Remove the non-functional button entirely from the desktop top bar. Keep the top bar itself (it hosts the "Create" dropdown on the right). Replace the button with an empty `<div />` spacer to maintain the `justify-between` layout, or simply remove the left side.

