/**
 * Precompute the /defense seed-building demo: a k=3 seed set, and the placements that assemble it
 * one vertex configuration at a time. Run: `pnpm tsx scripts/build-seed-figure.ts [--list] [--index n]`
 *
 * The widget on the slide is driven entirely from the JSON this writes, so the room is looking at
 * real SeedBuilder output and not a drawing: which vertices of the partial seed are open, and every
 * placement of a remaining configuration that survives its overlap and validity gates at each of
 * them. Both hooks are the builder's own public ones — `computeAvailableVertices` and
 * `enumerateVertexCompletions`, the latter being the single audited completion enumerator the
 * forward check and the lookahead scout also run through.
 *
 * WHY THE TREE BRANCHES TWICE. The builder's `expandNode` takes every open vertex with every
 * placement at once, so it makes neither choice and the viewer can make both. That means one branch
 * per (vertex, placement) pair: what is open after the second configuration goes down depends on
 * where it went as much as on which one it was, and reusing one second step under a different first
 * choice would offer placements the builder never offered there. At k=3 with six open vertices that
 * is thirty branches and about 80 kB, which is a slide's worth.
 */
import fs from "node:fs";
import path from "node:path";
import {
	CompatibilityGraph,
	PolygonsGenerator,
	PolygonType,
	SeedBuilder,
	SeedSetExtractor,
	VCGenerator,
	type GeneratorParameters,
} from "@/classes";
import { computeRing } from "@/classes/algorithm/PolygonsGenerator";
import { SeedConfiguration } from "@/classes/algorithm/SeedConfiguration";
import { VertexConfiguration } from "@/classes/algorithm/VertexConfiguration";
import { Cyclotomic, setActiveRing } from "@/classes/Cyclotomic";
import { Vector } from "@/classes/Vector";
import type { Polygon } from "@/classes/polygons/Polygon";

const K = 3;
/** The 12-direction tile set, as the growth figure uses: octagons need 24 and no k>=2 tiling has one. */
const NS = [3, 4, 6, 12];

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const value = (n: string) => {
	const i = args.indexOf(n);
	return i >= 0 ? args[i + 1] : undefined;
};

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: NS } };
setActiveRing(computeRing(params));

const pg = new PolygonsGenerator(params, []);
const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
const adj: Record<string, string[]> = {};
for (const vc of vcs) adj[vc.name] = [];
for (let i = 0; i < vcs.length; i++)
	for (let j = i + 1; j < vcs.length; j++)
		if (vcs[i].isCompatible(vcs[j])) {
			adj[vcs[i].name].push(vcs[j].name);
			adj[vcs[j].name].push(vcs[i].name);
		}
const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
// Three DISTINCT configurations: the slide is about k orbits, so k different vertices should be
// visible, and a set that repeats one makes a duller picture and a weaker point.
const seedSets = new SeedSetExtractor(graph)
	.findSeedSets(K)
	.filter((s) => new Set(s).size === K);

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const encode = (polys: Polygon[]) =>
	polys.map((p) => ({
		n: p.n,
		v: (p.exactVertices ?? []).map((vx) => {
			const q = vx.toVector();
			return [round(q.x), round(q.y)] as [number, number];
		}),
	}));

const builder = new SeedBuilder();

interface Placed {
	center: Vector;
	neighboringVertices: Vector[];
	neighboringVerticesExact: Cyclotomic[];
}

/**
 * The state of a partial seed: every open vertex, with the placements available at each.
 *
 * "Open" is `computeAvailableVertices`, which walks the placed configurations' own neighbouring
 * vertices — so an open vertex is by construction one edge from a placed centre, and nothing further
 * out is in the list at all. Vertices with no placement are kept: they are still part of the boundary
 * the room can see, and leaving them out would make the patch look smaller than it is.
 */
function encodeState(seed: SeedConfiguration, placed: Placed[], remaining: string[]) {
	const known = new Set(seed.polygons.map((p) => p.exactKey()));
	const open = builder.computeAvailableVertices(placed).map((o) => {
		const fits = builder.enumerateVertexCompletions(o.vertex, o.vertexExact, o.directions, seed, remaining);
		return {
			at: [round(o.vertex.x), round(o.vertex.y)] as [number, number],
			candidates: fits.map((c) => ({
				name: c.vc.name,
				add: encode(c.addedPolygons.filter((p) => !known.has(p.exactKey()))),
			})),
			fits,
			vertex: o.vertex,
		};
	});
	return open;
}

/** Place `vc` on `seed` at `at`, returning the node that results. */
function advance(seed: SeedConfiguration, placed: Placed[], remaining: string[], at: Vector, vc: VertexConfiguration) {
	// Drop ONE occurrence of whatever was just placed. The enumerator may have used the mirror of a
	// remaining name, so fall back to dropping the head, which keeps the count right: k placements
	// for k configurations, whatever the mirror renaming did.
	const used = remaining.findIndex((n) => n === vc.name);
	return {
		seed: new SeedConfiguration([...seed.vertexConfigurations, vc]),
		placed: [
			...placed,
			{
				center: at.copy(),
				neighboringVertices: vc.neighboringVertices.map((v) => v.copy()),
				neighboringVerticesExact: vc.neighboringVerticesExact.slice(),
			},
		],
		remaining: remaining.filter((_, i) => i !== (used >= 0 ? used : 0)),
	};
}

const strip = (open: ReturnType<typeof encodeState>) =>
	open.map(({ at, candidates }) => ({ at, candidates }));

/**
 * The whole tree the widget can walk, to depth k-1, branching on BOTH choices the viewer makes: which
 * open vertex to fill and which placement to put there. One branch per (vertex, placement) pair,
 * because what is open after the second configuration goes down depends on both — reusing one
 * second step under a different first choice would offer placements the builder never offered there.
 */
function build(seedSet: string[]) {
	const first = VertexConfiguration.fromName(seedSet[0]);
	first.computeNeighboringVertices();
	const seed = new SeedConfiguration([first]);
	const placed: Placed[] = [
		{
			center: new Vector(0, 0),
			neighboringVertices: first.neighboringVertices.map((v) => v.copy()),
			neighboringVerticesExact: first.neighboringVerticesExact.slice(),
		},
	];
	const remaining = seedSet.slice(1);

	const root = encodeState(seed, placed, remaining);
	if (!root.some((o) => o.candidates.length)) return null;

	const next: Record<string, ReturnType<typeof strip>> = {};
	root.forEach((o, vi) => {
		o.fits.forEach((fit, ci) => {
			const step = advance(seed, placed, remaining, o.vertex, fit.vc);
			next[`${vi}:${ci}`] = strip(encodeState(step.seed, step.placed, step.remaining));
		});
	});

	return { vcs: seedSet, first: encode(seed.polygons), root: strip(root), next };
}

if (flag("--list")) {
	const rows: { i: number; set: string[]; counts: number[] }[] = [];
	for (let i = 0; i < Math.min(seedSets.length, Number(value("--limit") ?? 120)); i++) {
		const out = build(seedSets[i]);
		if (!out) continue;
		// Every first placement must still offer a second somewhere: one that dead-ends strands the
		// widget with nothing to do.
		const seconds = Object.values(out.next).map((st) => st.reduce((t, o) => t + o.candidates.length, 0));
		if (!seconds.length || Math.min(...seconds) === 0) continue;
		const firsts = out.root.reduce((t, o) => t + o.candidates.length, 0);
		const openWith = out.root.filter((o) => o.candidates.length).length;
		if (openWith < 2 || firsts < 3) continue; // one vertex to click is not a choice
		const counts = [openWith, firsts, Math.min(...seconds)];
		rows.push({ i, set: seedSets[i], counts });
	}
	// Most to cycle at both steps first, then the smallest patch: a smaller seed reads bigger.
	rows.sort((a, b) => Math.min(...b.counts) - Math.min(...a.counts));
	console.log(`${rows.length} usable seed sets of ${seedSets.length}\n`);
	for (const r of rows.slice(0, 20))
		console.log(`#${String(r.i).padStart(3)} ${r.counts[0]} vertices, ${r.counts[1]} placements, then >= ${r.counts[2]}  ${r.set.join(" ")}`);
	process.exit(0);
}

const index = Number(value("--index") ?? 0);
const out = build(seedSets[index]);
if (!out) throw new Error(`seed set ${index} (${seedSets[index]?.join(" ")}) has no placement at some step`);
const outPath = value("--out") ?? path.join(process.cwd(), "public", "defense", "seed-build.json");
fs.writeFileSync(outPath, JSON.stringify({ k: K, ...out }));
console.log(
	`${outPath}: ${out.vcs.join(" ")}, ${out.root.filter((o) => o.candidates.length).length} open vertices offering ` +
		`${out.root.reduce((t, o) => t + o.candidates.length, 0)} placements, ${Object.keys(out.next).length} branches`,
);
