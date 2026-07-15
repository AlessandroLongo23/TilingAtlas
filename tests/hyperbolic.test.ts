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
	type Complex,
	type Rings,
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

describe("pickClickAnchor (snap to centre / vertex / edge midpoint)", () => {
	const p = 5, q = 4;
	const { rIn, rC, edgeA, edgeRho } = mirrorParams(p, q);

	it("snaps a central click to the tile centre", () => {
		const a = pickClickAnchor({ x: 0.02, y: -0.01 }, p, rIn, rC, edgeA, edgeRho);
		expect(near(a.x, 0, 1e-6)).toBe(true);
		expect(near(a.y, 0, 1e-6)).toBe(true);
	});

	it("snaps a click near a vertex to that vertex (circumradius r_c at angle π/p)", () => {
		const va = Math.PI / p;
		const vertex = { x: rC * Math.cos(va), y: rC * Math.sin(va) };
		const near95 = { x: vertex.x * 0.95, y: vertex.y * 0.95 };
		const a = pickClickAnchor(near95, p, rIn, rC, edgeA, edgeRho);
		expect(near(a.x, vertex.x, 1e-6)).toBe(true);
		expect(near(a.y, vertex.y, 1e-6)).toBe(true);
	});

	it("snaps a click near an edge midpoint to that midpoint (inradius r_in on +x)", () => {
		const mid = { x: rIn, y: 0 };
		const a = pickClickAnchor({ x: rIn * 0.96, y: 0.01 }, p, rIn, rC, edgeA, edgeRho);
		expect(near(a.x, mid.x, 1e-6)).toBe(true);
		expect(near(a.y, mid.y, 1e-6)).toBe(true);
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
