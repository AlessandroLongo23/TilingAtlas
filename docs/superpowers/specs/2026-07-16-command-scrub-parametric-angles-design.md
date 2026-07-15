# Command + mouse-move to scrub parametric angles

Date: 2026-07-16
Status: approved design, pre-implementation

## Goal

Let the user set the free angle(s) of a Euclidean parametric tiling by holding **Command** and moving
the mouse over the canvas, no button pressed. Horizontal movement scrubs α, vertical movement scrubs β.
The value eases the same way the rotation slider does, but is **clamped** to each parameter's min/max
instead of wrapping cyclically.

This complements the existing `ParamSliderPanel` — it does not replace it. Both write the same target.

## Gesture

- **Engage:** Command (`metaKey`) held, pointer over the flat p5 canvas, no mouse button pressed.
- **Mapping:** relative movement since the last frame. `Δα = movedX × ALPHA_DEG_PER_PX`,
  `Δβ = -movedY × ALPHA_DEG_PER_PX` (screen Y is inverted, so up = +β). Right = +α, up = +β.
- **Feel:** continuous / proportional (user choice). No detents. One tunable constant
  `ALPHA_DEG_PER_PX` (start ~0.25 °/px).
- **Relative, not absolute:** pressing Command never snaps the angle to the cursor position; it only
  responds to actual motion. Releasing Command or leaving the canvas freezes the value.
- **Single-parameter families:** the vertical axis is ignored; only α scrubs.
- **Clamp, never wrap:** the target is clamped into each parameter's `alphaRangeDegOpen` (the open
  validity interval already used by the slider), never folded modulo like rotation's `wrap360`.

## Architecture — target/live split (mirrors rotation)

Rotation already uses a two-value split: `cfg.rotation` is the target (slider/wheel write it, wrapped),
and `controls.rotation` is the live eased value the render path reads, chasing the target at ~0.2/frame
along the shortest arc inside the p5 draw loop. This feature is the direct analogue, minus the wrap.

Both the flat canvas (`canvas.tsx`) and the inversive overlay (`inversive-canvas.tsx`) render parametric
families from `familyAlphas`. Therefore the eased value must live in the **shared store**, not a
canvas-local ref — a canvas-local live value would leave the inversive view rendering the raw target and
desyncing from the flat view. The flat `Canvas` is always mounted as the input/pan layer beneath
whichever overlay is active (`_play-client.tsx:422-424`), so its draw loop is the single always-on place
to drive the ease, and its `mouseMoved` is the input hook that works in every view.

Data flow:

- `familyAlphas.values` — the **target** tuple. Unchanged role: the slider reads/writes it; the
  Command-scrub accumulates clamped deltas into it.
- `familyAlphas.live` — new, non-reactive tuple. Eased toward `values` each frame in the flat-canvas
  draw loop: `live[i] += (values[i] - live[i]) * ALPHA_DAMP` (ALPHA_DAMP ~0.2), snapping to the target
  within a hair to stop perpetual micro-updates. **Seeding rule:** the draw loop treats `live == null`
  (or a length mismatch against `values`) as "copy `values` into `live` this frame, no ease." The
  selection-change path (which already resets `values`) sets `live = null`, so a new family shows
  immediately instead of easing from a stale tuple. One rule covers both mount and selection change.
- Render reads `live` (fallback to `values` if `live` is null) in `ensureTiling` and in the inversive
  overlay. The slider thumbs keep reading `values`, so they track the scrub instantly while the geometry
  glides behind — the same relationship the rotation slider has with the eased view.

## Components and changes

- **`lib/stores/familyAlphas.ts`** — add a non-reactive `live: number[] | null` field alongside
  `values`, plus whatever minimal setter/mutation surface the draw loop needs. `values` keeps its
  current type and role. Keep the store's "only the slider panel subscribes reactively" property: `live`
  is mutated in place, never via a reactive `set` that would re-render subscribers.
- **`lib/utils/paramCell.ts`** — add `clampAlphaOnly(pc, paramIndex, alphaDeg)`: clamp into the open
  interval (with the existing `ALPHA_EPS_DEG` padding) **without** the 0.5° grid snap that `clampAlphaAt`
  applies, so the continuous scrub stays continuous. The slider keeps `clampAlphaAt` (grid-snapped) for
  its committed values.
- **`components/canvas.tsx`** —
  - Add `p5.mouseMoved` handler, guarded by `event.metaKey && paramCell != null &&
    event.target === p5.canvas`. Read the family's param count from `propsRef.current` / `paramCell`.
    Accumulate `movedX`/`movedY` into `familyAlphas.values` via `clampAlphaOnly` (α always, β only when
    `params.length >= 2`). Do nothing when not engaged (no per-move cost otherwise).
  - Add the per-frame α/β ease in the draw loop (new constant `ALPHA_DAMP`), mutating `familyAlphas.live`
    in place. Seed `live` from `values` on setup/remount.
  - Switch the `ensureTiling` alpha read (`canvas.tsx:383` and the inversive-cell branch at `:819`) from
    `values` to `live`.
  - Cursor affordance: while Command is held over a parametric tiling, set the canvas cursor to `move`;
    reset on Command keyup / pointer leave.
- **`components/inversive-canvas.tsx`** — switch its render read (`:276`) from `values` to `live`.
- **`components/param-slider-panel.tsx`** — unchanged. Still reads/writes `values` (the target).

Untouched: the wheel handler (`p5.mouseWheel`: zoom, Shift-rotate) and drag-pan (`mouseDragged`, which
requires a pressed button — Command+move has none). `wrap360` and the rotation path are not touched.

## Edge cases and interactions

- **Non-parametric selection:** `paramCell == null` → the gesture is inert; `mouseMoved` returns early.
- **Selection change while scrubbing:** the selection-change effect already resets `familyAlphas`; it
  also sets `live = null`, and the draw loop reseeds `live` from `values` on the next frame (the seeding
  rule above), so it never eases from a stale tuple across an unrelated family.
- **Command + drag (button pressed):** stays a pan (`mouseDragged`), not a scrub — the scrub is
  `mouseMoved` only, matching "without pressing anything."
- **Accidental trigger / discoverability:** a modifier-only, no-click gesture is undiscoverable without a
  hint and can be nudged by incidental motion while Command is held. Mitigations: the `move` cursor
  (hint) and the canvas-only guard. Relative deltas + easing keep stray motion small and recoverable.
  Accepted tradeoff. (Command+*move* also avoids the Cmd+*wheel* = browser-zoom conflict.)
- **Performance:** each scrubbed frame re-evaluates the parametric cell (`evaluateParamCell`) and rebuilds
  the replicated grid, same path a slider drag already exercises today. Slider dragging is smooth, so
  per-frame ease should be too; confirm during verification and, if needed, raise `ALPHA_DAMP` or gate
  re-eval on a minimum delta.

## Testing / verification

- Unit: `clampAlphaOnly` clamps to the open interval, applies `ALPHA_EPS_DEG` padding, and does **not**
  snap to the 0.5° grid (contrast with `clampAlphaAt`).
- Manual (the runtime behavior, per the verify skill): on a one-parameter family, Command+horizontal
  move sweeps α within bounds, eases on release, clamps hard at both ends, and leaves the value untouched
  when Command is not held. On a two-parameter family, horizontal = α, vertical = β, diagonal moves both.
  Confirm the inversive overlay eases in lockstep with the flat view. Confirm the wheel (zoom /
  Shift-rotate) and drag-pan are unchanged.
- `pnpm build` clean (types + warnings) before reporting complete, per the project workflow rule.

## Open tuning knobs (not blocking)

- `ALPHA_DEG_PER_PX` sensitivity (~0.25 °/px start).
- `ALPHA_DAMP` ease rate (~0.2, matching rotation's `ROTATE_DAMP`).
- Sign convention (right = +α, up = +β) — flip if it reads backwards in practice.
