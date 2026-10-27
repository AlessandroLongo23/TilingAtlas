import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Su11, su11Inverse, su11Mul, su11Normalize, su11Translation } from "@/lib/render/hyperbolic";
import type { Darts } from "@/lib/render/hyperbolicDevelopClient";
import { buildWalk, walkPoint } from "@/lib/render/hyperbolicWalk";
import { hashU32, SEED_CELL, SEED_SHIFT, SEED_TEX_W, TileSeeds } from "@/lib/render/materials";
import { familyMember } from "@/lib/render/hypStarFamily";
import type { CataloguePatch } from "@/lib/tilings/hyp-developed";
import { readDataText } from "../../scripts/atlas/io.mjs";

const FILES = ["public/hyperbolic-developed.json.gz", "public/hyperbolic-developed-stars.json.gz"];
const recs: CataloguePatch[] = FILES.flatMap((f) => (existsSync(f) ? JSON.parse(readDataText(f)) : []));
const rec = (id: string) => recs.find((r) => r.id === id) as unknown as { darts: Darts; edge: number };

// The shader's lookup (tileSeed in hypMaterials.ts), read off the table the renderer uploads: the key
// cell, and the next cell along each axis whose boundary the point lies within 0.08 of. Returns the seed
// and the tile's reference turn.
function lookup(t: TileSeeds, m: Su11): [number, number] | null {
	const X = (2 * (m.a.x * m.b.x - m.a.y * m.b.y)) / SEED_CELL + SEED_SHIFT;
	const Y = (2 * (m.a.x * m.b.y + m.a.y * m.b.x)) / SEED_CELL + SEED_SHIFT;
	const cap = (t.height * SEED_TEX_W) / 2;
	const step = (v: number) => (v - Math.floor(v) < 0.08 ? -1 : 1 - (v - Math.floor(v)) < 0.08 ? 1 : 0);
	for (const kx of new Set([Math.floor(X), Math.floor(X) + step(X)]))
		for (const ky of new Set([Math.floor(Y), Math.floor(Y) + step(Y)])) {
			for (let s = hashU32(kx, ky) & (cap - 1); t.data[s * 8 + 3] !== 0; s = (s + 1) & (cap - 1))
				if (t.data[s * 8] === kx && t.data[s * 8 + 1] === ky) return [t.data[s * 8 + 2], t.data[s * 8 + 4]];
		}
	return null;
}

/** A point of anchor B's frame, in anchor A's (W carries A's frame onto B's). */
function toA(W: Su11, p: { x: number; y: number }) {
	const m = su11Inverse(W);
	const num = { x: m.a.x * p.x - m.a.y * p.y + m.b.x, y: m.a.x * p.y + m.a.y * p.x + m.b.y };
	const den = { x: m.b.x * p.x + m.b.y * p.y + m.a.x, y: m.b.x * p.y - m.b.y * p.x - m.a.y };
	const d = den.x * den.x + den.y * den.y;
	return { x: (num.x * den.x + num.y * den.y) / d, y: (num.y * den.x - num.x * den.y) / d };
}

/** k-th of n points spread over a disk of radius r. */
const spread = (k: number, n: number, r: number) => ({
	x: r * Math.cos(k * 2.4) * Math.sqrt(k / n),
	y: r * Math.sin(k * 2.4) * Math.sqrt(k / n),
});

describe("material tile seeds", () => {
	// near home, and 20 units out, where float32 positions could no longer tell neighbours apart
	for (const [id, far] of [
		["hyp-7-7-7", 0.31],
		["hyp-5-8-8", 0.31],
		["hyp-3-3-3-3-3-3-3", 0.31],
		["hyp-5-8-8", Math.tanh(10)],
		["hyp-3-3-3-3-3-3-3", Math.tanh(10)],
	] as const) {
		it(`${id} at ${far.toFixed(3)}: a tile keeps its seed from every anchor, and neighbours differ`, () => {
			const { darts, edge } = rec(id);
			const walk = buildWalk(darts, edge, { allDrawn: true });
			// Two anchors a few tiles apart, found the way the camera finds them: walk the screen centre.
			const A = new TileSeeds();
			const B = new TileSeeds();
			const homeA: Su11 = su11Translation({ x: far, y: 0 }); // anchor A → home, not the identity
			const r = walkPoint(walk, walk.seedFace, { x: 0.62, y: 0.4 });
			const homeB = su11Normalize(su11Mul(homeA, su11Inverse(r.W))); // anchor B → home
			A.update(walk, walk, walk.seedFace, homeA, homeA);
			B.update(walk, walk, r.f, homeB, homeB);
			const seeds = new Set<number>();
			for (let k = 0; k < 400; k++) {
				const inB = walkPoint(walk, r.f, spread(k, 400, 0.5));
				const inA = walkPoint(walk, walk.seedFace, toA(r.W, spread(k, 400, 0.5)));
				const sA = lookup(A, su11Inverse(inA.W));
				const sB = lookup(B, su11Inverse(inB.W));
				expect(sA, `${id} sample ${k}`).not.toBeNull();
				expect(sB![0]).toBe(sA![0]);
				seeds.add(sA![0]);
			}
			expect(seeds.size).toBeGreaterThan(5); // the one-face quotients still vary tile to tile
		});
	}

	// What a recording of hyp-3-4s-4-4s showed: a star family's slider re-solves the tiling every frame,
	// and the seeds were hashed from LIVE positions, so every tile swapped its slab every frame.
	it("a star family's tiles keep their seed and their texture's turn across the slider", () => {
		const families = recs.filter((p) => p.family);
		expect(families.length).toBeGreaterThan(0);
		let sameAnchor = 0;
		for (const p of families.slice(0, 8)) {
			const [lo, hi] = p.family!.alphaRangeDegOpen;
			const ref = buildWalk(p.darts, p.edge, { allDrawn: true });
			// The camera at home in both members: the same frames, so a tile's reference turn must match.
			// (A camera that walked to its anchor may arrive by another route, a turn of the anchor tile
			// off; that turn shifts the reference turn and the table's live turn alike, and the shader only
			// uses their difference. Seeds are checked for a moved camera below.)
			const id: Su11 = { a: { x: 1, y: 0 }, b: { x: 0, y: 0 } };
			const members = [0.3, 0.7].map((x) => {
				const m = familyMember(p, lo + x * (hi - lo))!;
				const live = buildWalk(m.darts, m.edge, { allDrawn: true });
				const t = new TileSeeds();
				t.update(live, ref, live.seedFace, id, id);
				const r = walkPoint(live, live.seedFace, { x: 0.3, y: 0.2 }, 4096, ref);
				const moved = new TileSeeds();
				moved.update(live, ref, r.f, su11Inverse(r.W), su11Inverse(r.Wref));
				return { live, t, f: live.seedFace, moved, Wref: r.Wref };
			});
			const seedsOf = (t: TileSeeds) =>
				[...Array(t.data.length / 8).keys()]
					.filter((s) => t.data[s * 8 + 3])
					.map((s) => t.data[s * 8 + 2])
					.sort();
			// the walked-to anchor may be another tile in the other member; when it is the same tile (the
			// same reference element, up to sign), the moved camera's tables must hold the same seeds
			const [w0, w1] = members.map((m) => m.Wref);
			const same = (u: number, v: number) => Math.abs(u - v) < 1e-9;
			if (
				[1, -1].some(
					(g) =>
						same(w0.a.x, g * w1.a.x) &&
						same(w0.a.y, g * w1.a.y) &&
						same(w0.b.x, g * w1.b.x) &&
						same(w0.b.y, g * w1.b.y),
				)
			) {
				expect(seedsOf(members[1].moved), p.id).toEqual(seedsOf(members[0].moved));
				sameAnchor++;
			}
			// Both tables hold the same tiles: the same multiset of (seed, reference turn). A multiset, since
			// the float32 seed has 2^24 values and ten thousand tiles share a few by the birthday bound.
			const entries = (t: TileSeeds) =>
				[...Array(t.data.length / 8).keys()]
					.filter((s) => t.data[s * 8 + 3])
					.map(
						(s) =>
							`${t.data[s * 8 + 2]} ${Math.round(Math.cos(t.data[s * 8 + 4]) * 1e5)} ${Math.round(Math.sin(t.data[s * 8 + 4]) * 1e5)}`,
					)
					.sort();
			expect(entries(members[1].t), p.id).toEqual(entries(members[0].t));
			// and the shader finds them: points around the anchor resolve to entries in either member
			for (let k = 0; k < 40; k++) {
				for (const { live, t, f } of members)
					expect(lookup(t, su11Inverse(walkPoint(live, f, spread(k, 40, 0.3)).W)), p.id).not.toBeNull();
			}
		}
		expect(sameAnchor).toBeGreaterThan(0);
	});
});
