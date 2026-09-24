import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { halfEdgeKey } from "@/lib/freedraw/topology";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import type { ExactCellSource } from "@/lib/services/cellCodecService";
import { renderCellFromExactSource } from "@/lib/services/renderCellDerive";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import { gaussReduce, tilingToPatch } from "./patch";
import type { StudioPatch } from "./types";

/**
 * The fold is the part of the editor that can be quietly wrong: a missed weld does not throw, it just
 * leaves two tiles that should share an edge sharing nothing, and every tool downstream then refuses to
 * see them as neighbours. So the tests here are the two invariants that catch exactly that, and they are
 * run over the SHIPPED catalogue, not only over hand-built cells.
 *
 *   every edge has exactly one twin — a tiling on the torus has no boundary, so each directed
 *                                     half-edge must be answered by precisely one reversed copy. This
 *                                     is the definitive fold test: an unwelded boundary edge has none.
 *   V - E + F = 0                    — Euler on the torus. An over-counted vertex or edge breaks it,
 *                                     which is the same cross-check edgePatchCore.ts runs on a develop.
 */

/** Both invariants, as one assertion a caller can point at a record with. */
function checkClosed(patch: StudioPatch, label: string): void {
	let darts = 0;
	for (const ring of patch.rings) {
		darts += ring.length;
		for (let i = 0; i < ring.length; i++) {
			const [va, ax, ay] = ring[i];
			const [vb, bx, by] = ring[(i + 1) % ring.length];
			const twin = patch.half.get(halfEdgeKey(vb, va, -(bx - ax), -(by - ay)));
			expect(twin, `${label}: edge ${va}->${vb} has no twin`).toBeDefined();
			expect(twin!.length, `${label}: edge ${va}->${vb} has ${twin!.length} twins`).toBe(1);
		}
	}
	const V = patch.verts.length;
	const E = patch.edges.length;
	const F = patch.rings.length;
	expect(darts, `${label}: 2E should equal the dart count`).toBe(2 * E);
	expect(V - E + F, `${label}: Euler on the torus`).toBe(0);
}

/** A unit square cell whose two periods are the axes: one face, two edges, one vertex. */
const unitSquare: TranslationalCellData = {
	p: [{ v: [[0, 0], [1, 0], [1, 1], [0, 1]], n: 4 }],
	b: [[1, 0], [0, 1]],
};

/** Four unit squares in a 2x2 cell. Four faces, eight edges, four vertices. */
const fourSquares: TranslationalCellData = {
	p: [
		{ v: [[0, 0], [1, 0], [1, 1], [0, 1]], n: 4 },
		{ v: [[1, 0], [2, 0], [2, 1], [1, 1]], n: 4 },
		{ v: [[0, 1], [1, 1], [1, 2], [0, 2]], n: 4 },
		{ v: [[1, 1], [2, 1], [2, 2], [1, 2]], n: 4 },
	],
	b: [[2, 0], [0, 2]],
};

/** The regular hexagonal tiling: one hexagon, periods at 60 degrees. */
const H = Math.sqrt(3) / 2;
const hexCell: TranslationalCellData = {
	p: [{ v: [[1, 0], [0.5, H], [-0.5, H], [-1, 0], [-0.5, -H], [0.5, -H]], n: 6 }],
	b: [[1.5, H], [0, 2 * H]],
};

describe("gaussReduce", () => {
	it("shortens a skewed basis without changing the lattice covolume", () => {
		const [a, b] = gaussReduce([1, 0], [37, 1]);
		expect(Math.hypot(a[0], a[1])).toBeLessThanOrEqual(1 + 1e-12);
		expect(Math.hypot(b[0], b[1])).toBeLessThanOrEqual(2);
		expect(Math.abs(a[0] * b[1] - a[1] * b[0])).toBeCloseTo(1, 12);
	});

	it("returns a positively oriented basis", () => {
		const [a, b] = gaussReduce([0, 1], [1, 0]);
		expect(a[0] * b[1] - a[1] * b[0]).toBeGreaterThan(0);
	});
});

describe("tilingToPatch on hand-built cells", () => {
	it("folds one square onto one vertex and two edges", () => {
		const r = tilingToPatch(unitSquare);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.patch.rings).toHaveLength(1);
		expect(r.patch.verts).toHaveLength(1);
		expect(r.patch.edges).toHaveLength(2);
		checkClosed(r.patch, "unit square");
	});

	it("folds a 2x2 square cell to 4 faces, 8 edges, 4 vertices", () => {
		const r = tilingToPatch(fourSquares);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.patch.rings).toHaveLength(4);
		expect(r.patch.verts).toHaveLength(4);
		expect(r.patch.edges).toHaveLength(8);
		checkClosed(r.patch, "2x2 squares");
	});

	it("folds the hexagonal tiling to 1 face, 3 edges, 2 vertices", () => {
		const r = tilingToPatch(hexCell);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.patch.rings).toHaveLength(1);
		expect(r.patch.edges).toHaveLength(3);
		expect(r.patch.verts).toHaveLength(2);
		checkClosed(r.patch, "hexagons");
	});

	it("starts with every face its own tile, none of them infinite", () => {
		const r = tilingToPatch(fourSquares);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(new Set(r.patch.polyComp).size).toBe(4);
		expect(r.patch.compRank).toEqual([0, 0, 0, 0]);
		expect(r.patch.stats.finite).toBe(4);
		expect(r.patch.stats.strips + r.patch.stats.unbounded).toBe(0);
	});

	it("indexes every corner against its vertex", () => {
		const r = tilingToPatch(fourSquares);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const total = r.patch.incident.reduce((n, l) => n + l.length, 0);
		expect(total).toBe(r.patch.rings.reduce((n, ring) => n + ring.length, 0));
		// Four squares meet at each vertex of the square grid.
		for (const l of r.patch.incident) expect(l).toHaveLength(4);
	});

	it("drops an open polyline, which is a mark and not a tile", () => {
		const withMark: TranslationalCellData = {
			p: [
				{ v: [[0, 0], [1, 0], [1, 1], [0, 1]], n: 4 },
				{ v: [[0.2, 0.5], [0.8, 0.5]], n: 2, open: true },
			],
			b: [[1, 0], [0, 1]],
		};
		const r = tilingToPatch(withMark);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.patch.rings).toHaveLength(1);
	});

	it("gives a reason instead of throwing on a degenerate basis", () => {
		const r = tilingToPatch({ p: [{ v: [[0, 0], [1, 0], [1, 1]], n: 3 }], b: [[1, 0], [2, 0]] });
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.reason).toMatch(/parallel/);
	});

	it("gives a reason instead of throwing on a null cell", () => {
		const r = tilingToPatch(null);
		expect(r.ok).toBe(false);
	});
});

// --- the shipped catalogue -------------------------------------------------------------------------
// Hand-built cells are all axis-aligned and all fold trivially. The records that actually exercise the
// fold are the developed ones, where a cell can sit whole periods from the origin on a skewed basis.

const atlasPath = path.join(process.cwd(), "public", "reference-atlas.json");
type Rec = { id: string; exactSource?: ExactCellSource };
const atlas: Rec[] = fs.existsSync(atlasPath)
	? decodeAtlas<Rec>(JSON.parse(fs.readFileSync(atlasPath, "utf8")))
	: [];

describe.skipIf(atlas.length === 0)("tilingToPatch on the shipped catalogue", () => {
	// N = 24, and not 12: `reconstructOracleCell` goes through `detSurd`, which only exists in the
	// ring where Q(sqrt2, sqrt3) sits. `hydrateRenderCells` makes the same choice for the same reason.
	const ring = CyclotomicRing.create(24);
	setActiveRing(ring);
	const withSource = atlas.filter((r) => r.exactSource);
	// Every 40th record, so the suite stays quick while still crossing every k and every family.
	const sample = withSource.filter((_, i) => i % 40 === 0);

	it("has a sample to check", () => {
		expect(sample.length).toBeGreaterThan(50);
	});

	it("closes every edge and satisfies Euler on the torus", () => {
		let built = 0;
		const failures: string[] = [];
		for (const rec of sample) {
			const cell = renderCellFromExactSource(ring, rec.id, rec.exactSource!);
			if (!cell) continue;
			const r = tilingToPatch(cell as TranslationalCellData);
			if (!r.ok) {
				failures.push(`${rec.id}: ${r.reason}`);
				continue;
			}
			built++;
			checkClosed(r.patch, rec.id);
		}
		expect(built).toBeGreaterThan(50);
		expect(failures).toEqual([]);
	});

	it("never opens with an infinite tile", () => {
		for (const rec of sample) {
			const cell = renderCellFromExactSource(ring, rec.id, rec.exactSource!);
			if (!cell) continue;
			const r = tilingToPatch(cell as TranslationalCellData);
			if (!r.ok) continue;
			expect(r.patch.compRank.every((k) => k === 0), rec.id).toBe(true);
		}
	});
});
