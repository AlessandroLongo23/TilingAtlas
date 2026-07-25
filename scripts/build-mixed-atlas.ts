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
import { evaluateParamCell, type ParametricCellData, type ParamSegment, type ParamTerm } from "@/lib/utils/paramCell";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";

/* Merge plan (scripts/scan-family-joins.py --emit-merge-plan): pairs of exported families that are the two
 * halves of ONE continuous deformation, cut where the flexing tile's alternating vertex crosses 180°. See
 * docs/superpowers/specs/2026-07-25-mixed-family-merge-design.md. Absent plan ⇒ build the unmerged shelf. */
interface MergePlan {
	merges: {
		id: string; // survivor: the lower-numbered of the two ids
		aliases: string[];
		coordinate: "theta" | "sweep";
		range: [number, number];
		joinAt: number;
		defaultDeg: number;
		segments: {
			sourceId: string;
			range: [number, number];
			alphaOf: { m: number; c: number };
			alpha0Deg: number;
			pose: MergePose;
			starFlags: boolean[]; // per cellPolygon, unified across the seam so no tile changes colour there
		}[];
	}[];
	aliases: Record<string, { to: string; uOf: { m: number; c: number } }>;
}

/** The isometry that carries one half's frame onto the other's. Identity for the primary half. */
interface MergePose {
	rot: [number, number]; // unit complex ζ
	rotDeg: number;
	conj: boolean; // reflect first (z ↦ ζ·conj(z))
	translate: [number, number];
}

/**
 * Rewrite a symbolic vertex under a rigid motion, so the two halves of a merged family sit in ONE frame and
 * the pattern does not jump as the slider crosses the seam.
 *
 * A term [m, re, im] contributes (re+i·im)·e^{i·m·δ}. Rotating by ζ scales every coefficient by ζ.
 * Reflecting conjugates each coefficient AND negates its exponent, since conj(e^{i·m·δ}) = e^{−i·m·δ}.
 * Translating appends one constant (m = 0) term — vertices only: a basis vector is a difference, so it
 * rotates and reflects but must NOT be shifted.
 */
function posed(terms: ParamTerm[], pose: MergePose, translate: boolean): ParamTerm[] {
	const [zr, zi] = pose.rot;
	const out: ParamTerm[] = terms.map(([m, re, im]) => {
		const cr = re;
		const ci = pose.conj ? -im : im;
		const mm = pose.conj ? (typeof m === "number" ? -m : m.map((x) => -x)) : m;
		return [mm, zr * cr - zi * ci, zr * ci + zi * cr];
	});
	if (translate && (pose.translate[0] !== 0 || pose.translate[1] !== 0)) {
		out.push([0, pose.translate[0], pose.translate[1]]);
	}
	return out;
}

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
const PLAN_PATH = path.join(ROOT, "experiments", "results", "mixed-merge-plan.json");
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
	const merged = applyMergePlan(out, log);
	fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
	fs.writeFileSync(OUT_PATH, JSON.stringify(merged, null, 0) + "\n");
	const sizeKB = (fs.statSync(OUT_PATH).size / 1024).toFixed(1);
	log(`  wrote ${merged.length} mixed families (${skipped} skipped) → ${path.relative(ROOT, OUT_PATH)} (${sizeKB} KB), elapsed ${((Date.now() - t0) / 1000).toFixed(2)}s`);
	fs.writeFileSync(LOG_PATH, logLines.join("\n") + "\n");
}

/**
 * Splice each planned pair into one entry with one monotone slider, drop the absorbed ids, and write the
 * alias table the app uses to keep their old links working.
 *
 * The survivor keeps its id and its `family` label — the label is the shelf's grouping and search key, so
 * rewriting it to name both halves would reshuffle the variant groups; the halves go in `familyHalves` and
 * are spelled out in the note instead. Every other field is rebuilt from the merged cell.
 */
function applyMergePlan(out: ReferenceTiling[], log: (m?: string) => void): ReferenceTiling[] {
	// The scanner needs the UNMERGED shelf to find the joins, and the shipped file is the merged one, so
	// snapshot the pre-merge array here. That closes the loop: build → snapshot → scan the snapshot → build.
	fs.writeFileSync(UNMERGED_PATH, JSON.stringify(out, null, 0) + "\n");
	log(`  pre-merge snapshot (${out.length}) → ${path.relative(ROOT, UNMERGED_PATH)}`);
	if (!fs.existsSync(PLAN_PATH)) {
		log(`  ⚑ no merge plan at ${path.relative(ROOT, PLAN_PATH)} — shipping the UNMERGED shelf`);
		log(`    (regenerate: python3 scripts/scan-family-joins.py ${path.relative(ROOT, UNMERGED_PATH)} \\`);
		log(`         experiments/results/mixed-family-joins.log --emit-merge-plan ${path.relative(ROOT, PLAN_PATH)})`);
		return out;
	}
	const plan = JSON.parse(fs.readFileSync(PLAN_PATH, "utf8")) as MergePlan;
	const byId = new Map(out.map((t) => [t.id, t]));
	const absorbed = new Set<string>();
	log("");
	log(`  --- merge plan: ${plan.merges.length} merge(s) ---`);
	for (const m of plan.merges) {
		const sources = m.segments.map((s) => byId.get(s.sourceId));
		if (sources.some((s) => !s)) {
			log(`  ⚑ ${m.id}: source family missing from this build — merge SKIPPED`);
			continue;
		}
		const primary = byId.get(m.id)!;
		const segments: ParamSegment[] = m.segments.map((s, i) => ({
			sourceId: s.sourceId,
			range: s.range,
			alphaOf: s.alphaOf,
			alpha0Deg: s.alpha0Deg,
			...(s.pose.rotDeg || s.pose.conj || s.pose.translate.some((x) => x !== 0)
				? { poseDeg: s.pose.rotDeg, poseConj: s.pose.conj, poseTranslate: s.pose.translate }
				: {}),
			// `star` is the renderer's hue selector (star ramp vs by-side-count ramp), so it is taken from the
			// plan's seam-unified flags rather than the source family's: the flexing tile is a concave star on
			// one half and convex on the other, and keeping each half's own flag would flip its colour at the
			// join even though its shape is continuous.
			cellPolygons: sources[i]!.paramCell!.cellPolygons.map((poly, j) => ({
				n: poly.n,
				...(s.starFlags[j] ? { star: true } : {}),
				vertices: poly.vertices.map((v) => posed(v, s.pose, true)),
			})),
			basis: [posed(sources[i]!.paramCell!.basis[0], s.pose, false), posed(sources[i]!.paramCell!.basis[1], s.pose, false)],
		}));
		const p0 = primary.paramCell!.params[0];
		const paramCell: ParametricCellData = {
			params: [{
				name: m.coordinate,
				alpha0Deg: segments[0].alpha0Deg,
				deltaRangeDeg: [m.range[0] - m.defaultDeg, m.range[1] - m.defaultDeg],
				alphaRangeDegOpen: m.range,
				defaultAlphaDeg: m.defaultDeg,
				...(p0.tile ? { tile: p0.tile } : {}),
			}],
			// back-compat: the first segment's cell, so a consumer that ignores `segments` still draws a
			// real tiling (the first half of the sweep) instead of failing.
			cellPolygons: segments[0].cellPolygons,
			basis: segments[0].basis,
			segments,
		};
		const halves = m.segments.map((s) => byId.get(s.sourceId)!.family) as [string, string];
		primary.paramCell = paramCell;
		primary.alphaRange = m.range;
		primary.renderCell = evaluateParamCell(paramCell, m.defaultDeg) as ReferenceTiling["renderCell"];
		primary.familyHalves = halves;
		primary.mergedFrom = m.segments.map((s) => s.sourceId);
		primary.note =
			`${NOTE} MERGED: one continuous sweep spliced from two exported halves (${halves.join(" ↔ ")}), ` +
			`joined at ${m.coordinate} = ${m.joinAt}° where the flexing tile's alternating vertex is straight ` +
			`(180°) — concave star on one side, convex on the other. The slider is ` +
			`${m.coordinate === "theta" ? "that tile's own alternating interior angle" : "cumulative sweep angle"}` +
			`, monotone across the join.`;
		for (const a of m.aliases) absorbed.add(a);
		log(`  ${m.id}  ${m.coordinate} ∈ (${m.range[0]}°, ${m.range[1]}°) join ${m.joinAt}°  ← ${halves.join(" ↔ ")}`);
	}
	// Duplicate-only absorptions (an α-reversed re-export) never appear as a merge but must still go.
	for (const [from, a] of Object.entries(plan.aliases)) {
		if (byId.has(from) && byId.has(a.to)) absorbed.add(from);
	}
	const kept = out.filter((t) => !absorbed.has(t.id));
	fs.writeFileSync(ALIAS_PATH, JSON.stringify(plan.aliases, null, 1) + "\n");
	log(`  absorbed ${absorbed.size} id(s): ${[...absorbed].sort().join(", ")}`);
	log(`  alias table (${Object.keys(plan.aliases).length} entries) → ${path.relative(ROOT, ALIAS_PATH)}`);
	return kept;
}

main();
