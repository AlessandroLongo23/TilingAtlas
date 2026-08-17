import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ISOHEDRAL_TYPES } from "./catalogue";
import { curvesOf, defaultEdgeStates, makeTiling, prototileEdges } from "./build";
import {
	checkBoardAgreesWithTactile,
	IH_EDGE_BOARDS,
	ihLetterAngle,
	ihLetterLength,
	reverseChordCurve,
	solveIhBoard,
	solveIhBoardFor,
} from "./edge-board";
import { IH_EDGE_BOARDS as IH_EDGE_BOARDS_SHELF } from "./edge-shelf";
import { walkIhEdges, type IhEdgeRecord } from "./edgeDevelop";
import { buildIhEdgePatch, certCellFaces, checkSlotsAreOpposite } from "./edgePatch";
import { decodeAtlas } from "@/lib/services/atlasCodec";

const shardIh = (ih: number, k: number) =>
	`public/isohedral-edges/ie${String(ih).padStart(2, "0")}-k${k}.json`;
const anyShard = existsSync(shardIh(1, 2));
const readIh = (ih: number, k: number): IhEdgeRecord[] =>
	decodeAtlas(JSON.parse(readFileSync(shardIh(ih, k), "utf8")));
const read = (k: number): IhEdgeRecord[] => readIh(1, k);
/** A board's own shipped k slices, ascending. ⚑ Never hard-code 2, 4, 6 across boards: IH07 starts at
 *  k=4 (its bare tiling has four vertex orbits) and IH08 at k=1 (it has one, and odd k throughout). */
const shelfKs = (ih: number): number[] =>
	Object.keys(IH_EDGE_BOARDS_SHELF.find((b) => b.ih === ih)!.counts)
		.map(Number)
		.sort((a, b) => a - b);

const solved = (params?: number[]) => {
	const r = solveIhBoard(1, params);
	if (!r.ok) throw new Error(`solve failed: ${r.error}`);
	return r.board;
};

describe("the IH01 edge board", () => {
	it("agrees with Tactile about the tile it is decorating", () => {
		// Tactile says IH01 is 6 vertices, 3 edge shapes, edgeWord "abcABC". Marek's corpus says the
		// boundary is A-a-B-b-C-c-D-a-E-b-F-c-A. Those are the same statement, and `solveIhBoard` refuses
		// to build if they ever stop being — which is what protects the shelf from a Tactile bump.
		const info = ISOHEDRAL_TYPES.find((t) => t.ih === 1)!;
		const spec = IH_EDGE_BOARDS[0];
		expect(info.numVertices).toBe(spec.sides.length);
		expect(info.numEdgeShapes).toBe(spec.classes.length);
		expect(info.edgeWord).toBe("abcABC");
		expect(checkBoardAgreesWithTactile(spec, [0, 1, 2, 0, 1, 2])).toBe(true);
		expect(checkBoardAgreesWithTactile(spec, [0, 1, 2, 0, 2, 1])).toBe(false);
	});

	it("closes both vertex triples to 360 degrees, which is the corpus's own claim", () => {
		// Marek's certificates only ever put {A,C,E} or {B,D,F} at a vertex, so each triple must be a
		// full turn. Checked across the parameter family, not just at the defaults.
		const info = ISOHEDRAL_TYPES.find((t) => t.ih === 1)!;
		const points = [info.defaultParams, [0.1, 0.45, 0.2, 0.7], [0.2, 0.55, 0.1, 0.55]];
		for (const p of points) {
			const b = solveIhBoard(1, p);
			if (!b.ok) continue; // a point outside the type's valid region is refused, not fudged
			const deg = b.board.cornerAngles.map((a) => (a * 180) / Math.PI);
			expect(deg[0] + deg[2] + deg[4]).toBeCloseTo(360, 6);
			expect(deg[1] + deg[3] + deg[5]).toBeCloseTo(360, 6);
			expect(deg.reduce((s, d) => s + d, 0)).toBeCloseTo(720, 6);
		}
	});

	it("reads the certificate alphabet", () => {
		const b = solved();
		expect(ihLetterAngle("A6", b)).toBeCloseTo(b.cornerAngles[0], 12);
		expect(ihLetterAngle("F6", b)).toBeCloseTo(b.cornerAngles[5], 12);
		expect(ihLetterAngle("A12", b)).toBe(0); // a digon is a marker, never a corner
		expect(ihLetterLength("A10", b)).toBeCloseTo(b.classLengths[0], 12);
		expect(ihLetterLength("C13", b)).toBeCloseTo(b.classLengths[2], 12);
	});

	it("refuses an unknown type instead of inventing a board", () => {
		// IH20: a real Tactile type with no corpus and so no row here. This was IH07 until IH07 got one.
		expect(IH_EDGE_BOARDS.some((b) => b.ih === 20)).toBe(false);
		expect(solveIhBoard(20).ok).toBe(false);
		expect(solveIhBoard(20).error).toBe("unknown-type");
	});
});

describe.skipIf(!anyShard)("developing a shipped IH01 record", () => {
	it("recovers a period of k/2 tiles, at index k/2 over the base tiling", () => {
		// Tactile's cell holds exactly one tile here, so index over the base and tiles per period are the
		// same number — and it is k/2, NOT the k the certificate's dart count suggests. Every IH01 cell
		// spans two periods (2k board vertices, k orbit labels). That ratio is a property of the RECORD,
		// not of the board: IH02's cell is one period for most of its records. So the builder only asks
		// that the period divide the certificate's count, and the uniform 2 here is asserted, not assumed.
		const b = solved();
		const baseArea = Math.abs(b.t1.x * b.t2.y - b.t1.y * b.t2.x);
		for (const k of [2, 4, 6, 8]) {
			const rec = read(k)[1] ?? read(k)[0];
			const built = buildIhEdgePatch(rec, b);
			expect(built.ok, `k=${k}: ${built.reason}`).toBe(true);
			if (!built.ok) continue;
			const [p, q] = [built.patch.T1, built.patch.T2];
			const area = Math.abs(p[0] * q[1] - p[1] * q[0]);
			expect(area / baseArea, `k=${k} index`).toBeCloseTo(k / 2, 4);
			expect(built.patch.polys.length, `k=${k} tiles`).toBe(k / 2);
			// ...and the certificate really does describe twice that, which is the claim being relied on.
			expect(certCellFaces(rec, b)).toBe(k);
		}
	});

	it("satisfies Euler on the torus for a hexagonal board", () => {
		// 2E = 6F and V - E + F = 0, so E = 3F and V = 2F. Three counts from one number: a fold that
		// merged or split a vertex class lands on none of them.
		const b = solved();
		for (const k of [2, 6, 10]) {
			const built = buildIhEdgePatch(read(k)[0], b);
			expect(built.ok, `k=${k}: ${built.reason}`).toBe(true);
			if (!built.ok) continue;
			const F = built.patch.polys.length;
			expect(built.patch.edges.length, `k=${k} E`).toBe(3 * F);
			expect(built.patch.verts.length, `k=${k} V`).toBe(2 * F);
		}
	});

	it("has exactly one record with nothing drawn, and it is the bare board", () => {
		const bare = read(2).filter((r) => !r.drawn.includes("1"));
		expect(bare.length).toBe(1);
		const w = walkIhEdges(bare[0], solved(), { radius: 6 });
		expect(w.edges.length).toBeGreaterThan(50);
		expect(w.edges.every((e) => !e.drawn)).toBe(true);
		// One tile, no drawn edge: every face merges with its neighbour, so the whole plane is ONE
		// unbounded component. Rank 2 is the renderer's own word for that.
		const built = buildIhEdgePatch(bare[0], solved());
		expect(built.ok).toBe(true);
		if (built.ok) {
			expect(built.patch.compRank).toEqual([2]);
			expect(built.patch.edges.every((e) => e[4] === 0)).toBe(true);
		}
	});

	it("puts every developed edge at one of the three class lengths", () => {
		const b = solved();
		for (const rec of read(6).slice(0, 10)) {
			const w = walkIhEdges(rec, b, { radius: 5 });
			for (const e of w.edges) {
				const d = Math.hypot(
					w.vertices[e.u].x - w.vertices[e.v].x,
					w.vertices[e.u].y - w.vertices[e.v].y,
				);
				expect(Math.min(...b.classLengths.map((L) => Math.abs(d - L)))).toBeLessThan(1e-9);
			}
		}
	});

	it("folds losslessly: every walked edge is a lattice translate of one patch edge", () => {
		// The renderer stamps the period over the view, so the fold has to be lossless in both
		// directions: every edge the walk found must be congruent to a patch edge under a lattice
		// translation, with the same drawn bit. A fold that dropped one would leave a hole in the plane.
		const b = solved();
		const rec = read(4)[2];
		const built = buildIhEdgePatch(rec, b);
		expect(built.ok, built.reason).toBe(true);
		if (!built.ok) return;
		const [p, q] = [built.patch.T1, built.patch.T2];
		const det = p[0] * q[1] - p[1] * q[0];
		const key = (x: number, y: number) => {
			const a = (x * q[1] - y * q[0]) / det;
			const bb = (p[0] * y - p[1] * x) / det;
			const f = (t: number) => {
				const u = t - Math.floor(t);
				return Math.round((u > 1 - 1e-6 ? u - 1 : u) * 1e5);
			};
			return `${f(a)},${f(bb)}`;
		};
		const cell = new Map<string, number>();
		for (const [vi, vj, ox, oy, drawn] of built.patch.edges) {
			const A = built.patch.verts[vi];
			const B = built.patch.verts[vj];
			const mx = (A[0] + B[0] + ox * p[0] + oy * q[0]) / 2;
			const my = (A[1] + B[1] + ox * p[1] + oy * q[1]) / 2;
			cell.set(key(mx, my), drawn);
		}
		expect(cell.size).toBe(built.patch.edges.length);

		const w = walkIhEdges(rec, b, { radius: 6 });
		let checked = 0;
		for (const e of w.edges) {
			const mx = (w.vertices[e.u].x + w.vertices[e.v].x) / 2;
			const my = (w.vertices[e.u].y + w.vertices[e.v].y) / 2;
			const hit = cell.get(key(mx, my));
			expect(hit, `edge at ${mx.toFixed(3)},${my.toFixed(3)} is in no patch class`).toBeDefined();
			expect(hit).toBe(e.drawn ? 1 : 0);
			checked++;
		}
		expect(checked).toBeGreaterThan(built.patch.edges.length * 3);
	});

	it("keeps the COMBINATORICS fixed as the parameters move", () => {
		// The record ships no geometry, so a second parameter point must give the same incidence with a
		// different shape. Bounded by instance count, not radius: the tile changes size, so a fixed
		// radius would cover different amounts of tiling and compare nothing.
		const rec = read(6)[3];
		const b1 = solved();
		const b2 = solveIhBoard(1, [0.1, 0.45, 0.2, 0.7]);
		if (!b2.ok) throw new Error("second parameter point should be valid");
		const bound = { radius: Infinity, budget: 1500 };
		const w1 = walkIhEdges(rec, b1, bound);
		const w2 = walkIhEdges(rec, b2.board, bound);
		expect(w2.vertices.length).toBe(w1.vertices.length);
		expect(w2.edges.length).toBe(w1.edges.length);
		expect(w2.edges.filter((e) => e.drawn).length).toBe(w1.edges.filter((e) => e.drawn).length);
		// ...and the shapes really do differ, or the assertion above proves nothing.
		expect(Math.abs(b2.board.classLengths[0] - b1.classLengths[0])).toBeGreaterThan(1e-3);

		// The patch has to agree too: same tile count, same tile RANKS, different geometry. The ranks are
		// what the shelf colours by, so a parameter move that silently reclassified a strip as finite
		// would repaint the figure for no reason the user could see.
		const p1 = buildIhEdgePatch(rec, b1);
		const p2 = buildIhEdgePatch(rec, b2.board);
		expect(p1.ok && p2.ok, `${p1.reason ?? ""} ${p2.reason ?? ""}`).toBe(true);
		if (!p1.ok || !p2.ok) return;
		expect(p2.patch.polys.length).toBe(p1.patch.polys.length);
		expect(p2.patch.compRank).toEqual(p1.patch.compRank);
		expect(p2.patch.T1).not.toEqual(p1.patch.T1);
	});

	it("bows its edges the way Tactile bows them", () => {
		// The certificate's slot bit says which END of an edge a dart sits at, so it says which way the
		// edge is being crossed, so it decides which side a bowed edge bulges toward. That the two slots
		// are OPPOSITE is measured (checkSlotsAreOpposite, asserted below over the whole eager corpus);
		// that slot 0 is the forward one is Marek's convention, and this is what pins it.
		//
		// Distinct bulges per class on purpose: with three equal ones the boundary reads "+++---", which
		// is its own mirror under a rotation by three and cannot tell a correct sense from an inverted one.
		const bulge = [0.42, -0.18, 0.09];
		const info = ISOHEDRAL_TYPES.find((t) => t.ih === 1)!;
		const curves = curvesOf(
			defaultEdgeStates(info.edgeShapes).map((s, i) => ({ ...s, amount: bulge[i] })),
		);
		const tactile = prototileEdges(makeTiling(1, info.defaultParams), curves);

		const r = solveIhBoardFor(1, null, bulge);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.board.curved).toBe(true);

		// Signed perpendicular offset of an arc's midpoint from its chord, in chord-length units: one
		// number per side that is invariant under every similarity the develop can apply.
		const bowOf = (
			ax: number,
			ay: number,
			bx: number,
			by: number,
			mx: number,
			my: number,
		) => {
			const dx = bx - ax;
			const dy = by - ay;
			return ((my - ay) * dx - (mx - ax) * dy) / (dx * dx + dy * dy);
		};
		const want = tactile.map((e) => bowOf(e.from.x, e.from.y, e.to.x, e.to.y, e.mid.x, e.mid.y));

		const built = buildIhEdgePatch(read(6)[3], r.board);
		expect(built.ok, built.reason).toBe(true);
		if (!built.ok) return;
		const p = built.patch;
		expect(p.edgeCurves).toBeDefined();
		expect(p.polyCurves).toBeDefined();
		const at = (c: [number, number, number]) => [
			p.verts[c[0]][0] + c[1] * p.T1[0] + c[2] * p.T2[0],
			p.verts[c[0]][1] + c[1] * p.T1[1] + c[2] * p.T2[1],
		];
		const ring = p.polys[0];
		const got = ring.map((_, i) => {
			const A = at(ring[i]);
			const B = at(ring[(i + 1) % ring.length]);
			const c = p.polyCurves![0][i]!;
			expect(c).not.toBeNull();
			// Cubic at t = 1/2, with the control points stored as offsets from A.
			const mx = (A[0] + 3 * (A[0] + c[0]) + 3 * (A[0] + c[2]) + B[0]) / 8;
			const my = (A[1] + 3 * (A[1] + c[1]) + 3 * (A[1] + c[3]) + B[1]) / 8;
			return bowOf(A[0], A[1], B[0], B[1], mx, my);
		});

		// Same six bows, up to where the ring starts and which way round it runs. Both are checked rather
		// than just the signs: three distinct magnitudes is what makes this test able to fail.
		const rotations = (v: number[]) =>
			v.flatMap((_, i) => {
				const r1 = [...v.slice(i), ...v.slice(0, i)];
				return [r1, [...r1].reverse()];
			});
		const close = (a: number[], b: number[]) => a.every((x, i) => Math.abs(x - b[i]) < 1e-3);
		expect(rotations(got).some((cand) => close(cand, want)), `${got} vs ${want}`).toBe(true);
	});

	it("keeps every curved tile the same shape", () => {
		// A curve belongs to an EDGE, so the two tiles sharing it automatically fit whichever way it bows —
		// which means a mis-oriented bow does not tear the tiling, it silently makes some tiles a different
		// shape from the rest. That is what this catches, and nothing else would.
		const r = solveIhBoardFor(1, null, [0.42, -0.18, 0.09]);
		if (!r.ok) throw new Error(r.error);
		for (const k of [4, 6, 10]) {
			const built = buildIhEdgePatch(read(k)[2], r.board);
			expect(built.ok, `k=${k}: ${built.reason}`).toBe(true);
			if (!built.ok) continue;
			const p = built.patch;
			const at = (c: [number, number, number]) => [
				p.verts[c[0]][0] + c[1] * p.T1[0] + c[2] * p.T2[0],
				p.verts[c[0]][1] + c[1] * p.T1[1] + c[2] * p.T2[1],
			];
			const shapes = p.polys.map((ring, pi) => {
				const sides = ring.map((_, i) => {
					const A = at(ring[i]);
					const B = at(ring[(i + 1) % ring.length]);
					const dx = B[0] - A[0];
					const dy = B[1] - A[1];
					const L2 = dx * dx + dy * dy;
					const c = p.polyCurves![pi][i];
					// Back into chord coordinates, so the signature survives the tile's placement.
					const loc = c
						? [
								(c[0] * dx + c[1] * dy) / L2,
								(c[1] * dx - c[0] * dy) / L2,
								(c[2] * dx + c[3] * dy) / L2,
								(c[3] * dx - c[2] * dy) / L2,
							]
						: null;
					return `${Math.sqrt(L2).toFixed(4)}|${loc ? loc.map((v) => v.toFixed(4)).join(",") : "-"}`;
				});
				return sides
					.map((_, rot) => [...sides.slice(rot), ...sides.slice(0, rot)].join("/"))
					.sort()[0];
			});
			expect(new Set(shapes).size, `k=${k} distinct tile shapes`).toBe(1);
		}
	});

	it("agrees that the two digon slots of an edge are opposite senses", () => {
		// The whole curvature story rests on this, so it is asserted over every eagerly shipped record of
		// BOTH boards and not sampled, at no geometric cost — it reads the quotient, not the plane.
		for (const ih of [1, 2]) {
			const r = solveIhBoardFor(ih, null, null);
			if (!r.ok) throw new Error(r.error);
			for (const k of [2, 4, 6, 8, 10]) {
				for (const rec of readIh(ih, k)) {
					expect(checkSlotsAreOpposite(rec, r.board), rec.id).toBe(true);
				}
			}
		}
	});

	it("leaves the patch curve-free when nothing bows", () => {
		// The field is absent, not an array of nulls: every other patch board must be byte-for-byte what
		// it was before curves existed, and the renderer's straight path must stay the default.
		const built = buildIhEdgePatch(read(6)[3], solved());
		expect(built.ok).toBe(true);
		if (!built.ok) return;
		expect(built.patch.edgeCurves).toBeUndefined();
		expect(built.patch.polyCurves).toBeUndefined();
	});

	it("builds a patch for every record in the small slices", () => {
		// The shelf has no fallback renderer: a record whose period cannot be recovered is a blank panel.
		// So the claim that the shelf covers a k slice is exactly the claim that every record in it
		// builds, and that is worth asserting rather than sampling.
		const b = solved();
		for (const k of [2, 4, 6]) {
			for (const rec of read(k)) {
				const built = buildIhEdgePatch(rec, b);
				expect(built.ok, `${rec.id}: ${built.reason}`).toBe(true);
			}
		}
	});
});

describe.skipIf(!existsSync(shardIh(2, 2)))("the IH02 board, which is where the model got harder", () => {
	it("agrees with Tactile, whose edgeWord is NOT one class forward and one reversed", () => {
		// IH01's "abcABC" pairs each class forward-then-reversed. IH02's "aabccB" does not: classes a and c
		// each occur twice FORWARD, which is only possible because the tiling contains reflected tiles.
		const info = ISOHEDRAL_TYPES.find((t) => t.ih === 2)!;
		const spec = IH_EDGE_BOARDS.find((b) => b.ih === 2)!;
		expect(info.edgeWord).toBe("aabccB");
		expect(info.numAspects).toBe(2);
		expect(checkBoardAgreesWithTactile(spec, [0, 0, 1, 2, 2, 1])).toBe(true);
		expect(checkBoardAgreesWithTactile(spec, [0, 1, 2, 0, 1, 2])).toBe(false);
	});

	it("labels its corners the way the corpus and the geometry jointly demand", () => {
		// The hard part of this board. With TWO aspects a corner is met either way round, so the corpus's
		// `corner -> class` is not a function — B and F carry two classes each — and it narrows the corner
		// labelling only to eight candidates. What picks one is that Marek's letters run in BOUNDARY order,
		// offset by one from Tactile's vertex 0, which this pins: every corner's declared class must be one
		// of the two sides meeting there, and both vertex triples must close.
		const spec = IH_EDGE_BOARDS.find((b) => b.ih === 2)!;
		expect(spec.corners).toEqual(["F", "A", "B", "C", "D", "E"]);
		const cls = spec.sides.map((s) => s[1]);
		const at = (L: string) => spec.corners.indexOf(L);
		const sidesAt = (L: string) =>
			new Set([cls[at(L)], cls[(at(L) - 1 + cls.length) % cls.length]]);
		// Read off the corpus by tools/ctrnact-oracle/develop_ih_edges.py's own incidence pass.
		const corpus: Record<string, string[]> = {
			A: ["a"], B: ["a", "b"], C: ["c"], D: ["c"], E: ["b"], F: ["a", "b"],
		};
		for (const [L, seen] of Object.entries(corpus)) {
			for (const c of seen) expect(sidesAt(L).has(c), `${L} should admit class ${c}`).toBe(true);
		}
		// ...and at a parameter point where all six angles differ, both vertex triples still close.
		const b = solveIhBoard(2, [0.18, 0.42, 0.28, 0.16]);
		expect(b.ok).toBe(true);
		if (!b.ok) return;
		const deg = b.board.cornerAngles.map((a) => (a * 180) / Math.PI);
		const tri = (set: string[]) => set.reduce((s, L) => s + deg[at(L)], 0);
		expect(new Set(deg.map((d) => d.toFixed(3))).size, "angles must differ to make this a test").toBe(6);
		expect(tri(["A", "B", "F"])).toBeCloseTo(360, 6);
		expect(tri(["C", "D", "E"])).toBeCloseTo(360, 6);
	});

	it("builds every eagerly shipped record, at the defaults and away from them", () => {
		// Away from the defaults matters here more than on IH01: at its default parameters IH02 is the
		// regular hexagon, every angle 120°, and a WRONG corner labelling develops perfectly well on it.
		for (const params of [undefined, [0.18, 0.42, 0.28, 0.16]]) {
			const r = solveIhBoard(2, params);
			expect(r.ok).toBe(true);
			if (!r.ok) continue;
			for (const k of [2, 4, 6]) {
				for (const rec of readIh(2, k)) {
					const built = buildIhEdgePatch(rec, r.board);
					expect(built.ok, `${rec.id}: ${built.reason}`).toBe(true);
					if (!built.ok) continue;
					// The certificate cell is a whole number of periods — 1 or 2 on this board, where IH01 is
					// always 2. That it VARIES is why the builder checks divisibility instead of a constant.
					const ratio = certCellFaces(rec, r.board) / built.patch.polys.length;
					expect(Number.isInteger(ratio), `${rec.id} ratio ${ratio}`).toBe(true);
					expect([1, 2]).toContain(ratio);
				}
			}
		}
	});

	it("carries genuinely different tilings from IH01, despite identical per-k counts", () => {
		// Both boards ship 5 / 15 / 60 / 275 / 744 / 4380 / 9280. Same hexagonal shape, same three classes,
		// same four-letter digon alphabet, so the count of edge systems up to symmetry agrees at every k.
		// The records do not, and a shelf presenting one board's data twice would be the worst kind of bug.
		for (const k of [2, 6]) {
			const a = readIh(1, k);
			const b = readIh(2, k);
			expect(b.length).toBe(a.length);
			const key = (r: IhEdgeRecord) => JSON.stringify([r.rneig, r.glue, r.corner, r.edge, r.drawn]);
			const seen = new Set(a.map(key));
			expect(b.filter((r) => seen.has(key(r))).length, `k=${k} shared records`).toBe(0);
		}
	});
});

describe.skipIf(!existsSync(shardIh(4, 2)))("the IH04 board, whose classes do not all get a slot", () => {
	it("gives a direction bit exactly to the class that needs one", () => {
		// The alphabet gives a class four digon letters when it occurs TWICE on the tile and two when it
		// occurs once. IH04's boundary "abcdBe" uses b twice and a, c, d, e once, so only b has a slot
		// bit — and only b is a J edge. The other four are S edges, point-symmetric and equal to their own
		// reverse, so no direction is needed. That pairing is the whole reason curvature works here.
		const info = ISOHEDRAL_TYPES.find((t) => t.ih === 4)!;
		expect(info.edgeShapes).toEqual(["S", "J", "S", "S", "S"]);
		expect(info.edgeWord).toBe("abcdBe");
		const spec = IH_EDGE_BOARDS.find((b) => b.ih === 4)!;
		const uses = spec.classes.map((c) => spec.sides.filter((s) => s[1] === c).length);
		expect(uses).toEqual([1, 2, 1, 1, 1]);
		// The one class used twice is the one J edge, at the same index.
		expect(uses.indexOf(2)).toBe(info.edgeShapes.indexOf("J"));

		const r = solveIhBoardFor(4, null, [0.3, 0.25, -0.2, 0.35, 0.15]);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		r.board.classCurves.forEach((c, i) => {
			if (!c) return;
			const rev = reverseChordCurve(c);
			const selfReverse = c.every((v, j) => Math.abs(v - rev[j]) < 1e-9);
			// A class with one slot MUST be self-reverse, or a bowed edge could not know which way to bulge.
			expect(selfReverse, `class ${spec.classes[i]}`).toBe(uses[i] === 1);
		});
	});

	it("builds every eagerly shipped record, straight and curved", () => {
		for (const bulge of [null, [0.3, 0.25, -0.2, 0.35, 0.15]]) {
			const r = solveIhBoardFor(4, [0.16, 0.44, 0.3, 0.52, 0.28, 0.46], bulge);
			expect(r.ok).toBe(true);
			if (!r.ok) continue;
			expect(r.board.curved).toBe(bulge !== null);
			for (const k of [2, 4, 6]) {
				for (const rec of readIh(4, k)) {
					expect(checkSlotsAreOpposite(rec, r.board), rec.id).toBe(true);
					const built = buildIhEdgePatch(rec, r.board);
					expect(built.ok, `${rec.id}: ${built.reason}`).toBe(true);
				}
			}
		}
	});

	it("is a deeper board than the first three, and its counts say so", () => {
		// Five edge classes instead of three, so k grows the search much faster: 13 / 103 / 628 / 3977
		// against 5 / 15 / 60 / 275, and our budget stops at k=8 where the others reached 14.
		const b = IH_EDGE_BOARDS_SHELF.find((x) => x.ih === 4)!;
		expect(Object.keys(b.counts).map(Number)).toEqual([2, 4, 6, 8]);
		expect(b.counts[8]).toBe(3977);
		expect(b.dropped[10]).toBe(13272);
		expect(b.complete).toBe(false);
		for (const k of [2, 4, 6, 8]) expect(readIh(4, k).length).toBe(b.counts[k]);
	});
});

describe.skipIf(!existsSync(shardIh(5, 2)))("the IH05 board, and what four aspects cost", () => {
	it("has a period that need not divide k, which is what the old face-count gate assumed", () => {
		// ⚑ THE CORRECTION THIS BOARD FORCED. `certCellFaces` reads the tile count back off a certificate's
		// dart count, and the builder used to demand that the period DIVIDE it. On IH01 to IH04 that number
		// is identically `rec.k`, so the gate was really "F divides k", true on four boards by coincidence.
		// IH05 at k=6 has a period of TWELVE tiles against k=6, and the gate rejected every record of the
		// board, including the right labelling.
		//
		// ⚑ AND THE NUMBER IS NOT EVEN k EVERYWHERE. It is on seven of the eight boards; IH07 gives four
		// different ratios (1, 4/5, 3/4, 1/2), because a site tagged Cn contributes a 1/n of a vertex's
		// darts and IH07 is the first board with rotation centres. Asserted per board so that nobody
		// derives a rule from it a second time.
		const ratios = new Map<number, Set<number>>();
		for (const ih of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
			const spec = IH_EDGE_BOARDS.find((b) => b.ih === ih)!;
			expect(spec.sides.length).toBe(6);
			const r = solveIhBoard(ih);
			expect(r.ok).toBe(true);
			if (!r.ok) continue;
			const seen = new Set<number>();
			for (const k of shelfKs(ih).slice(0, 3))
				for (const rec of readIh(ih, k)) seen.add(certCellFaces(rec, r.board) / rec.k);
			ratios.set(ih, seen);
		}
		for (const ih of [1, 2, 3, 4, 5, 6, 8, 9])
			expect([...ratios.get(ih)!], `IH${ih} certFaces/k`).toEqual([1]);
		// The two boards with rotation centres, where a site tagged Cn or Dn contributes a 1/n of a
		// vertex's darts and the dart count stops counting whole vertices.
		for (const ih of [7, 10])
			expect(ratios.get(ih)!.size, `IH${ih} certFaces/k varies`).toBeGreaterThan(1);
		const r = solveIhBoard(5, [0.18, 0.42, 0.28, 0.16, 0.31]);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		for (const rec of readIh(5, 6)) {
			const built = buildIhEdgePatch(rec, r.board);
			expect(built.ok, `${rec.id}: ${built.reason}`).toBe(true);
			if (!built.ok) continue;
			// Twice k, so `certFaces % F` was never going to be zero.
			expect(built.patch.polys.length, rec.id).toBe(12);
		}
	});

	it("keeps every period a whole number of Tactile cells, on every board", () => {
		// What replaced the gate, and unlike it this one is a fact about the board: a decoration is
		// preserved only by translations that already preserve the undecorated tiling, so its cell holds
		// a multiple of the tiles Tactile's own cell holds: 1, 2, 2, 2, 4, 4, 3, 1, 2, 1 across the ten boards.
		for (const ih of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
			const r = solveIhBoard(ih);
			expect(r.ok).toBe(true);
			if (!r.ok) continue;
			const ring = r.board.outline;
			let a2 = 0;
			for (let i = 0; i < ring.length; i++) {
				const p = ring[i];
				const q = ring[(i + 1) % ring.length];
				a2 += p.x * q.y - q.x * p.y;
			}
			const base = Math.round(
				Math.abs(r.board.t1.x * r.board.t2.y - r.board.t1.y * r.board.t2.x) / Math.abs(a2 / 2),
			);
			expect(base, `IH0${ih} aspects`).toBe(ISOHEDRAL_TYPES.find((t) => t.ih === ih)!.numAspects);
			for (const k of shelfKs(ih).slice(0, 2)) {
				for (const rec of readIh(ih, k)) {
					const built = buildIhEdgePatch(rec, r.board);
					expect(built.ok, `${rec.id}: ${built.reason}`).toBe(true);
					if (built.ok) expect(built.patch.polys.length % base, rec.id).toBe(0);
				}
			}
		}
	});

	it("gives a direction bit exactly to the classes that need one", () => {
		// Same arrangement IH04 has, reached differently: "abccBd" uses b and c twice and a and d once, so
		// a and d get a single digon slot — and a and d are exactly the S edges, which are their own
		// reverse. The two J edges are the two that carry a slot bit.
		const info = ISOHEDRAL_TYPES.find((t) => t.ih === 5)!;
		expect(info.edgeShapes).toEqual(["S", "J", "J", "S"]);
		expect(info.edgeWord).toBe("abccBd");
		expect(info.numAspects).toBe(4);
		const spec = IH_EDGE_BOARDS.find((b) => b.ih === 5)!;
		const uses = spec.classes.map((c) => spec.sides.filter((s) => s[1] === c).length);
		expect(uses).toEqual([1, 2, 2, 1]);
		uses.forEach((u, i) => expect(u === 2, spec.classes[i]).toBe(info.edgeShapes[i] === "J"));

		const r = solveIhBoardFor(5, null, [0.3, 0.25, -0.2, 0.35]);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		r.board.classCurves.forEach((c, i) => {
			if (!c) return;
			const rev = reverseChordCurve(c);
			const selfReverse = c.every((v, j) => Math.abs(v - rev[j]) < 1e-9);
			expect(selfReverse, `class ${spec.classes[i]}`).toBe(uses[i] === 1);
		});
	});

	it("builds every eagerly shipped record, straight and curved", () => {
		// NOT the [0.18, 0.42, …] point the period test uses: bowed by this much, the tile is degenerate
		// there and the board says so instead of building. Both are away from the defaults, which is what
		// the develop test actually needs.
		for (const bulge of [null, [0.3, 0.25, -0.2, 0.35]]) {
			const r = solveIhBoardFor(5, [0.16, 0.44, 0.3, 0.52, 0.28], bulge);
			expect(r.ok).toBe(true);
			if (!r.ok) continue;
			expect(r.board.curved).toBe(bulge !== null);
			for (const k of [2, 4, 6]) {
				for (const rec of readIh(5, k)) {
					expect(checkSlotsAreOpposite(rec, r.board), rec.id).toBe(true);
					const built = buildIhEdgePatch(rec, r.board);
					expect(built.ok, `${rec.id}: ${built.reason}`).toBe(true);
				}
			}
		}
	});

	it("ships what the census counts, up to the budget", () => {
		const b = IH_EDGE_BOARDS_SHELF.find((x) => x.ih === 5)!;
		expect(Object.keys(b.counts).map(Number)).toEqual([2, 4, 6, 8, 10]);
		expect(b.counts[10]).toBe(2336);
		expect(b.dropped[12]).toBe(18737);
		expect(b.complete).toBe(false);
		expect(b.missing).toEqual([]);
		for (const k of [2, 4, 6, 8, 10]) expect(readIh(5, k).length).toBe(b.counts[k]);
	});
});

describe.skipIf(!existsSync(shardIh(6, 2)))("the IH06 board, whose corpus marks an edge at one end", () => {
	it("ships a drawn bit the two darts of an edge agree on, on every board", () => {
		// ⚑ WHAT IH06 BROKE. Its class `c` marks a drawn edge at ONE END, giving the letter pair
		// (C10, C12) where every single-slot class on every other board gives (C10, C10) or (C12, C12).
		// Read per dart, the drawn set depends on which side the walk reaches an edge from, and 10 of the
		// 14 records at k=4 develop into a figure with no period at all. develop_ih_edges.combinatorics
		// now resolves the bit PER EDGE — drawn iff either dart says so — which is a no-op on IH01 to
		// IH05 (their re-decode is byte-identical) and is what this asserts about the shipped shards.
		for (const ih of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
			for (const k of shelfKs(ih).slice(0, 3)) {
				for (const rec of readIh(ih, k)) {
					for (let h = 0; h < rec.glue.length; h++) {
						const g = rec.glue[h];
						if (g < 0) continue;
						expect(rec.drawn[h], `${rec.id} darts ${h}/${g}`).toBe(rec.drawn[g]);
					}
				}
			}
		}
	});

	it("keeps the full 1-skeleton, which is the reading that picked `or` over `and`", () => {
		// Both readings make every record periodic, so geometry cannot choose between them. This can:
		// under `and` no c-edge could ever be drawn on IH06, so the edge system with EVERY edge drawn
		// would be missing from a complete enumeration. Under `or` it is there, at k=4.
		const k4 = readIh(6, 4);
		const full = k4.filter((r) => r.drawn.split("").every((c) => c === "1"));
		expect(full.length, "records with every edge drawn").toBeGreaterThan(0);
		expect(readIh(6, 2).some((r) => !r.drawn.includes("1")), "the bare tiling").toBe(true);
	});

	it("builds every eagerly shipped record, straight and curved", () => {
		// Six distinct angles (46.3 / 190.8 / 80.3 / 122.2 / 122.9 / 157.5) against the regular hexagon
		// this type is at its defaults, and unlike the point the board solver picks it still takes a bulge.
		for (const bulge of [null, [0.3, 0.25, -0.2, 0.35]]) {
			const r = solveIhBoardFor(6, [0.18, 0.45, 0.28, 0.6, 0.42], bulge);
			expect(r.ok).toBe(true);
			if (!r.ok) continue;
			expect(r.board.curved).toBe(bulge !== null);
			for (const k of [2, 4, 6]) {
				for (const rec of readIh(6, k)) {
					expect(checkSlotsAreOpposite(rec, r.board), rec.id).toBe(true);
					const built = buildIhEdgePatch(rec, r.board);
					expect(built.ok, `${rec.id}: ${built.reason}`).toBe(true);
				}
			}
		}
	});

	it("ships what the census counts, up to the budget", () => {
		const b = IH_EDGE_BOARDS_SHELF.find((x) => x.ih === 6)!;
		expect(Object.keys(b.counts).map(Number)).toEqual([2, 4, 6, 8, 10]);
		expect(b.counts[10]).toBe(1224);
		expect(b.dropped[14]).toBe(18844);
		expect(b.complete).toBe(false);
		for (const k of [2, 4, 6, 8, 10]) expect(readIh(6, k).length).toBe(b.counts[k]);
	});
});

describe.skipIf(!existsSync(shardIh(7, 4)))("the IH07 board, and its rotation centres", () => {
	it("starts at k=4 and reports a zero at k=14 that the counts either side contradict", () => {
		const b = IH_EDGE_BOARDS_SHELF.find((x) => x.ih === 7)!;
		// No k=2: three of its six corners are 120° and meet three copies of themselves, so the bare
		// tiling already carries four vertex orbits.
		expect(Object.keys(b.counts).map(Number)).toEqual([4, 6, 8, 10, 12]);
		// ⚑ The census reads 1,100 at k=12, ZERO at k=14 and 22,240 at k=16. Nothing on this shelf grows
		// like that, so the zero is recorded as `missing` and not believed. If Marek confirms it is real,
		// this is the line that changes.
		expect(b.missing).toEqual([14]);
		expect(b.dropped[16]).toBe(22240);
		for (const k of [4, 6, 8, 10, 12]) expect(readIh(7, k).length).toBe(b.counts[k]);
	});

	it("builds every eagerly shipped record, straight and curved", () => {
		const info = ISOHEDRAL_TYPES.find((t) => t.ih === 7)!;
		expect(info.edgeWord).toBe("aAbBcC");
		expect(info.numAspects).toBe(3);
		for (const bulge of [null, [0.3, 0.25, -0.2]]) {
			const r = solveIhBoardFor(7, [0.22, 0.37], bulge);
			expect(r.ok).toBe(true);
			if (!r.ok) continue;
			expect(r.board.curved).toBe(bulge !== null);
			// The three 120° corners are what the C3 sites sit on, and they stay 120° across the family.
			const deg = r.board.cornerAngles.map((a) => (a * 180) / Math.PI);
			for (const i of [1, 3, 5]) expect(deg[i], `corner ${i}`).toBeCloseTo(120, 6);
			for (const k of [4, 6, 8]) {
				for (const rec of readIh(7, k)) {
					expect(checkSlotsAreOpposite(rec, r.board), rec.id).toBe(true);
					const built = buildIhEdgePatch(rec, r.board);
					expect(built.ok, `${rec.id}: ${built.reason}`).toBe(true);
				}
			}
		}
	});
});

describe.skipIf(!existsSync(shardIh(8, 1)))("the IH08 board, whose corner letters repeat", () => {
	it("starts at k=1, the first board on the shelf that does", () => {
		// One aspect and three S edges, so its bare tiling has a SINGLE vertex orbit. The seven boards
		// before it have a literal zero at every odd k; any code stepping these boards by two is wrong.
		const b = IH_EDGE_BOARDS_SHELF.find((x) => x.ih === 8)!;
		expect(Object.keys(b.counts).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
		expect(b.counts[1]).toBe(5);
		expect(b.dropped[10]).toBe(29532);
		for (const k of [1, 2, 3, 4, 5, 6, 7, 8]) expect(readIh(8, k).length).toBe(b.counts[k]);
		// ⚑ It was the only one when it landed; IH09 and IH10 joined it. The seven boards BEFORE it are
		// still even-only, and that is the claim worth holding on to.
		for (const other of IH_EDGE_BOARDS_SHELF.filter((x) => x.ih < 8))
			expect(Object.keys(other.counts).map(Number).every((k) => k % 2 === 0), other.label).toBe(true);
	});

	it("names three corners for six, and gives every class one slot because all three are S", () => {
		// ⚑ `abcabc` repeats with period three, so six corners fall into three classes and the corpus
		// knows only A, B, C. And although each class occurs TWICE on the boundary it gets ONE digon slot,
		// not two, which would be unreadable anywhere else: here all three edges are S, equal to their own
		// reverse, so no direction bit is needed. `checkSlotsAreOpposite` is what asserts that.
		const info = ISOHEDRAL_TYPES.find((t) => t.ih === 8)!;
		expect(info.edgeWord).toBe("abcabc");
		expect(info.edgeShapes).toEqual(["S", "S", "S"]);
		expect(info.numAspects).toBe(1);
		const spec = IH_EDGE_BOARDS.find((b) => b.ih === 8)!;
		expect(spec.corners).toEqual(["A", "B", "C", "A", "B", "C"]);
		expect(new Set(spec.corners).size).toBe(3);
		expect(spec.sides.length).toBe(6);
		const letters = new Set(readIh(8, 4).flatMap((r) => r.edge));
		expect([...letters].sort()).toEqual(["A10", "A12", "B10", "B12", "C10", "C12"]);
		// Opposite corners carry equal angles, which is what makes reading a letter's angle off its FIRST
		// occurrence exact instead of a rounding of two different numbers.
		const r = solveIhBoardFor(8, [0.15, 0.55, 0.35, 0.25], null);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		for (let i = 0; i < 3; i++)
			expect(r.board.cornerAngles[i], `corner ${i}`).toBeCloseTo(r.board.cornerAngles[i + 3], 9);
	});

	it("builds every record of its first four slices, straight and curved", () => {
		for (const bulge of [null, [0.3, 0.25, -0.2]]) {
			const r = solveIhBoardFor(8, [0.15, 0.55, 0.35, 0.25], bulge);
			expect(r.ok).toBe(true);
			if (!r.ok) continue;
			expect(r.board.curved).toBe(bulge !== null);
			for (const k of [1, 2, 3, 4]) {
				for (const rec of readIh(8, k)) {
					expect(checkSlotsAreOpposite(rec, r.board), rec.id).toBe(true);
					const built = buildIhEdgePatch(rec, r.board);
					expect(built.ok, `${rec.id}: ${built.reason}`).toBe(true);
				}
			}
		}
	});
});

describe.skipIf(!existsSync(shardIh(9, 1)))("the IH09 and IH10 boards", () => {
	it("does not require the census to grow with k", () => {
		// ⚑ IH09 falls from 4,152 at k=10 to 3,244 at k=11, and that is the board, not a short run: a k
		// with more vertex orbits is not obliged to admit more edge systems. Every count is the drop's own.
		const b = IH_EDGE_BOARDS_SHELF.find((x) => x.ih === 9)!;
		expect(b.counts[10]).toBeGreaterThan(b.counts[11]);
		expect(b.missing).toEqual([]);
		for (const k of Object.keys(b.counts).map(Number)) expect(readIh(9, k).length).toBe(b.counts[k]);
	});

	it("has three boards starting at k=1, not one", () => {
		// The note on IH08 said it was the only board with odd k. IH09 and IH10 have it too, so the shelf's
		// header claim is now "seven boards, not all of them", and code stepping by two is wrong on three.
		const odd = IH_EDGE_BOARDS_SHELF.filter((b) =>
			Object.keys(b.counts).map(Number).some((k) => k % 2 === 1),
		);
		expect(odd.map((b) => b.ih)).toEqual([8, 9, 10]);
	});

	it("carries a board with NO parameters at all, and reads its mirror sites", () => {
		// ⚑ IH10 is the degenerate end of the shelf: Tactile gives one fixed tile (the regular hexagon),
		// one edge class, one corner class. Its corpus is also the first with MIRROR site tags — `Aa`,
		// `Ac` and `D6a` beside `F` and `C3`. A `Dn` tag is n/2-fold, NOT n-fold: `D6a` lists one 120°
		// corner, which closes at 360/3. Reading it as sixfold or as onefold throws the board out.
		const info = ISOHEDRAL_TYPES.find((t) => t.ih === 10)!;
		expect(info.numParams).toBe(0);
		expect(info.numEdgeShapes).toBe(1);
		expect(info.edgeWord).toBe("aAaAaA");
		const spec = IH_EDGE_BOARDS.find((b) => b.ih === 10)!;
		expect(new Set(spec.corners).size).toBe(1);
		expect(spec.classes).toEqual(["a"]);
		const r = solveIhBoard(10);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		// The regular hexagon: six 120° corners, six equal sides.
		for (const a of r.board.cornerAngles) expect((a * 180) / Math.PI).toBeCloseTo(120, 9);
		expect(new Set(r.board.classLengths.map((v) => v.toFixed(9))).size).toBe(1);
	});

	it("refuses to bow a board that cannot say which way an edge is crossed", () => {
		// ⚑ WHAT IH10 BROKE. A digon slot says which END of an edge a dart sits at, so a two-slot class
		// knows its direction and a one-slot class does not. On IH04 to IH09 every one-slot class is an S
		// edge, its own reverse, so the missing bit costs nothing — that pairing is what made curvature
		// safe. IH10's single class is used SIX times, is a J edge, and still gets one slot, so a bow on
		// it would be mirrored on half the edges. `solveIhBoardFor` now says no instead of drawing it.
		expect(solveIhBoardFor(10, null, null).ok).toBe(true);
		const bowed = solveIhBoardFor(10, null, [0.3]);
		expect(bowed.ok).toBe(false);
		expect(bowed.error).toBe("unbowable");
		// Zero is not a bow, so the straight board still builds through the same call.
		expect(solveIhBoardFor(10, null, [0]).ok).toBe(true);
		// ...and every other board still bows.
		for (const ih of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
			const info = ISOHEDRAL_TYPES.find((t) => t.ih === ih)!;
			const r = solveIhBoardFor(ih, null, info.edgeShapes.map((_, i) => 0.18 + 0.03 * i));
			expect(r.ok, `IH0${ih} bows`).toBe(true);
			if (r.ok) expect(r.board.curved).toBe(true);
		}
	});

	it("declares the digon slots its corpus actually uses", () => {
		// Derived from the shards, not from the row, so a corpus whose alphabet changes fails here.
		for (const ih of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
			const spec = IH_EDGE_BOARDS.find((b) => b.ih === ih)!;
			const seen = spec.classes.map(() => new Set<number>());
			for (const k of shelfKs(ih).slice(0, 4))
				for (const rec of readIh(ih, k))
					for (const letter of rec.edge) {
						const c = spec.classes.indexOf(letter[0].toLowerCase());
						if (c >= 0) seen[c].add(Number(letter.slice(1)) % 2);
					}
			expect(
				seen.map((v) => v.size),
				`IH${String(ih).padStart(2, "0")} slots`,
			).toEqual(spec.slots);
		}
	});

	it("builds every record of the first slices of both, straight and curved", () => {
		// ⚑ IH10 straight only: it refuses a bulge, and the next test is where that is asserted.
		for (const [ih, params, bulge] of [
			[9, [0.15, 0.55, 0.35], null],
			[9, [0.15, 0.55, 0.35], [0.3, 0.25]],
			[10, null, null],
		] as [number, number[] | null, number[] | null][]) {
			const r = solveIhBoardFor(ih, params, bulge);
			expect(r.ok, `IH${ih}`).toBe(true);
			if (!r.ok) continue;
			expect(r.board.curved).toBe(bulge !== null);
			for (const k of [1, 2, 3, 4]) {
				for (const rec of readIh(ih, k)) {
					expect(checkSlotsAreOpposite(rec, r.board), rec.id).toBe(true);
					const built = buildIhEdgePatch(rec, r.board);
					expect(built.ok, `${rec.id}: ${built.reason}`).toBe(true);
				}
			}
		}
	});
});
