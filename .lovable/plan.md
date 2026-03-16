
Problem found:
- In `src/components/planner/ProductionSection.tsx`, the no-asset brief cards mix a free-width header (`justify-between`) with a variable-width status badge (`Brief Ready`) and a flexible two-button row (`flex-1` on both buttons).
- On wider desktop/full-screen layouts, long title + badge + equal-flex buttons inside a two-column grid can create uneven visual widths and occasional overflow/clipping because the card internals are not using a strict responsive layout contract.
- The current card also lacks explicit `min-w-0` protection on all header/content wrappers, which is part of the project’s responsive layout standard.

Implementation plan:
1. Refactor brief card header to a stable two-column/grid layout
   - Keep the title block in a `min-w-0` wrapper so it can truncate safely.
   - Move the status badge into a non-shrinking container.
   - Ensure `Brief Ready` never pushes the title or action row out of alignment.

2. Make the no-asset action row symmetrical
   - Replace the current loose `flex-wrap + flex-1` button layout with a consistent responsive grid:
     - mobile: 1 column
     - tablet/desktop/full-screen: 2 equal columns
   - Give both “Create in Studio” and “Attach Existing” identical height, width behavior, and icon/text alignment.
   - Add `w-full min-w-0` to both buttons so they fill their grid cells cleanly.

3. Harden all Production card internals against overflow
   - Add `min-w-0` where needed on card containers, header content, and text blocks.
   - Prevent badge/button text from forcing horizontal growth.
   - Verify the section respects the project standard of scroll-free layouts.

4. Align linked-asset action rows as well
   - Normalize the linked-state button group (`Open`, `Approve`, `Detach`) so it also behaves predictably across desktop widths.
   - Keep “Detach” compact while ensuring the primary actions remain balanced and don’t distort the row.

5. Verify planner container interaction
   - Confirm the parent shell in `EventPlanDetail.tsx` does not contribute to width issues at the current 1000px+ desktop/full-screen layout.
   - If needed, tighten the Production section/card wrappers with `min-w-0 overflow-x-hidden` so the full-screen grid cannot leak width.

Expected result:
- `Brief Ready` sits cleanly without crowding the title.
- `Attach Existing` and `Create in Studio` appear visually symmetrical.
- No overflow or awkward stretching in full-screen web mode.
- Production cards stay consistent across mobile, tablet, and desktop layouts.
