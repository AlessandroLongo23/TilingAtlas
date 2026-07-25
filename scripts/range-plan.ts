/*
 * range-plan.ts — widen each α-slider family to its TRUE validity interval before anything else runs.
 *
 * The exporter clips a family where the tile SPECIES changes, not where the tiling stops existing: when a
 * flexing isotoxal 2n-gon passes through a straight (180°) alternating vertex it becomes a concave nS
 * instead of a convex cx2n, a different alphabet symbol, so the export ends there. The cell is analytic in
 * δ and keeps tiling past that cut until a tile actually collapses to zero area. Everything in between is a
 * tiling the atlas was throwing away — 41 of 98 mixed families, 3,015° of arc, and for 18 of them the
 * palette has no species that could seed the arc, so no other shelf entry can be carrying it.
 *
 * The plan is measured by scripts/scan-family-ranges.py (area certificate + tile simplicity + a direct
 * covering test at the boundaries) and applied here. This runs BEFORE the merge plan, and that ordering is
 * load-bearing: once a family covers its own continuation, its former "other half" is a plain duplicate,
 * so the join census must see the widened ranges or it will splice two copies of one family.
 *
 * Findings + the two primitive bugs behind the earlier numbers: docs/DEVELOPMENT_NOTES.md §102.
 */
import fs from "node:fs";
import path from "node:path";
import { evaluateParamCell, type ParametricCellData } from "@/lib/utils/paramCell";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";

export interface RangePlan {
	ranges: {
		id: string;
		exported: [number, number];
		range: [number, number];
		snapped: [boolean, boolean];
		measured: [number, number];
		stops: [string, string];
		defaultDeg: number;
		gainDeg: number;
		fold: { centreDeg: number | null; kind: "rotation" | "reflection"; witness: [number, number] } | null;
		newArcReachable: (boolean | null)[];
		offPalette: string[];
	}[];
}

export interface ApplyRangeOptions {
	planPath: string;
	logName: string;
	log: (m?: string) => void;
	root: string;
}

/** Widen `alphaRange` / `paramCell.params[0]` in place and note the fold centre. Returns the entries. */
export function applyRangePlan(out: ReferenceTiling[], opts: ApplyRangeOptions): ReferenceTiling[] {
	const { planPath, log, root } = opts;
	const rel = (p: string): string => path.relative(root, p);
	if (!fs.existsSync(planPath)) {
		log(`  ⚑ no range plan at ${rel(planPath)} — shipping the exporter's clipped ranges`);
		log(`    (regenerate: python3 scripts/scan-family-ranges.py <cells.json…> \\`);
		log(`         experiments/results/${opts.logName}-ranges.log <palette.json> \\`);
		log(`         --emit-range-plan ${rel(planPath)})`);
		return out;
	}
	const plan = JSON.parse(fs.readFileSync(planPath, "utf8")) as RangePlan;
	const byId = new Map(out.map((t) => [t.id, t]));
	log("");
	log(`  --- range plan: ${plan.ranges.length} entr(ies) ---`);
	let widened = 0;
	let folds = 0;
	let gained = 0;
	for (const r of plan.ranges) {
		const t = byId.get(r.id);
		if (!t?.paramCell) {
			log(`  ⚑ ${r.id}: not in this build (or has no paramCell) — skipped`);
			continue;
		}
		if (t.paramCell.params.length !== 1) {
			log(`  ⚑ ${r.id}: ${t.paramCell.params.length} parameters — the plan is single-parameter, skipped`);
			continue;
		}
		const p = t.paramCell.params[0];
		const [lo, hi] = r.range;
		// The plan is measured off the same exported record this entry was built from, so a range that does
		// not contain the entry's own default means the two are out of sync — refuse rather than ship a
		// slider whose default sits outside its domain.
		if (!(lo <= p.defaultAlphaDeg && p.defaultAlphaDeg <= hi)) {
			log(`  ⚑ ${r.id}: plan range (${lo}, ${hi}) excludes default α=${p.defaultAlphaDeg} — SKIPPED`);
			continue;
		}
		if (r.gainDeg > 0.01) {
			p.alphaRangeDegOpen = [lo, hi];
			p.deltaRangeDeg = [lo - p.alpha0Deg + 0.4, hi - p.alpha0Deg - 0.4];
			t.alphaRange = [lo, hi];
			t.renderCell = evaluateParamCell(t.paramCell, p.defaultAlphaDeg) as ReferenceTiling["renderCell"];
			widened++;
			gained += r.gainDeg;
		}
		if (r.fold?.centreDeg != null) {
			p.foldCentreDeg = r.fold.centreDeg;
			p.foldKind = r.fold.kind;
			folds++;
		}
		const grew = r.gainDeg > 0.01
			? `(${r.exported[0]}, ${r.exported[1]}) → (${lo}, ${hi})  +${r.gainDeg.toFixed(2)}°`
			: `(${lo}, ${hi}) unchanged`;
		const novel = r.offPalette.length ? `  off-palette: ${r.offPalette.join(" ")}` : "";
		log(`  ${r.id}  ${grew}${r.fold?.centreDeg != null ? `  fold ${r.fold.kind} @ ${r.fold.centreDeg}°` : ""}${novel}`);
	}
	log(`  widened ${widened} range(s) by ${gained.toFixed(2)}° total; marked ${folds} fold centre(s)`);
	return out;
}

/** Prose for an entry whose range was widened past the exporter's species cut. */
export function rangeNote(r: RangePlan["ranges"][number]): string {
	const arcs: string[] = [];
	if (r.range[0] < r.exported[0] - 0.01) arcs.push(`(${r.range[0]}°, ${r.exported[0]}°)`);
	if (r.range[1] > r.exported[1] + 0.01) arcs.push(`(${r.exported[1]}°, ${r.range[1]}°)`);
	const where = arcs.length ? ` The arc${arcs.length > 1 ? "s" : ""} ${arcs.join(" and ")} ` : " ";
	return (
		`RANGE EXTENDED: the export clipped this family at ${r.exported[0]}°–${r.exported[1]}°, where a ` +
		`flexing tile's alternating vertex passes through 180° and its species changes (convex 2n-gon ↔ ` +
		`concave n-pointed star). The cell keeps tiling past that cut, so the slider now runs to where a ` +
		`tile actually reaches zero area.${where}` +
		`${arcs.length ? "was" : "is"} the analytic continuation of the same cell, verified by area ` +
		`certificate and a direct covering test.` +
		(r.offPalette.length
			? ` No configuration in it sits on the search palette (missing ${r.offPalette.join(", ")}), so these ` +
			  `tilings are not reachable as a separate family and were absent from the atlas.`
			: "")
	);
}
