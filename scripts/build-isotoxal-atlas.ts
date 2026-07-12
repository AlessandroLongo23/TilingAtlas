/*
 * build-isotoxal-atlas.ts — emit the "Isotoxal" tile-class shelf for the library, as one-parameter
 * FAMILIES (α-slider), the exact analog of the star families (build-reference-atlas Phase 5).
 *
 * These are edge-to-edge k-uniform tilings using a convex isotoxal tile — an equilateral polygon whose
 * interior angles alternate α, β = (360 − 360/n) − α. Because α + β is fixed, a tiling whose vertices
 * stay balanced (equal α- and β-corners per isotoxal species) flexes: the SAME combinatorial tiling
 * exists for a continuous range of α. The ζ₂₄ grid solve sampled each family at a few α; the flex
 * detector (tools/ctrnact-oracle/export_isotoxal_families.py, reusing family_flex.py's symbolic-α
 * development + rank-2 closure proof + area certificate) collapses those samples into one family with an
 * α-slider — so isotoxal-k1-008/009/010 (75/165, 90/150, 105/135 hexagon + triangles) become ONE record.
 *
 * Grouping is by (vertex-config key, α-invariant cell face-signature): finer than the star pipeline's
 * config-only key, because isotoxal admits distinct combinatorial tilings sharing a vertex config (the
 * exporter fails loud if any family ends up with two members at the same α — that would drop a tiling).
 * Only families whose area certificate passes at all 11 α samples are shipped. Display float geometry;
 * this shelf makes no all-and-only completeness claim (the palette was hand-chosen). Currently k=1 only.
 *
 * Run (after the exporter has produced the families JSON):  pnpm tsx scripts/build-isotoxal-atlas.ts
 */
import fs from "node:fs";
import path from "node:path";
import { evaluateParamCell, type ParametricCellData } from "@/lib/utils/paramCell";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";

interface FamilyRecord {
	id: string;
	k: number;
	familySymbol: string;
	primarySpecies: string;
	flexdim: number;
	members: { a_units: number; alphaDeg: number; vertype: string }[];
	params: ParametricCellData["params"];
	cellPolygons: ParametricCellData["cellPolygons"];
	basis: ParametricCellData["basis"];
	allChecksPass: boolean;
	P: number; // parameters exposed as sliders
	separable: boolean;
}

const ROOT = process.cwd();
// One family JSON per k (produced by export_isotoxal_families.py). k≤MAIN_MAX_K ship in the eagerly-loaded
// main file; each higher k goes to its own lazy shard (reference-atlas-isotoxal-k{k}.json), mirroring the
// composable atlas — k=3 alone is ~858 families / several MB, too heavy to load with the base library.
const IN_PATHS = [
	path.join(ROOT, "experiments", "results", "ctrnact-isotoxal-families.cells.json"),
	path.join(ROOT, "experiments", "results", "ctrnact-isotoxal-families-k2.cells.json"),
	path.join(ROOT, "experiments", "results", "ctrnact-isotoxal-families-k3.cells.json"),
	path.join(ROOT, "experiments", "results", "ctrnact-isotoxal-families-k4.cells.json"),
];
const MAIN_MAX_K = 2;
const PUBLIC_DIR = path.join(ROOT, "public");
const OUT_PATH = path.join(PUBLIC_DIR, "reference-atlas-isotoxal.json");
const shardPath = (k: number): string => path.join(PUBLIC_DIR, `reference-atlas-isotoxal-k${k}.json`);
const LOG_PATH = path.join(ROOT, "experiments", "results", "isotoxal-atlas-build.log");
const NOTE =
	"One-parameter isotoxal family (α-slider): a convex tile with two alternating angles α, β = 360−360/n−α, " +
	"tiled edge-to-edge with regular polygons. Closure proven for the whole α-range (symbolic ℤ[ζ₂₄] development " +
	"+ area certificate). Family over a hand-chosen palette — not an all-and-only completeness claim.";

const logLines: string[] = [];
function log(msg = ""): void {
	logLines.push(msg);
	console.log(msg);
}

/** A readable polygon-composition label from the symbolic family word: regular side-counts, plus each
 *  isotoxal tile's side-count marked with α (e.g. "3.3.6α" = two triangles + an alternating hexagon). */
function familyLabel(symbol: string): string {
	const regulars: number[] = [];
	const isoSides = new Set<number>();
	for (const t of symbol.matchAll(/cx(\d+)@/g)) isoSides.add(parseInt(t[1], 10));
	// bare integer tokens delimited by ( , )
	for (const t of symbol.matchAll(/[(,](\d+)[,)]/g)) regulars.push(parseInt(t[1], 10));
	const regPart = regulars.sort((a, b) => a - b).join(".");
	const isoPart = [...isoSides].sort((a, b) => a - b).map((n) => `${n}α`).join(".");
	return [regPart, isoPart].filter(Boolean).join(".");
}

function main(): void {
	const t0 = Date.now();
	log("=== build-isotoxal-atlas (families / α-slider) ===");
	const records: FamilyRecord[] = [];
	for (const p of IN_PATHS) {
		if (!fs.existsSync(p)) {
			log(`  ⚑ families JSON missing: ${path.relative(ROOT, p)} — skipped (run export_isotoxal_families.py)`);
			continue;
		}
		records.push(...(JSON.parse(fs.readFileSync(p, "utf8")) as { records: FamilyRecord[] }).records);
	}
	if (records.length === 0) {
		log("  ⚑ no family records found — nothing to build");
		process.exit(1);
	}
	const out: ReferenceTiling[] = [];
	let skipped = 0;
	for (const r of records) {
		if (!r.allChecksPass) {
			log(`  ⚑ ${r.id}: area checks failed — SKIPPED (never ship an unverified family)`);
			skipped++;
			continue;
		}
		const paramCell: ParametricCellData = { params: r.params, cellPolygons: r.cellPolygons, basis: r.basis };
		const renderCell = evaluateParamCell(paramCell, r.params.map((p) => p.defaultAlphaDeg)) as ReferenceTiling["renderCell"];
		const coupled = r.flexdim > r.P; // a further free angle exists but is held fixed (not independent)
		out.push({
			id: r.id,
			source: "isotoxal",
			k: r.k,
			family: familyLabel(r.familySymbol),
			renderCell,
			alphaRange: r.params[0].alphaRangeDegOpen,
			paramCell,
			discoverer: "Alessandro Longo",
			note:
				NOTE +
				(r.P > 1 ? ` ${r.P} independent α-sliders (each isotoxal tile flexes on its own).` : "") +
				(coupled ? " ⚑ has a further coupled free angle held fixed (not independently adjustable)." : ""),
		});
		log(`  ${r.id}  ${r.familySymbol}  P=${r.P}${coupled ? " (+coupled)" : ""}`);
	}

	fs.mkdirSync(PUBLIC_DIR, { recursive: true });
	const sizeKB = (p: string): string => (fs.statSync(p).size / 1024).toFixed(1);

	// k≤MAIN_MAX_K → eager main file; each higher k → its own lazy shard.
	const main = out.filter((t) => t.k <= MAIN_MAX_K);
	const shardKs = [...new Set(out.filter((t) => t.k > MAIN_MAX_K).map((t) => t.k))].sort((a, b) => a - b);
	fs.writeFileSync(OUT_PATH, JSON.stringify(main, null, 0) + "\n");
	log(`  main k≤${MAIN_MAX_K}: ${main.length} families → ${path.relative(ROOT, OUT_PATH)} (${sizeKB(OUT_PATH)} KB)`);
	for (const k of shardKs) {
		const entries = out.filter((t) => t.k === k);
		const p = shardPath(k);
		fs.writeFileSync(p, JSON.stringify(entries, null, 0) + "\n");
		log(`  shard k=${k}: ${entries.length} families → ${path.relative(ROOT, p)} (${sizeKB(p)} KB)`);
	}
	// Drop any orphaned isotoxal shard from a prior build (a k that no longer has entries).
	for (const f of fs.readdirSync(PUBLIC_DIR)) {
		const m = /^reference-atlas-isotoxal-k(\d+)\.json$/.exec(f);
		if (m && !shardKs.includes(Number(m[1]))) {
			fs.unlinkSync(path.join(PUBLIC_DIR, f));
			log(`  removed stale shard ${f}`);
		}
	}
	log(`  total ${out.length} families (${skipped} skipped), elapsed ${((Date.now() - t0) / 1000).toFixed(2)}s`);
	fs.writeFileSync(LOG_PATH, logLines.join("\n") + "\n");
}

main();
