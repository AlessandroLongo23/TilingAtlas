// Builds public/squarings/ — every squared rectangle hiding in the atlas's polyhedra.
//
//   pnpm tsx scripts/build-squaring-shelf.ts
//
// Corpus: the 40 named solids in SPHERICAL_SOLIDS (Platonic, Archimedean, prisms/antiprisms, the two
// Johnson twins), the 20 spherical 3.4.n.4 records, and the 16 halved-Platonic records. Every edge of
// every one is tried as a battery; the results are deduplicated on the rectangle they produce, which
// collapses edges in the same symmetry orbit automatically — an edge-transitive solid comes out with
// exactly one squaring, which is a fact about the solid and not a shortcut taken here.
//
// Certification, in the style of scripts/build-planigon-shelf.mjs: nothing is written unless every
// polyhedron is a genuine oriented planar map with Euler characteristic 2 and a 3-connected skeleton,
// and every squaring tiles its rectangle exactly — no gap, no overlap, area accounted for. A failure
// exits non-zero and leaves the previous output alone, because a shelf that half-writes is worse than
// one that does not write at all.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { SPHERICAL_SOLIDS } from "@/lib/render/sphericalSolids";
import { PLATONIC_SOLIDS } from "@/lib/render/platonicSolids";
import { ARCHIMEDEAN_SOLIDS } from "@/lib/render/archimedeanSolids";
import { PRISM_ANTIPRISM_SOLIDS } from "@/lib/render/prismSolids";
import { planarMapFromFaces, eulerCharacteristic, isThreeConnected, type PlanarMap } from "@/lib/squaring/planarMap";
import { allSquarings } from "@/lib/squaring/smith";
import { tiledArea, tilesExactly } from "@/lib/squaring/classify";
import { buildPipelineRecord, toSquaringRecord } from "@/lib/squaring/pipeline";
import { bestSquaring, type PipelineIndex, type PipelineIndexEntry, type PipelineRecord, type PolyhedronSquarings, type SquaringManifest, type SquaringRecord, type SquaringSummary } from "@/lib/squaring/shelf";

const OUT_DIR = path.join(process.cwd(), "public", "squarings");
const PIPELINE_DIR = path.join(OUT_DIR, "pipeline");

// Curation for the four-stage pipeline page. The bound is legibility, not quality.
//
// It sat at 26 — the point past which tile sizes stop fitting inside their tiles — until the picker
// grew folders and turning thumbnails, which made a longer list navigable. At 60 the numbers no longer
// fit in the smaller tiles of the biggest entries, but the drawing is still honest: labelFits decides
// per TILE, so the large squares keep their numbers and the rest read as colour, and the graph stages
// stay untangled because their layout comes from the tiling. Past 60 the sides run to twenty digits and
// the figures are pure colour, which is a different kind of picture from the one this page is for.
const PIPELINE_MAX_ORDER = 60;

interface Candidate {
	id: string;
	name: string;
	source: PolyhedronSquarings["source"];
	faces: number[][];
	vertexCount: number;
	symmetryOrder: number | null;
	/** Unit vectors per vertex, for the 3D stage. */
	vertices: [number, number, number][];
	/** Which family the solid belongs to, for the picker's folders. */
	category: string;
}

// SPHERICAL_SOLIDS is a concatenation of four families and keeps no record of which is which, so the
// membership is recovered by id from the arrays that compose it. Anything left over is a Johnson solid,
// which is what the fourth slot holds.
const PLATONIC_IDS = new Set(PLATONIC_SOLIDS.map((s) => s.id));
const ARCHIMEDEAN_IDS = new Set(ARCHIMEDEAN_SOLIDS.map((s) => s.id));
const PRISM_IDS = new Set(PRISM_ANTIPRISM_SOLIDS.map((s) => s.id));

const solidCategory = (id: string): string =>
	PLATONIC_IDS.has(id)
		? "Platonic"
		: ARCHIMEDEAN_IDS.has(id)
			? "Archimedean"
			: PRISM_IDS.has(id)
				? "Prisms and antiprisms"
				: "Johnson";

const unit = (v: number[]): [number, number, number] => {
	const n = Math.hypot(v[0], v[1], v[2]) || 1;
	return [v[0] / n, v[1] / n, v[2] / n];
};

function readShelf(dir: string, source: "sph-poly" | "sph-half"): Candidate[] {
	const base = path.join(process.cwd(), "public", dir);
	let files: string[];
	try {
		files = readdirSync(base).filter((f) => f.endsWith(".json") && f !== "manifest.json");
	} catch {
		console.warn(`  (public/${dir} not present — skipping)`);
		return [];
	}
	const out: Candidate[] = [];
	for (const file of files.sort()) {
		const records = JSON.parse(readFileSync(path.join(base, file), "utf8"));
		if (!Array.isArray(records)) continue;
		for (const r of records) {
			out.push({
				id: r.id,
				// Always carry the record id, even when the record names a solid. The corpora OVERLAP —
				// `sp4-1-00002` is the octagonal prism and so is the named solid `octagonal-prism`, and
				// they produce the same 118x218 rectangle — so a name alone puts two indistinguishable
				// rows next to each other in the picker.
				name: r.solid ? `${r.solid} · ${r.id}` : `${r.family} · ${r.id}`,
				source,
				faces: r.faces,
				vertexCount: r.vertices.length,
				symmetryOrder: r.stats?.symmetryOrder ?? null,
				vertices: (r.vertices as number[][]).map(unit),
				category: source === "sph-half" ? "Halved Platonic" : "Spherical 3.4.n.4",
			});
		}
	}
	return out;
}

/**
 * The star polyhedra, filtered to those with a PLANAR skeleton.
 *
 * Only 29 of the 54 have Euler characteristic 2; the rest are higher-genus, have no planar embedding
 * and therefore no Smith diagram at all, so the filter is a real mathematical gate and not a
 * convenience. Every one of the 29 that survives it also turns out to be 3-connected.
 *
 * Some of them share a skeleton with a convex solid — the great icosahedron {3,5/2} has the
 * icosahedron's 12 vertices and 30 edges — and so produce the SAME rectangle. That is not a duplicate
 * to be filtered out: it is the construction saying, correctly, that it sees only the graph.
 */
function readStars(): Candidate[] {
	const base = path.join(process.cwd(), "public", "spherical-star");
	let files: string[];
	try {
		files = readdirSync(base).filter((f) => f.endsWith(".json"));
	} catch {
		console.warn("  (public/spherical-star not present — skipping)");
		return [];
	}
	const out: Candidate[] = [];
	let skipped = 0;
	for (const file of files.sort()) {
		const r = JSON.parse(readFileSync(path.join(base, file), "utf8"));
		if (!r?.vertices || !r?.faces || !r?.edges) continue;
		if (r.vertices.length - r.edges.length + r.faces.length !== 2) {
			skipped++;
			continue;
		}
		out.push({
			id: r.id,
			name: r.solid ? `${r.solid}` : `${r.config} · ${r.id}`,
			source: "sph-star",
			faces: r.faces,
			vertexCount: r.vertices.length,
			symmetryOrder: r.stats?.symmetryOrder ?? null,
			vertices: (r.vertices as number[][]).map(unit),
			category: "Star polyhedra",
		});
	}
	console.log(`  ${out.length} star polyhedra (${skipped} skipped: higher genus, no planar embedding)`);
	return out;
}

function collectCorpus(): Candidate[] {
	const solids: Candidate[] = SPHERICAL_SOLIDS.map((s) => ({
		id: s.id,
		name: s.name,
		source: "solid" as const,
		faces: s.faces,
		vertexCount: s.vertices.length,
		symmetryOrder: null,
		// The hand-written solids do not promise unit-length vertices; the 3D stage wants them on the
		// sphere so every skeleton is framed the same way.
		vertices: s.vertices.map(unit),
		category: solidCategory(s.id),
	}));
	console.log(`  ${solids.length} named solids`);
	const poly = readShelf("spherical-poly", "sph-poly");
	console.log(`  ${poly.length} spherical 3.4.n.4 records`);
	const half = readShelf("spherical-half", "sph-half");
	console.log(`  ${half.length} halved-Platonic records`);
	const stars = readStars();
	return [...solids, ...poly, ...half, ...stars];
}

const fail = (message: string): never => {
	console.error(`\nREFUSING TO WRITE: ${message}`);
	process.exit(1);
};

// Shared with the page, which recomputes on every battery click. See lib/squaring/pipeline.ts.
const toRecord = toSquaringRecord;

function main() {
	console.log("Collecting corpus…");
	const corpus = collectCorpus();
	console.log(`  ${corpus.length} polyhedra total\n`);

	mkdirSync(OUT_DIR, { recursive: true });

	const entries: SquaringSummary[] = [];
	const shards: PolyhedronSquarings[] = [];
	let totalSquarings = 0;
	const started = Date.now();

	corpus.forEach((c, i) => {
		const map: PlanarMap | null = planarMapFromFaces(c.faces, c.vertexCount);
		if (!map) fail(`${c.id}: face rings do not form an oriented planar map`);
		const chi = eulerCharacteristic(map as PlanarMap);
		if (chi !== 2) fail(`${c.id}: Euler characteristic ${chi}, not 2 — no planar embedding, no Smith diagram`);
		if (!isThreeConnected(map as PlanarMap)) {
			fail(`${c.id}: skeleton is not 3-connected, so it is not a convex polyhedron's graph`);
		}

		const squarings = allSquarings(map as PlanarMap);
		if (squarings.length === 0) fail(`${c.id}: produced no squarings at all`);

		for (const s of squarings) {
			if (tiledArea(s) !== s.width * s.height) {
				fail(`${c.id} battery ${s.battery}: tile area ${tiledArea(s)} != ${s.width}x${s.height}`);
			}
			if (!tilesExactly(s)) {
				fail(`${c.id} battery ${s.battery}: tiles do not cover the rectangle exactly`);
			}
		}

		const records = squarings.map(toRecord);
		const best = bestSquaring(records);
		if (!best) fail(`${c.id}: no best squaring`);

		shards.push({
			id: c.id,
			name: c.name,
			source: c.source,
			counts: { vertices: map.vertexCount, edges: map.edges.length, faces: map.faces.length },
			symmetryOrder: c.symmetryOrder,
			squarings: records,
		});
		entries.push({
			id: c.id,
			name: c.name,
			source: c.source,
			counts: { vertices: map.vertexCount, edges: map.edges.length, faces: map.faces.length },
			symmetryOrder: c.symmetryOrder,
			squarings: records.length,
			perfect: records.filter((r) => r.perfect).length,
			simple: records.filter((r) => r.simple).length,
			best: {
				battery: (best as SquaringRecord).battery,
				width: (best as SquaringRecord).width,
				height: (best as SquaringRecord).height,
				order: (best as SquaringRecord).order,
				distinct: (best as SquaringRecord).distinct,
				perfect: (best as SquaringRecord).perfect,
				simple: (best as SquaringRecord).simple,
			},
		});
		totalSquarings += records.length;

		const elapsed = (Date.now() - started) / 1000;
		const eta = (elapsed / (i + 1)) * (corpus.length - i - 1);
		const b = best as SquaringRecord;
		console.log(
			`[${String(i + 1).padStart(3)}/${corpus.length}] ${c.id.padEnd(24)} ` +
				`V=${String(map.vertexCount).padStart(3)} E=${String(map.edges.length).padStart(3)} ` +
				`sq=${String(records.length).padStart(3)} best ${b.width}x${b.height} order=${b.order} ` +
				`distinct=${b.distinct}${b.perfect ? " PERFECT" : ""}${b.perfect && b.simple ? "+SIMPLE" : ""} ` +
				`(${elapsed.toFixed(0)}s elapsed, ~${eta.toFixed(0)}s left)`,
		);
	});

	for (const shard of shards) {
		writeFileSync(path.join(OUT_DIR, `${shard.id}.json`), JSON.stringify(shard));
	}
	const manifest: SquaringManifest = { polyhedra: corpus.length, squarings: totalSquarings, entries };
	writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, "\t"));

	// ---- the curated four-stage set --------------------------------------------------------------
	console.log(`\nBuilding the pipeline set (best squaring of order <= ${PIPELINE_MAX_ORDER})…`);
	mkdirSync(PIPELINE_DIR, { recursive: true });
	const pipelineEntries: PipelineIndexEntry[] = [];

	for (const c of corpus) {
		const map = planarMapFromFaces(c.faces, c.vertexCount) as PlanarMap;
		const records = allSquarings(map).map(toRecord);
		const chosen = bestSquaring(records);
		if (!chosen || chosen.order > PIPELINE_MAX_ORDER) continue;

		// Same builder the page calls when the reader clicks a different edge, so the shipped record and
		// a live one are the same computation and cannot drift.
		const built = buildPipelineRecord(
			{
				id: c.id,
				name: c.name,
				source: c.source,
				vertices: c.vertices,
				faces: c.faces,
				symmetryOrder: c.symmetryOrder,
			},
			chosen.battery,
		);
		if (built.ok === false) {
			fail(`${c.id}: ${built.error.stage} — ${built.error.detail}`);
			continue; // unreachable: fail() exits, but it keeps the narrowing honest for the checker
		}
		const record: PipelineRecord = built.record;
		writeFileSync(path.join(PIPELINE_DIR, `${c.id}.json`), JSON.stringify(record));

		pipelineEntries.push({
			id: c.id,
			name: c.name,
			source: c.source,
			counts: record.counts,
			symmetryOrder: c.symmetryOrder,
			order: chosen.order,
			distinct: chosen.distinct,
			perfect: chosen.perfect,
			simple: chosen.simple,
			width: chosen.width,
			height: chosen.height,
			squarings: records.length,
			// Rounded: the thumbnail is ~64px, so six decimals of a unit vector buy nothing and cost a
			// third of the index's size.
			vertices: record.vertices.map((v) => v.map((c) => Number(c.toFixed(4))) as [number, number, number]),
			edges: record.edges,
			category: c.category,
		});
	}

	// Perfect first, then by how many distinct sizes survive: the list doubles as the finding.
	pipelineEntries.sort(
		(a, b) => Number(b.perfect) - Number(a.perfect) || b.distinct - a.distinct || a.order - b.order,
	);
	const index: PipelineIndex = { maxOrder: PIPELINE_MAX_ORDER, entries: pipelineEntries };
	writeFileSync(path.join(PIPELINE_DIR, "index.json"), JSON.stringify(index, null, "\t"));
	console.log(
		`  ${pipelineEntries.length} curated, ${pipelineEntries.filter((e) => e.perfect).length} of them perfect.`,
	);

	const perfect = entries.filter((e) => e.best.perfect).length;
	const perfectSimple = entries.filter((e) => e.best.perfect && e.best.simple).length;
	console.log(
		`\nWrote ${shards.length} shards + manifest to public/squarings/ — ` +
			`${totalSquarings} distinct squarings, ${perfect} polyhedra with a perfect one ` +
			`(${perfectSimple} perfect AND simple).`,
	);
}

main();
