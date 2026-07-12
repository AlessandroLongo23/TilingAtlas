/*
 * build-composable-atlas.ts — emit the "Composable" tile-class shelf for the library, sharded by k:
 * the low-k entries (k≤2) into public/reference-atlas-composable.json (loaded eagerly with the base
 * atlas) and each k≥3 into its own lazy shard public/reference-atlas-composable-k{k}.json, mirroring
 * the regular atlas's k≥8 shards (loadReferenceAtlasShard). These are edge-to-edge tilings that use at
 * least one COMPOSITE convex tile (a rigid super-tile assembled from regular pieces, e.g. cx4-2.4.2.4)
 * alongside the regular set.
 *
 * The distinct-tiling COUNTS are now EXACT. The shelf dedups with proof-grade ℤ[ζ₂₄] congruence
 * (lib/classes/algorithm/composable/exactComposableDedup — the same TilingCongruence stack behind the
 * regular 11/20/61 claims), so a supercell, a relabelled fundamental domain, and the same tiling emitted
 * at different target-k all collapse to one, exactly — no float in any dedup decision (NOTES §55, closing
 * the §52/§54 gap). Caveats that remain: the k-uniformity LABEL still uses the float trueVertexOrbitCount
 * (below), and COMPLETENESS of the enumeration — did the Čtrnáct solve find EVERY composite tiling — rests
 * on the same engine exhaustiveness as the regular family (a thesis-theory question, not the dedup's). So
 * this is an exact distinct-COUNT, not yet a closed all-and-only claim. Render geometry is float (the
 * sanctioned place for it).
 *
 * Source: the Čtrnáct-engine composite development, exact ℤ[ζ₂₄], exported to
 *   experiments/composable-oracle/ctrnact-composite-{convex,decomp}-k{n}.cells.json
 * (each `{ _meta, records: [...] }`; the convex palette is the SUPERSET — it includes the decomposable
 * palette). Every record now carries the exact ℤ[ζ₂₄] coordinates the dedup consumes (cellPolygons.exact
 * /name + exactBasis, from export_composable_cells.py); the build strips them before writing the shelf so
 * the public JSON keeps only n/vertices/star + basis. Only usesComposite records enter the shelf;
 * pure-regular solutions already live in the regular atlas. INPUTS prefers the convex cells per k.
 *
 * Decomposable split: a tiling is "decomposable-family" iff every cx… tile it uses is one of the 7
 * tiles that dissect into regular pieces (DECOMPOSABLE below); using any of the 4 non-decomposable
 * composites (cx6-3.5.3.5.3.5, cx6-3.4.5.3.4.5, cx8-4.5.4.5.4.5.4.5, cx8-3.5.5.5.3.5.5.5) flips it to
 * the uses-non-decomposable group. Stamped per record as `decomposableOnly`.
 *
 * Run: pnpm tsx scripts/build-composable-atlas.ts
 */
import fs from "node:fs";
import path from "node:path";
import { trueVertexOrbitCount } from "@/classes/algorithm/composable/canonicalTilingKey";
import { exactComposableKeys, type ExactComposableCell } from "@/classes/algorithm/composable/exactComposableDedup";

// The 7 composite convex tiles that dissect into regular polygons (the decomposable palette).
const DECOMPOSABLE = new Set([
	"cx4-2.4.2.4",
	"cx5-2.5.3.3.5",
	"cx6-2.5.5.2.5.5",
	"cx7-3.5.4.5.3.5.5",
	"cx8-4.4.5.5.4.4.5.5",
	"cx9-4.5.5.4.5.5.4.5.5",
	"cx10-4.5.5.5.5.4.5.5.5.5",
]);

interface CellPoly {
	n: number;
	vertices: number[][];
	star?: boolean;
	// Exact ℤ[ζ₂₄] fields (present in the regenerated cells) — consumed by the exact dedup, stripped before
	// the shelf JSON is written (renderTiling.ts needs only n/vertices/star).
	name?: string;
	exact?: number[][];
}
interface RenderCell {
	cellPolygons: CellPoly[];
	basis: number[][];
	exactBasis?: number[][];
}
interface CellRecord {
	id: string;
	k: number;
	family: string;
	renderCell: RenderCell;
	usesComposite?: boolean;
	tiles?: string[];
}
interface CellFile {
	_meta?: unknown;
	records: CellRecord[];
}

// Mirror of lib/services/referenceAtlas.ts ReferenceTiling, the fields a composable entry carries.
// No certification / wallpaperGroup / m / partition — those don't apply to a demo shelf.
interface ComposableTiling {
	id: string;
	source: "composable";
	k: number;
	family: string;
	renderCell: RenderCell;
	discoverer: string;
	decomposableOnly: boolean;
	note: string;
}

const ROOT = process.cwd();
const IN_DIR = path.join(ROOT, "experiments", "composable-oracle");
const PUBLIC_DIR = path.join(ROOT, "public");
const OUT_PATH = path.join(PUBLIC_DIR, "reference-atlas-composable.json");
const shardPath = (k: number): string => path.join(PUBLIC_DIR, `reference-atlas-composable-k${k}.json`);
// k≤MAIN_MAX_K ships in the eagerly-loaded main file; each higher k is written to its own lazy shard
// (reference-atlas-composable-k{k}.json), mirroring the regular atlas's k≥8 shards. The k=3 convex
// solve will add thousands of tilings to the k=3 shard without bloating the main /library + /play load.
const MAIN_MAX_K = 2;
const LOG_DIR = path.join(ROOT, "experiments", "results");
const LOG_PATH = path.join(LOG_DIR, "composable-atlas-build.log");

// Per k, candidate cells files in PREFERENCE order (first existing wins). Convex is the superset
// palette and is preferred; the decomposable-only palette is the k=3 fallback while the convex k=3
// solve runs. Keep this simple — a two-entry list per k, first hit is used.
const INPUTS: { k: number; files: string[] }[] = [
	{ k: 1, files: ["ctrnact-composite-convex-k1.cells.json"] },
	{ k: 2, files: ["ctrnact-composite-convex-k2.cells.json"] },
	{
		k: 3,
		files: ["ctrnact-composite-convex-k3.cells.json", "ctrnact-composite-decomp-k3.cells.json"],
	},
];

const NOTE =
	"Tilings using composite convex tiles; distinct-tiling counts are exact (ℤ[ζ₂₄] congruence dedup).";

const logLines: string[] = [];
function log(msg = ""): void {
	logLines.push(msg);
	console.log(msg);
}

function readRecords(file: string): CellRecord[] {
	const p = path.join(IN_DIR, file);
	if (!fs.existsSync(p)) {
		log(`  ⚑ ${file} missing — skipped`);
		return [];
	}
	const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as CellFile | CellRecord[];
	return Array.isArray(parsed) ? parsed : parsed.records ?? [];
}

// First candidate file that exists on disk (preference order), or null if none are present yet.
function resolveFile(files: string[]): string | null {
	for (const f of files) if (fs.existsSync(path.join(IN_DIR, f))) return f;
	return null;
}

// A cx… tile decomposes iff it's in DECOMPOSABLE; a tiling is decomposable-family iff EVERY cx tile it
// uses decomposes (i.e. it references none of the 4 non-decomposable composites). Pure-regular tokens
// (e.g. "3", "6") are ignored — they never gate the classification.
function isDecomposableOnly(tiles: string[] | undefined): boolean {
	const cx = (tiles ?? []).filter((t) => t.startsWith("cx"));
	return cx.every((t) => DECOMPOSABLE.has(t));
}

// Collapse entries that describe the SAME infinite tiling under a different fundamental domain,
// supercell, sheared basis, or orbit/@-index relabelling. The composite engine emits many such
// representations and this shelf previously ingested them verbatim (unlike the regular atlas, which
// dedups with dedupeByCongruence). We can't reuse that exact-ℤ[ζ] dedup here (float-only cells, and it
// treats a primitive cell and its supercell as distinct), so we use a fundamental-domain-invariant
// float key (canonicalTilingKey). Keeps the most primitive representative (fewest cell polygons, then
// smallest cell), logs every merge, and with --verify-dedup re-checks that a wider patch radius yields
// the same distinct count (proving the merges aren't false — i.e. no genuinely distinct tiling dropped).
function dedupeComposable(out: ComposableTiling[]): ComposableTiling[] {
	const cellArea = (t: ComposableTiling): number => {
		const [[ux, uy], [vx, vy]] = t.renderCell.basis;
		return Math.abs(ux * vy - uy * vx);
	};
	// EXACT ℤ[ζ₂₄] congruence dedup (lib/classes/algorithm/composable/exactComposableDedup) — proof-grade,
	// replacing the float canonicalTilingKey heuristic. Key on the tiling itself, NOT k#tiling: the engine's
	// separate k-solves each emit the same tiling under their own target k (the dodecagon+cx6 tiling appears
	// as k=2 AND k=3), so the render must collapse regardless of the unreliable k label; relabelling to the
	// true k happens after, once per distinct tiling.
	const cells: ExactComposableCell[] = out.map((t, i) => {
		const rc = t.renderCell;
		if (!rc.exactBasis || rc.cellPolygons.some((cp) => !cp.exact || !cp.name)) {
			throw new Error(
				`[build-composable-atlas] ${out[i].id} lacks exact ℤ[ζ₂₄] coords — regenerate the cells with the ` +
					`updated export_composable_cells.py (it emits cellPolygons.exact/name + exactBasis).`,
			);
		}
		return {
			cellPolygons: rc.cellPolygons.map((cp) => ({ n: cp.n, name: cp.name!, exact: cp.exact!, star: cp.star })),
			exactBasis: rc.exactBasis,
		};
	});
	const { keys, distinct, reduced } = exactComposableKeys(cells);

	const groups = new Map<string, number[]>();
	keys.forEach((key, i) => (groups.get(key) ?? groups.set(key, []).get(key)!).push(i));
	const survivors: ComposableTiling[] = [];
	const mergeLog: string[] = [];
	let merged = 0;
	for (const [, idxs] of groups) {
		idxs.sort((a, b) => {
			const pa = out[a].renderCell.cellPolygons.length;
			const pb = out[b].renderCell.cellPolygons.length;
			if (pa !== pb) return pa - pb; // fewest polygons ⇒ the primitive representation (kept for display)
			const aa = cellArea(out[a]);
			const ab = cellArea(out[b]);
			if (Math.abs(aa - ab) > 1e-6) return aa - ab;
			return a - b; // deterministic
		});
		survivors.push(out[idxs[0]]);
		if (idxs.length > 1) {
			merged += idxs.length - 1;
			mergeLog.push(`    ${out[idxs[0]].id}  ⇐  ${idxs.slice(1).map((i) => out[i].id).join(", ")}`);
		}
	}
	survivors.sort((a, b) => a.id.localeCompare(b.id)); // stable original order (IDs kept, gaps allowed)
	log(
		`  dedup (EXACT ℤ[ζ₂₄] congruence): ${out.length} → ${distinct} distinct tilings ` +
			`(${merged} duplicate representations merged; ${reduced} supercells primitive-reduced)`,
	);
	for (const line of mergeLog) log(line);
	return survivors;
}

function main(): void {
	const t0 = Date.now();
	log("=== build-composable-atlas ===");
	const out: ComposableTiling[] = [];
	const unknownCx = new Set<string>();
	const perK: Record<number, { total: number; decomp: number; nonDecomp: number }> = {};

	for (const { k, files } of INPUTS) {
		perK[k] = { total: 0, decomp: 0, nonDecomp: 0 };
		const file = resolveFile(files);
		if (!file) {
			log(`  k=${k}: no cells file present (${files.join(", ")}) — skipped`);
			continue;
		}
		const records = readRecords(file);
		const composite = records.filter((r) => r.usesComposite === true);
		composite.forEach((r, i) => {
			for (const t of r.tiles ?? []) {
				if (t.startsWith("cx") && !DECOMPOSABLE.has(t)) {
					// Not decomposable — either one of the 4 known non-decomposables or a name we don't know.
					const KNOWN_NON = ["cx6-3.5.3.5.3.5", "cx6-3.4.5.3.4.5", "cx8-4.5.4.5.4.5.4.5", "cx8-3.5.5.5.3.5.5.5"];
					if (!KNOWN_NON.includes(t)) unknownCx.add(t);
				}
			}
			const decomposableOnly = isDecomposableOnly(r.tiles);
			out.push({
				id: `composable-k${k}-${String(i).padStart(3, "0")}`,
				source: "composable",
				k: r.k,
				family: r.family,
				renderCell: r.renderCell, // { cellPolygons, basis } — consumed directly by renderTiling.ts
				discoverer: "Alessandro Longo",
				decomposableOnly,
				note: NOTE,
			});
			perK[k].total++;
			if (decomposableOnly) perK[k].decomp++;
			else perK[k].nonDecomp++;
		});
		log(
			`  k=${k} [${file}]: ${composite.length} usesComposite of ${records.length} records  ` +
				`(decomposable-only ${perK[k].decomp}, uses-non-decomposable ${perK[k].nonDecomp})`,
		);
	}

	if (unknownCx.size > 0) {
		log(`  ⚑ WARNING: cx tiles not in either known palette — treated as non-decomposable: ${[...unknownCx].join(", ")}`);
	}

	// Dedup: the raw counts above are pre-dedup (one row per source representation). Collapse
	// same-tiling duplicates before writing the shelf.
	log("");
	const deduped = dedupeComposable(out);

	// Relabel k to the TRUE vertex-orbit count under the FULL symmetry group (mirror-merged). The
	// composite engine counts orbits chirally (orientation-preserving subgroup only), so an achiral
	// tiling whose vertex figures come in mirror pairs gets its k inflated — e.g. the dodecagon+cx9 p6m
	// tiling lands at k=3 when it is really k=2. trueVertexOrbitCount is always ≤ the engine k, so a
	// tiling only ever moves DOWN a shelf; genuinely chiral tilings are left untouched.
	log("");
	log("=== relabel k → true vertex-orbit count (mirror-merged, matching the regular atlas) ===");
	let relabeled = 0;
	const moves: string[] = [];
	for (const t of deduped) {
		const tk = trueVertexOrbitCount(t.renderCell, t.k);
		if (tk !== t.k) {
			relabeled++;
			if (moves.length < 40) moves.push(`    ${t.id}  k=${t.k} → k=${tk}  [${t.family.slice(0, 56)}]`);
			t.k = tk;
		}
	}
	log(`  ${relabeled} of ${deduped.length} tilings were chirally over-counted; relabeled to their true (lower) k`);
	for (const m of moves) log(m);
	if (relabeled > moves.length) log(`    … and ${relabeled - moves.length} more`);
	// Reassign ids so the k in each id matches its corrected shelf (ids are cosmetic; nothing references
	// them). Renumber contiguously per corrected k, in stable order.
	const byNewK = new Map<number, ComposableTiling[]>();
	for (const t of [...deduped].sort((a, b) => a.id.localeCompare(b.id))) {
		(byNewK.get(t.k) ?? byNewK.set(t.k, []).get(t.k)!).push(t);
	}
	for (const [k, list] of byNewK) list.forEach((t, i) => (t.id = `composable-k${k}-${String(i).padStart(3, "0")}`));

	// Strip the exact ℤ[ζ₂₄] fields (used only for the dedup) — renderTiling.ts consumes only n/vertices/star
	// + basis, and keeping the exact coords would balloon the shelf JSON.
	for (const t of deduped) {
		t.renderCell = {
			cellPolygons: t.renderCell.cellPolygons.map((cp) => ({ n: cp.n, vertices: cp.vertices, star: cp.star })),
			basis: t.renderCell.basis,
		};
	}

	fs.mkdirSync(PUBLIC_DIR, { recursive: true });

	// Split the deduped, relabelled shelf: k≤MAIN_MAX_K into the eagerly-loaded main file, each higher k
	// into its own lazy shard. Every entry has exactly one (true) k and lands in exactly one file.
	const main = deduped.filter((t) => t.k <= MAIN_MAX_K);
	const shardKs = [...new Set(deduped.filter((t) => t.k > MAIN_MAX_K).map((t) => t.k))].sort((a, b) => a - b);
	const sizeKB = (p: string): string => (fs.statSync(p).size / 1024).toFixed(1);

	fs.writeFileSync(OUT_PATH, JSON.stringify(main, null, 0) + "\n");
	log("");
	log(`=== composable atlas written (main + ${shardKs.length} shard${shardKs.length === 1 ? "" : "s"}) ===`);
	log(`  main  k≤${MAIN_MAX_K}: ${main.length} tilings → ${path.relative(ROOT, OUT_PATH)}  (${sizeKB(OUT_PATH)} KB)`);
	for (const k of shardKs) {
		const entries = deduped.filter((t) => t.k === k);
		const p = shardPath(k);
		fs.writeFileSync(p, JSON.stringify(entries, null, 0) + "\n");
		log(`  shard k=${k}: ${entries.length} tilings → ${path.relative(ROOT, p)}  (${sizeKB(p)} KB)`);
	}

	// Drop any orphaned composable shard from a prior build (a k that no longer has entries) so we never
	// serve a stale shard. Only touches reference-atlas-composable-k{n}.json — this script's own outputs.
	for (const f of fs.readdirSync(PUBLIC_DIR)) {
		const m = /^reference-atlas-composable-k(\d+)\.json$/.exec(f);
		if (m && !shardKs.includes(Number(m[1]))) {
			fs.unlinkSync(path.join(PUBLIC_DIR, f));
			log(`  removed stale shard ${f}`);
		}
	}

	const totalDecomp = deduped.filter((t) => t.decomposableOnly).length;
	const totalNon = deduped.length - totalDecomp;
	log(`  total ${deduped.length} tilings  (${out.length} raw before dedup)`);
	log(`  decomposable-only ${totalDecomp}  ·  uses-non-decomposable ${totalNon}`);
	log(`  elapsed ${((Date.now() - t0) / 1000).toFixed(2)}s`);

	fs.mkdirSync(LOG_DIR, { recursive: true });
	fs.writeFileSync(LOG_PATH, logLines.join("\n") + "\n");
	console.log(`\n(log → ${path.relative(ROOT, LOG_PATH)})`);
}

main();
