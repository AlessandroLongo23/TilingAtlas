import { describe, expect, it } from "vitest";
import {
	ISOHEDRAL_TYPES,
	MARKED_TYPES,
	MAX_IH,
	isohedralType,
	parseIh,
	DEFAULT_IH,
} from "./catalogue";
import {
	BULGE,
	buildCell,
	canonicalBase,
	curvesOf,
	defaultEdgeStates,
	flatness,
	HOME_PERIODS,
	isSimple,
	MAX_EDGE_SEGMENTS,
	makeTiling,
	prototileEdges,
	prototileOutline,
	quantizeAmount,
	randomEdgeStates,
	segmentsForEdge,
	setEdgeAmount,
	straightCurves,
} from "./build";
import { EdgeShape, IsohedralTiling, tilingTypes } from "./vendor/tactile";

const available = ISOHEDRAL_TYPES.filter((t) => t.available);

describe("the catalogue covers all 93 types and is honest about the twelve", () => {
	it("has one entry per IH number, in order", () => {
		expect(ISOHEDRAL_TYPES).toHaveLength(MAX_IH);
		expect(ISOHEDRAL_TYPES.map((t) => t.ih)).toEqual(
			Array.from({ length: MAX_IH }, (_, i) => i + 1),
		);
	});

	it("flags exactly the twelve marked types, and they are the expected ones", () => {
		const missing = ISOHEDRAL_TYPES.filter((t) => !t.available).map((t) => t.ih);
		expect(missing).toEqual([...MARKED_TYPES]);
		expect(missing).toHaveLength(12);
		expect(available).toHaveLength(81);
		// Cross-check against the vendored library rather than trusting our own list.
		expect(available.map((t) => t.ih)).toEqual([...tilingTypes]);
	});

	it("pads labels so the list aligns", () => {
		expect(isohedralType(1)!.label).toBe("IH01");
		expect(isohedralType(93)!.label).toBe("IH93");
	});

	it("parses ?type= in both bare and prefixed forms, falling back on nonsense", () => {
		expect(parseIh("4")).toBe(4);
		expect(parseIh("IH04")).toBe(4);
		expect(parseIh("ih93")).toBe(93);
		expect(parseIh("94")).toBe(DEFAULT_IH);
		expect(parseIh("banana")).toBe(DEFAULT_IH);
		expect(parseIh(null)).toBe(DEFAULT_IH);
	});
});

describe("derived facts stay inside the ranges Tactile actually ships", () => {
	it("keeps every count in range and every array length consistent", () => {
		for (const t of available) {
			expect(t.numParams, t.label).toBeGreaterThanOrEqual(0);
			expect(t.numParams, t.label).toBeLessThanOrEqual(6);
			expect(t.numVertices, t.label).toBeGreaterThanOrEqual(3);
			expect(t.numVertices, t.label).toBeLessThanOrEqual(6);
			expect(t.numAspects, t.label).toBeGreaterThanOrEqual(1);
			expect(t.numAspects, t.label).toBeLessThanOrEqual(12);
			expect(t.numEdgeShapes, t.label).toBeGreaterThanOrEqual(1);
			expect(t.numEdgeShapes, t.label).toBeLessThanOrEqual(5);
			expect(t.edgeShapes, t.label).toHaveLength(t.numEdgeShapes);
			expect(t.defaultParams, t.label).toHaveLength(t.numParams);
			expect(t.edgeWord, t.label).toHaveLength(t.numVertices);
			expect([2, 3], t.label).toContain(t.numColours);
		}
	});

	it("reproduces the measured distributions", () => {
		const tally = (pick: (t: (typeof available)[number]) => number) => {
			const out: Record<number, number> = {};
			for (const t of available) out[pick(t)] = (out[pick(t)] ?? 0) + 1;
			return out;
		};
		expect(tally((t) => t.numParams)).toEqual({ 0: 26, 1: 15, 2: 21, 3: 9, 4: 7, 5: 2, 6: 1 });
		expect(tally((t) => t.numVertices)).toEqual({ 3: 16, 4: 37, 5: 9, 6: 19 });
		expect(tally((t) => t.numAspects)).toEqual({ 1: 17, 2: 27, 3: 6, 4: 20, 6: 8, 8: 2, 12: 1 });
		expect(tally((t) => t.numEdgeShapes)).toEqual({ 1: 17, 2: 30, 3: 26, 4: 7, 5: 1 });
	});

	it("puts U edges in exactly six types", () => {
		const withU = available.filter((t) => t.edgeShapes.includes("U")).map((t) => t.ih);
		expect(withU).toEqual([12, 13, 18, 64, 66, 73]);
	});

	it("pins IH04 as the only six-parameter type and IH77 as the only twelve-aspect one", () => {
		expect(available.filter((t) => t.numParams === 6).map((t) => t.ih)).toEqual([4]);
		expect(available.filter((t) => t.numAspects === 12).map((t) => t.ih)).toEqual([77]);
		expect(isohedralType(4)!.edgeShapes).toEqual(["S", "J", "S", "S", "S"]);
	});
});

describe("the vendored library still produces the geometry we measured", () => {
	// A regression pin on the vendored file. If a future `tactile.js` update perturbs the coefficient
	// tables, this fails here instead of quietly redrawing the whole shelf.
	it("puts IH01's default hexagon and lattice exactly where they were", () => {
		const tiling = new IsohedralTiling(1);
		const verts = tiling.vertices().map((v) => [+v.x.toFixed(6), +v.y.toFixed(6)]);
		expect(verts).toEqual([
			[0, 0],
			[0.57735, 0],
			[0.866025, 0.5],
			[0.57735, 1],
			[0, 1],
			[-0.288675, 0.5],
		]);
		expect(tiling.getParameters()).toEqual([0.12239750492, 0.5, 0.143395479017, 0.625]);
		const t1 = tiling.getT1();
		const t2 = tiling.getT2();
		expect([+t1.x.toFixed(6), +t1.y.toFixed(6)]).toEqual([0, -1]);
		expect([+t2.x.toFixed(6), +t2.y.toFixed(6)]).toEqual([0.866025, -0.5]);
	});

	it("round-trips the default parameters", () => {
		for (const t of available) {
			const tiling = new IsohedralTiling(t.ih);
			const before = tiling.getParameters();
			tiling.setParameters(before);
			expect(tiling.getParameters(), t.label).toEqual(before);
			expect(before, t.label).toEqual(t.defaultParams);
		}
	});

	it("refuses a wrong-length parameter vector instead of silently ignoring it", () => {
		expect(() => makeTiling(1, [0.1, 0.5])).toThrow(/takes 4 parameters, got 2/);
		expect(() => makeTiling(10, [])).not.toThrow(); // IH10 has none
	});
});

/** Deterministic stand-in for Math.random, so a failure is reproducible. */
function seeded(seed = 1) {
	let s = seed;
	return () => {
		s = (s * 1103515245 + 12345) % 2147483648;
		return s / 2147483648;
	};
}

describe("the edge curvature model respects each edge's symmetry", () => {
	it("gives S edges the 180° pairing and U edges the mirror pairing", () => {
		const s = canonicalBase("S")!;
		expect(s.b.x).toBeCloseTo(1 - s.a.x, 12);
		expect(s.b.y).toBeCloseTo(-s.a.y, 12);

		const u = canonicalBase("U")!;
		expect(u.b.x).toBeCloseTo(1 - u.a.x, 12);
		expect(u.b.y).toBeCloseTo(u.a.y, 12);
	});

	it("emits no control points for an I edge, which is forced straight", () => {
		expect(canonicalBase("I")).toBeNull();
		expect(curvesOf(defaultEdgeStates(["I"]))[0]).toBeNull();
	});

	it("scaling by the amplitude preserves each symmetry", () => {
		for (const kind of ["J", "U", "S"] as const) {
			const c = curvesOf([{ kind, base: canonicalBase(kind), amount: -0.22 }])[0]!;
			expect(c.a.y, kind).toBeCloseTo(-0.22, 12);
			if (kind === "S") expect(c.b.y).toBeCloseTo(0.22, 12);
			if (kind === "U") expect(c.b.y).toBeCloseTo(-0.22, 12);
		}
	});

	it("keeps random edges inside their symmetry families for every type", () => {
		const rnd = seeded();
		for (const t of available) {
			const states = randomEdgeStates(t.edgeShapes, rnd);
			const curves = curvesOf(states);
			expect(curves, t.label).toHaveLength(t.numEdgeShapes);
			t.edgeShapes.forEach((kind, i) => {
				const c = curves[i];
				if (kind === "I") {
					expect(c, `${t.label} edge ${i}`).toBeNull();
					return;
				}
				expect(c, `${t.label} edge ${i}`).not.toBeNull();
				// The template is unit-amplitude, so the slider reads a meaningful number.
				expect(Math.max(Math.abs(states[i].base!.a.y), Math.abs(states[i].base!.b.y))).toBeCloseTo(1, 12);
				if (kind === "S") {
					expect(c!.b.x).toBeCloseTo(1 - c!.a.x, 12);
					expect(c!.b.y).toBeCloseTo(-c!.a.y, 12);
				} else if (kind === "U") {
					expect(c!.b.x).toBeCloseTo(1 - c!.a.x, 12);
					expect(c!.b.y).toBeCloseTo(c!.a.y, 12);
				}
			});
		}
	});

	/**
	 * The slider's travel is [-0.5, 0.5], and normalising the random curve by |y| put the bow's
	 * direction into the template and left every amplitude positive: correct shapes, but every thumb
	 * parked right of centre and the left half of the control looked dead. The sign belongs in
	 * `amount`, where the reader can see it.
	 */
	it("randomizes into both halves of the slider's travel", () => {
		const rnd = seeded(5);
		const signs = new Set<number>();
		for (const t of available) {
			for (const s of randomEdgeStates(t.edgeShapes, rnd)) {
				if (s.kind === "I") continue;
				signs.add(Math.sign(s.amount));
				// The template holds shape only: its dominant control point is +1, never -1.
				const lead =
					Math.abs(s.base!.a.y) >= Math.abs(s.base!.b.y) ? s.base!.a.y : s.base!.b.y;
				expect(lead, `${t.label} ${s.kind}`).toBeCloseTo(1, 12);
			}
		}
		expect(signs.has(-1), "no edge bowed the negative way").toBe(true);
		expect(signs.has(1), "no edge bowed the positive way").toBe(true);
	});

	/**
	 * The reported bug, pinned. Randomize, nudge one slider, put it back: the tiling must be the one you
	 * started with. It was not, because the old model rebuilt the control points from the slider value
	 * and Randomize varies their x as well as their y, so the first touch of any edge slider silently
	 * replaced the random shape with the canonical bow and never restored it.
	 */
	it("round-trips an edge slider after Randomize, geometry included", () => {
		const rnd = seeded(7);
		for (const t of available) {
			const states = randomEdgeStates(t.edgeShapes, rnd);
			const cellOf = (s: typeof states) =>
				buildCell({ ih: t.ih, params: t.defaultParams, curves: curvesOf(s) })!;

			const before = cellOf(states);

			for (let i = 0; i < states.length; ++i) {
				if (t.edgeShapes[i] === "I") continue;
				const original = states[i].amount;
				const moved = setEdgeAmount(states, i, original + 0.11);
				const back = setEdgeAmount(moved, i, original);

				expect(curvesOf(back), `${t.label} edge ${i} curve`).toEqual(curvesOf(states));
				expect(cellOf(back).polygons, `${t.label} edge ${i} geometry`).toEqual(before.polygons);
				// And the nudge really did change something, so this is not passing vacuously.
				expect(cellOf(moved).polygons, `${t.label} edge ${i} nudge`).not.toEqual(before.polygons);
			}
		}
	});

	/**
	 * The other half of the same bug. The slider's step is 0.01, so a state holding a full-precision
	 * random amplitude shows as rounded and writes that rounded value back on the first drag: the
	 * tiling moved as soon as you touched the control, before the thumb did.
	 */
	it("gives Randomize amplitudes the slider can hold exactly", () => {
		const rnd = seeded(3);
		for (const t of available) {
			for (const s of randomEdgeStates(t.edgeShapes, rnd)) {
				if (s.kind === "I") {
					expect(s.amount, t.label).toBe(0);
					continue;
				}
				// Exactly what a round trip through the input element's value string would produce.
				expect(s.amount, `${t.label} ${s.kind}`).toBe(Number(s.amount.toFixed(2)));
				expect(quantizeAmount(s.amount), `${t.label} ${s.kind}`).toBe(s.amount);
				// And always visible: a shape you cannot see is not a randomization.
				expect(Math.abs(s.amount), `${t.label} ${s.kind}`).toBeGreaterThanOrEqual(BULGE.step);
			}
		}
	});

	it("survives a trip to zero and back, which a naive model would flatten permanently", () => {
		const rnd = seeded(11);
		const t = isohedralType(4)!;
		const states = randomEdgeStates(t.edgeShapes, rnd);
		const cellOf = (s: typeof states) =>
			buildCell({ ih: 4, params: t.defaultParams, curves: curvesOf(s) })!;
		const before = cellOf(states);

		let s = states;
		for (let i = 0; i < states.length; ++i) s = setEdgeAmount(s, i, 0);
		const flat = cellOf(s);
		expect(flat.polygons).not.toEqual(before.polygons);
		// Every edge straight, so the outline is back to the bare tiling vertices.
		expect(flat.polygons[0].vertices).toHaveLength(t.numVertices);

		for (let i = 0; i < states.length; ++i) s = setEdgeAmount(s, i, states[i].amount);
		expect(cellOf(s).polygons).toEqual(before.polygons);
	});
});

describe("prototile outlines", () => {
	it("is exactly the tiling vertices when every edge is straight", () => {
		for (const t of available) {
			const tiling = new IsohedralTiling(t.ih);
			const outline = prototileOutline(tiling, straightCurves(t.edgeShapes));
			expect(outline, t.label).toHaveLength(t.numVertices);
			for (const p of outline) {
				expect(Number.isFinite(p.x) && Number.isFinite(p.y), t.label).toBe(true);
			}
		}
	});

	it("emits one sample run per curved edge and leaves I edges straight", () => {
		for (const t of available) {
			const tiling = new IsohedralTiling(t.ih);
			const curves = curvesOf(t.edgeShapes.map((kind) => ({ kind, base: canonicalBase(kind), amount: 0.25 })));
			const outline = prototileOutline(tiling, curves, { segments: 10 });

			// Count boundary edges that end up curved: the edge's shape is not I and its curve is set.
			let curved = 0;
			for (const edge of tiling.shape()) {
				if (edge.shape !== EdgeShape.I && curves[edge.id]) curved++;
			}
			const straight = t.numVertices - curved;
			expect(outline, t.label).toHaveLength(curved * 10 + straight);
		}
	});

	it("never repeats the closing vertex, which would give the ear clipper a zero-area ear", () => {
		const tiling = new IsohedralTiling(1);
		const outline = prototileOutline(tiling, straightCurves(["J", "J", "J"]));
		const first = outline[0];
		const last = outline[outline.length - 1];
		expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeGreaterThan(1e-6);
	});
});

/**
 * The sidebar preview draws from these: a letter per boundary edge, and a point on that edge to hang it
 * and its symmetry mark on. Everything it asserts is something the drawing would get silently wrong.
 */
describe("named boundary edges", () => {
	it("spells edgeWord, in tiling-vertex order", () => {
		for (const t of available) {
			const tiling = new IsohedralTiling(t.ih);
			const edges = prototileEdges(tiling, straightCurves(t.edgeShapes));
			expect(edges, t.label).toHaveLength(t.numVertices);
			const word = edges
				.map((e) => {
					const letter = String.fromCharCode(97 + e.id);
					return e.rev ? letter.toUpperCase() : letter;
				})
				.join("");
			expect(word, t.label).toBe(t.edgeWord);
		}
	});

	it("chords the tiling polygon: edge i runs from vertex i to vertex i+1", () => {
		for (const t of available) {
			const tiling = new IsohedralTiling(t.ih);
			const verts = tiling.vertices();
			const edges = prototileEdges(tiling, straightCurves(t.edgeShapes));
			edges.forEach((e, i) => {
				expect([e.from.x, e.from.y], `${t.label} edge ${i}`).toEqual([verts[i].x, verts[i].y]);
				const q = verts[(i + 1) % verts.length];
				expect([e.to.x, e.to.y], `${t.label} edge ${i}`).toEqual([q.x, q.y]);
			});
		}
	});

	it("puts `mid` at the chord midpoint while every edge is straight", () => {
		for (const t of available) {
			const tiling = new IsohedralTiling(t.ih);
			for (const e of prototileEdges(tiling, straightCurves(t.edgeShapes))) {
				expect(Math.hypot(e.mid.x - (e.from.x + e.to.x) / 2, e.mid.y - (e.from.y + e.to.y) / 2)).
					toBeLessThan(1e-9);
			}
		}
	});

	/**
	 * The one that matters for the drawing: an S edge turns 180° about its own midpoint, so that point
	 * stays ON the chord however hard the edge bows — which is why the preview can draw the 2-fold centre
	 * there and be right. A U or J edge bows off it, and must, or the letter would sit on the wrong side.
	 */
	it("keeps an S edge's midpoint on its chord, and moves a bowed U or J edge's off it", () => {
		for (const t of available) {
			const tiling = new IsohedralTiling(t.ih);
			const curves = curvesOf(
				t.edgeShapes.map((kind) => ({ kind, base: canonicalBase(kind), amount: BULGE.max })),
			);
			for (const e of prototileEdges(tiling, curves)) {
				const chord = { x: (e.from.x + e.to.x) / 2, y: (e.from.y + e.to.y) / 2 };
				const off = Math.hypot(e.mid.x - chord.x, e.mid.y - chord.y);
				const len = Math.hypot(e.to.x - e.from.x, e.to.y - e.from.y);
				if (e.kind === "S" || e.kind === "I") {
					expect(off, `${t.label} ${e.kind}`).toBeLessThan(1e-9);
				} else {
					// 3/8 of the amplitude, by the cubic at t = 1/2. Well clear of zero at BULGE.max.
					expect(off / len, `${t.label} ${e.kind}`).toBeGreaterThan(0.1);
				}
			}
		}
	});

	it("is what buildCell reports", () => {
		const t = isohedralType(13)!;
		const cell = buildCell({
			ih: 13,
			params: [...t.defaultParams],
			curves: straightCurves(t.edgeShapes),
		})!;
		expect(cell.edges).toEqual(prototileEdges(makeTiling(13, t.defaultParams), straightCurves(t.edgeShapes)));
	});
});

describe("adaptive edge flattening", () => {
	const cubic = (c: { a: { x: number; y: number }; b: { x: number; y: number } }, t: number) => {
		const u = 1 - t;
		const P = [{ x: 0, y: 0 }, c.a, c.b, { x: 1, y: 0 }];
		const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
		return {
			x: w[0] * P[0].x + w[1] * P[1].x + w[2] * P[2].x + w[3] * P[3].x,
			y: w[0] * P[0].y + w[1] * P[1].y + w[2] * P[2].y + w[3] * P[3].y,
		};
	};

	/** Largest distance from the true curve to the polyline that `n` equal-parameter steps produces. */
	function measuredError(c: { a: { x: number; y: number }; b: { x: number; y: number } }, n: number) {
		let worst = 0;
		for (let i = 0; i < n; ++i) {
			const p = cubic(c, i / n);
			const q = cubic(c, (i + 1) / n);
			const dx = q.x - p.x, dy = q.y - p.y;
			const len2 = dx * dx + dy * dy || 1;
			for (let s = 1; s < 32; ++s) {
				const t = (i + s / 32) / n;
				const m = cubic(c, t);
				// Distance from the curve point to the segment's line.
				const u = ((m.x - p.x) * dx + (m.y - p.y) * dy) / len2;
				const px = p.x + u * dx, py = p.y + u * dy;
				worst = Math.max(worst, Math.hypot(m.x - px, m.y - py));
			}
		}
		return worst;
	}

	it("is zero exactly for the straight line and grows with the bow", () => {
		expect(flatness({ a: { x: 1 / 3, y: 0 }, b: { x: 2 / 3, y: 0 } })).toBeCloseTo(0, 12);
		const shallow = flatness(curvesOf([{ kind: "J", base: canonicalBase("J"), amount: 0.1 }])[0]!);
		const deep = flatness(curvesOf([{ kind: "J", base: canonicalBase("J"), amount: 0.5 }])[0]!);
		expect(deep).toBeGreaterThan(shallow);
	});

	/**
	 * The bound is what the whole adaptive rule rests on, so measure against the actual curve rather
	 * than trusting the algebra: for every kind and depth, the polyline `segmentsForEdge` asks for must
	 * really land inside the pixel budget it was given.
	 */
	it("delivers the error budget it promises, for every kind and depth", () => {
		for (const kind of ["J", "U", "S"] as const) {
			for (const amount of [0.05, 0.15, 0.3, 0.5]) {
				for (const chordPx of [40, 120, 400, 1200]) {
					const c = curvesOf([{ kind, base: canonicalBase(kind), amount }])[0]!;
					const tolPx = 0.25;
					const n = segmentsForEdge(c, chordPx, tolPx, 4096);
					// measuredError is in chord units; scale to pixels.
					const errPx = measuredError(c, n) * chordPx;
					expect(errPx, `${kind} @ ${amount}, ${chordPx}px, n=${n}`).toBeLessThanOrEqual(tolPx);
				}
			}
		}
	});

	it("asks for more segments as the edge gets bigger on screen, and honours the cap", () => {
		const c = curvesOf([{ kind: "J", base: canonicalBase("J"), amount: 0.5 }])[0]!;
		const counts = [50, 200, 800, 3200].map((px) => segmentsForEdge(c, px, 0.25, 4096));
		for (let i = 1; i < counts.length; ++i) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
		// Quadrupling the chord doubles the count: n ∝ √chord.
		expect(counts[1] / counts[0]).toBeCloseTo(2, 0);
		expect(segmentsForEdge(c, 1e9, 0.25, MAX_EDGE_SEGMENTS)).toBe(MAX_EDGE_SEGMENTS);
	});

	it("spends nothing on a straight edge however far you zoom", () => {
		const straight = { a: { x: 1 / 3, y: 0 }, b: { x: 2 / 3, y: 0 } };
		expect(segmentsForEdge(straight, 1e6, 0.25)).toBe(1);
	});

	it("gives a bigger outline at a higher zoom, with the same tile count", () => {
		const t = isohedralType(4)!;
		const curves = curvesOf(t.edgeShapes.map((kind) => ({ kind, base: canonicalBase(kind), amount: 0.4 })));
		const near = buildCell({ ih: 4, params: t.defaultParams, curves, pxPerWorld: 100 })!;
		const far = buildCell({ ih: 4, params: t.defaultParams, curves, pxPerWorld: 3200 })!;
		expect(far.prototile.length).toBeGreaterThan(near.prototile.length);
		expect(far.tilesPerCell).toBe(near.tilesPerCell);
		// Refining the curve must not change what the tiling IS: the cell still covers its lattice.
		for (const c of [near, far]) {
			const total = c.polygons.reduce((s, p) => s + Math.abs(area2(p.vertices)) / 2, 0);
			const lattice = Math.abs(c.v1[0] * c.v2[1] - c.v2[0] * c.v1[1]);
			expect(total / lattice).toBeCloseTo(1, 6);
		}
	});
});

describe("isSimple", () => {
	it("accepts a convex polygon and rejects a bow tie", () => {
		const square = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 1, y: 1 },
			{ x: 0, y: 1 },
		];
		expect(isSimple(square)).toBe(true);
		const bowtie = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
		];
		expect(isSimple(bowtie)).toBe(false);
	});

	it("holds for every type at its defaults", () => {
		for (const t of available) {
			const tiling = new IsohedralTiling(t.ih);
			const outline = prototileOutline(tiling, straightCurves(t.edgeShapes));
			expect(isSimple(outline), t.label).toBe(true);
		}
	});
});

/** Twice the signed area of a ring. */
function area2(pts: { x: number; y: number }[]): number {
	let s = 0;
	for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
		s += (pts[j].x - pts[i].x) * (pts[j].y + pts[i].y);
	}
	return s;
}

describe("buildCell", () => {
	it("returns null for the twelve marked types", () => {
		for (const ih of MARKED_TYPES) {
			expect(buildCell({ ih, params: [], curves: [] }), `IH${ih}`).toBeNull();
		}
	});

	/**
	 * The load-bearing claim of the whole renderer: this cell, repeated on this lattice, IS the tiling.
	 * If the tiles exactly cover one lattice cell with no gap and no overlap, their total area equals
	 * |det(v1, v2)|. A missing aspect, a wrong supercell size or a malformed prototile all break it.
	 */
	it("has tiles whose total area is exactly one lattice cell, for all 81", () => {
		for (const t of available) {
			const c = buildCell({
				ih: t.ih,
				params: t.defaultParams,
				curves: straightCurves(t.edgeShapes),
			})!;
			const total = c.polygons.reduce((s, p) => s + Math.abs(area2(p.vertices)) / 2, 0);
			const latticeArea = Math.abs(c.v1[0] * c.v2[1] - c.v2[0] * c.v1[1]);
			expect(total / latticeArea, t.label).toBeCloseTo(1, 9);
		}
	});

	/**
	 * And it still holds with curved edges: an edge bows into one tile exactly as much as it bows out
	 * of the neighbour that shares it, so the cell's total area is unchanged. This also pins that the
	 * flattened polyline is identical along both sides of a shared edge, including the reversed ones —
	 * if `rev` sampled the curve at different parameters, the two sides would disagree and leave slivers.
	 */
	it("keeps that exact area under edge curvature", () => {
		for (const t of available) {
			const c = buildCell({
				ih: t.ih,
				params: t.defaultParams,
				curves: curvesOf(t.edgeShapes.map((kind) => ({ kind, base: canonicalBase(kind), amount: 0.35 }))),
			})!;
			const total = c.polygons.reduce((s, p) => s + Math.abs(area2(p.vertices)) / 2, 0);
			const latticeArea = Math.abs(c.v1[0] * c.v2[1] - c.v2[0] * c.v1[1]);
			expect(total / latticeArea, t.label).toBeCloseTo(1, 6);
		}
	});

	it("takes the nc x nc supercell, because the colouring is not one-cell periodic", () => {
		for (const t of available) {
			const c = buildCell({
				ih: t.ih,
				params: t.defaultParams,
				curves: straightCurves(t.edgeShapes),
			})!;
			expect(c.tilesPerCell, t.label).toBe(t.numColours * t.numColours * t.numAspects);
			expect(c.v1[0], t.label).toBeCloseTo(t.numColours * c.t1.x, 12);
			expect(c.v2[1], t.label).toBeCloseTo(t.numColours * c.t2.y, 12);

			// The colouring IS periodic at nc, which is what makes this supercell the right one.
			const tiling = new IsohedralTiling(t.ih);
			const nc = t.numColours;
			for (let asp = 0; asp < t.numAspects; ++asp) {
				expect(tiling.getColour(0, 0, asp), t.label).toBe(tiling.getColour(nc, nc, asp));
				expect(tiling.getColour(1, 2, asp), t.label).toBe(tiling.getColour(1 + nc, 2 + nc, asp));
				expect(tiling.getColour(-1, 4, asp), t.label).toBe(tiling.getColour(-1 + nc, 4 - nc, asp));
			}

		}
	});

	/**
	 * How many types actually need the supercell, pinned.
	 *
	 * Most do: their colour depends on lattice position, so a one-cell mesh would repeat one colour
	 * onto tiles that touch. The other 32 carry all their colours on the aspects alone — IH07 has three
	 * aspects and three colours and its lattice permutations are the identity — so a single cell would
	 * serve there. buildCell uses nc × nc for everything anyway: the branch would save at most 96 of
	 * 108 tiles in a mesh uploaded once per parameter change, and a colouring rule that is right by
	 * construction beats one that is right per type.
	 */
	it("needs the supercell for 49 of the 81, and is harmless for the other 32", () => {
		let needsSupercell = 0;
		for (const t of available) {
			const tiling = new IsohedralTiling(t.ih);
			const nc = t.numColours;
			let varies = false;
			for (let i = 0; i < nc && !varies; ++i) {
				for (let j = 0; j < nc && !varies; ++j) {
					for (let asp = 0; asp < t.numAspects; ++asp) {
						if (tiling.getColour(i, j, asp) !== tiling.getColour(0, 0, asp)) {
							varies = true;
							break;
						}
					}
				}
			}
			if (varies) needsSupercell++;
		}
		expect(needsSupercell).toBe(49);
	});

	it("produces a mesh with the buffer sizes FlatCellRenderer expects", () => {
		for (const t of available) {
			const c = buildCell({
				ih: t.ih,
				params: t.defaultParams,
				curves: straightCurves(t.edgeShapes),
			})!;
			const verts = c.polygons.reduce((s, p) => s + p.vertices.length, 0);
			// Ear clipping: an n-gon yields n-2 triangles, so 3(n-2) vertices.
			const tris = c.polygons.reduce((s, p) => s + (p.vertices.length - 2), 0);
			expect(c.mesh.fillVertexCount, t.label).toBe(tris * 3);
			expect(c.mesh.fillHue.length, t.label).toBe(tris * 3);
			// One stroke quad (6 verts) per polygon edge.
			expect(c.mesh.strokeVertexCount, t.label).toBe(verts * 6);
			expect(c.mesh.pointVertexCount, t.label).toBe(0);
			expect(Math.abs(c.mesh.det), t.label).toBeGreaterThan(0);
			for (const k of ["aMin", "aMax", "bMin", "bMax"] as const) {
				expect(Number.isFinite(c.mesh.extent[k]), `${t.label} extent.${k}`).toBe(true);
			}
		}
	});

	it("frames a square box, since the renderer instances to any canvas aspect", () => {
		const t = isohedralType(1)!;
		const c = buildCell({ ih: 1, params: t.defaultParams, curves: straightCurves(t.edgeShapes) })!;
		expect(c.home.width).toBeCloseTo(c.home.height, 12);
		expect(c.home.cx).toBe(0);
		expect(c.home.cy).toBe(0);
	});

	it("scales the framed box with `periods` and leaves the cell alone", () => {
		const t = isohedralType(1)!;
		const mk = (periods?: number) =>
			buildCell({ ih: 1, params: t.defaultParams, curves: straightCurves(t.edgeShapes), periods })!;
		const small = mk(3);
		const large = mk(9);
		expect(large.home.width / small.home.width).toBeCloseTo(3, 9);
		// Only the framing moved. This is exactly why `periods` is not a user control: it duplicates the
		// wheel and cannot show more tiling, because the tiling is already unbounded.
		expect(large.tilesPerCell).toBe(small.tilesPerCell);
		expect(large.polygons).toEqual(small.polygons);
		// Omitting it uses HOME_PERIODS.
		expect(mk().home.width).toBeCloseTo(mk(HOME_PERIODS).home.width, 12);
	});

	it("keeps every cell polygon finite and non-degenerate at the defaults", () => {
		for (const t of available) {
			const c = buildCell({
				ih: t.ih,
				params: t.defaultParams,
				curves: straightCurves(t.edgeShapes),
			})!;
			expect(c, t.label).not.toBeNull();
			expect(c.tilesPerCell, t.label).toBeGreaterThan(0);
			expect(c.degenerate, t.label).toBe(false);
			expect(c.period, t.label).toBeGreaterThan(0);
			for (const poly of c.polygons) {
				expect(poly.vertices.length, t.label).toBe(t.numVertices);
				for (const v of poly.vertices) {
					expect(Number.isFinite(v.x) && Number.isFinite(v.y), t.label).toBe(true);
				}
			}
		}
	});

	it("uses exactly the type's colour count, so no two touching tiles match", () => {
		for (const t of available) {
			const c = buildCell({
				ih: t.ih,
				params: t.defaultParams,
				curves: straightCurves(t.edgeShapes),
			})!;
			const hues = new Set(c.polygons.map((p) => p.hue));
			expect(hues.size, t.label).toBe(t.numColours);
		}
	});

	it("moves the geometry when a parameter moves", () => {
		const t = isohedralType(1)!;
		const base = buildCell({
			ih: 1,
			params: t.defaultParams,
			curves: straightCurves(t.edgeShapes),
		})!;
		const moved = buildCell({
			ih: 1,
			params: [t.defaultParams[0] + 0.3, ...t.defaultParams.slice(1)],
			curves: straightCurves(t.edgeShapes),
		})!;
		expect(moved.tilingVertices).not.toEqual(base.tilingVertices);
	});
});
