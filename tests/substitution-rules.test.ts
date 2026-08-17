// The load-bearing check on lib/substitution/rules.ts: each rule's children tile its own inflated
// prototile exactly once. The rules were derived by exhaustive exact cover (see the provenance note
// in rules.ts) but they are transcribed numbers in a source file, and a sign flip in one of the 24
// entries would still draw a plausible-looking patch. This catches that.
//
// The test is deliberately geometric and shape-agnostic: it samples the inflated outline and counts
// covering children. It knows nothing about square or triangular lattices, so a third rule added
// later is covered by the same code.

import { describe, expect, it } from "vitest";
import {
	affMul,
	childSets,
	conjugateByExpansion,
	makeRng,
	sameAbelianisation,
	inflate,
	inflateCount,
	inflatedOutline,
	ringArea,
	type Aff,
	type SubstitutionRule,
} from "@/lib/substitution/engine";
import { CHAIR, PINWHEEL, SPHINX, SUBSTITUTION_RULES } from "@/lib/substitution/rules";
import { penroseRuleFigure } from "@/lib/render/penrosePatch";
import {
	chairPatch,
	halfHex3Patch,
	halfHexPatch,
	pinwheelPatch,
	sphinxPatch,
	substitutionRuleFigure,
	PINWHEEL_LEVEL,
	SUBSTITUTION_LEVEL,
} from "@/lib/render/substitutionPatch";

type Pt = readonly [number, number];

const apply = (m: Aff, [x, y]: Pt): Pt => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];

/** Ray casting; boundary points are excluded by the caller's jitter, not handled here. */
function inside(poly: readonly Pt[], [px, py]: Pt): boolean {
	let hit = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i];
		const [xj, yj] = poly[j];
		if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
	}
	return hit;
}

/** Distance from a point to a ring's nearest edge — used to skip samples sitting on a seam. */
function edgeDistance(poly: readonly Pt[], [px, py]: Pt): number {
	let best = Infinity;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i];
		const [xj, yj] = poly[j];
		const dx = xj - xi, dy = yj - yi;
		const len2 = dx * dx + dy * dy;
		const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - xi) * dx + (py - yi) * dy) / len2));
		best = Math.min(best, Math.hypot(px - (xi + t * dx), py - (yi + t * dy)));
	}
	return best;
}

const ringsOf = (rule: SubstitutionRule, kids: readonly { tile: number; m: Aff }[]): Pt[][] =>
	kids.map((c) => rule.prototiles[c.tile].outline.map((p) => apply(c.m, p)));

// Every dissection is checked, not just the default one: a random rule's variants each have to fill
// the inflated prototile on their own, or mixing them tears the patch.
describe.each(Object.entries(SUBSTITUTION_RULES))("%s substitution rule", (_id, rule) => {
	rule.prototiles.forEach((proto, t) => {
		// Not `outline * factor`: the pinwheel's expansion turns as well as scales.
		const inflated: Pt[] = inflatedOutline(rule, t);

		describe.each(childSets(rule, t).map((kids, i) => [i, kids] as const))("dissection %i", (_i, kids) => {
		const rings = ringsOf(rule, kids);

		it("children's areas sum to the inflated prototile's", () => {
			const parent = Math.abs(ringArea(inflated));
			const kidArea = rings.reduce((s, r) => s + Math.abs(ringArea(r)), 0);
			expect(kidArea).toBeCloseTo(parent, 9);
			// λ² is the area factor, so the child count must match it for a one-prototile rule.
			expect(parent).toBeCloseTo(Math.abs(ringArea(proto.outline)) * rule.factor ** 2, 9);
		});

		it("covers the inflated prototile exactly once, with no overlaps and no gaps", () => {
			let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
			for (const [x, y] of inflated) {
				minx = Math.min(minx, x); maxx = Math.max(maxx, x);
				miny = Math.min(miny, y); maxy = Math.max(maxy, y);
			}
			// An off-lattice step, so samples miss the seams between children rather than landing on them.
			const step = 0.0731;
			let tested = 0;
			for (let x = minx + step / 3; x < maxx; x += step) {
				for (let y = miny + step / 7; y < maxy; y += step) {
					const p: Pt = [x, y];
					if (!inside(inflated, p)) continue;
					if (edgeDistance(inflated, p) < 1e-6) continue;
					if (rings.some((r) => edgeDistance(r, p) < 1e-6)) continue;
					tested++;
					expect(rings.filter((r) => inside(r, p)).length).toBe(1);
				}
			}
			expect(tested).toBeGreaterThan(300);
		});

		it("places every child by a rigid motion (no scaling, no shear)", () => {
			for (const c of kids) {
				const [a, b, , d, e] = c.m;
				expect(Math.hypot(a, d)).toBeCloseTo(1, 12);
				expect(Math.hypot(b, e)).toBeCloseTo(1, 12);
				expect(a * b + d * e).toBeCloseTo(0, 12);
			}
		});
		});

		it("keeps every variant compatible with the default dissection", () => {
			// Compatibility is what makes mixing legitimate: same multiset of child prototiles, so the
			// substitution matrix, the inflation factor and the tile frequencies never move.
			for (const alt of childSets(rule, t).slice(1)) {
				expect(sameAbelianisation(rule.children[t], alt, rule.prototiles.length)).toBe(true);
			}
		});
	});
});

describe("inflation driver", () => {
	it("grows by the area factor per level", () => {
		for (let n = 0; n <= 5; n++) {
			expect(inflate(CHAIR, n).length).toBe(4 ** n);
			expect(inflateCount(CHAIR, n)).toBe(4 ** n);
			expect(inflate(SPHINX, n).length).toBe(4 ** n);
			expect(inflate(PINWHEEL, n).length).toBe(5 ** n);
		}
	});

	it("conjugating by a scalar expansion scales the translation and leaves the rotation alone", () => {
		const m: Aff = [0, -1, 3, 1, 0, -7];
		expect(conjugateByExpansion(m, 2)).toEqual([0, -1, 6, 1, 0, -14]);
	});

	it("conjugating by a turning expansion agrees with the scalar path when it does not turn", () => {
		const m: Aff = [0, -1, 3, 1, 0, -7];
		const viaMatrix = conjugateByExpansion(m, [2, 0, 0, 2]);
		conjugateByExpansion(m, 2).forEach((v, i) => expect(viaMatrix[i]).toBeCloseTo(v, 12));
	});

	it("conjugating a REFLECTION by a turning expansion turns its mirror axis", () => {
		// z ↦ conj(z) under φ = ×(2+i) becomes z ↦ e^{2iθ}·conj(z), θ = atan(1/2). Scaling the
		// translation alone would leave this reflection at its old axis and tear the patch at level 2.
		const mirror: Aff = [1, 0, 0, 0, -1, 0];
		const [a, b, , d, e] = conjugateByExpansion(mirror, [2, -1, 1, 2]);
		const twoTheta = 2 * Math.atan(1 / 2);
		expect(a).toBeCloseTo(Math.cos(twoTheta), 12);
		expect(b).toBeCloseTo(Math.sin(twoTheta), 12);
		expect(d).toBeCloseTo(Math.sin(twoTheta), 12);
		expect(e).toBeCloseTo(-Math.cos(twoTheta), 12);
	});

	it("keeps the pinwheel's orientations spreading instead of repeating", () => {
		// The point of an irrational expansion angle: no level repeats an earlier orientation set.
		const angles = (n: number) =>
			new Set(inflate(PINWHEEL, n).map((t) => Math.round((Math.atan2(t.m[3], t.m[0]) * 180) / Math.PI)));
		expect(angles(1).size).toBeLessThan(angles(3).size);
		expect(angles(3).size).toBeLessThan(angles(5).size);
	});

	it("composes in the order the driver relies on", () => {
		// A ∘ B applies B first: translating then turning is not turning then translating.
		const turn: Aff = [0, -1, 0, 1, 0, 0];
		const shift: Aff = [1, 0, 1, 0, 1, 0];
		expect(apply(affMul(turn, shift), [0, 0])).toEqual([0, 1]);
		expect(apply(affMul(shift, turn), [0, 0])).toEqual([1, 0]);
	});

	it("level-1 tiles are exactly the rule's children", () => {
		const lvl1 = inflate(SPHINX, 1);
		expect(lvl1.map((t) => t.m)).toEqual(SPHINX.children[0].map((c) => c.m));
		expect(lvl1.map((t) => t.slot)).toEqual([0, 1, 2, 3]);
	});
});

describe("patch builders", () => {
	it("open at a tile count comparable to the other patch views", () => {
		expect(chairPatch(SUBSTITUTION_LEVEL)).toHaveLength(1024);
		expect(sphinxPatch(SUBSTITUTION_LEVEL)).toHaveLength(1024);
		expect(halfHexPatch(SUBSTITUTION_LEVEL)).toHaveLength(1024);
		expect(pinwheelPatch(PINWHEEL_LEVEL)).toHaveLength(625);
	});

	it("colours by the thing each rule is about", () => {
		expect(new Set(chairPatch(3).map((p) => p.hue)).size).toBe(4);
		expect(new Set(halfHexPatch(3).map((p) => p.hue)).size).toBe(4);
		expect(new Set(sphinxPatch(3).map((p) => p.hue)).size).toBe(2);
		// The pinwheel is coloured by orientation, and its whole point is that orientations keep
		// appearing — so the hue count has to grow with the level, not saturate at a fixed palette.
		expect(new Set(pinwheelPatch(4).map((p) => p.hue)).size).toBeGreaterThan(
			new Set(pinwheelPatch(2).map((p) => p.hue)).size,
		);
	});

	it("holds the pinwheel patch still as the level rises", () => {
		// φ = ×(2+i) turns by arctan(1/2) per level, so without the de-spin the patch swings 26.57° at
		// every notch of the slider. De-spun, the patch is always the prototile scaled by 5^(n/2), whose
		// bounding box is 2 wide by 1 tall — so the aspect ratio pins the orientation at every level.
		for (let n = 1; n <= 5; n++) {
			const polys = pinwheelPatch(n);
			let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
			for (const p of polys)
				for (const v of p.vertices) {
					minx = Math.min(minx, v.x); maxx = Math.max(maxx, v.x);
					miny = Math.min(miny, v.y); maxy = Math.max(maxy, v.y);
				}
			expect((maxx - minx) / (maxy - miny)).toBeCloseTo(2, 6);
		}
	});

	it("draws Penrose's deflation with the apex on the vertex subdivide expects", () => {
		// `subdivide` reads Tri.a as the apex. Hand it a triangle labelled the other way round and it
		// still returns three triangles — they are just slivers that do not fill the parent, which is a
		// silent wrong picture. Area conservation is the check that catches it.
		const panels = penroseRuleFigure();
		expect(panels).toHaveLength(2);
		panels.forEach((panel, i) => {
			const apex = i === 0 ? Math.PI / 5 : (3 * Math.PI) / 5;
			const parent = 0.5 * Math.sin(apex); // isosceles with two unit sides
			const kids = panel.pieces.reduce(
				(s, p) => s + Math.abs(ringArea(p.vertices.map((v) => [v.x, v.y] as const))),
				0,
			);
			expect(kids).toBeCloseTo(parent, 12);
		});
		expect(panels[0].pieces).toHaveLength(2);
		expect(panels[1].pieces).toHaveLength(3);
	});

	it("builds each rule figure out of the rule's own children, one panel per dissection", () => {
		for (const id of ["chair", "sphinx", "half-hex", "pinwheel", "half-hex-3"] as const) {
			const rule = SUBSTITUTION_RULES[id];
			const expected = rule.prototiles.flatMap((_, t) => childSets(rule, t));
			const panels = substitutionRuleFigure(id);
			expect(panels).toHaveLength(expected.length);
			panels.forEach((panel, i) => {
				expect(panel.pieces).toHaveLength(expected[i].length);
				expect(panel.caption).toContain(`${expected[i].length} tiles`);
			});
		}
		// The random rule is the only one that gets more panels than it has prototiles.
		expect(substitutionRuleFigure("half-hex-3")).toHaveLength(2);
		expect(substitutionRuleFigure("half-hex")).toHaveLength(1);
	});

	it("samples the random half-hex reproducibly, and actually mixes", () => {
		const at = (sample: Parameters<typeof halfHex3Patch>[1]) => halfHex3Patch(3, sample);
		// Same seed, same patch; different seed, different patch. Otherwise "New sample" is a lie.
		const a = at({ pick: "mix", seed: 7 });
		expect(a.map((p) => p.hue)).toEqual(at({ pick: "mix", seed: 7 }).map((p) => p.hue));
		expect(a.map((p) => p.hue)).not.toEqual(at({ pick: "mix", seed: 8 }).map((p) => p.hue));

		// Pinning a variant uses only that one; mixing uses both. Hue encodes the variant (200 vs 28
		// plus a slot nudge under 36), so the two bands never collide.
		const band = (polys: typeof a) => new Set(polys.map((p) => ((p.hue ?? 0) >= 200 ? "A" : "B")));
		expect(band(at({ pick: 0 }))).toEqual(new Set(["A"]));
		expect(band(at({ pick: 1 }))).toEqual(new Set(["B"]));
		expect(band(a)).toEqual(new Set(["A", "B"]));

		// Every sample is still a tiling: 9^3 tiles, and the same total area as either pure rule.
		const area = (polys: typeof a) =>
			polys.reduce((s, p) => s + Math.abs(ringArea(p.vertices.map((v) => [v.x, v.y] as const))), 0);
		expect(a).toHaveLength(729);
		expect(area(a)).toBeCloseTo(area(at({ pick: 0 })), 6);
		expect(area(at({ pick: "mix", seed: 99 }))).toBeCloseTo(area(at({ pick: 1 })), 6);
	});

	it("emits the prototile's own vertex count on every tile", () => {
		expect(chairPatch(2).every((p) => p.n === 6)).toBe(true);
		// The sphinx outline is a pentagon: its two left-hand unit edges are collinear.
		expect(sphinxPatch(2).every((p) => p.n === 5)).toBe(true);
		expect(halfHexPatch(2).every((p) => p.n === 4)).toBe(true);
		expect(pinwheelPatch(2).every((p) => p.n === 3)).toBe(true);
	});
});
