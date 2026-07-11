/*
 * build-composable-atlas.ts — emit public/reference-atlas-composable.json, the "Composable" tile-class
 * shelf for the library. These are edge-to-edge tilings that use at least one COMPOSITE convex tile
 * (a rigid super-tile assembled from regular pieces, e.g. cx4-2.4.2.4) alongside the regular set.
 *
 * This is a DISPLAY-ONLY, palette-agnosticism demo — NOT a certified enumeration. The counts are
 * illustrative (20 at k=1, 238 at k=2), not the all-and-only result the thesis claims for the regular
 * atlas. Float geometry only (render/broadphase is the sanctioned place for float).
 *
 * Source: the Čtrnáct-engine composite development, exact ℤ[ζ₂₄], exported to
 *   experiments/composable-oracle/ctrnact-composite-{convex,decomp}-k{n}.cells.json
 * (each `{ _meta, records: [...] }`; the convex palette is the SUPERSET — it includes the decomposable
 * palette). Only records with usesComposite === true enter the shelf; pure-regular solutions already
 * live in the regular atlas.
 *
 * Per-k source: k=1 and k=2 come from the CONVEX cells. k=3 currently comes from the DECOMPOSABLE
 * cells (ctrnact-composite-decomp-k3.cells.json) because the convex k=3 solve is still running; since
 * that palette is exactly {regular + 7 decomposable tiles}, every k=3 entry here is decomposable-only.
 * When ctrnact-composite-convex-k3.cells.json lands it supersedes the decomp file automatically —
 * INPUTS lists convex first per k and takes the first file that exists.
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
}
interface CellRecord {
	id: string;
	k: number;
	family: string;
	renderCell: { cellPolygons: CellPoly[]; basis: number[][] };
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
	renderCell: { cellPolygons: CellPoly[]; basis: number[][] };
	discoverer: string;
	decomposableOnly: boolean;
	note: string;
}

const ROOT = process.cwd();
const IN_DIR = path.join(ROOT, "experiments", "composable-oracle");
const OUT_PATH = path.join(ROOT, "public", "reference-atlas-composable.json");
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
	"Palette-agnosticism demo: tilings using composite convex tiles. Illustrative shelf, not an " +
	"all-and-only enumeration.";

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

	fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
	fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 0) + "\n");

	const totalDecomp = Object.values(perK).reduce((s, v) => s + v.decomp, 0);
	const totalNon = Object.values(perK).reduce((s, v) => s + v.nonDecomp, 0);
	log("");
	log(`=== reference-atlas-composable.json written ===`);
	log(`  ${out.length} tilings → ${path.relative(ROOT, OUT_PATH)}`);
	log(`  decomposable-only ${totalDecomp}  ·  uses-non-decomposable ${totalNon}`);
	log(`  elapsed ${((Date.now() - t0) / 1000).toFixed(2)}s`);

	fs.mkdirSync(LOG_DIR, { recursive: true });
	fs.writeFileSync(LOG_PATH, logLines.join("\n") + "\n");
	console.log(`\n(log → ${path.relative(ROOT, LOG_PATH)})`);
}

main();
