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
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { evaluateParamCell, type ParametricCellData } from "@/lib/utils/paramCell";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";
import { applyMergePlan } from "./merge-plan";
import { applyRangePlan, rangeNote, type RangePlan } from "./range-plan";
import { applyCoupledPlan } from "./coupled-plan";
import { stringifyAtlas } from './atlas/encode.mjs';

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
	// k=3 and k=4, added 2026-08-09. The shelf sat at k≤2 because nobody had run the palette further, not
	// because of a wall: `isotoxal-star-z24` keeps BUCKET_OK true, so it never suffered the period-3
	// optimization bug that held the composite and scaled palettes at k≤2-3. Measured: k=3 solves in 14s
	// (8 workers) and k=4 in 547s, giving 904 and 4,319 blocks that use a cx tile AND a star tile, which
	// export to 161 and 536 families with zero failing checks — every one area-certified across its whole
	// α-range, which is the same proof the k≤2 tier ships on.
	path.join(ROOT, "experiments", "results", "ctrnact-mixed-families-k3.cells.json"),
	path.join(ROOT, "experiments", "results", "ctrnact-mixed-families-k4.cells.json"),
];
const OUT_PATH = path.join(ROOT, "public", "reference-atlas-mixed.json");
/**
 * The star × scaled crossing — rigid tilings that use a star species AND a side-2 regular tile.
 *
 * `docs/TILE_TAXONOMY_AUDIT.md` §3.1 records `scaled × anything-else` as never searched, and the census on
 * `regular-star-scaled2-z24` says why it is worth searching: its regular-only, +star and +side-2 buckets
 * reproduce `regular-z24`, `star24` and `regular-doubled` EXACTLY, so the only thing the combined palette
 * adds is these. They belong on this shelf for the reason the shelf exists — a tiling reachable only when
 * two tile families are offered to the solver together — and they are rigid, so they carry no slider.
 *
 * Extended to k=3 on 2026-08-12 (56min solve, 8 workers → 658 blocks, ALL developed and area-certified):
 *
 *          k=1   k=2   k=3   tot
 *   -+-     11    20    61    92     ← A068599 exactly, octagon t1002 included (D=24)
 *   -+scl   16    61   273   350
 *   star+   26    45   101   172     ← every one already on the shipped star shelf, checked by vertype
 *   star+scl 4     8    32    44     ← the crossing; k≤2 subset reproduces the shipped 12 exactly
 *
 * The regular-only row is the load-bearing control: 92 = 11+20+61 is A068599 through k=3, so the palette
 * and the developer are both measuring the tilings and not themselves. ⚑ The +side-2 row is verified
 * against `regular-doubled` at k≤2 ONLY — no k=3 run of that palette exists, so its 273 k=3 entries are
 * unreconciled. That does not touch the crossing rows, which no other palette can produce at any k.
 *
 * ⚑ They were unshippable for half a day because `eu_develop` is a ℤ[ζ₁₂] developer and the palette is
 * D=24: it certified 2 of the 31 regular-only tilings it developed, all of which provably tile.
 * `tools/ctrnact-oracle/develop_any.py` runs the shared ℤ[ζ₂₄] engine instead and certifies 658 of 658.
 */
const CROSSING_PATH = path.join(ROOT, "experiments", "period-oracle", "star-scaled-crossing-k3.cells.json");
const PLAN_PATH = path.join(ROOT, "experiments", "results", "mixed-merge-plan.json");
const RANGE_PLAN_PATH = path.join(ROOT, "experiments", "results", "mixed-range-plan.json");
const COUPLED_PLAN_PATH = path.join(ROOT, "experiments", "results", "mixed-coupled-plan.json");
const COUPLED_ALIAS_PATH = path.join(ROOT, "lib", "services", "coupledFamilyAliases.json");
const UNMERGED_PATH = path.join(ROOT, "experiments", "results", "mixed-atlas-unmerged.json");
const ALIAS_PATH = path.join(ROOT, "lib", "services", "mergedFamilyAliases.json");
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
	// Widen first, merge second. A widened family covers its own continuation, so its former partner turns
	// into a plain duplicate — and the join census must run against the widened snapshot to see that.
	applyRangePlan(out, { planPath: RANGE_PLAN_PATH, logName: "mixed-family", log, root: ROOT });
	if (fs.existsSync(RANGE_PLAN_PATH)) {
		const plan = JSON.parse(fs.readFileSync(RANGE_PLAN_PATH, "utf8")) as RangePlan;
		const byId = new Map(out.map((t) => [t.id, t]));
		for (const r of plan.ranges) {
			const t = byId.get(r.id);
			if (t && r.gainDeg > 0.01) t.note = `${t.note ?? NOTE} ${rangeNote(r)}`;
		}
	}
	const merged = applyMergePlan(out, {
		planPath: PLAN_PATH,
		unmergedPath: UNMERGED_PATH,
		aliasPath: ALIAS_PATH,
		logName: "mixed-family",
		note: NOTE,
		log,
		root: ROOT,
	});
	// Coupled multi-parameter families LAST. applyMergePlan writes the snapshot the join census reads, and
	// that census wants the 1-parameter shelf — so collapsing slices into 2-parameter entries has to happen
	// after it, or the next census would never see the slices it is supposed to reason about.
	const final = applyCoupledPlan(merged, {
		planPath: COUPLED_PLAN_PATH,
		aliasPath: COUPLED_ALIAS_PATH,
		logName: "mixed-family",
		note: NOTE,
		log,
		root: ROOT,
	});
	// The crossing entries join AFTER the range/merge/coupled plans: those are keyed on family ids and
	// operate on α-slider records, and these have no parameter at all.
	if (fs.existsSync(CROSSING_PATH)) {
		const cross = JSON.parse(fs.readFileSync(CROSSING_PATH, "utf8")) as {
			k: number; tiles: string[]; areaOk: boolean; tileNames: string[];
			renderCell: ReferenceTiling["renderCell"];
		}[];
		const SUB: Record<string, string> = { "1": "₁", "2": "₂", "3": "₃" };
		const label = (tiles: string[]): string =>
			[...tiles].sort().map((t) => {
				const st = /^(\d+)\*(\d+)$/.exec(t);
				if (st) return `${st[1]}*`;
				const sc = /^(\d+)s(\d+)$/.exec(t);
				if (sc) return `${sc[1]}${SUB[sc[2]] ?? sc[2]}`;
				return t;
			}).filter((v, i, a) => a.indexOf(v) === i).join(".");
		let n = 0;
		for (const c of cross) {
			if (!c.areaOk) { log(`  ⚑ crossing record k=${c.k} fails its area certificate — SKIPPED`); continue; }
			n++;
			final.push({
				id: `ctrnact-cross-star-scaled-k${c.k}-${String(n).padStart(2, "0")}`,
				source: "mixed",
				k: c.k,
				family: label(c.tiles),
				renderCell: c.renderCell,
				discoverer: "Alessandro Longo",
				certification: "candidate",
				note:
					"STAR × SCALED crossing: a k-uniform tiling using a concave star species AND a side-2 regular " +
					"tile together — the one combination the regular/star/side-2 palettes cannot reach on their " +
					"own. A side-s N-gon is the degenerate sN-gon (unit edges, one real corner then s−1 flat 180° " +
					"corners, which are noncounting). Exactly area-certified in ℤ[ζ₂₄] (Σ face area = |det Λ|). " +
					"Found on a hand-built probe palette (regular {3,4,6,8,12} + the Myers star species + side-2 " +
					"{3,4,6,12}), so this is a coverage extension, not an all-and-only claim. Through k=3 that " +
					"palette's regular-only bucket is A068599 exactly (11+20+61) and every star-bearing tiling it " +
					"finds is already on the star shelf, so what it adds over the shipped catalogs is these.",
			} as ReferenceTiling);
		}
		log(`  crossing: ${n} star × scaled tilings added (rigid, no slider)`);
	}

	fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
	// k≤2 eager with the base atlas, each higher k its own lazy shard — the period shelf's arrangement,
	// for the same reason: the k=3 and k=4 tiers take this shelf from 0.5 MB to 7.8 MB, and the eager
	// bundle already carries a 34 MB base atlas. `shelf-dedup.py` reads main + every `-k*.json` beside it,
	// so the split has to happen before it runs, not after.
	const MAIN_MAX_K = 2;
	const main_ = final.filter((t) => t.k <= MAIN_MAX_K);
	const shardKs = [...new Set(final.filter((t) => t.k > MAIN_MAX_K).map((t) => t.k))].sort((a, b) => a - b);
	fs.writeFileSync(OUT_PATH, stringifyAtlas(main_) + "\n");
	for (const k of shardKs) {
		const p = OUT_PATH.replace(/\.json$/, `-k${k}.json`);
		fs.writeFileSync(p, JSON.stringify(final.filter((t) => t.k === k), null, 0) + "\n");
		log(`  shard k=${k}: ${final.filter((t) => t.k === k).length} families → ${path.relative(ROOT, p)} (${(fs.statSync(p).size / 1024).toFixed(1)} KB)`);
	}
	for (const f of fs.readdirSync(path.dirname(OUT_PATH))) {
		const m = /^reference-atlas-mixed-k(\d+)\.json$/.exec(f);
		if (m && !shardKs.includes(Number(m[1]))) fs.unlinkSync(path.join(path.dirname(OUT_PATH), f));
	}

	// ── ONE APPEARANCE PER TILING ─────────────────────────────────────────────────────────────────────
	// The merge/range/coupled plans above are keyed on ids and only cover the k≤2 tier, so the k=3 and k=4
	// families arrive with nothing having asked whether they are already on the shelf. That question is not
	// shelf-specific — a family is an affine subspace of its own map's angle space — so the period shelf's
	// check runs here unchanged, downstream of every producer, exactly as it does there. Ids are kept
	// (`--no-rename`): the mixed shelf has published deep links and `mergedFamilyAliases.json` resolves the
	// pre-merge ones.
	try {
		const dedup = execFileSync("python3", [
			path.join(ROOT, "scripts", "shelf-dedup.py"),
			"--shelf", OUT_PATH,
			"--log", path.join(ROOT, "experiments", "results", "mixed-shelf-dedup.log"),
			"--json", path.join(ROOT, "experiments", "results", "mixed-shelf-dedup.json"),
			"--no-rename", "--write",
		], { encoding: "utf8" });
		for (const line of dedup.trimEnd().split("\n").slice(-6)) log(`  ${line}`);
	} catch (e) {
		throw new Error(
			"[build-mixed-atlas] shelf-dedup.py failed; the shelf may contain a tiling more than once. " +
				`Fix it rather than skipping it. ${(e as Error).message}`,
		);
	}
	const sizeKB = (fs.statSync(OUT_PATH).size / 1024).toFixed(1);
	log(`  wrote ${final.length} mixed families (${skipped} skipped) → ${path.relative(ROOT, OUT_PATH)} (${sizeKB} KB), elapsed ${((Date.now() - t0) / 1000).toFixed(2)}s`);
	fs.writeFileSync(LOG_PATH, logLines.join("\n") + "\n");
}


main();
