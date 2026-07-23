import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HyperbolicDeveloper, type Darts } from "@/lib/render/hyperbolicDevelopClient";
import { prepareShaderTiling } from "@/lib/render/hyperbolicReduce";
import {
	KLEIN_SCALE,
	islamicSegmentsForTile,
	kleinToPoincare,
	poincareToKlein,
	prepareIslamicField,
} from "@/lib/render/hyperbolicIslamic";
import { hypDist, hypMidpoint, su11Apply, type Complex, type Su11 } from "@/lib/render/hyperbolic";
import { islamicNormalAngleFromSlider } from "@/utils/islamicNoise";
import type { DevelopedPatch } from "@/lib/render/hyperbolicDevelopedDraw";

import { sampleAtlas } from "./hyperbolic-sample";

interface ShippedPatch extends DevelopedPatch {
	darts?: Darts;
	certified?: boolean;
}
const atlas: ShippedPatch[] = JSON.parse(
	readFileSync(join(__dirname, "..", "public", "hyperbolic-developed.json"), "utf8"),
);
const byId = (id: string) => {
	const p = atlas.find((x) => x.id === id);
	if (!p) throw new Error(`patch ${id} not in atlas`);
	return p;
};
const metaOf = (p: ShippedPatch) => ({ id: p.id, name: p.name, config: p.config, edge: p.edge });

const identity: Su11 = { a: { x: 1, y: 0 }, b: { x: 0, y: 0 } };

/** The bake's develop bound (hyperbolicIslamic/hyperbolicReduce formula) — a reference patch must
 *  reach this deep or its segment pool misses tiles the bake sees. */
function bakeBound(RD: number, darts: Darts, edge: number): number {
	let rMaxTile = 0;
	for (const p of darts.lvert) rMaxTile = Math.max(rMaxTile, Math.asinh(Math.sinh(edge / 2) / Math.sin(Math.PI / p)));
	return Math.min(0.9995, Math.tanh((RD + 0.15 + 2 * rMaxTile + 0.2) / 2));
}

function facePolyP(patch: DevelopedPatch, fi: number): Complex[] {
	return patch.faces[fi].map((i) => ({ x: patch.vertices[i][0], y: patch.vertices[i][1] }));
}

/** Euclidean distance from point p to Klein segment [a,b] — all scaled-Klein. */
function kleinSegDist(p: Complex, a: Complex, b: Complex): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const l2 = dx * dx + dy * dy;
	let t = l2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
	t = Math.max(0, Math.min(1, t));
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("hyperbolic Islamic plain (Klein-model Hankin construction)", () => {
	it("Klein <-> Poincaré round-trips, and geodesic midpoints are Klein-collinear", () => {
		let s = 424242;
		const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
		for (let n = 0; n < 200; n++) {
			const r = 0.999 * Math.sqrt(rnd());
			const th = 2 * Math.PI * rnd();
			const p = { x: r * Math.cos(th), y: r * Math.sin(th) };
			const back = kleinToPoincare(poincareToKlein(p));
			expect(Math.hypot(back.x - p.x, back.y - p.y)).toBeLessThan(1e-12);
		}
		// a geodesic is a straight chord in Klein: endpoints and hyperbolic midpoint are collinear
		for (let n = 0; n < 50; n++) {
			const a = { x: 0.9 * (rnd() * 2 - 1), y: 0.9 * (rnd() * 2 - 1) };
			const b = { x: 0.9 * (rnd() * 2 - 1), y: 0.9 * (rnd() * 2 - 1) };
			if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-3) continue;
			const ka = poincareToKlein(a);
			const kb = poincareToKlein(b);
			const km = poincareToKlein(hypMidpoint(a, b));
			const cross = (kb.x - ka.x) * (km.y - ka.y) - (kb.y - ka.y) * (km.x - ka.x);
			expect(Math.abs(cross)).toBeLessThan(1e-9);
		}
	});

	it.each([0, 0.5])("tile segments are EQUIVARIANT under the tiling's own isometries (offset %s)", (frac) => {
		const p = byId("hyp-3-6-4-6");
		const st = prepareShaderTiling(p.darts as Darts, p.edge, metaOf(p), { fieldRes: 64 });
		expect(st).not.toBeNull();
		const dev = new HyperbolicDeveloper(p.darts as Darts, p.edge);
		const patch = dev.develop(metaOf(p), identity, 0.8, 4000);
		const theta = islamicNormalAngleFromSlider(45);
		const poly = facePolyP(patch, 0);
		const base = islamicSegmentsForTile(poly, theta, frac);
		for (const g of st!.domain.gens.slice(0, 4)) {
			const movedPoly = poly.map((v) => su11Apply(g, v));
			const moved = islamicSegmentsForTile(movedPoly, theta, frac);
			expect(moved.length).toBe(base.length);
			// map the base segments through g (Klein -> Poincaré -> g -> Klein) and match as a set
			const mapped = base.map(([a, b]) =>
				[a, b].map((q) => {
					const w = su11Apply(g, kleinToPoincare({ x: q.x / KLEIN_SCALE, y: q.y / KLEIN_SCALE }));
					const k = poincareToKlein(w);
					return { x: k.x * KLEIN_SCALE, y: k.y * KLEIN_SCALE };
				}),
			);
			for (const [ma, mb] of moved) {
				let best = Infinity;
				for (const [qa, qb] of mapped) {
					const straight = Math.max(Math.hypot(ma.x - qa.x, ma.y - qa.y), Math.hypot(mb.x - qb.x, mb.y - qb.y));
					const flipped = Math.max(Math.hypot(ma.x - qb.x, ma.y - qb.y), Math.hypot(mb.x - qa.x, mb.y - qa.y));
					best = Math.min(best, straight, flipped);
				}
				expect(best).toBeLessThan(1e-5 * KLEIN_SCALE);
			}
		}
	});

	it.each(["hyp-8-8-8", "hyp-5x5", "hyp-k2-3-3-4-3-4-4__3-3-4-3-4-4"])(
		"rosette closes on every tile ray for %s (no dangling construction line)",
		(id) => {
			const p = byId(id);
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			const dev = new HyperbolicDeveloper(p.darts as Darts, p.edge);
			const patch = dev.develop(metaOf(p), identity, 0.7, 2000);
			for (const [slider, frac] of [
				[30, 0],
				[45, 0],
				[60, 0],
				[45, 0.4],
				[60, 0.8],
			] as [number, number][]) {
				const theta = islamicNormalAngleFromSlider(slider);
				for (let fi = 0; fi < Math.min(patch.faces.length, 6); fi++) {
					const poly = facePolyP(patch, fi);
					const segs = islamicSegmentsForTile(poly, theta, frac);
					expect(segs.length).toBe(2 * poly.length); // two rays per edge, none dropped
					// every ray endpoint terminates ON another ray's body (T-junction or shared crossing)
					for (let i = 0; i < segs.length; i++) {
						let d = Infinity;
						for (let j = 0; j < segs.length; j++) {
							if (i === j) continue;
							d = Math.min(d, kleinSegDist(segs[i][1], segs[j][0], segs[j][1]));
						}
						expect(d).toBeLessThan(1e-6 * KLEIN_SCALE);
					}
				}
			}
			expect(warn).not.toHaveBeenCalled();
		},
	);

	it("slider 0 (rays along the edges) retraces the tile boundary exactly", () => {
		const p = byId("hyp-8-8-8");
		const dev = new HyperbolicDeveloper(p.darts as Darts, p.edge);
		const patch = dev.develop(metaOf(p), identity, 0.9, 4000);
		expect(patch.faces.length).toBeGreaterThan(0);
		const poly = facePolyP(patch, 0);
		const theta = islamicNormalAngleFromSlider(0); // 90° from the normal = along the edge
		const segs = islamicSegmentsForTile(poly, theta);
		// expected endpoints: the Klein images of the edge midpoints and the vertices
		const anchors: Complex[] = [];
		for (let i = 0; i < poly.length; i++) {
			const m = poincareToKlein(hypMidpoint(poly[i], poly[(i + 1) % poly.length]));
			const v = poincareToKlein(poly[i]);
			anchors.push({ x: m.x * KLEIN_SCALE, y: m.y * KLEIN_SCALE }, { x: v.x * KLEIN_SCALE, y: v.y * KLEIN_SCALE });
		}
		for (const [a, b] of segs) {
			for (const q of [a, b]) {
				let best = Infinity;
				for (const an of anchors) best = Math.min(best, Math.hypot(q.x - an.x, q.y - an.y));
				expect(best).toBeLessThan(1e-6 * KLEIN_SCALE);
			}
		}
	});

	it.each(["hyp-8-8-8", "hyp-3-6-4-6", "hyp-k2-3-3-4-3-4-4__3-3-4-3-4-4"])(
		"bakes a TOTAL plain field for %s (classes valid, no deep unresolved, centres are star bodies)",
		(id) => {
			const p = byId(id);
			const st = prepareShaderTiling(p.darts as Darts, p.edge, metaOf(p), { fieldRes: 128 });
			expect(st).not.toBeNull();
			const err = vi.spyOn(console, "error").mockImplementation(() => {});
			const theta = islamicNormalAngleFromSlider(45);
			const field = prepareIslamicField(st!, p.darts as Darts, p.edge, metaOf(p), theta, 0, { fieldRes: 128 });
			expect(field).not.toBeNull();
			expect(err).not.toHaveBeenCalled(); // no deep-unresolved coverage bug
			const { data, res, rTex } = field!;
			expect(rTex).toBe(st!.field.rTex);
			for (let o = 0; o < data.length; o += 4) {
				expect(data[o]).toBeGreaterThanOrEqual(1);
				expect(data[o]).toBeLessThanOrEqual(3);
			}
			// the texel at every in-square tile barycenter belongs to a star body (class A = 1)
			const dev = new HyperbolicDeveloper(p.darts as Darts, p.edge);
			const patch = dev.develop(metaOf(p), identity, bakeBound(st!.domain.RD, p.darts as Darts, p.edge), 100000);
			let centres = 0;
			for (const f of patch.faces) {
				let X = 0;
				let Y = 0;
				let T = 0;
				for (const vi_ of f) {
					const [x, y] = patch.vertices[vi_];
					const s = Math.max(1 - x * x - y * y, 1e-12);
					X += (2 * x) / s;
					Y += (2 * y) / s;
					T += (1 + x * x + y * y) / s;
				}
				const nrm = Math.sqrt(Math.max(T * T - X * X - Y * Y, 1e-18));
				const t = T / nrm;
				const c = { x: X / nrm / (1 + t), y: Y / nrm / (1 + t) };
				// keep centres safely inside the sampled square (the seed is vertex-anchored, so the
				// nearest tile centres sit a full circumradius out — don't filter them away)
				if (Math.hypot(c.x, c.y) > 0.95 * rTex) continue;
				const i = Math.max(0, Math.min(res - 1, Math.floor(((c.x / rTex) * 0.5 + 0.5) * res)));
				const j = Math.max(0, Math.min(res - 1, Math.floor(((c.y / rTex) * 0.5 + 0.5) * res)));
				expect(data[(j * res + i) * 4], `${id}: tile centre not class A`).toBe(1);
				centres++;
			}
			expect(centres).toBeGreaterThan(0);
		},
	);

	it("the G channel equals the distance to the GLOBALLY nearest construction line (face-boundary shortcut is sound)", () => {
		const p = byId("hyp-3-6-4-6");
		const st = prepareShaderTiling(p.darts as Darts, p.edge, metaOf(p), { fieldRes: 192 });
		expect(st).not.toBeNull();
		const theta = islamicNormalAngleFromSlider(45);
		const field = prepareIslamicField(st!, p.darts as Darts, p.edge, metaOf(p), theta, 0, { fieldRes: 192 });
		expect(field).not.toBeNull();
		const { data, res, rTex } = field!;
		// independent brute force: pool ALL tiles' segments (to the bake's own develop depth — a
		// shallower pool would MISS segments and overstate the distance), tessellate, min × conformal
		const dev = new HyperbolicDeveloper(p.darts as Darts, p.edge);
		const patch = dev.develop(metaOf(p), identity, bakeBound(st!.domain.RD, p.darts as Darts, p.edge), 400000);
		const polys: [number, number][][] = [];
		for (let fi = 0; fi < patch.faces.length; fi++) {
			const poly = facePolyP(patch, fi);
			for (const [a, b] of islamicSegmentsForTile(poly, theta)) {
				const pa = kleinToPoincare({ x: a.x / KLEIN_SCALE, y: a.y / KLEIN_SCALE });
				const pb = kleinToPoincare({ x: b.x / KLEIN_SCALE, y: b.y / KLEIN_SCALE });
				// tessellate the geodesic chord by hyperbolic midpoint subdivision (8 pieces)
				let pts: Complex[] = [pa, pb];
				for (let d = 0; d < 3; d++) {
					const next: Complex[] = [pts[0]];
					for (let k = 0; k + 1 < pts.length; k++) {
						next.push(hypMidpoint(pts[k], pts[k + 1]), pts[k + 1]);
					}
					pts = next;
				}
				polys.push(pts.map((q) => [q.x, q.y] as [number, number]));
			}
		}
		let s = 777;
		const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
		let checked = 0;
		for (let n = 0; n < 400 && checked < 150; n++) {
			const i = Math.floor(rnd() * res);
			const j = Math.floor(rnd() * res);
			const x = ((i + 0.5) / res) * 2 * rTex - rTex;
			const y = ((j + 0.5) / res) * 2 * rTex - rTex;
			if (x * x + y * y > (0.75 * rTex) ** 2) continue;
			let dSq = Infinity;
			for (const pts of polys) {
				for (let k = 0; k + 1 < pts.length; k++) {
					const [ax, ay] = pts[k];
					const [bx, by] = pts[k + 1];
					const dx = bx - ax;
					const dy = by - ay;
					const l2 = dx * dx + dy * dy;
					let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
					t = Math.max(0, Math.min(1, t));
					dSq = Math.min(dSq, (x - (ax + t * dx)) ** 2 + (y - (ay + t * dy)) ** 2);
				}
			}
			const conf = 2 / Math.max(1 - (x * x + y * y), 1e-6);
			const expected = Math.min(255, Math.sqrt(dSq) * conf * 510);
			const got = data[(j * res + i) * 4 + 1];
			if (expected > 240) continue; // both saturate — uninformative
			expect(Math.abs(got - expected), `texel ${i},${j}`).toBeLessThan(12); // byte + tessellation slack
			checked++;
		}
		expect(checked).toBeGreaterThan(80);
	});

	it("bakes a valid plain field for a sample of certifiable tilings (offsets 0 and 50 %)", { timeout: 300_000 }, () => {
		// Was "EVERY shipped tiling" at 59; the shelf is thousands and the Islamic bake needs the
		// certified reduction, so: seeded sample over stamped-certifiable patches (tests/hyperbolic-sample.ts).
		const theta = islamicNormalAngleFromSlider(45);
		const bad: string[] = [];
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {}); // clamped rays may warn on exotic tiles
		for (const p of sampleAtlas(atlas.filter((x) => x.certified !== false), 30)) {
			const st = prepareShaderTiling(p.darts as Darts, p.edge, metaOf(p), { fieldRes: 96 });
			if (!st) {
				bad.push(`${p.id}: certificate failed`);
				continue;
			}
			for (const frac of [0, 0.5]) {
				err.mockClear();
				const field = prepareIslamicField(st, p.darts as Darts, p.edge, metaOf(p), theta, frac, { fieldRes: 96 });
				if (!field) {
					bad.push(`${p.id}@${frac}: bake returned null`);
					continue;
				}
				if (err.mock.calls.length > 0) bad.push(`${p.id}@${frac}: ${String(err.mock.calls[0][0])}`);
				for (let o = 0; o < field.data.length; o += 4) {
					if (field.data[o] < 1 || field.data[o] > 3) {
						bad.push(`${p.id}@${frac}: texel ${o / 4} class ${field.data[o]}`);
						break;
					}
				}
			}
		}
		expect(bad, bad.join("; ")).toEqual([]);
	});

	// ---- edge offset + the C class ------------------------------------------------------------------
	const clsCounts = (f: { data: Uint8Array }): [number, number, number] => {
		const c: [number, number, number] = [0, 0, 0];
		for (let o = 0; o < f.data.length; o += 4) c[f.data[o] - 1]++;
		return c;
	};
	const clsAgreement = (a: { data: Uint8Array }, b: { data: Uint8Array }): number => {
		let same = 0;
		for (let o = 0; o < a.data.length; o += 4) if (a.data[o] === b.data[o]) same++;
		return same / (a.data.length / 4);
	};

	it("edge offset opens the C diamonds; offset 0 has none", () => {
		const p = byId("hyp-3-6-4-6");
		const st = prepareShaderTiling(p.darts as Darts, p.edge, metaOf(p), { fieldRes: 160 });
		const theta = islamicNormalAngleFromSlider(45);
		const f0 = prepareIslamicField(st!, p.darts as Darts, p.edge, metaOf(p), theta, 0, { fieldRes: 160 })!;
		const f4 = prepareIslamicField(st!, p.darts as Darts, p.edge, metaOf(p), theta, 0.4, { fieldRes: 160 })!;
		const [, , c0] = clsCounts(f0);
		const [a4, , c4] = clsCounts(f4);
		expect(c0).toBe(0); // no contact gap at offset 0 — no C anywhere
		expect(c4).toBeGreaterThan(0); // the diamonds are open
		expect(a4).toBeGreaterThan(0); // star bodies survive the split
	});

	// AL's continuity requirement: the classification must not jump at the degenerate ends of either
	// slider. Marker-based C makes these limits continuous by construction — verify per-texel.
	it("colour continuity at the slider end stops (angle 89↔90, offset 95↔100, offset 0↔5)", () => {
		const p = byId("hyp-3-6-4-6");
		const st = prepareShaderTiling(p.darts as Darts, p.edge, metaOf(p), { fieldRes: 160 });
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const bake = (slider: number, frac: number) =>
			prepareIslamicField(st!, p.darts as Darts, p.edge, metaOf(p), islamicNormalAngleFromSlider(slider), frac, {
				fieldRes: 160,
			})!;
		// angle 89 → 90 (rays collapse onto the apothems; the star bodies vanish smoothly)
		const a89 = bake(89, 0);
		const a90 = bake(90, 0);
		expect(clsCounts(a89)[2]).toBe(0); // parity-C would light up HERE — geometric C must not
		expect(clsCounts(a90)[2]).toBe(0);
		expect(clsAgreement(a89, a90)).toBeGreaterThan(0.96);
		// offset top end: the last notch must NOT snap (the 100 % vertex-coincidence is regularised —
		// unclamped it flipped ~8 % of texels in that single percent); across 95 → 100 the classes
		// drift only at the smooth geometric rate (~1.5 %/percent of legitimately moving boundaries).
		const o95 = bake(45, 0.95);
		const o99 = bake(45, 0.99);
		const o100 = bake(45, 1);
		expect(clsAgreement(o99, o100)).toBeGreaterThan(0.97);
		expect(clsAgreement(o95, o100)).toBeGreaterThan(0.9);
		// offset 0 → 5 % (the diamonds open from nothing)
		const o0 = bake(45, 0);
		const o5 = bake(45, 0.05);
		expect(clsAgreement(o0, o5)).toBeGreaterThan(0.95);
		warn.mockRestore();
	});

	it("the doubly degenerate corner (angle 90 + offset 100 %) still bakes a total, valid field", () => {
		const p = byId("hyp-8-8-8");
		const st = prepareShaderTiling(p.darts as Darts, p.edge, metaOf(p), { fieldRes: 128 });
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const field = prepareIslamicField(
			st!,
			p.darts as Darts,
			p.edge,
			metaOf(p),
			islamicNormalAngleFromSlider(90),
			1,
			{ fieldRes: 128 },
		);
		expect(field).not.toBeNull();
		expect(err).not.toHaveBeenCalled();
		for (let o = 0; o < field!.data.length; o += 4) {
			expect(field!.data[o]).toBeGreaterThanOrEqual(1);
			expect(field!.data[o]).toBeLessThanOrEqual(3);
		}
	});
});
