import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	hydrateSphShard,
	hypSchwarzBoards,
	schwarzBoardKs,
	schwarzKGaps,
	sphSchwarzBoards,
	SCHWARZ_BOARDS,
	type HypSchwarzPattern,
	type SchwarzBoard,
	type SphSchwarzShard,
} from "./schwarz";
import { sphSchwarzScene } from "@/lib/render/sphSchwarz";

// The Schwarz shelf's decode checks. What is worth asserting here is not the develop (that is
// tools/ctrnact-oracle/develop_schwarz.py's own business, and it fails loudly) but the properties the
// SHIPPED data has to have for the shelf to be honest: the board is the (p,q,r) tiling and nothing else,
// the manifest matches the files, and the pieces a pattern is made of index into that one board.

const sphShard = (b: SchwarzBoard, k: number): SphSchwarzShard | null => {
	const f = `public/schwarz-sph/s${b.id}-k${k}.json`;
	return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as SphSchwarzShard) : null;
};
const hypShard = (b: SchwarzBoard, k: number): HypSchwarzPattern[] | null => {
	const f = `public/schwarz-hyp/h${b.id}-k${k}.json`;
	return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as HypSchwarzPattern[]) : null;
};

/** Triangles in the whole (p,q,r) sphere = the order of the reflection group, 4 / (1/p+1/q+1/r−1). */
const triangleCount = (b: SchwarzBoard) =>
	Math.round(4 / (b.pqr.reduce((s, n) => s + 1 / n, 0) - 1));

const anySphShard = existsSync("public/schwarz-sph/s234-k3.json");
const anyHypShard = existsSync("public/schwarz-hyp/h237-k3.json");

describe("Schwarz board manifest", () => {
	it("gives every board a distinct id, and both geometries at least one board", () => {
		expect(new Set(SCHWARZ_BOARDS.map((b) => b.id)).size).toBe(SCHWARZ_BOARDS.length);
		expect(sphSchwarzBoards().length).toBeGreaterThan(0);
		expect(hypSchwarzBoards().length).toBeGreaterThan(0);
	});

	it("classifies each board by the sign of 1/p + 1/q + 1/r − 1", () => {
		// The board's geometry is not a label — it is forced by the angle triple, so the manifest cannot
		// disagree with the arithmetic without one of the two being wrong.
		for (const b of SCHWARZ_BOARDS) {
			const s = b.pqr.reduce((acc, n) => acc + 1 / n, 0) - 1;
			expect(s === 0 ? "euclidean" : s > 0 ? "spherical" : "hyperbolic").toBe(b.geometry);
		}
	});

	it("counts every k it lists, and lists every k it counts", () => {
		for (const b of SCHWARZ_BOARDS) {
			expect(schwarzBoardKs(b)).toEqual(Object.keys(b.counts).map(Number).sort((x, y) => x - y));
			expect(b.eagerKs.filter((k) => b.lazyKs.includes(k))).toHaveLength(0);
		}
	});

	it("reports the three boards whose k coverage has a hole", () => {
		// On (2,2,4) and (2,3,5) these are gaps in Marek's SOLVE, not facts about the board, and every
		// surface that lists a board's k values leans on this to say so. If a rerun fills them, this test
		// is the reminder.
		// ⚑ (2,2,5) is the exception and the function cannot tell them apart: its census counts a literal
		// 0 at k=9 and k=10, so those two are empty slices of the board and not a short run. Saying which
		// is which needs the census on the row, the way SPH_EDGES_BOARDS carries `complete`/`missing`.
		const gaps = Object.fromEntries(
			SCHWARZ_BOARDS.map((b) => [b.id, schwarzKGaps(b)]).filter(([, g]) => (g as number[]).length),
		);
		expect(gaps).toEqual({ "224": [8], "225": [9, 10], "235": [4] });
	});
});

describe.skipIf(!anySphShard)("spherical Schwarz shards", () => {
	it("ships one board per shard, and it is the (p,q,r) tiling", () => {
		for (const b of sphSchwarzBoards()) {
			for (const k of schwarzBoardKs(b)) {
				const shard = sphShard(b, k);
				expect(shard, `${b.id} k=${k}`).not.toBeNull();
				expect(shard!.board).toBe(b.id);
				expect(shard!.k).toBe(k);
				// The board is the whole sphere: V − E + F = 2 with F the group order.
				expect(shard!.faces).toHaveLength(triangleCount(b));
				expect(shard!.vertices.length - shard!.edges.length + shard!.faces.length).toBe(2);
				expect(shard!.patterns.length).toBe(b.counts[k]);
			}
		}
	});

	it("indexes every pattern against that one board", () => {
		for (const b of sphSchwarzBoards()) {
			const k = schwarzBoardKs(b)[0];
			const shard = sphShard(b, k)!;
			for (const p of hydrateSphShard(shard)) {
				expect(p.faceTile).toHaveLength(shard.faces.length);
				expect(p.drawn).toHaveLength(shard.edges.length);
				expect(p.vorbit).toHaveLength(shard.vertices.length);
				// Tile ids are dense, 0..tiles−1 — what lets the renderer index a colour array by them.
				expect(new Set(p.faceTile).size).toBe(p.stats.tiles);
				expect(Math.max(...p.faceTile)).toBe(p.stats.tiles - 1);
				expect([...p.drawn].filter((c) => c === "1")).toHaveLength(p.stats.drawnEdges);
			}
		}
	});

	it("develops every board's edges to one of its own class lengths", () => {
		// Three angles ⇒ up to three side lengths, and this is the check that the per-class edge table
		// reached the develop, not one length used throughout.
		for (const b of sphSchwarzBoards()) {
			const shard = sphShard(b, schwarzBoardKs(b)[0])!;
			const want = b.pqr.map((_, i) => {
				const [j, m] = [0, 1, 2].filter((x) => x !== i);
				const [A, B, C] = [Math.PI / b.pqr[j], Math.PI / b.pqr[m], Math.PI / b.pqr[i]];
				return Math.acos((Math.cos(C) + Math.cos(A) * Math.cos(B)) / (Math.sin(A) * Math.sin(B)));
			});
			for (const [u, v] of shard.edges) {
				const a = shard.vertices[u];
				const c = shard.vertices[v];
				const d = Math.acos(Math.min(1, Math.max(-1, a[0] * c[0] + a[1] * c[1] + a[2] * c[2])));
				expect(Math.min(...want.map((w) => Math.abs(d - w)))).toBeLessThan(1e-6);
			}
		}
	});

	it("turns a record into a scene whose tiles partition the board", () => {
		const shard = sphShard(sphSchwarzBoards()[0], schwarzBoardKs(sphSchwarzBoards()[0])[0])!;
		for (const p of hydrateSphShard(shard)) {
			const scene = sphSchwarzScene(p);
			expect(scene.pattern.tiles.reduce((n, t) => n + t.length, 0)).toBe(shard.faces.length);
			expect(scene.pattern.nDrawn).toBe(p.stats.drawnEdges);
			expect(scene.vertices).toBe(shard.vertices); // shared, never copied
		}
	});

	it("has exactly one nothing-drawn pattern per board, and it is the bare board", () => {
		// Draw no edge and every triangle merges into one region covering the sphere. Exactly one
		// certificate does that, and it is the underlying tiling — the decode's sanity anchor, the same
		// one the Euclidean (2,3,6) shelf uses.
		for (const b of sphSchwarzBoards()) {
			const bare = schwarzBoardKs(b).flatMap((k) =>
				(sphShard(b, k)?.patterns ?? []).filter((p) => !p.drawn.includes("1")),
			);
			expect(bare, b.id).toHaveLength(1);
			expect(bare[0].stats.tiles).toBe(1);
		}
	});
});

describe.skipIf(!anyHypShard)("hyperbolic Schwarz shards", () => {
	it("ships the per-dart data a scalene board cannot derive", () => {
		// On a regular {p,q} board the client reads a dart's turn off the polygon size and its edge off
		// the single forced ℓ. Neither works here — every face is a triangle and every edge carries a
		// digon — so alpha / elen / drawn are explicit, and glued darts must agree on the length.
		for (const b of hypSchwarzBoards()) {
			for (const k of schwarzBoardKs(b)) {
				const recs = hypShard(b, k);
				expect(recs, `${b.id} k=${k}`).not.toBeNull();
				expect(recs!.length).toBe(b.counts[k]);
				for (const r of recs!) {
					const d = r.darts;
					const n = d.rneig.length;
					expect(d.alpha).toHaveLength(n);
					expect(d.elen).toHaveLength(n);
					expect(d.drawn).toHaveLength(n);
					for (let h = 0; h < n; h++) {
						expect(d.elen![h]).toBeCloseTo(d.elen![d.glue[h]], 12);
						// A dart's turn is one of the board's three corner angles, or 0 at a digon.
						const ok = [0, ...b.pqr.map((p) => Math.PI / p)];
						expect(Math.min(...ok.map((a) => Math.abs(d.alpha![h] - a)))).toBeLessThan(1e-9);
					}
					// Every edge length is one of the board's classes.
					for (const l of new Set(d.elen!)) {
						expect(Math.min(...r.edges.map((e) => Math.abs(e - l)))).toBeLessThan(1e-9);
					}
				}
			}
		}
	});

	it("develops to a Schwarz triangle everywhere, to machine precision", () => {
		for (const b of hypSchwarzBoards()) {
			for (const k of schwarzBoardKs(b)) {
				for (const r of hypShard(b, k)!) {
					expect(r.residual.edgeErr).toBeLessThan(1e-9);
					expect(r.residual.faceErr).toBeLessThan(1e-9);
				}
			}
		}
	});

	it("gives (2,3,7) the four tilings its three edge classes allow, with the right tiles", () => {
		// The whole shelf in one case. (2,3,7) has three edge classes and Marek's run drew each of the
		// first two or not, so: nothing drawn is the bare board (unbounded); drawing only the S2–S3 class
		// merges everything round an S7 vertex, which is the {7,3} heptagon (14 triangles); drawing only
		// S2–S7 merges round an S3 vertex, the {3,7} triangle (6); drawing both leaves the two triangles
		// across an S3–S7 edge, the quasiregular rhombus (2).
		const recs = hypShard(hypSchwarzBoards().find((b) => b.id === "237")!, 3)!;
		expect(recs.map((r) => r.stats.sizes).flat().sort((a, c) => a - c)).toEqual([-1, 2, 6, 14]);
	});
});
