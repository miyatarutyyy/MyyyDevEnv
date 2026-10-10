# Pi Navigator extension

`navigator.ts` adds a read-only, fixed-position ten-line dashboard at the top of Pi's TUI. The goal itself is the panel title, framed by `=` rules; below it the Phase/Task plan is shown without redundant GOAL/NAVIGATOR labels. The panel always uses exactly 10 rows, and the title wraps to at most 2 rows. The number of progress rows adjusts to the title height; unused progress rows remain blank so the panel stays 10 rows tall. The scroll hint and bottom `=` run share one line, followed by a blank row. The panel is a non-capturing TUI overlay, so it remains visible while the transcript scrolls. Mouse-wheel scrolling over its item rows scrolls the Phase/Task list. After progress updates or session restoration, the list starts at the nearest preceding `FINISH` task when one exists, so it and the active `ADDRESS` task are both visible; otherwise it starts one row above the active item. Phase and Task titles share a fixed column. `FINISH` is green, `PLANNED` orange, `ADDRESS` blue, and `BLOCK` red. The panel has no background fill; the transcript is visually covered in those rows but still scrolls underneath.

- **Goal**: overall work objective.
- **Phase**: PR-sized unit with its own status.
- **Task**: Issue-sized unit within a Phase, also with its own status.
- Statuses for both levels: `PLANNED`, `ADDRESS`, `FINISH`, `BLOCK`.

The agent updates progress through three model-callable tools:

- `navigator_set_plan`: create or replace a goal, phases, and tasks.
- `navigator_update_phase`: update one Phase status.
- `navigator_update_task`: update one Task status.

Blocked statuses can include a `reason`. Phase and Task statuses are independent; changing one does not implicitly change its children or parent. Each successful update appends a `pi-navigator-state` custom session entry. On session start and branch navigation, the extension restores the latest matching entry from the active branch. This survives restarting Pi and resuming the same session; a separate new session starts without a plan.

Home Manager manages `~/.pi/agent/extensions` as one immutable directory containing the existing managed extensions plus `navigator.ts`. This avoids trying to create a file underneath an existing read-only Nix-store directory link. Run `just check` to build the declared environment. Applying it to the active user profile remains a separate operation.
