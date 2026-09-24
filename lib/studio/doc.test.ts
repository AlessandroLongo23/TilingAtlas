import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { canonicalEdge, halfEdgeKey, ringKey } from "@/lib/freedraw/topology";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import type { ExactCellSource } from "@/lib/services/cellCodecService";
import { renderCellFromExactSource } from "@/lib/services/renderCellDerive";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import { build, moveOnly, resolveRef } from "./doc";
import { tilingToPatch } from "./patch";
import { EMPTY_DOC, type PointRef, type StudioDoc, type StudioPatch } from "./types";

/**
 * The claim under test is that `build` re-cuts the faces out of the planar rotation system correctly.
 * It is the one piece of the editor with no easy sanity check by eye: a walk that takes the wrong dart
 * still produces rings, just the wrong ones, and the picture would look plausible.
 *
 * So the tests are the same two invariants `patch.test.ts` uses (every edge twinned, Euler on the
 * torus) plus the one that actually pins the walk: with an EMPTY doc the rebuild must reproduce the
 * base tiling exactly, face for face. The rebuild always re-cuts, so that assertion runs the walk over
 * every tiling in the sample, not only over edited ones.
 */

const fourSquares: TranslationalCellData = {
	p: [
		{ v: [[0, 0], [1, 0], [1, 1], [0, 1]], n: 4 },
		{ v: [[1, 0], [2, 0], [2, 1], [1, 1]], n: 4 },
		{ v: [[0, 1], [1, 1], [1, 2], [0, 2]], n: 4 },
		{ v: [[1, 1], [2, 1], [2, 2], [1, 2]], n: 4 },
	],
	b: [[2, 0], [0, 2]],
};

const H = Math.sqrt(3) / 2;
const hexCell: TranslationalCellData = {
	p: [{ v: [[1, 0], [0.5, H], [-0.5, H], [-1, 0], [-0.5, -H], [0.5, -H]], n: 6 }],
	b: [[1.5, H], [0, 2 * H]],
};

function patchOf(cell: TranslationalCellData): StudioPatch {
	const r = tilingToPatch(cell);
	if (!r.ok) throw new Error(r.reason);
	return r.patch;
}

const doc = (over: Partial<StudioDoc>): StudioDoc => ({ ...EMPTY_DOC, ...over });

/** A midpoint ref for face `f`'s edge `i`, derived the way a click derives it.
 *
 * The edge by its canonical KEY, and `off` measured from that CANONICAL frame. Both halves matter: an
 * index would name a different edge after a rebuild renumbered the faces, and an `off` measured from the
 * ring instead of from the canonical start would put the new vertex in the wrong lattice cell, so the
 * chord would join copies of two midpoints that are not the ones clicked. */
function midRef(patch: StudioPatch, f: number, i: number, off: [number, number]): PointRef {
	const ring = patch.rings[f];
	const [va, ax, ay] = ring[i];
	const [vb, bx, by] = ring[(i + 1) % ring.length];
	const c = canonicalEdge(va, vb, bx - ax, by - ay);
	// The canonical start's own offset within this ring: the cell the canonical frame sits in.
	const base: [number, number] = c.flipped ? [bx, by] : [ax, ay];
	return {
		kind: "midpoint",
		edge: c.key,
		off: [base[0] + off[0], base[1] + off[1]],
	};
}

/** A centroid ref for face `f`, by its canonical ring key. An out-of-range `f` yields a ref that names
 *  nothing, which is what the stale-ref tests want. */
function cenRef(patch: StudioPatch, f: number, off: [number, number]): PointRef {
	const ring = patch.rings[f];
	return { kind: "centroid", ring: ring ? ringKey(ring) : "no-such-ring", off };
}


/** Every directed half-edge answered by exactly one twin, and Euler on the torus. */
function checkClosed(patch: StudioPatch, label: string): void {
	for (const ring of patch.rings) {
		for (let i = 0; i < ring.length; i++) {
			const [va, ax, ay] = ring[i];
			const [vb, bx, by] = ring[(i + 1) % ring.length];
			const twin = patch.half.get(halfEdgeKey(vb, va, -(bx - ax), -(by - ay)));
			expect(twin, `${label}: ${va}->${vb} has no twin`).toBeDefined();
			expect(twin!.length, `${label}: ${va}->${vb} twin count`).toBe(1);
		}
	}
	expect(patch.verts.length - patch.edges.length + patch.rings.length, `${label}: Euler`).toBe(0);
}

/** The multiset of face keys, so "same faces" can be asserted without depending on face ORDER. */
const faceSet = (p: StudioPatch) => [...p.rings.map(ringKey)].sort();

describe("build with an empty doc", () => {
	it("re-cuts the 2x2 square cell back to the same four faces", () => {
		const base = patchOf(fourSquares);
		const r = build(base, EMPTY_DOC, "lattice");
		expect(r.patch.rings).toHaveLength(4);
		expect(faceSet(r.patch)).toEqual(faceSet(base));
		checkClosed(r.patch, "2x2 rebuild");
	});

	it("re-cuts the hexagonal cell back to its one face", () => {
		const base = patchOf(hexCell);
		const r = build(base, EMPTY_DOC, "lattice");
		expect(r.patch.rings).toHaveLength(1);
		expect(r.patch.rings[0]).toHaveLength(6);
		expect(faceSet(r.patch)).toEqual(faceSet(base));
		checkClosed(r.patch, "hex rebuild");
	});

	it("reports no failures and one tile per face", () => {
		const r = build(patchOf(fourSquares), EMPTY_DOC, "lattice");
		expect(r.dropped).toEqual([]);
		expect(new Set(r.patch.polyComp).size).toBe(4);
		expect(r.patch.compRank).toEqual([0, 0, 0, 0]);
	});
});

describe("merge", () => {
	it("dropping one interior edge makes two squares into one finite tile", () => {
		const base = patchOf(fourSquares);
		// An edge between two DISTINCT faces, so dropping it genuinely merges.
		const shared = base.edgeKeys.find((k) => {
			const [a, b, dx, dy] = k.split(",").map(Number);
			const l = base.half.get(halfEdgeKey(a, b, dx, dy));
			const r = base.half.get(halfEdgeKey(b, a, -dx, -dy));
			return l && r && base.polyComp[l[0].p] !== base.polyComp[r[0].p];
		});
		expect(shared).toBeDefined();
		const r = build(base, doc({ dropped: [shared!] }), "lattice");
		expect(new Set(r.patch.polyComp).size).toBe(3);
		expect(r.patch.stats.finite).toBe(3);
		expect(r.patch.stats.strips + r.patch.stats.unbounded).toBe(0);
		// The merged tile holds two faces; the other two hold one each.
		expect([...r.patch.compCells].sort()).toEqual([1, 1, 2]);
	});

	it("dropping a whole lattice direction makes an infinite strip, and says so", () => {
		const base = patchOf(fourSquares);
		const r = build(base, doc({ dropped: [...base.edgeKeys] }), "lattice");
		// Everything merged: one tile, unbounded in both directions.
		expect(new Set(r.patch.polyComp).size).toBe(1);
		expect(r.patch.compRank[0]).toBe(2);
		expect(r.patch.stats.unbounded).toBe(1);
	});

	it("leaves the drawn bit off exactly the dropped edges", () => {
		const base = patchOf(fourSquares);
		const k = base.edgeKeys[0];
		const r = build(base, doc({ dropped: [k] }), "lattice");
		const off = r.patch.edges.filter((e) => e[4] === 0);
		expect(off).toHaveLength(1);
		expect(r.patch.edgeKeys[r.patch.edges.indexOf(off[0])]).toBe(k);
	});
});

describe("cut", () => {
	it("a vertex-to-vertex diagonal splits one square into two triangles", () => {
		const base = patchOf(fourSquares);
		const ring = base.rings[0];
		const r = build(
			base,
			doc({
				cuts: [[
					{ kind: "vertex", vi: ring[0][0], off: [ring[0][1], ring[0][2]] },
					{ kind: "vertex", vi: ring[2][0], off: [ring[2][1], ring[2][2]] },
				]],
			}),
			"lattice",
		);
		expect(r.dropped).toEqual([]);
		// One face became two, and the new pair are triangles.
		expect(r.patch.rings).toHaveLength(5);
		expect(r.patch.rings.filter((x) => x.length === 3)).toHaveLength(2);
		checkClosed(r.patch, "diagonal cut");
	});

	it("a midpoint-to-midpoint cut splits the edges it lands on as well as the face", () => {
		const base = patchOf(fourSquares);
		const r = build(
			base,
			doc({ cuts: [[
				midRef(base, 0, 0, [0, 0]),
				midRef(base, 0, 2, [0, 0]),
			]] }),
			"lattice",
		);
		expect(r.dropped).toEqual([]);
		// Two edges split into two each (+2 edges) and one chord added (+1): E goes up by 3, V by 2,
		// F by 1, so Euler still holds. checkClosed asserts exactly that.
		expect(r.patch.verts.length).toBe(base.verts.length + 2);
		expect(r.patch.edges.length).toBe(base.edges.length + 3);
		expect(r.patch.rings.length).toBe(base.rings.length + 1);
		checkClosed(r.patch, "midpoint cut");
	});

	it("chains through a centroid to cut a hexagon in two", () => {
		const base = patchOf(hexCell);
		const ring = base.rings[0];
		const r = build(
			base,
			doc({ cuts: [[
				{ kind: "vertex", vi: ring[0][0], off: [ring[0][1], ring[0][2]] },
				cenRef(base, 0, [0, 0]),
				{ kind: "vertex", vi: ring[3][0], off: [ring[3][1], ring[3][2]] },
			]] }),
			"lattice",
		);
		expect(r.dropped).toEqual([]);
		expect(r.patch.rings).toHaveLength(2);
		checkClosed(r.patch, "hexagon through centroid");
	});

	it("keeps a cut attached after the vertices move", () => {
		const base = patchOf(fourSquares);
		const ring = base.rings[0];
		const cuts: StudioDoc["cuts"] = [[
			midRef(base, 0, 0, [0, 0]),
			midRef(base, 0, 2, [0, 0]),
		]];
		const before = build(base, doc({ cuts }), "lattice");
		const after = build(base, doc({ cuts, moved: { "0": [0.11, -0.07] } }), "lattice");
		// Same topology either way: a ref names what it comes from, so the cut follows the geometry.
		expect(after.patch.rings.length).toBe(before.patch.rings.length);
		expect(after.patch.edges.length).toBe(before.patch.edges.length);
		checkClosed(after.patch, "cut after a move");
	});
});

describe("move", () => {
	it("moveOnly displaces one quotient vertex and leaves topology alone", () => {
		const base = patchOf(fourSquares);
		const m = moveOnly(base, { "0": [0.25, -0.5] });
		expect(m.verts[0]).toEqual([base.verts[0][0] + 0.25, base.verts[0][1] - 0.5]);
		expect(m.rings).toBe(base.rings);
		expect(m.half).toBe(base.half);
	});

	it("build moves the vertex in every lattice copy, so the tiling stays closed", () => {
		const base = patchOf(fourSquares);
		const r = build(base, doc({ moved: { "0": [0.3, 0.2] } }), "lattice");
		expect(faceSet(r.patch)).toEqual(faceSet(base));
		checkClosed(r.patch, "after a move");
	});

	it("names a cut vertex by its ref, so a drag on it writes a key the rebuild reads", () => {
		const base = patchOf(hexCell);
		const ring = base.rings[0];
		const cen = cenRef(base, 0, [0, 0]);
		const cuts: StudioDoc["cuts"] = [[
			{ kind: "vertex", vi: ring[0][0], off: [ring[0][1], ring[0][2]] },
			cen,
			{ kind: "vertex", vi: ring[3][0], off: [ring[3][1], ring[3][2]] },
		]];
		const r = build(base, doc({ cuts }), "lattice");
		const vi = r.moveKeys.indexOf(JSON.stringify(cen));
		expect(vi).toBe(base.verts.length);
		expect(r.moveKeys.slice(0, base.verts.length)).toEqual(base.verts.map((_, i) => String(i)));
		const moved = build(base, doc({ cuts, moved: { [r.moveKeys[vi]]: [0.1, 0] } }), "lattice");
		expect(moved.patch.verts[vi][0]).toBeCloseTo(r.patch.verts[vi][0] + 0.1);
	});
});

describe("resolveRef", () => {
	it("puts a midpoint halfway along its edge and a centroid at the vertex mean", () => {
		const base = patchOf(fourSquares);
		const mid = resolveRef(base, midRef(base, 0, 0, [0, 0]))!;
		const ring = base.rings[0];
		const a = base.verts[ring[0][0]];
		expect(mid).toBeDefined();
		// The midpoint sits half an edge from the first corner, in some direction.
		expect(Math.hypot(mid[0] - a[0], mid[1] - a[1])).toBeCloseTo(0.5, 9);
		const c = resolveRef(base, cenRef(base, 0, [0, 0]))!;
		expect(Math.hypot(c[0] - a[0], c[1] - a[1])).toBeCloseTo(Math.SQRT2 / 2, 9);
	});

	it("returns null for a reference past the end of the geometry", () => {
		const base = patchOf(fourSquares);
		expect(resolveRef(base, { kind: "vertex", vi: 999, off: [0, 0] })).toBeNull();
		expect(resolveRef(base, cenRef(base, 999, [0, 0]))).toBeNull();
	});
});

// --- the shipped catalogue -------------------------------------------------------------------------

const atlasPath = path.join(process.cwd(), "public", "reference-atlas.json");
type Rec = { id: string; exactSource?: ExactCellSource };
const atlas: Rec[] = fs.existsSync(atlasPath)
	? decodeAtlas<Rec>(JSON.parse(fs.readFileSync(atlasPath, "utf8")))
	: [];

describe.skipIf(atlas.length === 0)("build on the shipped catalogue", () => {
	const ring = CyclotomicRing.create(24);
	setActiveRing(ring);
	const sample = atlas.filter((r) => r.exactSource).filter((_, i) => i % 97 === 0);

	it("an empty doc reproduces every sampled tiling face for face", () => {
		let checked = 0;
		for (const rec of sample) {
			const cell = renderCellFromExactSource(ring, rec.id, rec.exactSource!);
			if (!cell) continue;
			const p = tilingToPatch(cell as TranslationalCellData);
			if (!p.ok) continue;
			const r = build(p.patch, EMPTY_DOC, "lattice");
			expect(faceSet(r.patch), rec.id).toEqual(faceSet(p.patch));
			checkClosed(r.patch, rec.id);
			checked++;
		}
		expect(checked).toBeGreaterThan(20);
	});
});
