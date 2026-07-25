import { describe, it, expect } from "vitest";
import {
	directions,
	canonicalOffsets,
	symmetricOffsets,
	randomOffsets,
	buildMultigrid,
	multigridEdgeCheck,
	MULTIGRID_SYMMETRIES,
	type MgTile,
} from "./engine";

const rhArea = (c: { x: number; y: number }[]) =>
	0.5 * Math.abs((c[2].x - c[0].x) * (c[3].y - c[1].y) - (c[3].x - c[1].x) * (c[2].y - c[0].y));

describe("multigrid directions & offsets", () => {
	it("directions are unit vectors at πj/n", () => {
		const e = directions(5);
		expect(e).toHaveLength(5);
		for (const v of e) expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 12);
		expect(Math.atan2(e[1].y, e[1].x)).toBeCloseTo(Math.PI / 5, 12);
	});
	it("canonical offsets are generic and lie in [0, 1)", () => {
		for (const n of [4, 5, 6, 7]) {
			const g = canonicalOffsets(n);
			expect(g).toHaveLength(n);
			for (const x of g) {
				expect(x).toBeGreaterThanOrEqual(0);
				expect(x).toBeLessThan(1);
			}
		}
	});
	it("randomOffsets is deterministic for a seed", () => {
		expect(randomOffsets(5, 42)).toEqual(randomOffsets(5, 42));
	});
});

describe("multigrid builds valid edge-to-edge rhombic tilings (canonical offsets)", () => {
	for (const n of [4, 5, 6, 7]) {
		it(`n=${n} (${2 * n}-fold): edge-to-edge, one boundary loop, prototiles in range`, () => {
			const { tiles, capped } = buildMultigrid({ n, offsets: canonicalOffsets(n), radius: 8 });
			expect(capped).toBe(false);
			expect(tiles.length).toBeGreaterThan(100);
			const rep = multigridEdgeCheck(tiles);
			expect(rep.edgesOverused).toBe(0); // every interior edge used exactly twice
			expect(rep.boundaryLoops).toBe(1); // gap-free, simply connected
			for (const t of tiles) {
				expect(t.protoId).toBeGreaterThanOrEqual(1);
				expect(t.protoId).toBeLessThanOrEqual(Math.floor(n / 2));
			}
		});
	}

	it("n=5 yields exactly the two Penrose rhombs, with correct areas", () => {
		const { tiles } = buildMultigrid({ n: 5, offsets: canonicalOffsets(5), radius: 8 });
		const protos = new Set(tiles.map((t) => t.protoId));
		expect([...protos].sort()).toEqual([1, 2]);
		for (const t of tiles) {
			// rhomb area with unit edges and interior angle π·protoId/n is sin(π·protoId/n)
			expect(rhArea(t.corners)).toBeCloseTo(Math.sin((Math.PI * t.protoId) / 5), 9);
		}
	});

	it("n=4 yields the 45° rhomb (protoId 1) and the square (protoId 2, area 1)", () => {
		const { tiles } = buildMultigrid({ n: 4, offsets: canonicalOffsets(4), radius: 8 });
		const protos = new Set(tiles.map((t) => t.protoId));
		expect([...protos].sort()).toEqual([1, 2]);
		const square = tiles.find((t) => t.protoId === 2)!;
		expect(rhArea(square.corners)).toBeCloseTo(1, 9); // sin(π/2) = 1
	});
});

describe("duality link fields (site + fams) for the split-view", () => {
	it("every tile carries its crossing point and family pair, consistent with protoId and the window", () => {
		const R = 8;
		const { tiles } = buildMultigrid({ n: 6, offsets: canonicalOffsets(6), radius: R });
		for (const t of tiles) {
			const [i, j] = t.fams;
			expect(i).toBeGreaterThanOrEqual(0);
			expect(i).toBeLessThan(j);
			expect(j).toBeLessThan(6);
			expect(t.protoId).toBe(Math.min(j - i, 6 - (j - i)));
			expect(Number.isFinite(t.site.x) && Number.isFinite(t.site.y)).toBe(true);
			expect(Math.hypot(t.site.x, t.site.y)).toBeLessThanOrEqual(R + 1e-9); // crossing was in-window
		}
	});
});

describe("shared corners are exact (no float cracks)", () => {
	it("every interior edge is shared by exactly two tiles keyed on integer vertex ids", () => {
		const { tiles } = buildMultigrid({ n: 7, offsets: canonicalOffsets(7), radius: 7 });
		const rep = multigridEdgeCheck(tiles);
		// interior edges used twice + boundary edges used once = all edges; overuse must be zero.
		expect(rep.edgesOverused).toBe(0);
		expect(rep.boundaryEdges).toBeGreaterThan(0);
	});
});

describe("the symmetric preset is 2n-fold symmetric about the origin", () => {
	it("n=5: the interior vertex set is invariant under a π/5 rotation about the origin", () => {
		const { tiles } = buildMultigrid({ n: 5, offsets: symmetricOffsets(5), radius: 12 });
		// Iterate vertices at r < 5; test membership against the SUPERSET at r < 8, so a rotation (which
		// preserves radius) always has room to land in-set. Distance search, not a rounded grid, so
		// float rotation error can't straddle a cell boundary.
		const member = new Map<string, { x: number; y: number }>();
		const inner: { x: number; y: number }[] = [];
		for (const t of tiles)
			t.corners.forEach((v, k) => {
				const r = Math.hypot(v.x, v.y);
				if (r < 8) member.set(t.vkeys[k], v);
				if (r < 5) inner.push(v);
			});
		expect(inner.length).toBeGreaterThan(50);
		const members = [...member.values()];
		const near = (x: number, y: number) => members.some((p) => Math.hypot(p.x - x, p.y - y) < 1e-6);
		const c = Math.cos(Math.PI / 5), s = Math.sin(Math.PI / 5);
		let matched = 0;
		for (const v of inner) {
			if (near(c * v.x - s * v.y, s * v.x + c * v.y)) matched++;
		}
		expect(matched / inner.length).toBeGreaterThan(0.98);
	});
});

describe("MULTIGRID_SYMMETRIES", () => {
	it("offers n = 4..10", () => {
		expect([...MULTIGRID_SYMMETRIES]).toEqual([4, 5, 6, 7, 8, 9, 10]);
	});
});
