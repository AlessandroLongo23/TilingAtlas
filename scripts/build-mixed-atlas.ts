/*
 * build-mixed-atlas.ts — emit the "Mixed" tile-class shelf: k-uniform tilings that use a convex isotoxal
 * tile AND a concave star tile TOGETHER. Neither the isotoxal shelf (cx only) nor the star shelf (star
 * only) can contain these; they are the genuinely-new intersection found on the combined regular+isotoxal+
 * star palette (isotoxal-star-z24), pruned to overlap-free configs.
 *
 * Developed + area-certified by tools/ctrnact-oracle/export_combined_families.py (the merged cx+star corner
 * model over family_flex): each family's Σ tile area == |det basis| across its whole α-range, so every
 * shipped tiling PROVABLY tiles (the area certificate is the global-overlap check the combinatorial solver
 * lacks). One-parameter α-slider families, same schema as the isotoxal/star shelves. Currently k=1.
 *
 * Run (after export_combined_families.py):  pnpm tsx scripts/build-mixed-atlas.ts
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
	P: number;
	separable: boolean;
	members: { a_units: number[]; vertype: string }[];
	params: ParametricCellData["params"];
	cellPolygons: ParametricCellData["cellPolygons"];
	basis: ParametricCellData["basis"];
	allChecksPass: boolean;
}

const ROOT = process.cwd();
const IN_PATHS = [
	path.join(ROOT, "experiments", "results", "ctrnact-mixed-families.cells.json"),
	path.join(ROOT, "experiments", "results", "ctrnact-mixed-families-k2.cells.json"),
];
const OUT_PATH = path.join(ROOT, "public", "reference-atlas-mixed.json");
const LOG_PATH = path.join(ROOT, "experiments", "results", "mixed-atlas-build.log");
const NOTE =
	"Mixed convex-isotoxal + star family (α-slider): a k-uniform tiling using a convex isotoxal tile AND a " +
	"concave star tile together — reachable only on the combined palette. Closure proven across the whole " +
	"α-range (symbolic ℤ[ζ₂₄] development + area certificate). Family over a hand-chosen palette; not an " +
	"all-and-only completeness claim.";

const logLines: string[] = [];
function log(msg = ""): void {
	logLines.push(msg);
	console.log(msg);
}

/** Readable composition label: regular side-counts, cx side-counts marked α, star point-counts marked ★. */
function familyLabel(symbol: string): string {
	const regulars = new Set<number>();
	const cxSides = new Set<number>();
	const starPts = new Set<number>();
	for (const t of symbol.matchAll(/cx(\d+)@/g)) cxSides.add(parseInt(t[1], 10));
	for (const t of symbol.matchAll(/(\d+)S@/g)) starPts.add(parseInt(t[1], 10)); // n = star point count
	for (const t of symbol.matchAll(/[(,](\d+)[,)]/g)) regulars.add(parseInt(t[1], 10));
	// dot-separated, star folds as "n*" (so starFoldsOf picks them up) and cx tiles as "nα".
	return [
		...[...regulars].sort((a, b) => a - b).map(String),
		...[...cxSides].sort((a, b) => a - b).map((n) => `${n}α`),
		...[...starPts].sort((a, b) => a - b).map((n) => `${n}*`),
	].join(".");
}

function main(): void {
	const t0 = Date.now();
	log("=== build-mixed-atlas (convex-isotoxal + star families) ===");
	const records: FamilyRecord[] = [];
	for (const p of IN_PATHS) {
		if (!fs.existsSync(p)) {
			log(`  ⚑ families JSON missing: ${path.relative(ROOT, p)} — skipped (run export_combined_families.py)`);
			continue;
		}
		records.push(...(JSON.parse(fs.readFileSync(p, "utf8")) as { records: FamilyRecord[] }).records);
	}
	if (records.length === 0) {
		log("  ⚑ no mixed family records found — nothing to build");
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
		out.push({
			id: r.id,
			source: "mixed",
			k: r.k,
			family: familyLabel(r.familySymbol),
			renderCell,
			alphaRange: r.params[0].alphaRangeDegOpen,
			paramCell,
			discoverer: "Alessandro Longo",
			note: NOTE,
		});
		log(`  ${r.id}  ${familyLabel(r.familySymbol)}  P=${r.P}`);
	}
	fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
	fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 0) + "\n");
	const sizeKB = (fs.statSync(OUT_PATH).size / 1024).toFixed(1);
	log(`  wrote ${out.length} mixed families (${skipped} skipped) → ${path.relative(ROOT, OUT_PATH)} (${sizeKB} KB), elapsed ${((Date.now() - t0) / 1000).toFixed(2)}s`);
	fs.writeFileSync(LOG_PATH, logLines.join("\n") + "\n");
}

main();
