import { describe, it, expect } from "vitest";
import {
	isHyperbolic,
	mirrorParams,
	panToB,
	mobius,
	mobiusInverse,
	su11Identity,
	su11Mul,
	su11Translation,
	su11Rotation,
	su11Apply,
	su11ApplyInverse,
	su11Normalize,
	su11Inverse,
	su11CrossEdge,
	su11Rebase,
	foldTileCenter,
	pickClickAnchor,
	wythoffFaces,
	schwarzCorners,
	wythoffVertex,
	tileHue,
	uniformDescriptor,
	wythoffFeet,
	hyperbolicUniformValues,
	snubData,
	hypCentroid,
	hyperbolicFeaturePoints,
	MAX_FEATURE_POINTS,
	islamicStrap,
	islamicStrapSegments,
	strapReflect,
	type Complex,
	type Rings,
	type WythoffSpec,
} from "@/lib/render/hyperbolic";

// Reference values from the verified (2,p,q) Schwarz-triangle geometry, computed independently to
// 9 digits. {6,4} lands on clean √2−1 / √2 / 1, the load-bearing sanity anchor. Note {5,4}/{4,5}
// share r_c and swap edgeA/edgeRho — the p↔q duality.
const REF = [
	{ p: 6, q: 4, rIn: 0.414213562, edgeA: 1.414213562, edgeRho: 1.0, rC: 0.51763809 },
	{ p: 7, q: 3, rIn: 0.266077245, edgeA: 2.012192173, edgeRho: 1.746114927, rC: 0.300742619 },
	{ p: 8, q: 3, rIn: 0.364566859, edgeA: 1.553773974, edgeRho: 1.189207115, rC: 0.405616401 },
	{ p: 5, q: 4, rIn: 0.303558659, edgeA: 1.79890744, edgeRho: 1.495348781, rC: 0.397975427 },
	{ p: 4, q: 5, rIn: 0.259263587, edgeA: 2.058171027, edgeRho: 1.79890744, rC: 0.397975427 },
];

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe("isHyperbolic", () => {
	it("is true iff 1/p + 1/q < 1/2", () => {
		expect(isHyperbolic(7, 3)).toBe(true);
		expect(isHyperbolic(4, 5)).toBe(true);
		expect(isHyperbolic(8, 3)).toBe(true);
		expect(isHyperbolic(5, 4)).toBe(true);
		expect(isHyperbolic(4, 4)).toBe(false); // Euclidean (== 1/2)
		expect(isHyperbolic(3, 6)).toBe(false); // Euclidean
		expect(isHyperbolic(3, 3)).toBe(false); // spherical
	});
});

describe("mirrorParams", () => {
	for (const r of REF) {
		it(`matches the reference table for {${r.p},${r.q}}`, () => {
			const m = mirrorParams(r.p, r.q);
			expect(near(m.rIn, r.rIn)).toBe(true);
			expect(near(m.edgeA, r.edgeA)).toBe(true);
			expect(near(m.edgeRho, r.edgeRho)).toBe(true);
			if (r.rC != null) expect(near(m.rC, r.rC)).toBe(true);
		});
	}

	it("satisfies the orthogonal-circle identities a²=ρ²+1 and a−ρ=r_in", () => {
		for (const r of REF) {
			const m = mirrorParams(r.p, r.q);
			expect(near(m.edgeA * m.edgeA - m.edgeRho * m.edgeRho, 1)).toBe(true);
			expect(near(m.edgeA - m.edgeRho, m.rIn)).toBe(true);
			expect(m.rC).toBeGreaterThan(m.rIn);
		}
	});

	it("throws on non-hyperbolic {p,q} rather than returning NaN", () => {
		expect(() => mirrorParams(4, 4)).toThrow();
		expect(() => mirrorParams(3, 3)).toThrow();
	});
});

describe("panToB", () => {
	it("compresses offset magnitude via tanh and preserves direction", () => {
		const b = panToB({ x: 100, y: 0 }, 100, 1); // |offset|/(κR) = 1
		expect(near(Math.hypot(b.x, b.y), Math.tanh(1))).toBe(true);
		expect(b.y).toBe(0);
		expect(b.x).toBeGreaterThan(0);
	});

	it("maps zero offset to the origin", () => {
		const b = panToB({ x: 0, y: 0 }, 100, 1);
		expect(b.x).toBe(0);
		expect(b.y).toBe(0);
	});

	it("stays strictly inside the unit disk for arbitrarily large offset", () => {
		const b = panToB({ x: 1e9, y: -1e9 }, 100, 1);
		expect(Math.hypot(b.x, b.y)).toBeLessThan(1);
	});
});

describe("SU(1,1) view isometries", () => {
	it("identity is a no-op", () => {
		const z = { x: 0.3, y: -0.2 };
		const w = su11Apply(su11Identity(), z);
		expect(near(w.x, z.x)).toBe(true);
		expect(near(w.y, z.y)).toBe(true);
	});

	it("translation maps 0 → delta and its inverse maps delta → 0", () => {
		const delta = { x: 0.25, y: -0.1 };
		const T = su11Translation(delta);
		const at0 = su11Apply(T, { x: 0, y: 0 });
		expect(near(at0.x, delta.x)).toBe(true);
		expect(near(at0.y, delta.y)).toBe(true);
		const back = su11ApplyInverse(T, delta);
		expect(near(back.x, 0)).toBe(true);
		expect(near(back.y, 0)).toBe(true);
	});

	it("rotation maps z → e^{iθ}·z", () => {
		const R = su11Rotation(0.6);
		const w = su11Apply(R, { x: 0.5, y: 0 });
		expect(near(w.x, 0.5 * Math.cos(0.6))).toBe(true);
		expect(near(w.y, 0.5 * Math.sin(0.6))).toBe(true);
	});

	it("multiplication composes: apply(mul(m,n),z) = apply(m, apply(n,z))", () => {
		const m = su11Translation({ x: 0.2, y: 0.1 });
		const n = su11Rotation(0.4);
		const z = { x: -0.3, y: 0.15 };
		const a = su11Apply(su11Mul(m, n), z);
		const b = su11Apply(m, su11Apply(n, z));
		expect(near(a.x, b.x)).toBe(true);
		expect(near(a.y, b.y)).toBe(true);
	});

	it("apply/applyInverse round-trip and stay in the disk", () => {
		let m = su11Identity();
		for (const d of [{ x: 0.1, y: 0 }, { x: 0, y: 0.1 }, { x: -0.05, y: 0.08 }]) {
			m = su11Mul(su11Translation(d), m);
		}
		m = su11Normalize(m);
		const z = { x: 0.4, y: -0.3 };
		const back = su11ApplyInverse(m, su11Apply(m, z));
		expect(near(back.x, z.x, 1e-9)).toBe(true);
		expect(near(back.y, z.y, 1e-9)).toBe(true);
		expect(Math.hypot(su11Apply(m, z).x, su11Apply(m, z).y)).toBeLessThan(1);
	});

	it("normalize restores det = |a|²−|b|² = 1", () => {
		const m = su11Normalize({ a: { x: 2, y: 0 }, b: { x: 1, y: 0 } });
		expect(near(m.a.x * m.a.x + m.a.y * m.a.y - (m.b.x * m.b.x + m.b.y * m.b.y), 1)).toBe(true);
	});
});

describe("su11Inverse", () => {
	it("inverts: mul(m, inverse(m)) = identity", () => {
		const m = su11Normalize(su11Mul(su11Translation({ x: 0.3, y: -0.2 }), su11Rotation(0.5)));
		const prod = su11Mul(m, su11Inverse(m));
		expect(near(prod.a.x, 1)).toBe(true);
		expect(near(prod.a.y, 0)).toBe(true);
		expect(near(prod.b.x, 0)).toBe(true);
		expect(near(prod.b.y, 0)).toBe(true);
	});
});

describe("su11CrossEdge (edge-crossing symmetry)", () => {
	it("is a unit SU(1,1) element that sends the origin to the +x neighbour centre 1/edgeA", () => {
		const { edgeA, edgeRho } = mirrorParams(7, 3);
		const cross = su11CrossEdge(edgeA, edgeRho);
		expect(near(cross.a.x * cross.a.x + cross.a.y * cross.a.y - (cross.b.x * cross.b.x + cross.b.y * cross.b.y), 1)).toBe(true);
		const img = su11Apply(cross, { x: 0, y: 0 });
		expect(near(img.x, 1 / edgeA)).toBe(true);
		expect(near(img.y, 0)).toBe(true);
	});
});

describe("su11Rebase (keeps the view bounded under unlimited panning)", () => {
	it("re-bases a far-panned view so the screen-centre world point sits in the central tile", () => {
		const { rC, edgeA, edgeRho } = mirrorParams(7, 3);
		// Compose many translations to pan far toward the boundary.
		let view = su11Identity();
		for (let i = 0; i < 60; i++) view = su11Normalize(su11Mul(su11Translation({ x: 0.2, y: 0.05 }), view));
		const wBefore = su11ApplyInverse(view, { x: 0, y: 0 });
		expect(Math.hypot(wBefore.x, wBefore.y)).toBeGreaterThan(0.99); // pinned near the boundary
		const { view: rebased } = su11Rebase(view, 7, edgeA, edgeRho);
		const wAfter = su11ApplyInverse(rebased, { x: 0, y: 0 });
		expect(Math.hypot(wAfter.x, wAfter.y)).toBeLessThanOrEqual(rC + 1e-6); // now inside the central tile
	});

	it("leaves an already-centred view unchanged (identity → identity)", () => {
		const { edgeA, edgeRho } = mirrorParams(4, 5);
		const { view, steps } = su11Rebase(su11Identity(), 4, edgeA, edgeRho);
		expect(steps).toBe(0);
		expect(near(view.a.x, 1)).toBe(true);
		expect(near(Math.hypot(view.b.x, view.b.y), 0)).toBe(true);
	});
});

describe("foldTileCenter", () => {
	it("maps the origin and a neighbour centre to themselves (they are tile centres)", () => {
		const { edgeA, edgeRho } = mirrorParams(7, 3);
		const o = foldTileCenter({ x: 0, y: 0 }, 7, edgeA, edgeRho);
		expect(near(o.x, 0)).toBe(true);
		expect(near(o.y, 0)).toBe(true);
		const n = foldTileCenter({ x: 1 / edgeA, y: 0 }, 7, edgeA, edgeRho);
		expect(near(n.x, 1 / edgeA)).toBe(true);
		expect(near(n.y, 0)).toBe(true);
	});

	it("is idempotent: folding a point, then its tile centre, gives the same centre", () => {
		const { edgeA, edgeRho } = mirrorParams(4, 5);
		const w = { x: 0.55, y: 0.15 };
		const c1 = foldTileCenter(w, 4, edgeA, edgeRho);
		const c2 = foldTileCenter(c1, 4, edgeA, edgeRho);
		expect(near(c1.x, c2.x, 1e-7)).toBe(true);
		expect(near(c1.y, c2.y, 1e-7)).toBe(true);
		expect(Math.hypot(c1.x, c1.y)).toBeLessThan(1);
	});
});

describe("pickClickAnchor (snap to centroid / vertex / edge midpoint)", () => {
	// Regular {5,4}: the generalized snapper must reduce exactly to the old regular-{p,q} behaviour — the
	// p-gon centre O, the p vertices at r_c (angle π/p), and the p edge midpoints at r_in (on +x).
	const p = 5, q = 4;
	const { rIn, rC } = mirrorParams(p, q);
	const gReg = hyperbolicUniformValues({ p, q, rings: [true, false, false] });

	it("snaps a central click to the tile centroid", () => {
		const a = pickClickAnchor({ x: 0.02, y: -0.01 }, gReg);
		expect(near(a.x, 0, 1e-6)).toBe(true);
		expect(near(a.y, 0, 1e-6)).toBe(true);
	});

	it("snaps a click near a vertex to that vertex (circumradius r_c at angle π/p)", () => {
		const va = Math.PI / p;
		const vertex = { x: rC * Math.cos(va), y: rC * Math.sin(va) };
		const near95 = { x: vertex.x * 0.95, y: vertex.y * 0.95 };
		const a = pickClickAnchor(near95, gReg);
		expect(near(a.x, vertex.x, 1e-6)).toBe(true);
		expect(near(a.y, vertex.y, 1e-6)).toBe(true);
	});

	it("snaps a click near an edge midpoint to that midpoint (inradius r_in on +x)", () => {
		const mid = { x: rIn, y: 0 };
		const a = pickClickAnchor({ x: rIn * 0.96, y: 0.01 }, gReg);
		expect(near(a.x, mid.x, 1e-6)).toBe(true);
		expect(near(a.y, mid.y, 1e-6)).toBe(true);
	});

	// Uniform tiling with THREE distinct tiles: rhombi {7,3} = heptagon (O) · triangle (V) · square (E).
	// The regular snapper offered none of the V/E centroids nor the between-different-tiles edge midpoints.
	describe("multi-tile (rhombitri {7,3}: heptagon O, triangle V, square E)", () => {
		const rings: Rings = [true, false, true];
		const g = hyperbolicUniformValues({ p: 7, q: 3, rings });
		const feet = wythoffFeet(7, 3, rings);

		it("snaps to the q-gon (triangle) centroid at corner V", () => {
			const V = g.cornerV;
			const a = pickClickAnchor({ x: V.x * 0.97, y: V.y * 0.97 }, g);
			expect(near(a.x, V.x, 1e-6)).toBe(true);
			expect(near(a.y, V.y, 1e-6)).toBe(true);
		});

		it("snaps to the square centroid at corner E", () => {
			const E = { x: g.rIn, y: 0 };
			const a = pickClickAnchor({ x: E.x * 0.985, y: 0.004 }, g);
			expect(near(a.x, E.x, 1e-6)).toBe(true);
			expect(near(a.y, E.y, 1e-6)).toBe(true);
		});

		it("snaps to the halfway point of the heptagon|square edge (foot on mirror A)", () => {
			// footA is the midpoint of the O|E edge — the boundary between two DIFFERENT tiles (heptagon, square).
			const fA = feet.fA;
			expect(Math.hypot(fA.x - g.wythoff.x, fA.y - g.wythoff.y)).toBeGreaterThan(1e-3); // it is a real edge
			const click = { x: fA.x + (g.wythoff.x - fA.x) * 0.06, y: fA.y + (g.wythoff.y - fA.y) * 0.06 };
			const a = pickClickAnchor(click, g);
			expect(near(a.x, fA.x, 1e-6)).toBe(true);
			expect(near(a.y, fA.y, 1e-6)).toBe(true);
		});

		it("snaps to a real tiling vertex (the Wythoff-vertex orbit)", () => {
			const W = g.wythoff;
			const a = pickClickAnchor({ x: W.x * 0.97, y: W.y * 0.97 }, g);
			expect(near(a.x, W.x, 1e-6)).toBe(true);
			expect(near(a.y, W.y, 1e-6)).toBe(true);
		});
	});
});

describe("mobius / mobiusInverse (disk automorphisms)", () => {
	const b: Complex = { x: 0.3, y: -0.15 };
	const theta = 0.7;

	it("round-trips: mobiusInverse ∘ mobius = id", () => {
		for (const z of [
			{ x: 0, y: 0 },
			{ x: 0.4, y: 0.2 },
			{ x: -0.6, y: 0.1 },
		]) {
			const back = mobiusInverse(mobius(z, b, theta), b, theta);
			expect(near(back.x, z.x, 1e-9)).toBe(true);
			expect(near(back.y, z.y, 1e-9)).toBe(true);
		}
	});

	it("maps the origin to e^{iθ}·b", () => {
		const w = mobius({ x: 0, y: 0 }, b, theta);
		const c = Math.cos(theta), s = Math.sin(theta);
		expect(near(w.x, c * b.x - s * b.y)).toBe(true);
		expect(near(w.y, s * b.x + c * b.y)).toBe(true);
	});

	it("maps the unit disk into itself", () => {
		for (const z of [
			{ x: 0.9, y: 0 },
			{ x: -0.5, y: 0.5 },
			{ x: 0, y: 0.99 },
		]) {
			expect(Math.hypot(...Object.values(mobius(z, b, theta)) as [number, number])).toBeLessThan(1);
		}
	});
});

describe("wythoffFaces (per-corner face sizes)", () => {
	// [group p, q, rings, expected {O,V,E} face sizes, name]
	const CASES: Array<[number, number, Rings, [number, number, number], string]> = [
		[7, 3, [true, true, false], [14, 3, 0], "t{7,3}=3.14.14"],
		[7, 3, [false, true, false], [7, 3, 0], "r{7,3}=3.7.3.7"],
		[7, 3, [false, true, true], [7, 6, 0], "t{3,7}=6.6.7"],
		[7, 3, [true, false, true], [7, 3, 4], "rr{7,3}=3.4.7.4"],
		[7, 3, [true, true, true], [14, 6, 4], "tr{7,3}=4.6.14"],
		[8, 3, [true, true, true], [16, 6, 4], "tr{8,3}=4.6.16"],
		[5, 4, [true, true, false], [10, 4, 0], "t{5,4}=4.10.10"],
		[5, 4, [false, true, false], [5, 4, 0], "r{5,4}=4.5.4.5"],
		[5, 4, [false, true, true], [5, 8, 0], "t{4,5}=5.8.8"],
		[5, 4, [true, false, true], [5, 4, 4], "rr{5,4}=4.4.5.4"],
		[5, 4, [true, true, true], [10, 8, 4], "tr{5,4}=4.8.10"],
		[7, 3, [true, false, false], [7, 0, 0], "{7,3} regular"],
	];
	for (const [p, q, rings, expected, name] of CASES) {
		it(`derives ${name}`, () => {
			const f = wythoffFaces(p, q, rings);
			expect([f.nO, f.nV, f.nE]).toEqual(expected);
		});
	}
	it("distinct nonzero sizes match the vertex config's distinct polygons", () => {
		const f = wythoffFaces(7, 3, [true, false, true]); // 3.4.7.4 → {3,4,7}
		const distinct = new Set([f.nO, f.nV, f.nE].filter((n) => n > 0));
		expect(distinct).toEqual(new Set([7, 3, 4]));
	});
});

describe("schwarzCorners", () => {
	it("places O at the origin, E on +x at rIn, V at circumradius/angle π/p", () => {
		const { rIn, rC } = mirrorParams(7, 3);
		const { O, V, E } = schwarzCorners(7, 3);
		expect(near(O.x, 0) && near(O.y, 0)).toBe(true);
		expect(near(E.x, rIn) && near(E.y, 0)).toBe(true);
		expect(near(V.x, rC * Math.cos(Math.PI / 7))).toBe(true);
		expect(near(V.y, rC * Math.sin(Math.PI / 7))).toBe(true);
	});
});

describe("wythoffVertex", () => {
	const onRealAxis = (z: Complex) => near(z.y, 0, 1e-6);
	const onDiameter = (z: Complex, ang: number) => near(z.x * Math.sin(ang) - z.y * Math.cos(ang), 0, 1e-6);
	const onEdgeCircle = (z: Complex, a: number, rho: number) => near(Math.hypot(z.x - a, z.y) - rho, 0, 1e-5);

	it("rectified [0,1,0] sits at the edge midpoint E", () => {
		const { rIn } = mirrorParams(7, 3);
		const w = wythoffVertex(7, 3, [false, true, false]);
		expect(near(w.x, rIn) && near(w.y, 0)).toBe(true);
	});
	it("truncated [1,1,0] lies on the edge circle and the π/2p bisector", () => {
		const { edgeA, edgeRho } = mirrorParams(7, 3);
		const w = wythoffVertex(7, 3, [true, true, false]);
		expect(onEdgeCircle(w, edgeA, edgeRho)).toBe(true);
		expect(onDiameter(w, Math.PI / (2 * 7))).toBe(true);
	});
	it("trunc-dual [0,1,1] lies on the real axis (mirror A) and inside the disk", () => {
		const w = wythoffVertex(7, 3, [false, true, true]);
		expect(onRealAxis(w)).toBe(true);
		expect(Math.hypot(w.x, w.y)).toBeLessThan(1);
	});
	it("rhombi [1,0,1] lies on the π/p diameter (mirror B)", () => {
		const w = wythoffVertex(7, 3, [true, false, true]);
		expect(onDiameter(w, Math.PI / 7)).toBe(true);
	});
	it("omnitruncated [1,1,1] lies strictly inside T, off all three mirrors", () => {
		const { edgeA, edgeRho } = mirrorParams(7, 3);
		const w = wythoffVertex(7, 3, [true, true, true]);
		expect(onRealAxis(w)).toBe(false);
		expect(onDiameter(w, Math.PI / 7)).toBe(false);
		expect(onEdgeCircle(w, edgeA, edgeRho)).toBe(false);
		expect(Math.hypot(w.x, w.y)).toBeLessThan(1);
	});

	// Incenter: the generating vertex must be EQUIDISTANT from the three mirrors, and inside the Schwarz
	// triangle (bounded by A: y≥0, B: below the π/p diameter, C: origin side of the edge circle). A weaker
	// "off all mirrors" check silently accepted a diverged point outside T — this pins the real property.
	for (const [p, q] of [[7, 3], [8, 3], [5, 4]] as Array<[number, number]>) {
		it(`omnitruncated [1,1,1] {${p},${q}} incenter is equidistant from A,B,C and inside T`, () => {
			const { edgeA, edgeRho, rIn } = mirrorParams(p, q);
			const w = wythoffVertex(p, q, [true, true, true]);
			// distances to the three mirrors, via the half-reflection-distance identity.
			const half = (u: Complex, v: Complex) => {
				const dx = u.x - v.x, dy = u.y - v.y;
				const du = 1 - (u.x * u.x + u.y * u.y), dv = 1 - (v.x * v.x + v.y * v.y);
				return 0.5 * Math.acosh(1 + (2 * (dx * dx + dy * dy)) / (du * dv));
			};
			const refDia = (z: Complex, ang: number) => ({ x: Math.cos(2 * ang) * z.x + Math.sin(2 * ang) * z.y, y: Math.sin(2 * ang) * z.x - Math.cos(2 * ang) * z.y });
			const refCir = (z: Complex) => { const dx = z.x - edgeA, d2 = dx * dx + z.y * z.y; const k = (edgeRho * edgeRho) / d2; return { x: edgeA + k * dx, y: k * z.y }; };
			const dA = half(w, refDia(w, 0)), dB = half(w, refDia(w, Math.PI / p)), dC = half(w, refCir(w));
			expect(Math.abs(dA - dB)).toBeLessThan(1e-3);
			expect(Math.abs(dB - dC)).toBeLessThan(1e-3);
			// inside T
			expect(w.y).toBeGreaterThan(0); // above mirror A (the x-axis)
			expect(w.x * Math.sin(Math.PI / p) - w.y * Math.cos(Math.PI / p)).toBeGreaterThan(0); // inside the π/p wedge
			expect(Math.hypot(w.x - edgeA, w.y)).toBeGreaterThan(edgeRho); // origin side of edge circle
			void rIn;
		});
	}
});

describe("tileHue + uniformDescriptor", () => {
	it("gives a stable, distinct hue per polygon side count", () => {
		expect(tileHue(3)).toBe(tileHue(3));
		expect(tileHue(3)).not.toBe(tileHue(4));
		expect(tileHue(14)).toBeGreaterThanOrEqual(0);
		expect(tileHue(14)).toBeLessThan(360);
	});
	it("descriptor lists the tile types with hues and a valid Wythoff vertex", () => {
		const d = uniformDescriptor(7, 3, [true, true, true]); // 4.6.14
		const sizes = d.tiles.map((t) => t.sides).sort((a, b) => a - b);
		expect(sizes).toEqual([4, 6, 14]);
		expect(d.tiles.find((t) => t.sides === 4)!.corner).toBe("E");
		expect(Math.hypot(d.wythoff.x, d.wythoff.y)).toBeLessThan(1);
	});
});

describe("wythoffFeet", () => {
	// A foot must lie on its mirror: on A (y=0), on B (π/p diameter), on C (edge circle).
	const onA = (z: Complex) => near(z.y, 0, 1e-6);
	const onB = (z: Complex, p: number) => near(z.x * Math.sin(Math.PI / p) - z.y * Math.cos(Math.PI / p), 0, 1e-6);
	const onC = (z: Complex, a: number, rho: number) => near(Math.hypot(z.x - a, z.y) - rho, 0, 1e-5);

	it("omnitruncated [1,1,1] feet lie on their mirrors and inside the disk", () => {
		const { edgeA, edgeRho } = mirrorParams(7, 3);
		const { fA, fB, fC } = wythoffFeet(7, 3, [true, true, true]);
		expect(onA(fA)).toBe(true);
		expect(onB(fB, 7)).toBe(true);
		expect(onC(fC, edgeA, edgeRho)).toBe(true);
		for (const f of [fA, fB, fC]) expect(Math.hypot(f.x, f.y)).toBeLessThan(1);
	});
	it("rhombi [1,0,1] foot on B coincides with W (W already on mirror B ⇒ degenerate O|V edge)", () => {
		const w = uniformDescriptor(7, 3, [true, false, true]).wythoff;
		const { fB } = wythoffFeet(7, 3, [true, false, true]);
		expect(near(fB.x, w.x, 1e-5) && near(fB.y, w.y, 1e-5)).toBe(true);
	});
});

describe("snubData (chiral snub generating vertex)", () => {
	const hyp = (u: Complex, v: Complex) => {
		const dx = u.x - v.x, dy = u.y - v.y, du = 1 - (u.x * u.x + u.y * u.y), dv = 1 - (v.x * v.x + v.y * v.y);
		return Math.acosh(1 + (2 * (dx * dx + dy * dy)) / (du * dv));
	};
	for (const [p, q] of [[7, 3], [8, 3], [5, 4]] as Array<[number, number]>) {
		it(`sr{${p},${q}}: p-gon, q-gon and snub-triangle edges are all equal`, () => {
			const d = snubData(p, q);
			const Lp = hyp(d.s, d.as); // p-gon edge (s to a·s)
			const Lq = hyp(d.s, d.bs); // q-gon edge (s to b·s)
			const Lt = hyp(d.as, d.bis); // snub-triangle third edge (a·s to b⁻¹·s)
			expect(Math.abs(Lp - Lq)).toBeLessThan(1e-4);
			expect(Math.abs(Lp - Lt)).toBeLessThan(1e-4);
			expect(Math.abs(Lp - d.edge)).toBeLessThan(1e-9);
			// s is off the mirrors (chiral): not on the real axis, inside the disk.
			expect(Math.abs(d.s.y)).toBeGreaterThan(1e-3);
			expect(Math.hypot(d.s.x, d.s.y)).toBeLessThan(1);
		});
	}
});

describe("hypCentroid (Klein-model average)", () => {
	it("returns the point itself for a singleton", () => {
		const c = hypCentroid([{ x: 0.3, y: -0.2 }]);
		expect(near(c.x, 0.3, 1e-9)).toBe(true);
		expect(near(c.y, -0.2, 1e-9)).toBe(true);
	});

	it("puts the average of a mirror-symmetric pair on the axis of symmetry", () => {
		const c = hypCentroid([{ x: 0.4, y: 0.25 }, { x: 0.4, y: -0.25 }]);
		expect(near(c.y, 0, 1e-9)).toBe(true);
		expect(c.x).toBeGreaterThan(0); // between the two points, off the origin
		expect(Math.hypot(c.x, c.y)).toBeLessThan(1);
	});

	it("keeps a triangle centroid strictly inside the disk", () => {
		const tri = [{ x: 0.5, y: 0.1 }, { x: 0.2, y: 0.6 }, { x: -0.3, y: 0.2 }];
		const c = hypCentroid(tri);
		expect(Math.hypot(c.x, c.y)).toBeLessThan(1);
	});
});

describe("hyperbolicFeaturePoints (fundamental-frame markers for the points overlay)", () => {
	const inDisk = (pts: { pos: Complex }[]) => pts.every((f) => Math.hypot(f.pos.x, f.pos.y) < 1);
	const byKind = (pts: { pos: Complex; kind: number }[], k: number) => pts.filter((f) => f.kind === k);

	it("regular {5,4}: one centroid at O, the vertex orbit, one edge midpoint at (rIn,0)", () => {
		const p = 5, q = 4;
		const { rIn, rC } = mirrorParams(p, q);
		const g = hyperbolicUniformValues({ p, q, rings: [true, false, false] });
		const pts = hyperbolicFeaturePoints(g);

		expect(inDisk(pts)).toBe(true);
		expect(pts.length).toBeLessThanOrEqual(MAX_FEATURE_POINTS);

		const centroids = byKind(pts, 0);
		expect(centroids.length).toBe(1);
		expect(near(centroids[0].pos.x, 0, 1e-9) && near(centroids[0].pos.y, 0, 1e-9)).toBe(true);

		const edges = byKind(pts, 1);
		expect(edges.length).toBe(1); // fA = E = (rIn,0); fB, fC coincide with W and carry no edge
		expect(near(edges[0].pos.x, rIn, 1e-6) && near(edges[0].pos.y, 0, 1e-6)).toBe(true);

		const verts = byKind(pts, 2);
		const va = Math.PI / p;
		const vx = rC * Math.cos(va), vy = rC * Math.sin(va);
		expect(verts.length).toBe(2); // W and its ±y mirror
		expect(verts.every((f) => near(Math.abs(f.pos.x), vx, 1e-6) && near(Math.abs(f.pos.y), vy, 1e-6))).toBe(true);
		expect(verts.some((f) => f.pos.y > 0) && verts.some((f) => f.pos.y < 0)).toBe(true);
	});

	it("rhombitri {7,3}: centroids at all three occupied corners, all three kinds present", () => {
		const g = hyperbolicUniformValues({ p: 7, q: 3, rings: [true, false, true] });
		const pts = hyperbolicFeaturePoints(g);

		expect(inDisk(pts)).toBe(true);
		expect(pts.length).toBeLessThanOrEqual(MAX_FEATURE_POINTS);
		expect(byKind(pts, 0).length).toBeGreaterThan(0);
		expect(byKind(pts, 1).length).toBeGreaterThan(0);
		expect(byKind(pts, 2).length).toBeGreaterThan(0);

		const centroids = byKind(pts, 0);
		const has = (x: number, y: number) => centroids.some((f) => near(f.pos.x, x, 1e-6) && near(f.pos.y, y, 1e-6));
		expect(has(0, 0)).toBe(true); // O — heptagon
		expect(has(g.rIn, 0)).toBe(true); // E — square
		expect(centroids.some((f) => near(Math.abs(f.pos.x), Math.abs(g.cornerV.x), 1e-6) && near(Math.abs(f.pos.y), Math.abs(g.cornerV.y), 1e-6))).toBe(true); // V — triangle
	});

	it("snub sr{7,3}: all three kinds, vertices include the snub point, within the cap", () => {
		const g = hyperbolicUniformValues({ p: 7, q: 3, rings: [true, true, true], snub: true });
		const pts = hyperbolicFeaturePoints(g);

		expect(inDisk(pts)).toBe(true);
		expect(pts.length).toBeLessThanOrEqual(MAX_FEATURE_POINTS);
		expect(byKind(pts, 0).length).toBeGreaterThan(0);
		expect(byKind(pts, 1).length).toBeGreaterThan(0);
		expect(byKind(pts, 2).length).toBeGreaterThan(0);

		const s = g.snub!.s;
		expect(byKind(pts, 2).some((f) => near(f.pos.x, s.x, 1e-9) && near(f.pos.y, s.y, 1e-9))).toBe(true);
	});
});

describe("islamicStrap (regular {p,q} polygons-in-contact segment)", () => {
	// P on the O–V diameter (mirror B, angle π/p): x·sin − y·cos = 0.
	const onDiameter = (z: Complex, ang: number) => near(z.x * Math.sin(ang) - z.y * Math.cos(ang), 0, 1e-6);

	for (const [p, q] of [[7, 3], [8, 3], [5, 4], [6, 4]] as Array<[number, number]>) {
		it(`{${p},${q}}: E is the edge midpoint (rIn, 0)`, () => {
			const { rIn } = mirrorParams(p, q);
			const { E } = islamicStrap(p, q, 45);
			expect(near(E.x, rIn) && near(E.y, 0)).toBe(true);
		});

		it(`{${p},${q}}: slider 0° ⇒ tip at the vertex V (original tiling)`, () => {
			const { V } = schwarzCorners(p, q);
			const { P } = islamicStrap(p, q, 0);
			expect(near(P.x, V.x, 1e-6) && near(P.y, V.y, 1e-6)).toBe(true);
		});

		it(`{${p},${q}}: slider 90° ⇒ tip at the centre O (dual tiling)`, () => {
			const { P } = islamicStrap(p, q, 90);
			expect(near(P.x, 0) && near(P.y, 0)).toBe(true);
		});

		it(`{${p},${q}}: interior slider ⇒ tip on the O–V mirror, strictly between O and V`, () => {
			const { rC } = mirrorParams(p, q);
			for (const slider of [20, 45, 70]) {
				const { P } = islamicStrap(p, q, slider);
				expect(onDiameter(P, Math.PI / p)).toBe(true);
				const r = Math.hypot(P.x, P.y);
				expect(r).toBeGreaterThan(0);       // off the centre
				expect(r).toBeLessThan(rC + 1e-9);   // not past the vertex
				expect(r).toBeLessThan(1);           // inside the disk
			}
		});

		it(`{${p},${q}}: the tip retracts monotonically toward O as the slider opens 0°→90°`, () => {
			const radii = [0, 30, 60, 90].map((s) => {
				const { P } = islamicStrap(p, q, s);
				return Math.hypot(P.x, P.y);
			});
			for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeLessThan(radii[i - 1]);
		});
	}
});

describe("islamicStrapSegments (uniform + snub strapwork)", () => {
	const R: Rings = [true, false, false];
	const near2 = (a: Complex, b: Complex, eps = 1e-5) => Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;

	it("regular {p,q} [1,0,0]: islamicStrap's segment plus its mirror-A twin", () => {
		for (const [p, q] of [[7, 3], [5, 4], [8, 3]] as Array<[number, number]>) {
			for (const slider of [20, 45, 70]) {
				const segs = islamicStrapSegments({ p, q, rings: R }, slider);
				// The fundamental segment E→P, followed by its real-axis (mirror-A) twin. The shader tests z
				// directly (no |z.y| fold), so both mates are emitted; E lies on the axis so E == mirror(E).
				expect(segs.length).toBe(2);
				const { E, P } = islamicStrap(p, q, slider);
				expect(near2(segs[0].a, E)).toBe(true);
				expect(near2(segs[0].b, P)).toBe(true);
				expect(near2(segs[1].a, { x: E.x, y: -E.y })).toBe(true);
				expect(near2(segs[1].b, { x: P.x, y: -P.y })).toBe(true);
			}
		}
	});

	it("strapReflect: false for all — segments are expressed in the full kite, tested as z", () => {
		expect(strapReflect({ p: 7, q: 3, rings: R })).toBe(false);
		expect(strapReflect({ p: 7, q: 3, rings: [false, true, false] })).toBe(false);
		expect(strapReflect({ p: 7, q: 3, rings: [true, true, true], snub: true })).toBe(false);
	});

	// Uniform tilings: every segment start sits on a wythoff foot (edge midpoint) at offset 0, and every
	// segment stays inside the disk. Continuity: each present foot is the start of ≥1 segment.
	for (const rings of [[false, true, false], [true, true, false], [true, false, true], [true, true, true]] as Rings[]) {
		const spec: WythoffSpec = { p: 7, q: 3, rings };
		it(`{7,3} rings ${rings.map(Number).join("")}: non-empty, all segments in-disk`, () => {
			const segs = islamicStrapSegments(spec, 45);
			expect(segs.length).toBeGreaterThan(0);
			for (const seg of segs) {
				expect(Math.hypot(seg.a.x, seg.a.y)).toBeLessThan(1);
				expect(Math.hypot(seg.b.x, seg.b.y)).toBeLessThan(1);
			}
		});
	}

	it("{7,3} omnitruncated [1,1,1]: 3 feet × … segments; slider 0 pushes tips to tile vertices (W)", () => {
		const spec: WythoffSpec = { p: 7, q: 3, rings: [true, true, true] };
		// At slider 0 the strap tips (segment.b) collapse onto the shared vertex W (original tiling); the
		// segments become degenerate (start ≈ end near W). At slider 90 tips reach the tile centres.
		const s0 = islamicStrapSegments(spec, 0);
		const s90 = islamicStrapSegments(spec, 90);
		// 3 regions × 2 feet = 6 fundamental segments, each with its mirror-A twin ⇒ 12.
		expect(s0.length).toBe(12);
		expect(s90.length).toBe(12);
		// slider 90: every tip lands at a region centre O/V/E — or, for a mirror-A twin, the reflected V.
		const V = schwarzCorners(7, 3).V;
		const centres: Complex[] = [{ x: 0, y: 0 }, V, { x: V.x, y: -V.y }, { x: mirrorParams(7, 3).rIn, y: 0 }];
		for (const seg of s90) {
			const hitsCentre = centres.some((c) => Math.hypot(seg.b.x - c.x, seg.b.y - c.y) < 1e-4);
			expect(hitsCentre).toBe(true);
		}
	});

	it("edge offset slides the contact off the foot but keeps the segment count", () => {
		const spec: WythoffSpec = { p: 7, q: 3, rings: [true, true, true] };
		const base = islamicStrapSegments(spec, 45, 0);
		const shifted = islamicStrapSegments(spec, 45, 40);
		expect(shifted.length).toBe(base.length);
		// Every contact moved (two-point family): no shifted start coincides with its unshifted start.
		let moved = 0;
		for (let i = 0; i < base.length; i++) if (!near2(base[i].a, shifted[i].a, 1e-4)) moved++;
		expect(moved).toBe(base.length);
	});

	it("snub sr{7,3} produces a non-empty, in-disk segment set within the shader cap", () => {
		const spec: WythoffSpec = { p: 7, q: 3, rings: [true, true, true], snub: true };
		const segs = islamicStrapSegments(spec, 45);
		expect(segs.length).toBeGreaterThan(0);
		expect(segs.length).toBeLessThanOrEqual(32); // MAX_STRAP
		for (const seg of segs) {
			expect(Math.hypot(seg.a.x, seg.a.y)).toBeLessThan(1);
			expect(Math.hypot(seg.b.x, seg.b.y)).toBeLessThan(1);
		}
	});
});
