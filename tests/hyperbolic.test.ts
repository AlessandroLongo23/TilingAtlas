import { describe, it, expect } from "vitest";
import {
	isHyperbolic,
	mirrorParams,
	su11Identity,
	su11Mul,
	su11Translation,
	su11Rotation,
	su11Apply,
	su11ApplyInverse,
	su11Normalize,
	su11Inverse,
	hypDist,
	hypMidpoint,
	tileHue,
	geodesicThroughPoints,
	geodesicTangentAt,
	geodesicMove,
	type Complex,
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

describe("hypDist + hypMidpoint (Poincaré metric)", () => {
	it("hypDist is 0 at a point, symmetric, and grows toward the rim", () => {
		const u: Complex = { x: 0.2, y: -0.1 };
		const v: Complex = { x: -0.3, y: 0.25 };
		expect(hypDist(u, u)).toBeLessThan(1e-12);
		expect(near(hypDist(u, v), hypDist(v, u), 1e-12)).toBe(true);
		// same Euclidean step is longer in hyperbolic terms when it sits closer to the boundary
		const nearO = hypDist({ x: 0, y: 0 }, { x: 0.1, y: 0 });
		const nearRim = hypDist({ x: 0.8, y: 0 }, { x: 0.9, y: 0 });
		expect(nearRim).toBeGreaterThan(nearO);
	});

	it("hypMidpoint is equidistant from both endpoints (half the total)", () => {
		for (const [u, v] of [
			[{ x: 0, y: 0 }, { x: 0.6, y: 0 }],
			[{ x: 0.2, y: -0.1 }, { x: -0.4, y: 0.35 }],
		] as Array<[Complex, Complex]>) {
			const m = hypMidpoint(u, v);
			const full = hypDist(u, v);
			expect(near(hypDist(u, m), full / 2, 1e-9)).toBe(true);
			expect(near(hypDist(m, v), full / 2, 1e-9)).toBe(true);
		}
	});
});

describe("geodesic kernel", () => {
	it("geodesicThroughPoints: both points lie on the conic (c0(|z|²+1)+c1 x+c2 y = 0)", () => {
		const a: Complex = { x: 0.3, y: 0.1 }, b: Complex = { x: -0.2, y: 0.4 };
		const g = geodesicThroughPoints(a, b);
		const on = (z: Complex) => g.c0 * (z.x * z.x + z.y * z.y + 1) + g.c1 * z.x + g.c2 * z.y;
		expect(Math.abs(on(a))).toBeLessThan(1e-9);
		expect(Math.abs(on(b))).toBeLessThan(1e-9);
	});

	it("geodesicTangentAt is a unit vector pointing toward the target", () => {
		const p: Complex = { x: 0.1, y: -0.2 }, toward: Complex = { x: 0.5, y: 0.3 };
		const t = geodesicTangentAt(p, toward);
		expect(near(Math.hypot(t.x, t.y), 1)).toBe(true);
		expect((toward.x - p.x) * t.x + (toward.y - p.y) * t.y).toBeGreaterThan(0);
	});

	it("geodesicMove steps the requested hyperbolic distance, and a full step lands on the target", () => {
		const from: Complex = { x: 0.1, y: 0.05 }, toward: Complex = { x: -0.3, y: 0.4 };
		const half = geodesicMove(from, toward, 0.5);
		expect(near(hypDist(from, half), 0.5, 1e-9)).toBe(true);
		const full = geodesicMove(from, toward, hypDist(from, toward));
		expect(hypDist(full, toward)).toBeLessThan(1e-9);
	});
});

describe("tileHue", () => {
	it("is deterministic, in [0,360), and stable per side count", () => {
		for (const n of [3, 4, 5, 6, 8, 12]) {
			const h = tileHue(n);
			expect(h).toBeGreaterThanOrEqual(0);
			expect(h).toBeLessThan(360);
			expect(tileHue(n)).toBe(h); // stable
		}
		expect(tileHue(3)).not.toBe(tileHue(4)); // distinct polygons read distinct hues
	});
});
