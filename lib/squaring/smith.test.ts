import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SPHERICAL_SOLIDS } from "@/lib/render/sphericalSolids";
import { planarMapFromFaces, eulerCharacteristic, isThreeConnected, type PlanarMap } from "./planarMap";
import { allSquarings, squaringFrom, type Squaring } from "./smith";
import { bouwkampCode, isPerfect, isSimple, order, smithGraphOf, tiledArea, tilesExactly } from "./classify";
import { integerDet } from "./linalg";
import type { PolyhedronSquarings, SquaringManifest } from "./shelf";

// The Brooks-Smith-Stone-Tutte construction, tested the way the rest of the atlas tests geometry: not
// against snapshots, but against the invariants the mathematics guarantees. A squaring is either an
// exact tiling of its rectangle or it is nothing, and the arithmetic is exact, so every assertion here
// is an equality with no tolerance anywhere.

const solid = (id: string) => {
	const s = SPHERICAL_SOLIDS.find((x) => x.id === id);
	if (!s) throw new Error(`no solid ${id}`);
	return s;
};

const mapOf = (id: string): PlanarMap => {
	const s = solid(id);
	const m = planarMapFromFaces(s.faces, s.vertices.length);
	if (!m) throw new Error(`${id}: no planar map`);
	return m;
};

const sides = (s: Squaring) =>
	s.squares
		.map((q) => q.side)
		.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
		.join(",");

/** Kirchhoff's matrix-tree theorem: any cofactor of the Laplacian counts the graph's spanning trees. */
function spanningTrees(map: PlanarMap): bigint {
	const n = map.vertexCount;
	const L: bigint[][] = Array.from({ length: n - 1 }, () => new Array<bigint>(n - 1).fill(0n));
	for (const [u, v] of map.edges) {
		if (u < n - 1) L[u][u] += 1n;
		if (v < n - 1) L[v][v] += 1n;
		if (u < n - 1 && v < n - 1) {
			L[u][v] -= 1n;
			L[v][u] -= 1n;
		}
	}
	return integerDet(L);
}

/**
 * Replay a Bouwkamp code: place each side in turn at the leftmost of the currently highest points.
 * Deliberately a separate implementation from the encoder's — a round trip through shared code proves
 * nothing.
 */
function decodeBouwkamp(code: string): { width: bigint; height: bigint; squares: { x: bigint; y: bigint; side: bigint }[] } | null {
	const head = code.match(/^(\d+)\s+(\d+)\s+(\d+)\s/);
	if (!head) return null;
	const width = BigInt(head[2]);
	const height = BigInt(head[3]);
	const list = [...code.matchAll(/\((.*?)\)/g)].flatMap((m) => m[1].split(",").map((v) => BigInt(v.trim())));
	if (list.length !== Number(head[1])) return null;

	let runs = [{ start: 0n, end: width, depth: 0n }];
	const squares: { x: bigint; y: bigint; side: bigint }[] = [];
	for (const side of list) {
		let pick = 0;
		for (let i = 1; i < runs.length; i++) if (runs[i].depth < runs[pick].depth) pick = i;
		const { start, depth } = runs[pick];
		const end = start + side;
		if (end > width || depth + side > height) return null;
		squares.push({ x: start, y: height - depth - side, side });
		const next: typeof runs = [];
		for (const r of runs) {
			if (r.end <= start || r.start >= end) next.push(r);
			else {
				if (r.start < start) next.push({ start: r.start, end: start, depth: r.depth });
				if (r.end > end) next.push({ start: end, end: r.end, depth: r.depth });
			}
		}
		next.push({ start, end, depth: depth + side });
		next.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
		runs = next.reduce<typeof runs>((acc, r) => {
			const last = acc[acc.length - 1];
			if (last && last.depth === r.depth && last.end === r.start) last.end = r.end;
			else acc.push({ ...r });
			return acc;
		}, []);
	}
	return { width, height, squares };
}

describe("squared rectangles from polyhedra", () => {
	it("every named solid is a 3-connected planar map with Euler characteristic 2", () => {
		for (const s of SPHERICAL_SOLIDS) {
			const map = planarMapFromFaces(s.faces, s.vertices.length);
			expect(map, `${s.id}: face rings do not form an oriented planar map`).not.toBeNull();
			expect(eulerCharacteristic(map as PlanarMap), `${s.id}: V-E+F`).toBe(2);
			expect(isThreeConnected(map as PlanarMap), `${s.id}: skeleton not 3-connected`).toBe(true);
		}
	});

	it("the spherical shelves need their face rings reoriented, and every one of them takes it", () => {
		// The shipped rings are in traversal order but not consistently wound, so buildMap rejects them
		// as-is; orientFaces is what makes them usable. If a future rebuild of those shelves starts
		// emitting consistent rings this test still passes — it asserts the end state, not the repair.
		const dir = path.join(process.cwd(), "public", "spherical-poly");
		const files = readFileSync(path.join(dir, "sp3-k1.json"), "utf8");
		const records = JSON.parse(files) as { id: string; faces: number[][]; vertices: unknown[] }[];
		for (const r of records) {
			const map = planarMapFromFaces(r.faces, r.vertices.length);
			expect(map, `${r.id}: no planar map even after reorientation`).not.toBeNull();
			expect(eulerCharacteristic(map as PlanarMap), `${r.id}: V-E+F`).toBe(2);
		}
	});

	it("each squaring tiles its rectangle exactly, with no gap and no overlap", () => {
		// Coverage on the compressed grid, where 0 is a gap and 2 an overlap — the same reading the
		// tiling coverage tests use. Run over every squaring of the small solids; the shipped shelf is
		// checked separately below, subsampled, because the order-119 grids cost seconds each.
		for (const id of ["tetrahedron", "cube", "octahedron", "cuboctahedron", "truncated-tetrahedron", "metabidiminished-icosahedron"]) {
			const map = mapOf(id);
			for (const s of allSquarings(map)) {
				expect(tiledArea(s), `${id} battery ${s.battery}: tile area != w*h`).toBe(s.width * s.height);
				expect(tilesExactly(s), `${id} battery ${s.battery}: not an exact cover`).toBe(true);
			}
		}
	});

	it("width plus height counts the polyhedron's spanning trees, whichever edge is the battery", () => {
		// The matrix-tree identity behind the whole construction: a spanning tree of G either avoids the
		// battery edge, and is counted by the network's own tree count (the width), or uses it, and is
		// counted by the 2-forests separating the poles (the height). So W + H = tau(G) for EVERY edge,
		// which is a strong statement — one number the solid fixes in advance, that every one of its
		// rectangles has to hit.
		for (const id of ["tetrahedron", "cube", "octahedron", "icosahedron", "dodecahedron", "cuboctahedron"]) {
			const map = mapOf(id);
			const tau = spanningTrees(map);
			for (const edge of map.edges) {
				const s = squaringFrom(map, edge);
				expect(s, `${id}: no squaring for battery ${edge}`).not.toBeNull();
				const raw = (s as Squaring).width * (s as Squaring).reduction + (s as Squaring).forests;
				expect(raw, `${id} battery ${edge}: W+H = ${raw}, spanning trees = ${tau}`).toBe(tau);
			}
		}
	});

	it("current is conserved at every horizontal segment of the finished picture", () => {
		// Kirchhoff read back off the geometry: on any interior segment, the tiles resting on it are as
		// wide as the tiles hanging beneath it. Computed from the drawn rectangle, not from the solve,
		// so it is an independent check that the picture really is the circuit.
		for (const id of ["cube", "cuboctahedron", "metabidiminished-icosahedron", "truncated-tetrahedron"]) {
			const map = mapOf(id);
			for (const s of allSquarings(map)) {
				const above = new Map<string, bigint>();
				const below = new Map<string, bigint>();
				for (const q of s.squares) {
					const top = (q.y + q.side).toString();
					const bottom = q.y.toString();
					below.set(top, (below.get(top) ?? 0n) + q.side);
					above.set(bottom, (above.get(bottom) ?? 0n) + q.side);
				}
				for (const level of new Set([...above.keys(), ...below.keys()])) {
					if (level === "0" || level === s.height.toString()) continue;
					expect(
						below.get(level) ?? 0n,
						`${id} battery ${s.battery}: at height ${level}, ${below.get(level)} above vs ${above.get(level)} below`,
					).toBe(above.get(level) ?? 0n);
				}
			}
		}
	});

	it("the Smith graph read back off a squaring has one edge per tile and no more nodes than the solid had vertices", () => {
		// Nodes can MERGE — two vertices the solid's symmetry exchanges sit at equal potential and their
		// segments coincide — but they can never multiply. That merging is exactly the coincidence BSST
		// warn about, and the reason a 3-connected graph can still produce a compound squaring.
		for (const id of ["cube", "octahedron", "cuboctahedron", "metabidiminished-icosahedron"]) {
			const map = mapOf(id);
			for (const s of allSquarings(map)) {
				const g = smithGraphOf(s);
				expect(g.edges.length, `${id} battery ${s.battery}: edges per tile`).toBe(order(s));
				expect(
					g.levels.length,
					`${id} battery ${s.battery}: ${g.levels.length} segments from ${map.vertexCount} vertices`,
				).toBeLessThanOrEqual(map.vertexCount);
			}
		}
	});

	it("the Bouwkamp code replays to the tiling it came from", () => {
		// The notation stores side lengths only; the positions are recovered by replaying the skyline
		// greedy. If the encoder emitted in any other order the string would still look like a Bouwkamp
		// code and decode to something else, so this is the test that the notation is really ours.
		for (const id of ["cube", "cuboctahedron", "truncated-tetrahedron", "metabidiminished-icosahedron", "pentagonal-antiprism"]) {
			const map = mapOf(id);
			for (const s of allSquarings(map)) {
				const code = bouwkampCode(s);
				const back = decodeBouwkamp(code);
				expect(back, `${id} battery ${s.battery}: undecodable code ${code}`).not.toBeNull();
				const got = (back as NonNullable<typeof back>).squares
					.map((q) => `${q.x},${q.y},${q.side}`)
					.sort()
					.join(" ");
				const want = s.squares.map((q) => `${q.x},${q.y},${q.side}`).sort().join(" ");
				expect(got, `${id} battery ${s.battery}: ${code}`).toBe(want);
				expect((back as NonNullable<typeof back>).width, `${id}: decoded width`).toBe(s.width);
				expect((back as NonNullable<typeof back>).height, `${id}: decoded height`).toBe(s.height);
			}
		}
	});

	it("dual polyhedra give the same rectangle turned on its side", () => {
		// The planar dual swaps the roles of the potential and the stream function, so it swaps the two
		// coordinates. Cube against octahedron and icosahedron against dodecahedron: same tiles, same
		// multiset of sizes, width and height exchanged. Free correctness check, and the reason the two
		// members of a dual pair are never separate entries in the catalogue's story.
		for (const [a, b] of [
			["cube", "octahedron"],
			["icosahedron", "dodecahedron"],
		]) {
			const sa = allSquarings(mapOf(a));
			const sb = allSquarings(mapOf(b));
			expect(sa.length, `${a}: edge-transitive solids have exactly one squaring`).toBe(1);
			expect(sb.length, `${b}: edge-transitive solids have exactly one squaring`).toBe(1);
			expect(sa[0].width, `${a} width vs ${b} height`).toBe(sb[0].height);
			expect(sa[0].height, `${a} height vs ${b} width`).toBe(sb[0].width);
			expect(sides(sa[0]), `${a} vs ${b}: tile sizes`).toBe(sides(sb[0]));
		}
	});

	it("the five Platonic solids each have exactly one squared rectangle, and not one of them is perfect", () => {
		// Edge-transitivity leaves a single orbit to choose a battery from, so a Platonic solid has one
		// rectangle and no more. That is why BSST had to look past the regular solids: the objects with
		// the most symmetry are precisely the ones with the least to say here.
		for (const id of ["tetrahedron", "cube", "octahedron", "dodecahedron", "icosahedron"]) {
			const list = allSquarings(mapOf(id));
			expect(list.length, `${id}: distinct squarings`).toBe(1);
			expect(isPerfect(list[0]), `${id}: unexpectedly perfect`).toBe(false);
		}
	});

	it("holds the measured results for the headline solids", () => {
		// Regression pins. These numbers were computed independently in a separate prototype before this
		// module existed; if a refactor moves them, the refactor is wrong.
		const cube = allSquarings(mapOf("cube"))[0];
		expect(`${cube.width}x${cube.height}`, "cube rectangle").toBe("10x14");
		expect(order(cube), "cube order").toBe(11);

		const j62 = allSquarings(mapOf("metabidiminished-icosahedron"));
		const best = j62.find((s) => isPerfect(s) && isSimple(s));
		expect(best, "metabidiminished icosahedron: expected a perfect simple squaring").toBeDefined();
		expect(`${(best as Squaring).width}x${(best as Squaring).height}`, "J62 rectangle").toBe("1238x1102");
		expect(order(best as Squaring), "J62 order").toBe(19);
	});
});

describe("the shipped squarings shelf", () => {
	const dir = path.join(process.cwd(), "public", "squarings");
	const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as SquaringManifest;

	it("carries every polyhedron the build was given", () => {
		expect(manifest.polyhedra, "polyhedra in manifest").toBe(manifest.entries.length);
		expect(manifest.polyhedra, "corpus size").toBeGreaterThanOrEqual(76);
		expect(manifest.squarings, "total squarings").toBeGreaterThan(500);
	});

	it("agrees with itself about which squarings are perfect", () => {
		// `distinct === order` IS the definition of perfect, so a manifest where the two disagree has a
		// stale field somewhere.
		for (const e of manifest.entries) {
			expect(e.best.perfect, `${e.id}: perfect flag vs distinct=${e.best.distinct} order=${e.best.order}`).toBe(
				e.best.distinct === e.best.order,
			);
		}
	});

	it("ships tilings that are exact covers", () => {
		// Every fourth shard: the full sweep re-runs the whole build's certification and costs minutes,
		// and the build already refuses to write anything that fails it. This is a guard against a shard
		// going stale on disk, not a re-derivation.
		for (const e of manifest.entries.filter((_, i) => i % 4 === 0)) {
			const shard = JSON.parse(readFileSync(path.join(dir, `${e.id}.json`), "utf8")) as PolyhedronSquarings;
			expect(shard.squarings.length, `${e.id}: shard vs manifest count`).toBe(e.squarings);
			for (const r of shard.squarings) {
				const w = BigInt(r.width);
				const h = BigInt(r.height);
				const area = r.squares.reduce((acc, q) => acc + BigInt(q.side) * BigInt(q.side), 0n);
				expect(area, `${e.id} battery ${r.battery}: area ${area} != ${w}x${h}`).toBe(w * h);
				expect(r.squares.length, `${e.id} battery ${r.battery}: order field`).toBe(r.order);
			}
		}
	});

	it("never finds a perfect rectangle once the solid's symmetry group reaches order 6", () => {
		// The finding the article is built on, stated in the one direction the corpus actually supports.
		// Symmetry puts vertices on equal potentials and equal potentials make equal tiles, so symmetry
		// is an OBSTRUCTION to perfection: across all 21 records with |G| >= 6 there is not one perfect
		// squaring, exceptionless.
		//
		// The converse is false and deliberately not asserted. Low symmetry only PERMITS perfection —
		// 10 of the 11 records with |G| <= 4 have a perfect squaring, and shcube-half-2-00005 (|G| = 4,
		// four distinct squarings, best 13 sizes across 17 tiles) is the one that does not. Having few
		// edge orbits to search is its own obstruction, independent of the group's order.
		const withSymmetry = manifest.entries.filter((e) => e.symmetryOrder !== null);
		expect(withSymmetry.length, "records carrying a measured symmetry order").toBeGreaterThan(30);
		for (const e of withSymmetry.filter((x) => (x.symmetryOrder as number) >= 6)) {
			expect(
				e.perfect,
				`${e.id}: symmetry order ${e.symmetryOrder} yet ${e.perfect} perfect squarings of ${e.squarings}`,
			).toBe(0);
		}
		const low = withSymmetry.filter((x) => (x.symmetryOrder as number) <= 4);
		expect(low.filter((e) => e.perfect > 0).length, "low-symmetry records with a perfect squaring").toBe(
			low.length - 1,
		);
	});

	it("loses tile sizes to repeats in step with the solid's symmetry, but not monotonically", () => {
		// The obstruction is graded rather than a threshold: the shortfall — how many tile sizes the best
		// squaring gives up to repeats — rises broadly with the order of the isometry group.
		//
		// It does NOT rise monotonically, and this test asserts the weaker true statement on purpose. An
		// earlier version demanded monotonicity. That held across the 36 records the corpus had at the
		// time and broke the moment the star polyhedra arrived: |G| = 14 gives up 7 sizes where |G| = 16
		// gives up 3, and |G| = 60 gives up 22 where one |G| = 120 record gives up 20. The order of the
		// group is not the whole story — what decides the shortfall is how much of it acts on the EDGES,
		// and two groups of similar size can differ there. Do not restore the monotone version; more data
		// will break it again.
		const shortfall = (e: SquaringManifest["entries"][number]) => e.best.order - e.best.distinct;
		const measured = manifest.entries.filter((x) => x.symmetryOrder !== null);
		expect(measured.length, "records carrying a measured symmetry order").toBeGreaterThan(60);

		for (const e of measured) {
			const g = e.symmetryOrder as number;
			if (g >= 6) {
				expect(shortfall(e), `${e.id}: |G| = ${g} yet it gives up no sizes`).toBeGreaterThanOrEqual(1);
			}
			if (g >= 20) {
				expect(shortfall(e), `${e.id}: |G| = ${g} gives up only ${shortfall(e)}`).toBeGreaterThanOrEqual(4);
			}
		}

		// The trend itself, as a comparison of the two ends rather than step by step.
		const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
		const low = mean(measured.filter((e) => (e.symmetryOrder as number) <= 4).map(shortfall));
		const high = mean(measured.filter((e) => (e.symmetryOrder as number) >= 20).map(shortfall));
		expect(high, `mean shortfall: |G|<=4 is ${low}, |G|>=20 is ${high}`).toBeGreaterThan(low);
	});
});
