/**
 * The tilings the compatibility-graph slide can draw beside its graph, with the vertex configurations
 * each of them uses. Writes lib/defense/vcTilings.ts.
 *
 * Run: pnpm tsx scripts/build-compat-tilings.ts
 *
 * The point of the pairing is the slide's claim: the configurations appearing in one tiling span a
 * CONNECTED subgraph of the compatibility graph. So this script does not merely collect the words —
 * it checks that claim on every tiling it ships, and refuses to write a pool that breaks it. If the
 * relation or the extraction is ever wrong, the build stops here instead of the deck asserting
 * something false to a room.
 *
 * Reading the words out of a cell: replicate the translational cell over a window, collect the tiles
 * meeting at each vertex position, and keep the vertices whose tiles close a full turn — those are the
 * ones the window has surrounded, and `figureFromPlacedPolys` names them exactly as the deck's own
 * vertex-configuration slide does.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { COMPAT_EDGES, COMPAT_NODES } from "@/lib/defense/vcCompatibility";
import { orbitsFor } from "@/lib/defense/orbitCache";
import type { ExactCellSource } from "@/lib/services/cellCodecService";
import { figureFromPlacedPolys } from "@/lib/render/vertexFigure";
import { parseBaseCell, type RawPolygon, type TranslationalCellData } from "@/lib/utils/renderTiling";

/** How many tilings the random button cycles through. Each ships its own cell with the page. */
const POOL_PER_K = 4;
const KS = [2, 3, 4, 5];
/** Cells replicated this many periods either way: enough to close every vertex of the base cell. */
const SPAN = 2;
/** Unit-edge tiles, so corners of different vertices are half an edge apart at the closest. */
const SNAP = 1e4;

interface AtlasEntry {
	id: string;
	source: string;
	exactSource?: ExactCellSource;
	k: number;
	/** Distinct vertex TYPES: a k-uniform tiling is also m-Archimedean. */
	m: number;
	renderCell: TranslationalCellData;
}

const NODES = new Set(COMPAT_NODES.map((n) => n.word));
const NEIGHBOURS = new Map<string, Set<string>>(COMPAT_NODES.map((n) => [n.word, new Set<string>()]));
for (const [a, b] of COMPAT_EDGES) {
	NEIGHBOURS.get(a)!.add(b);
	NEIGHBOURS.get(b)!.add(a);
}

const key = (x: number, y: number) => `${Math.round(x * SNAP)},${Math.round(y * SNAP)}`;

interface Read {
	/** Every vertex configuration the tiling uses. */
	words: string[];
	/** The pairs of configurations that actually MEET along an edge of this tiling, unordered. */
	pairs: [string, string][];
	/**
	 * The configuration of each vertex ORBIT, indexed by orbit id — the same ids the `o` overlay
	 * colours its dots by. Lets the slide answer "the orbit under your pointer is this node".
	 * Undefined when the tiling has no usable exact source to take orbits from.
	 */
	orbitWords?: string[];
}

/**
 * What the tiling is made of: its configurations, and which of them are neighbours IN IT.
 *
 * The second is the part that matters for the slide. The configurations of a tiling induce a
 * subgraph of the compatibility graph, but that induced subgraph is the wrong thing to draw: it
 * carries every edge the relation allows between them, including pairs this particular tiling never
 * puts at the two ends of an edge. t5167 uses 3.4.4.6 and 3.3.3.3.6, which are compatible, and never
 * once places them together. What is drawn is what the tiling does.
 */
function wordsOf(cell: TranslationalCellData, orbitAt?: (x: number, y: number) => number): Read | null {
	const base = parseBaseCell(cell);
	if (!base || base.polys.length === 0) return null;
	const [u, v] = base.basis;

	// Tiles round each vertex position, over a window of translates.
	const at = new Map<string, RawPolygon[]>();
	for (let i = -SPAN; i <= SPAN; i++) {
		for (let j = -SPAN; j <= SPAN; j++) {
			const dx = i * u[0] + j * v[0];
			const dy = i * u[1] + j * v[1];
			for (const p of base.polys) {
				const moved: RawPolygon = {
					n: p.n,
					vertices: p.vertices.map((w) => ({ x: w.x + dx, y: w.y + dy })),
				};
				for (const w of moved.vertices) {
					const k = key(w.x, w.y);
					(at.get(k) ?? at.set(k, []).get(k)!).push(moved);
				}
			}
		}
	}

	// Name every vertex the window has closed. The rest are on the rim of the replicated block, where
	// tiles are missing, and their word would be a lie.
	const wordAt = new Map<string, string>();
	for (const [k, polys] of at) {
		const [kx, ky] = k.split(",").map((s) => Number(s) / SNAP);
		const turn = polys.reduce((t, p) => t + ((p.n - 2) * 180) / p.n, 0);
		if (Math.abs(turn - 360) > 1e-6) continue;
		const figure = figureFromPlacedPolys(
			polys.map((p) => ({ n: p.n, vertices: p.vertices.map((w) => ({ x: w.x - kx, y: w.y - ky })) })),
		);
		if (figure) wordAt.set(k, figure.word);
	}
	if (wordAt.size === 0) return null;

	// Then walk the edges. Every side of every tile is an edge of the tiling, and an edge with a named
	// vertex at both ends is one adjacency this tiling realizes. Both ends have to be named: an edge
	// running off the rim of the block says nothing.
	const pairs = new Map<string, [string, string]>();
	for (const polys of at.values()) {
		for (const p of polys) {
			for (let i = 0; i < p.vertices.length; i++) {
				const a = wordAt.get(key(p.vertices[i].x, p.vertices[i].y));
				const w = p.vertices[(i + 1) % p.vertices.length];
				const b = wordAt.get(key(w.x, w.y));
				if (!a || !b || a === b) continue;
				const [lo, hi] = a < b ? [a, b] : [b, a];
				pairs.set(`${lo}|${hi}`, [lo, hi]);
			}
		}
	}
	// Which configuration each ORBIT is. Every vertex of one orbit is carried onto every other by a
	// symmetry of the tiling, so they must all have the same configuration; if they do not, either the
	// orbit partition or the reader above is wrong, and the slide would be colouring a node for an
	// orbit that is not one configuration.
	let orbitWords: string[] | undefined;
	if (orbitAt) {
		const byOrbit = new Map<number, string>();
		for (const [k, word] of wordAt) {
			const [kx, ky] = k.split(",").map((t) => Number(t) / SNAP);
			const o = orbitAt(kx, ky);
			if (o < 0) continue;
			const seen = byOrbit.get(o);
			if (seen && seen !== word) throw new Error(`orbit ${o} holds both ${seen} and ${word}`);
			byOrbit.set(o, word);
		}
		if (byOrbit.size) {
			orbitWords = [];
			for (let o = 0; o < Math.max(...byOrbit.keys()) + 1; o++) orbitWords.push(byOrbit.get(o) ?? "");
		}
	}
	return { words: [...new Set(wordAt.values())].sort(), pairs: [...pairs.values()], orbitWords };
}

/** Is what the tiling realizes connected? The slide says it always is, and that is why. */
function connected({ words, pairs }: Read): boolean {
	if (words.length <= 1) return true;
	const adj = new Map<string, string[]>(words.map((w) => [w, []]));
	for (const [a, b] of pairs) {
		adj.get(a)!.push(b);
		adj.get(b)!.push(a);
	}
	const seen = new Set([words[0]]);
	const queue = [words[0]];
	while (queue.length) {
		for (const n of adj.get(queue.shift()!)!) {
			if (!seen.has(n)) {
				seen.add(n);
				queue.push(n);
			}
		}
	}
	return seen.size === words.length;
}

async function main() {
	const raw = await readFile(path.join(process.cwd(), "public", "reference-atlas.json"), "utf8");
	const atlas = JSON.parse(raw) as AtlasEntry[];

	const chosen: { id: string; k: number; read: Read }[] = [];
	const rejected: string[] = [];
	for (const k of KS) {
		// Spread the pick across the k-shelf instead of taking the first few, which are all one family:
		// the point of the button is that the next tiling lights a different part of the graph.
		// Galebach's catalogue only. The star shelves are in the same file, and a star tile's interior
		// angle is not (n-2)/n of a turn, so the reader below names its vertices as though the star
		// were a convex polygon of the same side count: ctrnact-star-k2-12 came out as 3.12.12 and
		// 3.4.3.12 when its family is 3.4*.12*. Those tilings are outside this graph anyway, which is
		// over the fifteen configurations of REGULAR polygons.
		const shelf = atlas
			.filter((t) => t.source === "galebach" && t.k === k && t.m >= 2)
			.sort((a, b) => a.id.localeCompare(b.id));
		const stride = Math.max(1, Math.floor(shelf.length / POOL_PER_K));
		let taken = 0;
		for (let i = 0; i < shelf.length && taken < POOL_PER_K; i += stride) {
			const t = shelf[i];
			const orbits = t.exactSource ? orbitsFor(t.id, t.exactSource) : null;
			const read = wordsOf(t.renderCell, orbits ? orbits.orbitAt : undefined);
			const unknown = read?.words.filter((w) => !NODES.has(w)) ?? [];
			if (!read || unknown.length) {
				rejected.push(`${t.id}: ${read ? `unknown word ${unknown}` : "no cell"}`);
				continue;
			}
			// The atlas records m, the number of distinct vertex types, independently of anything here.
			// If the reader above has miscounted, this is where it shows.
			if (read.words.length !== t.m)
				throw new Error(
					`${t.id}: read ${read.words.length} configurations (${read.words.join(" ")}), atlas says m = ${t.m}`,
				);
			// Anything two vertices of a real tiling do across one edge is, by definition, something
			// the compatibility relation permits. If this fires, either the reader above or
			// `VertexConfiguration.isCompatible` is wrong, and the deck must not ship either way.
			for (const [a, b] of read.pairs)
				if (!NEIGHBOURS.get(a)!.has(b))
					throw new Error(`${t.id} places ${a} next to ${b}, which the compatibility graph forbids`);
			if (!connected(read))
				throw new Error(`${t.id} uses ${read.words.join(" ")}, which is NOT connected`);
			chosen.push({ id: t.id, k, read });
			taken++;
		}
	}
	if (chosen.length < KS.length * POOL_PER_K) {
		console.warn(`only ${chosen.length} tilings; rejected:\n  ${rejected.join("\n  ")}`);
	}

	const out = `// GENERATED by scripts/build-compat-tilings.ts — do not edit by hand.
//
// The tilings the compatibility-graph slide cycles through: the vertex configurations each one uses
// and, more to the point, which of them it actually places at the two ends of an edge. Read off the
// tiling's own cell. Every entry was checked at build time to place only pairs the compatibility
// relation permits, and to be CONNECTED through those pairs — which is the claim the slide makes.

export interface CompatTiling {
	id: string;
	k: number;
	/** The configurations at its vertices, as named in COMPAT_NODES. */
	words: string[];
	/** Which of them meet along an edge OF THIS TILING. A subset of the compatibility graph's edges. */
	pairs: [string, string][];
	/** The configuration of each vertex orbit, by orbit id: the ids the orbit overlay colours by. */
	orbitWords: string[];
}

export const COMPAT_TILINGS: CompatTiling[] = [
${chosen
	.map(
		(t) =>
			`\t{ id: "${t.id}", k: ${t.k}, words: [${t.read.words.map((w) => `"${w}"`).join(", ")}], pairs: [${t.read.pairs
				.map(([a, b]) => `["${a}", "${b}"]`)
				.join(", ")}], orbitWords: [${(t.read.orbitWords ?? []).map((w) => `"${w}"`).join(", ")}] },`,
	)
	.join("\n")}
];
`;
	await writeFile("lib/defense/vcTilings.ts", out);
	console.log(`${chosen.length} tilings`);
	for (const t of chosen)
		console.log(
			`  k=${t.k} ${t.id.padEnd(8)} ${t.read.words.length} vcs, ${t.read.pairs.length} of the ${
				t.read.words.length * (t.read.words.length - 1) / 2
			} pairs realized, ${t.read.orbitWords?.length ?? 0} orbits named`,
		);
}

main();
