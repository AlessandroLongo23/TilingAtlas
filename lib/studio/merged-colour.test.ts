import { describe, expect, it } from "vitest";
import { halfEdgeKey } from "@/lib/freedraw/topology";
import { polygonFillHue, type TranslationalCellData } from "@/lib/utils/renderTiling";
import { componentOutline } from "./classify";
import { constructionPoints, pointFaces } from "./snap";
import { canCommitCut, canExtendCut } from "./validate";
import { build } from "./doc";
import { tilingToPatch } from "./patch";
import { EMPTY_DOC, type StudioDoc, type StudioPatch } from "./types";

/**
 * AL's requirement, as assertions: a merged tile takes ONE colour, and that colour is the one the atlas
 * gives its shape anywhere else. "4 + 3 = house pentagon is already a shape we used, so removing the
 * edge between a square and a triangle anywhere should match that colour."
 *
 * The mechanism is `componentOutline` plus `polygonFillHue`, the same ramp every unmerged tile goes
 * through, so the test is: the outline has the corner count of the SHAPE (not of its parts, and not
 * counting the collinear points the removed edge leaves behind), and two merges producing congruent
 * shapes produce one hue.
 */

/** Four unit squares in a 2x2 cell. */
const fourSquares: TranslationalCellData = {
	p: [
		{ v: [[0, 0], [1, 0], [1, 1], [0, 1]], n: 4 },
		{ v: [[1, 0], [2, 0], [2, 1], [1, 1]], n: 4 },
		{ v: [[0, 1], [1, 1], [1, 2], [0, 2]], n: 4 },
		{ v: [[1, 1], [2, 1], [2, 2], [1, 2]], n: 4 },
	],
	b: [[2, 0], [0, 2]],
};

function patchOf(cell: TranslationalCellData): StudioPatch {
	const r = tilingToPatch(cell);
	if (!r.ok) throw new Error(r.reason);
	return r.patch;
}

const doc = (over: Partial<StudioDoc>): StudioDoc => ({ ...EMPTY_DOC, ...over });

/** The key of an edge separating two distinct components, i.e. one a merge drag could drop. */
function edgeBetweenComponents(patch: StudioPatch): string {
	for (let i = 0; i < patch.edges.length; i++) {
		const [vi, vj, dx, dy] = patch.edges[i];
		const a = patch.half.get(halfEdgeKey(vi, vj, dx, dy));
		const b = patch.half.get(halfEdgeKey(vj, vi, -dx, -dy));
		if (!a || !b) continue;
		if (patch.polyComp[a[0].p] !== patch.polyComp[b[0].p]) return patch.edgeKeys[i];
	}
	throw new Error("no inter-component edge");
}

describe("a merged tile's outline", () => {
	it("drops the collinear points the removed edge leaves, so two squares read as a 4-corner tile", () => {
		const base = patchOf(fourSquares);
		const k = edgeBetweenComponents(base);
		const r = build(base, doc({ dropped: [k] }), "lattice");
		const merged = r.patch.compCells.findIndex((n) => n === 2);
		expect(merged).toBeGreaterThanOrEqual(0);
		const outline = componentOutline(r.patch, merged);
		expect(outline).not.toBeNull();
		// The raw boundary of two glued squares has six points; the SHAPE has four corners, and the ramp
		// is a function of the corner count.
		expect(outline!.length).toBe(4);
	});

	it("gives the merged tile the hue the atlas gives that shape on its own", () => {
		const base = patchOf(fourSquares);
		const k = edgeBetweenComponents(base);
		const r = build(base, doc({ dropped: [k] }), "lattice");
		const merged = r.patch.compCells.findIndex((n) => n === 2);
		const outline = componentOutline(r.patch, merged)!;
		const got = polygonFillHue(outline.map((p) => ({ x: p[0], y: p[1] })));
		// A 1x2 rectangle drawn as an ordinary polygon, which is what the merged pair IS.
		const want = polygonFillHue([
			{ x: 0, y: 0 },
			{ x: 2, y: 0 },
			{ x: 2, y: 1 },
			{ x: 0, y: 1 },
		]);
		expect(got).toBeCloseTo(want, 6);
	});

	it("gives congruent merges one hue wherever they happen", () => {
		const base = patchOf(fourSquares);
		// Two DIFFERENT inter-component edges, each merging a different pair into the same shape.
		const keys: string[] = [];
		for (let i = 0; i < base.edges.length && keys.length < 2; i++) {
			const [vi, vj, dx, dy] = base.edges[i];
			const a = base.half.get(halfEdgeKey(vi, vj, dx, dy));
			const b = base.half.get(halfEdgeKey(vj, vi, -dx, -dy));
			if (!a || !b) continue;
			if (base.polyComp[a[0].p] !== base.polyComp[b[0].p]) keys.push(base.edgeKeys[i]);
		}
		expect(keys.length).toBe(2);
		const hues = keys.map((key) => {
			const r = build(base, doc({ dropped: [key] }), "lattice");
			const c = r.patch.compCells.findIndex((n) => n === 2);
			const o = componentOutline(r.patch, c)!;
			return polygonFillHue(o.map((p) => ({ x: p[0], y: p[1] })));
		});
		expect(hues[0]).toBeCloseTo(hues[1], 6);
	});

	it("declines an outline for a tile that is not finite", () => {
		const base = patchOf(fourSquares);
		const r = build(base, doc({ dropped: [...base.edgeKeys] }), "lattice");
		expect(r.patch.compRank[0]).toBe(2);
		expect(componentOutline(r.patch, 0)).toBeNull();
	});
});

describe("edges interior to a tile", () => {
	it("exist: a merge that closes a loop leaves a drawn edge with one component on both sides", () => {
		const base = patchOf(fourSquares);
		// Drop three of the four inter-cell edges of one vertex's star, so the four faces become one
		// component while a fourth edge between two of them stays drawn.
		const inter: string[] = [];
		for (let i = 0; i < base.edges.length; i++) {
			const [vi, vj, dx, dy] = base.edges[i];
			const a = base.half.get(halfEdgeKey(vi, vj, dx, dy));
			const b = base.half.get(halfEdgeKey(vj, vi, -dx, -dy));
			if (a && b && base.polyComp[a[0].p] !== base.polyComp[b[0].p]) inter.push(base.edgeKeys[i]);
		}
		const r = build(base, doc({ dropped: inter.slice(0, 3) }), "lattice");
		// Some edge is still drawn with the same component on both sides. That is the edge AL could not
		// remove, and the renderer now declines to stroke it.
		let found = 0;
		for (let i = 0; i < r.patch.edges.length; i++) {
			const [vi, vj, dx, dy, drawn] = r.patch.edges[i];
			if (drawn === 0) continue;
			const a = r.patch.half.get(halfEdgeKey(vi, vj, dx, dy));
			const b = r.patch.half.get(halfEdgeKey(vj, vi, -dx, -dy));
			if (a && b && r.patch.polyComp[a[0].p] === r.patch.polyComp[b[0].p]) found++;
		}
		expect(found).toBeGreaterThan(0);
	});
});

describe("a cut built the way the tool builds it", () => {
	/**
	 * The cut tool's pipeline, end to end: take the construction points of the CURRENT patch, pick two
	 * that share a face (which is what `pointFaces` now restricts the second click to), and build.
	 *
	 * This is the test that would have caught the ref bug. The refs come off the rebuilt patch and are
	 * resolved inside `build` against the base, and those two frames number faces differently, so an
	 * index-named ref pointed at a different edge and the chord attached somewhere unrelated. Content
	 * keys make the two frames agree.
	 */
	it("splits exactly one face for every pair the tool accepts", () => {
		const base = patchOf(fourSquares);
		const built = build(base, EMPTY_DOC, "lattice");
		const pts = constructionPoints(built.patch);
		let found = 0;
		for (let i = 0; i < pts.length; i++) {
			for (let j = 0; j < pts.length; j++) {
				if (i === j) continue;
				const a = pts[i];
				const c = pts[j];
				if (a.kind === "centroid" || c.kind === "centroid") continue;
				// THE TOOL'S OWN GATE. Without it this test feeds in pairs the tool refuses, notably a
				// chord along an existing edge, which splits nothing. Gating here is what makes the
				// assertion below an invariant of the editor and not of `build` in isolation.
				const fa = new Set(pointFaces(built.patch, a.ref));
				if (!pointFaces(built.patch, c.ref).some((f) => fa.has(f))) continue;
				if (!canExtendCut(built.patch, EMPTY_DOC, [a.ref], c.ref).ok) continue;
				if (!canCommitCut(built.patch, EMPTY_DOC, [a.ref, c.ref]).ok) continue;
				const r = build(base, doc({ cuts: [[a.ref, c.ref]] }), "lattice");
				expect(r.dropped, `${a.label}->${c.label} placed`).toEqual([]);
				const ends = [a.kind, c.kind].filter((k) => k === "midpoint").length;
				expect(r.patch.rings.length, `${a.label}->${c.label} faces`).toBe(
					built.patch.rings.length + 1,
				);
				expect(r.patch.verts.length, `${a.label}->${c.label} verts`).toBe(
					built.patch.verts.length + ends,
				);
				expect(r.patch.edges.length, `${a.label}->${c.label} edges`).toBe(
					built.patch.edges.length + 1 + ends,
				);
				// Euler on the torus is the assertion that the chord landed where it was meant to: one
				// attached to the wrong vertices breaks it, which is exactly what the index-named refs did.
				expect(
					r.patch.verts.length - r.patch.edges.length + r.patch.rings.length,
					`${a.label}->${c.label} euler`,
				).toBe(0);
				found++;
			}
		}
		// The 2x2 square cell has plenty of legal cuts; a zero here would mean the gate refuses everything.
		expect(found).toBeGreaterThan(3);
	});

	it("refuses a chord that lies along an edge, which would split nothing", () => {
		const base = patchOf(fourSquares);
		const built = build(base, EMPTY_DOC, "lattice");
		const pts = constructionPoints(built.patch);
		// A vertex and the midpoint of an edge at it: the chord runs along half that edge.
		let checked = 0;
		for (const m of pts) {
			if (m.kind !== "midpoint" || m.ref.kind !== "midpoint") continue;
			const i = built.patch.edgeKeys.indexOf(m.ref.edge);
			const [vi] = built.patch.edges[i];
			const v = pts.find((q) => q.ref.kind === "vertex" && q.ref.vi === vi);
			if (!v) continue;
			const got = canExtendCut(built.patch, EMPTY_DOC, [v.ref], m.ref);
			expect(got.ok, `${v.label}->${m.label} should be refused`).toBe(false);
			checked++;
			break;
		}
		expect(checked).toBe(1);
	});

	it("refuses a pair that does not share a face, instead of attaching a chord across tiles", () => {
		const base = patchOf(fourSquares);
		const built = build(base, EMPTY_DOC, "lattice");
		const pts = constructionPoints(built.patch).filter((p) => p.kind !== "centroid");
		let refused = 0;
		for (let i = 0; i < pts.length && refused < 1; i++) {
			for (let j = i + 1; j < pts.length && refused < 1; j++) {
				const fa = new Set(pointFaces(built.patch, pts[i].ref));
				if (pointFaces(built.patch, pts[j].ref).some((f) => fa.has(f))) continue;
				const v = canExtendCut(built.patch, EMPTY_DOC, [pts[i].ref], pts[j].ref);
				expect(v.ok, `${pts[i].label}->${pts[j].label} should be refused`).toBe(false);
				refused++;
			}
		}
		expect(refused).toBe(1);
	});
});
