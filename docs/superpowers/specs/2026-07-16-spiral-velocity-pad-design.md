# Spiral velocity pad — continuous zoom/rotation animation for the spiral view

Date: 2026-07-16
Status: approved (AL, 2026-07-16)

## Goal

Watching the spiral today requires continuous dragging: a translation in strip space reads as
rotation + self-similar zoom in the spiral image, so the motion stops the moment the mouse does. Add a
circular joystick ("velocity pad") to the sidebar's spiral controls that sets a persistent strip-space
*velocity*: horizontal deflection = zoom rate, vertical = rotation rate. Set it once and the spiral
animates on its own; drag it back to the center (or into the dead zone) to stop.

## Why a circle, and why strip space

The spiral shader ([components/inversive-canvas.tsx](../../../components/inversive-canvas.tsx),
`uMode==2`) computes `world = K·(merc − V)` with `V = (dolly, spin)` — pan already acts in strip space
(x = self-similar zoom, y = rotation). A velocity in strip space is therefore exactly the animation
wanted: advance `V` by `vel·dt` per frame and the spiral turns and breathes at constant rate. The pad
is a disc, not a square, because the control is a polar vector: direction picks the mix of zoom/spin,
magnitude picks the speed.

## Approach (B — spiral-only drift, lattice-wrapped)

Rejected A: advancing the shared `controls.targetOffset` per frame. Least code, but the offset grows
without bound (float32 `merc − V` in the shader visibly jitters after ~10+ min of animation) and
toggling back to flat view finds the pan absurdly far away.

Chosen B: the pad writes a velocity; the spiral canvas's existing rAF loop integrates it into a
separate strip-space drift added to `V`. Advancing `V` by a strip-lattice vector `v/K` is an exact
world-lattice translation — invisible — so the drift is wrapped modulo the strip lattice every frame:
bounded forever, no precision decay, flat-view pan untouched. Manual drag composes for free (`V` is
linear in pan and drift). Works unchanged in double-pole (Droste) mode: the wrap is still a world
lattice translation.

## Components

**`lib/render/velocityPad.ts`** (new, pure): pad math.
- `padPosition(dx, dy, radius)` — clamp raw pointer displacement to the disc; snap to (0,0) inside the
  dead zone (12% of radius). The snap applies live during drag, not only on release.
- `padVelocity(pos, radius)` — normalized displacement past the dead zone, quadratic curve for fine
  control near the center: `vel = MAX_RATE · r² · direction`, strip-units/second. Default
  `MAX_RATE ≈ 1.0` for both axes (≈ e× zoom per second / full turn in ~6 s at full deflection) —
  constants tuned by eye at implementation.

**`lib/render/spiralMap.ts`**: add `wrapStripDrift(drift, k, v1, v2)` — strip-lattice basis
`u1 = v1/K`, `u2 = v2/K` (complex division); solve the 2×2 for real coefficients (a, b) and subtract
`round(a)·u1 + round(b)·u2`. Singular determinant → return drift unchanged.

**`lib/stores/configuration.ts`**:
- `spiralVel: { x: number; y: number }` — strip-space velocity, written via `setCfg` on pad
  interaction only (discrete events, no per-frame React writes).
- `spiralDrift: { x: number; y: number }` — the integrated drift, mutated in place by the render loop
  (the `controls` pattern), so it survives `InversiveCanvas` remounts and the view doesn't jump when
  toggling modes.

**`components/spiral-velocity-pad.tsx`** (new): SVG disc (~140 px) with faint crosshair axes, a vector
line from the center, and a knob that persists where released. Pointer capture on the SVG; labels
"zoom" below the disc and "rotation" rotated along the left edge, `text-[11px] text-fg-muted` to match
the sidebar. Theme-aware via existing tokens. No keyboard interaction in v1.

**`components/sidebar/tilings-tab.tsx`**: mount the pad in the spiral branch, under Arm a/b. The pad
is self-contained (reads/writes the store itself).

**`components/inversive-canvas.tsx`**: in the render loop, when `inversiveMode === "spiral"` and
`spiralVel ≠ 0`, integrate `drift += vel·dt` (dt clamped to 50 ms so a backgrounded tab doesn't jump),
wrap via `wrapStripDrift`, and add drift to `spiralV`.

## Semantics and edge cases

- Sign convention: pad right = zoom in, pad up = counterclockwise — flip signs at implementation if
  the visual reads inverted (screen y is down).
- Leaving spiral mode: velocity stays in the store but is not consumed (integration gated on mode);
  the knob shows its last value when returning. Only the spiral branch renders the pad.
- Tiling / arm / family change: drift is strip-space view state like pan — any value stays valid; no
  reset needed. Parametric families rebuild geometry per frame already; drift is orthogonal.
- Dead zone: 12% of radius; entering it (dragging or releasing there) snaps the knob to center and
  zeroes the velocity.

## Testing

Vitest over the pure math (`tests/velocity-pad.test.ts`, plus `wrapStripDrift` cases in the spiral map
tests):
- `padPosition`: clamps to the rim, dead zone snaps to origin, pass-through outside it.
- `padVelocity`: zero in the dead zone, monotone quadratic, max at the rim, direction preserved.
- `wrapStripDrift`: `K·(orig − wrapped)` is an integer combination of (v1, v2) to float tolerance;
  wrapped drift lies within one strip cell; singular basis returns input unchanged; identity for
  drift already inside the cell.

Component behavior (pointer capture, visuals) verified manually in `pnpm dev`.
