import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	hydrateSphEdgesShard,
	sphEdgesBoardKs,
	sphEdgesKGaps,
	sphEdgesShardUrl,
	SPH_EDGES_BOARDS,
	type SphEdgesBoard,
	type SphEdgesShard,
} from "./sph-edges";
import { sphSchwarzScene } from "@/lib/render/sphSchwarz";

// The uniform-polyhedron edge shelf's decode checks. As with the Schwarz shelf, the develop itself is
// develop_sph_edges.py's business (it fails loudly); what is asserted here is what the SHIPPED data must
// satisfy for the shelf to be honest — the board is the solid the manifest claims, the manifest matches
// the files, and a pattern's arrays index into that one board.

const shardOf = (b: SphEdgesBoard, k: number): SphEdgesShard | null => {
	const f = `public${sphEdgesShardUrl(b.id, k)}`;
	return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as SphEdgesShard) : null;
};

const anyShard = existsSync("public/spherical-edges/x443-k1.json");

describe("uniform-polyhedron edge board manifest", () => {
	it("gives every board a distinct id and at least one k", () => {
		expect(new Set(SPH_EDGES_BOARDS.map((b) => b.id)).size).toBe(SPH_EDGES_BOARDS.length);
		for (const b of SPH_EDGES_BOARDS) expect(sphEdgesBoardKs(b).length).toBeGreaterThan(0);
	});

	it("never lists a k as both eager and lazy, and counts exactly the ks it lists", () => {
		for (const b of SPH_EDGES_BOARDS) {
			expect(b.eagerKs.filter((k) => b.lazyKs.includes(k))).toEqual([]);
			expect(Object.keys(b.counts).map(Number).sort((x, y) => x - y)).toEqual(sphEdgesBoardKs(b));
		}
	});

	it("reports the k holes, which on these finite boards are the SOLID and not a short run", () => {
		// (4,4,7) has nothing at k = 3, 5, 6 or 9…13 — Marek's census file confirms each zero, and its
		// k = 14 is the last slice a 14-vertex solid can have. The function exists so a surface can say
		// so; a board with no holes must report none.
		const p447 = SPH_EDGES_BOARDS.find((b) => b.id === "447")!;
		expect(sphEdgesKGaps(p447)).toEqual([3, 5, 6, 9, 10, 11, 12, 13]);
		expect(sphEdgesKGaps(SPH_EDGES_BOARDS.find((b) => b.id === "443")!)).toEqual([]);
	});

	it("keeps the three coverage claims apart: a hole, an unfinished run, a slice we did not get", () => {
		// A k cannot be both shipped and missing — `missing` is what the census counts and the drop
		// does not carry, so the two sets are disjoint by construction.
		for (const b of SPH_EDGES_BOARDS) {
			const ks = new Set(sphEdgesBoardKs(b));
			for (const m of b.missing) expect(ks.has(m), `${b.id} claims k=${m} both ways`).toBe(false);
		}
		// 3337's enumeration DID finish — its census reaches k = 14, which is V for a heptagonal
		// antiprism — and the zip still carries none of that slice's 334,772 tilings. Exhausted board,
		// short copy: two facts, and the shelf must not collapse them into one.
		const p3337 = SPH_EDGES_BOARDS.find((b) => b.id === "3337")!;
		expect(p3337.complete).toBe(true);
		expect(p3337.missing).toEqual([14]);
		// The 4443 corpus is the opposite case: every k its census lists is here, and the census stops
		// at k = 8 on a 24-vertex solid with no MAX marker, so the search itself is unfinished. Both
		// boards that came out of that one run inherit it.
		const snub = SPH_EDGES_BOARDS.find((b) => b.id === "33334")!;
		// Lexicographic, so "33334" sorts before "3338" — the fourth character decides.
		// Twelve of the twenty-seven are unfinished after the 2026-08-12 drop, which is the honest shape of
		// a shelf fed by budgeted runs: only the prisms and the small truncated solids reach k = V.
		expect(SPH_EDGES_BOARDS.filter((b) => !b.complete).map((b) => b.id).sort()).toEqual([
			"33310",
			"33334",
			"33335",
			"3338",
			"3339",
			"4435",
			"4443",
			"468",
			"665",
			"j37",
			"j72",
			"j73",
		]);
		// ⚑ 3338 is the third shape of the same story: its census counts 2,925,191 tilings at k=16, the
		// drop carries no k=16 file at all, and the census carries no MAX marker either — so the board is
		// both unfinished AND short-copied, like the snub cube, at a scale that dwarfs everything shipped.
		const oct = SPH_EDGES_BOARDS.find((b) => b.id === "3338")!;
		expect(oct.complete).toBe(false);
		expect(oct.missing).toEqual([16]);
		expect(SPH_EDGES_BOARDS.find((b) => b.id === "4443")!.missing).toEqual([]);
		// The snub cube is the case where BOTH are true at once, which is why they are two fields: its
		// census stops at k = 8 of a 24-vertex solid (unfinished) AND counts 147,140 tilings there that
		// the zip does not carry (short copy). Neither claim implies the other.
		expect(snub.complete).toBe(false);
		expect(snub.missing).toEqual([8]);
	});

	it("ships the rhombicuboctahedron and J37 as separate boards, which only the symmetry justifies", () => {
		// The textbook pair: V/E/F identical, 3.4.4.4 at EVERY vertex of both, same edge arc — so the
		// vertex-figure census cannot tell them apart and develop_sph_edges.py keys the board on the
		// measured isometry group instead (|G| = 48 in one vertex orbit against 16 in two).
		const rco = SPH_EDGES_BOARDS.find((b) => b.id === "4443")!;
		const j37 = SPH_EDGES_BOARDS.find((b) => b.id === "j37")!;
		expect(j37.config).toBe(rco.config);
		// J37 is not vertex-transitive, so even its BARE board has two vertex orbits and no decoration
		// of it can have one. A k=1 slice on this board would mean the split went wrong.
		expect(rco.counts[1]).toBeGreaterThan(0);
		expect(j37.counts[1]).toBeUndefined();
	});
});

describe.skipIf(!anyShard)("uniform-polyhedron edge shards", () => {
	it("matches the manifest: every listed (board, k) exists with the listed count", () => {
		for (const b of SPH_EDGES_BOARDS) {
			for (const k of sphEdgesBoardKs(b)) {
				const shard = shardOf(b, k);
				expect(shard, `${b.id} k=${k}`).not.toBeNull();
				expect(shard!.patterns.length, `${b.id} k=${k}`).toBe(b.counts[k]);
				expect(shard!.board).toBe(b.id);
				expect(shard!.k).toBe(k);
			}
		}
	});

	it("ships a closed polyhedron whose faces are the board's vertex figure", () => {
		for (const b of SPH_EDGES_BOARDS) {
			const shard = shardOf(b, sphEdgesBoardKs(b)[0])!;
			const V = shard.vertices.length;
			const E = shard.edges.length;
			const F = shard.faces.length;
			expect(V - E + F, `${b.id} Euler`).toBe(2);
			// Unit sphere, and every edge the one forced arc. The shipped coordinates are rounded to 9
			// decimals, so the norm is only unit to ~1e-9 — the tolerance is the rounding, not the develop
			// (whose own residuals are ~1e-12).
			for (const v of shard.vertices) expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(1, 8);
			for (const [u, w] of shard.edges) {
				const a = shard.vertices[u];
				const c = shard.vertices[w];
				const d = Math.acos(Math.min(1, Math.max(-1, a[0] * c[0] + a[1] * c[1] + a[2] * c[2])));
				expect(d).toBeCloseTo(shard.edge, 6);
			}
			// Every vertex carries the number of faces its vertex figure names — the check that the board
			// is the solid the manifest says and not another one with the same V/E/F. (The cuboctahedron
			// and J27 are exactly that pair, which is why this is per-vertex and not a global count.)
			const deg = new Map<number, number>();
			for (const ring of shard.faces) for (const v of ring) deg.set(v, (deg.get(v) ?? 0) + 1);
			const want = b.config.split(" / ")[0].split(".").length;
			for (let v = 0; v < V; v++) expect(deg.get(v), `${b.id} vertex ${v}`).toBe(want);
		}
	});

	it("indexes every pattern against the shard's one shared board", () => {
		for (const b of SPH_EDGES_BOARDS) {
			const shard = shardOf(b, sphEdgesBoardKs(b)[0])!;
			for (const p of hydrateSphEdgesShard(shard)) {
				expect(p.faceTile.length).toBe(shard.faces.length);
				expect(p.drawn.length).toBe(shard.edges.length);
				expect(p.vorbit.length).toBe(shard.vertices.length);
				expect(p.stats.tiles).toBe(new Set(p.faceTile).size);
				expect([...p.drawn].filter((c) => c === "1").length).toBe(p.stats.drawnEdges);
				expect(p.geom.vertices).toBe(shard.vertices); // shared, never copied
			}
		}
	});

	it("turns a record into a scene whose tiles partition the solid", () => {
		// The whole point of the shelf: it draws through the Schwarz spheres' adapter unchanged, even
		// though these boards mix face sizes.
		for (const b of SPH_EDGES_BOARDS) {
			const shard = shardOf(b, sphEdgesBoardKs(b)[0])!;
			for (const p of hydrateSphEdgesShard(shard)) {
				const scene = sphSchwarzScene(p);
				expect(scene.pattern.tiles.reduce((n, t) => n + t.length, 0)).toBe(shard.faces.length);
				expect(scene.pattern.nDrawn).toBe(p.stats.drawnEdges);
				expect(scene.vertices).toBe(shard.vertices);
			}
		}
	});

	it("has exactly one nothing-drawn pattern per board, and it is the bare solid", () => {
		// Draw no edge and every face merges into one region covering the solid — the decode's sanity
		// anchor, the same one the Schwarz and (2,3,6) shelves use. J27 has no k=1 slice, so its bare
		// board is not in the lowest k it ships and it is exempt.
		for (const b of SPH_EDGES_BOARDS) {
			const bare = sphEdgesBoardKs(b)
				.map((k) => shardOf(b, k))
				.filter((s): s is SphEdgesShard => s !== null)
				.flatMap((s) => hydrateSphEdgesShard(s))
				.filter((p) => !p.drawn.includes("1"));
			expect(bare.length, `${b.id} bare boards`).toBeLessThanOrEqual(1);
			for (const p of bare) expect(p.stats.tiles).toBe(1);
		}
	});
});
