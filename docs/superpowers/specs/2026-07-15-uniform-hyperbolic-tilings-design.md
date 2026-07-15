# Uniform (Archimedean) hyperbolic tilings on the /play shelf — design

Date: 2026-07-15. Author: CC. Status: approved (AL, "go ahead"), pre-implementation.

## Goal

Add the uniform (Wythoffian) hyperbolic tilings to the /play hyperbolic shelf. The shelf today
holds four **regular** {p,q} tilings ({7,3}, {8,3}, {5,4}, {4,5}) — all isohedral. This adds their
**non-isohedral** uniform siblings: the truncated, rectified, rhombi-, omnitruncated, and snub forms
of the same three triangle groups. These are vertex-transitive (isogonal) but have 2–3 regular-polygon
tile types, so they are not isohedral.

This is a rendering/exhibit feature only. `source: "hyperbolic"`, no completeness claim, decoupled
from the Čtrnáct engine — exactly the standing of the existing four (NOTES §59). The theoretical
backdrop (why uniform hyperbolic tilings live at the triangle-group edge lengths) is in
`docs/hyperbolic-port-notes-2026-07-12.md`.

## Scope — the 18 tilings

The three groups already shown — (2,3,7), (2,3,8), (2,4,5) — each contribute their six non-regular
uniform forms:

| Group | truncated | rectified | trunc-dual | rhombi | omnitrunc | snub |
|---|---|---|---|---|---|---|
| (2,3,7) | 3.14.14 | 3.7.3.7 | 6.6.7 | 3.4.7.4 | 4.6.14 | 3.3.3.3.7 |
| (2,3,8) | 3.16.16 | 3.8.3.8 | 6.6.8 | 3.4.8.4 | 4.6.16 | 3.3.3.3.8 |
| (2,4,5) | 4.10.10 | 4.5.4.5 | 5.8.8 | 4.4.5.4 | 4.8.10 | 3.3.4.3.5 |

The four regular entries stay. No new triangle groups, no k-uniform (multi-vertex-orbit) tilings —
those have no generator and no oracle and are explicitly out of scope (port notes §3–4).

## Ring convention (used throughout)

Coxeter–Dynkin linear diagram for [p,q] is `A —p— B —q— C`:
- `A` = face mirror (opposite the tiling vertex), `B` = edge mirror, `C` = vertex mirror.
- Dihedral angles: ∠(A,B) = π/p, ∠(B,C) = π/q, ∠(A,C) = π/2.

The fundamental Schwarz triangle T has corners:
- `O = A∩B`, interior angle π/p — a p-gon-face centre.
- `V = B∩C`, interior angle π/q — a tiling vertex (q faces meet).
- `E = A∩C`, interior angle π/2 — an edge midpoint.

`rings = [a, b, c]` are the ring flags on `[A, B, C]`. The seven rank-3 forms:

| rings | form | example (2,3,7) |
|---|---|---|
| [1,0,0] | {p,q} regular | {7,3} (have) |
| [0,0,1] | {q,p} regular | {3,7} (not added — isohedral) |
| [1,1,0] | t{p,q} truncated | 3.14.14 |
| [0,1,1] | t{q,p} truncated-dual | 6.6.7 |
| [0,1,0] | r{p,q} rectified | 3.7.3.7 |
| [1,0,1] | rr{p,q} rhombi- | 3.4.7.4 |
| [1,1,1] | tr{p,q} omnitruncated | 4.6.14 |
| [1,1,1] + snub | sr{p,q} snub | 3.3.3.3.7 |

The added set is the five non-snub multi-tile-type patterns {[1,1,0],[0,1,1],[0,1,0],[1,0,1],[1,1,1]}
plus snub, per group.

## Data model

Add a `wythoff` descriptor to the reference-atlas hyperbolic entries
(`public/reference-atlas-hyperbolic.json`, typed in `lib/services/referenceAtlas.ts`):

```ts
wythoff?: { p: number; q: number; rings: [boolean, boolean, boolean]; snub?: boolean };
```

Everything downstream (Wythoff point, tile-type list, per-type hues, vertex config, name) is **derived**
in pure code from `(p, q, rings, snub)` — a data row carries no geometry. The four existing regular
entries migrate to `wythoff: { p, q, rings: [true,false,false] }`, keeping `schlafli` as the card
label. Routing (play client, thumbnail, catalogue) switches from "has `schlafli`" to "has `wythoff`".

Rationale for a unified `wythoff` field over keeping `schlafli` + a bolt-on: a Schläfli symbol only
names the two regular forms; the other six per group have no {p,q}. One descriptor that produces the
regular case as `rings:[1,0,0]` keeps the renderer single-path.

## Geometry — `lib/render/hyperbolic.ts` (pure, unit-tested)

New pure functions, tested the way `mirrorParams` already is (closed-form hyperbolic trig, no WebGL):

1. `schwarzTriangle(p, q)` — the three corner positions `O, V, E` as Poincaré-disk points, with the
   central p-gon at the origin and the reference edge on +x (consistent with `mirrorParams`).
2. `wythoffPoint(p, q, rings)` — the generating point `W`: the point lying on every **unringed**
   mirror and equidistant from the **ringed** mirrors (a corner, an edge point, or the incenter for
   the one-, two-, three-ring cases). Returns `W` plus the derived tile-type descriptor: which corners
   (`O`/`V`/`E`) carry a face, and each face's polygon side count.
3. `tileHue(sides)` — a shared side-count → hue map so a given n-gon reads the same hue across all
   tilings that contain it. Reused by the card/thumbnail.

Correctness anchors: the derived vertex configuration of each form must equal the §Scope table, and a
sampled render must match `experiments/hyperbolic/render_poincare.py` for at least one case per group.

## Shader — `lib/render/hyperbolicShader.ts`

The current shader folds a pixel into the whole p-gon tile (p-fold rotation + edge inversions) and
colours by tile-centre distance. Two changes:

**Fold one reflection further, to a single Schwarz triangle.** After the existing reduction lands the
pixel in the reference "kite" (the ±π/p wedge of the central tile), one reflection across the +x
apothem axis (`z.y → |z.y|`, matched by a Jacobian-sign update for AA) puts it in the reference
Schwarz triangle T. The pan/rebase/SU(1,1) machinery is untouched.

**Classify within T.** New uniforms: the Wythoff point `W`, the active-mirror flags, up to three
tile-type hues, and a snub flag.
- *Non-snub:* drop perpendiculars from `W` to the three sides of T. They partition T into ≤3 regions,
  one per occupied corner (`O`/`V`/`E`); the pixel's region gives its tile type and hue. Cost: a small
  fixed number of geodesic half-plane tests per pixel. Tile-edge strokes are the region boundaries; the
  existing geometry/constant line-mode and rim-AA carry over.
- *Snub:* fold with the **rotation** subgroup into the doubled domain (two Schwarz triangles), then
  classify into p-gon / q-gon / snub-triangle with a chirality parity term. This is the highest-risk
  piece; the plan isolates it as the **final** increment so it cannot block the other 15 tilings. If it
  proves disproportionately costly it can be dropped without unwinding anything else.

Colouring becomes per-tile-type (up to three hues) rather than one hue per tiling. Distance-dimming,
the parity shading toggle (offered only where meaningful), and both line modes are preserved.

## Interaction & catalogue

Pan, rotation, click-to-centre, line-mode toggle, and shading toggle all carry over. Click-to-centre
snaps to the Schwarz-triangle corner orbits (tile centres `O`, vertices `V`, edge midpoints `E`) —
the same anchor family as today, now spanning the multiple tile types. The 18 entries join the existing
"Hyperbolic" tile class in the catalogue; thumbnails render through the same extended shader path
(`components/hyperbolic-thumbnail.tsx`). Each card shows the form name and vertex configuration.

## Out of scope

k-uniform (multi-vertex-orbit) hyperbolic tilings; triangle groups beyond the three shown; any
coupling to the enumeration engine or a completeness claim; new interaction modes.

## Files touched

- `public/reference-atlas-hyperbolic.json` — 18 new entries + migrate 4 regular ones.
- `lib/services/referenceAtlas.ts` — `wythoff` field on the entry type; routing on its presence.
- `lib/render/hyperbolic.ts` — `schwarzTriangle`, `wythoffPoint`, `tileHue` (+ tests).
- `lib/render/hyperbolicShader.ts` — Schwarz-triangle fold, Wythoff classifier, per-type hues, snub.
- `components/hyperbolic-canvas.tsx` — pass the new uniforms from the derived descriptor.
- `components/hyperbolic-thumbnail.tsx` — same uniform wiring for static renders.
- `tests/hyperbolic.test.ts` — cases for the new pure functions.
- Catalogue/card wiring (`lib/services/catalogueService.ts`, `components/reference-card.tsx` and the
  play client) — read `wythoff` where they read `schlafli` today.

## Verification

- `pnpm test` green, including new `hyperbolic.test.ts` cases (Wythoff point on the unringed mirrors,
  derived vertex configs equal the §Scope table).
- `pnpm build` clean (types + lint).
- Manual /play check: each of the 18 renders, pans, and rotates without float blow-up; thumbnails
  render; at least one per group visually matches the `render_poincare.py` reference.
