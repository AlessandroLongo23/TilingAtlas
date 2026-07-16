import { describe, it, expect } from "vitest";
import { fdSnapTranslate, type OverlayView } from "@/components/canvas-overlays";

// The canvas world transform: screen = (W/2 + off.x, H/2 + off.y) + Rot(rot)·(zoom·wx, −zoom·wy).
// fdSnapTranslate returns the whole-lattice-vector translate that brings `anchor` to the copy nearest
// the world point currently under the SCREEN CENTRE, for that transform.

const view = (offset: { x: number; y: number }, zoom = 50, rotation = 0): OverlayView => ({
  zoom,
  rotation,
  offset,
  width: 800,
  height: 600,
});

const UNIT: [{ x: number; y: number }, { x: number; y: number }] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
];

describe("fdSnapTranslate", () => {
  it("identity view: pulls a far anchor back to within half a cell of the origin", () => {
    // Centre of an un-panned view is world (0,0); anchor at (3.2, 1.9) on the unit lattice.
    const t = fdSnapTranslate(view({ x: 0, y: 0 }), UNIT, { x: 3.2, y: 1.9 });
    expect(t).toEqual({ x: -3, y: -2 }); // anchor + t = (0.2, -0.1), the nearest copy
  });

  it("panned view: follows the world point under the centre", () => {
    // offset (-30, 0) at zoom 50 puts world (0.6, 0) under the centre; nearest copy of (0,0) is (1,0).
    const t = fdSnapTranslate(view({ x: -30, y: 0 }), UNIT, { x: 0, y: 0 });
    expect(t).toEqual({ x: 1, y: 0 });
  });

  it("rotated view: inverts the rotation when finding the centre point", () => {
    // rot 90°: world (1,0) maps to screen centre when offset = (0, -50) at zoom 50
    // (forward: (zoom·1, -zoom·0)=(50,0), Rot90→(0,50), +offset→(0,0)).
    const t = fdSnapTranslate(view({ x: 0, y: -50 }, 50, Math.PI / 2), UNIT, { x: 0, y: 0 });
    expect(t).toEqual({ x: 1, y: 0 });
  });

  it("oblique basis: reduces in lattice coordinates, not axis-aligned ones", () => {
    // offset (-100, 100) at zoom 50 puts world (2,2) under the centre. Basis {(1,0),(0.5,1)}:
    // (2,2) = 1·c1 + 2·c2 exactly, so the translate is a whole lattice vector landing ON the centre.
    const c1 = { x: 1, y: 0 };
    const c2 = { x: 0.5, y: 1 };
    const t = fdSnapTranslate(view({ x: -100, y: 100 }), [c1, c2], { x: 0, y: 0 });
    expect(t.x).toBeCloseTo(2, 12);
    expect(t.y).toBeCloseTo(2, 12);
  });

  it("degenerate basis: no translate", () => {
    const t = fdSnapTranslate(view({ x: -30, y: 0 }), [UNIT[0], UNIT[0]], { x: 0, y: 0 });
    expect(t).toEqual({ x: 0, y: 0 });
  });
});
