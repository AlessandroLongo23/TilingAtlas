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

const shardIh = (ih: number, k: number) =>
	`public/isohedral-edges/ie${String(ih).padStart(2, "0")}-k${k}.json`;
const anyShard = existsSync(shardIh(1, 2));
const readIh = (ih: number, k: number): IhEdgeRecord[] =>
	JSON.parse(readFileSync(shardIh(ih, k), "utf8"));
const read = (k: number): IhEdgeRecord[] => readIh(1, k);

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
		expect(solveIhBoard(7).ok).toBe(false);
		expect(solveIhBoard(7).error).toBe("unknown-type");
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
