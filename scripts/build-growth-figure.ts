/**
 * Precompute the /defense growth demo: a k=3 seed and the first two stamps the expander can make on
 * it. Run: `pnpm tsx scripts/build-growth-figure.ts [--list] [--seed <name>] [--out <path>]`
 *
 * The slide's widget is driven entirely from the JSON this writes, so the room is looking at real
 * SeedExpander output, not a drawing: the frontier, the target vertex the DFS would take next
 * (least graph distance to the core), and every rigid placement of the seed that survives the orbit,
 * alignment and collision gates at that vertex.
 *
 * Depth 2 — the seed, one stamp, a second stamp — because that is the slide. The tree is small at
 * that depth precisely because the target vertex is the algorithm's choice and not the viewer's.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SeedExpander, type CollapsedVertex } from '@/classes/algorithm/SeedExpander';
import type { SeedConfiguration } from '@/classes/algorithm/SeedConfiguration';
import type { Polygon } from '@/classes/polygons/Polygon';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing } from '@/classes/Cyclotomic';

const K = 3;
// The 12-direction tile set. Octagons need 24 directions and blow the pool up (NOTES §11), and no
// octagon-bearing tiling exists at k ≥ 2 anyway (CLAUDE.md, settled) — so nothing is lost here.
const NS = [3, 4, 6, 12];

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: NS } };
setActiveRing(computeRing(params));

const pg = new PolygonsGenerator(params, []);
const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
const adj: Record<string, string[]> = {};
for (const vc of vcs) adj[vc.name] = [];
for (let i = 0; i < vcs.length; i++)
	for (let j = i + 1; j < vcs.length; j++)
		if (vcs[i].isCompatible(vcs[j])) { adj[vcs[i].name].push(vcs[j].name); adj[vcs[j].name].push(vcs[i].name); }
const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
const seedSets = new SeedSetExtractor(graph).findSeedSets(K);
const seeds = new SeedBuilder().buildSeeds(K, 1, { seedSetLoader: () => seedSets });
// Three DISTINCT vertex configurations: a seed repeating one VC makes a duller picture and a weaker
// point (the slide is about k orbits, so k different vertices should be visible).
const distinct = seeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size === K);
console.log(`k=${K}, tiles {${NS.join(',')}}: ${seedSets.length} seed sets, ${seeds.length} seeds, ${distinct.length} with 3 distinct VCs`);

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const encodePolys = (polys: Polygon[]) =>
	polys.map((p) => ({ n: p.n, v: (p.exactVertices ?? []).map((vx) => { const q = vx.toVector(); return [round(q.x), round(q.y)]; }) }));

/** Every distinct polygon key in `patch`, so a candidate can be stored as just what it ADDS. */
const keysOf = (polys: Polygon[]) => new Set(polys.map((p) => p.exactKey()));

interface StateOut {
	/** Open vertices of this state — everything the frontier holds. */
	frontier: [number, number][];
	/** The one the DFS takes next: least graph distance to the core. Null at a dead end. */
	target: [number, number] | null;
	/** Placements of the seed that survive every gate at `target`, in the expander's own order. */
	candidates: { add: ReturnType<typeof encodePolys>; collapsed: { at: [number, number]; orbit: number }[] }[];
}

function describe(exp: SeedExpander, seed: SeedConfiguration, patch: Polygon[], collapsed: CollapsedVertex[]): StateOut {
	const step = exp.figureStep(seed, patch, collapsed);
	const known = keysOf(patch);
	return {
		frontier: step.frontier.map((f) => { const v = f.vertex.toVector(); return [round(v.x), round(v.y)] as [number, number]; }),
		target: step.target ? (() => { const v = step.target.vertex.toVector(); return [round(v.x), round(v.y)] as [number, number]; })() : null,
		candidates: step.candidates.map((c) => ({
			add: encodePolys(c.transformedPatch.filter((p) => !known.has(p.exactKey()))),
			collapsed: c.collapsed
				.filter((cv) => !collapsed.some((old) => old.vertex.key() === cv.vertex.key()))
				.map((cv) => { const v = cv.vertex.toVector(); return { at: [round(v.x), round(v.y)] as [number, number], orbit: cv.orbitId }; }),
		})),
	};
}

const expander = new SeedExpander(K);

/** Depth-1 candidate counts, one per root candidate. The MINIMUM is the number that matters: if any
 *  first stamp leaves nothing to do, confirming it strands the demo with no second iteration. */
function survey(seed: SeedConfiguration) {
	const patch = seed.polygons.map((p) => p.clone());
	const start = expander.figureStart(seed);
	const step = expander.figureStep(seed, patch, start);
	const nexts = step.candidates.map((c) => {
		const merged = expander.figureMerge(patch, c);
		return expander.figureStep(seed, merged.patch, merged.collapsed).candidates.length;
	});
	return { tiles: patch.length, frontier: step.frontier.length, root: step.candidates.length, nexts };
}

if (flag('--list')) {
	// Chosen on evidence, not by eye: every root candidate must still admit a second stamp.
	const limit = Number(value('--limit') ?? 243);
	const rows: { i: number; name: string; s: ReturnType<typeof survey>; vcs: string }[] = [];
	for (let i = 0; i < Math.min(distinct.length, limit); i++) {
		const s = survey(distinct[i]);
		if (s.root === 0 || s.nexts.length === 0 || Math.min(...s.nexts) === 0) continue;
		rows.push({ i, name: distinct[i].name, s, vcs: distinct[i].vertexConfigurations.map((v) => v.name).join(' ') });
	}
	// Most cycling to show at BOTH steps, then fewest tiles (a smaller seed reads bigger on a slide).
	rows.sort((a, b) => (Math.min(...b.s.nexts) - Math.min(...a.s.nexts)) || (b.s.root - a.s.root) || (a.s.tiles - b.s.tiles));
	console.log(`${rows.length} of ${Math.min(distinct.length, limit)} seeds keep going at every branch\n`);
	for (const r of rows.slice(0, 25)) {
		console.log(
			`#${String(r.i).padStart(3)} tiles=${String(r.s.tiles).padStart(3)} open=${String(r.s.frontier).padStart(2)} ` +
			`stamps=${String(r.s.root).padStart(2)} then=[${r.s.nexts.join(',')}] ${r.vcs}`,
		);
	}
	process.exit(0);
}

const idx = value('--index');
const seed = idx !== undefined ? distinct[Number(idx)] : distinct[0];
if (!seed) { console.error(`no seed at index ${idx}`); process.exit(1); }

const seedPatch = seed.polygons.map((p) => p.clone());
const start = expander.figureStart(seed);
const root = describe(expander, seed, seedPatch, start);

// Depth 1: one state per confirmed candidate at the root.
const level1: StateOut[] = [];
for (let i = 0; i < root.candidates.length; i++) {
	const step = expander.figureStep(seed, seedPatch, start);
	const merged = expander.figureMerge(seedPatch, step.candidates[i]);
	level1.push(describe(expander, seed, merged.patch, merged.collapsed));
}

const out = {
	k: K,
	seedName: seed.name,
	vcs: seed.vertexConfigurations.map((v) => v.name),
	/** The k core vertices, in orbit order — the seed's own vertices, one per orbit. */
	cores: start.map((c) => { const v = c.vertex.toVector(); return { at: [round(v.x), round(v.y)] as [number, number], orbit: c.orbitId }; }),
	seedPolys: encodePolys(seedPatch),
	root,
	level1,
};

const outPath = value('--out') ?? path.join(process.cwd(), 'public', 'defense', 'growth-k3.json');
fs.writeFileSync(outPath, JSON.stringify(out));
const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log(
	`wrote ${outPath} (${kb} KB)\n` +
	`  seed ${seed.name}: ${seedPatch.length} tiles, VCs ${out.vcs.join(' ')}\n` +
	`  root: ${root.frontier.length} open vertices, target ${JSON.stringify(root.target)}, ${root.candidates.length} candidates\n` +
	`  level 1: ${level1.map((s) => s.candidates.length).join(', ')} candidates`,
);
