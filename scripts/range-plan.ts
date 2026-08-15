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
	/**
	 * Multi-parameter families. A single interval cannot describe them: P free angles have a REGION, and
	 * the region the exporter ships is the convex polytope where every corner stays under 180°. Past that
	 * a corner goes reflex, the tile turns concave, and the tiling carries on — the same species cut that
	 * `ranges` undoes in one dimension.
	 *
	 * Two shapes, because the runtime enforces two different things. P=2 draws `regionVertices` on the pad
	 * and projects onto it (`nearestInRegionDeg`), so the measured polygon is the whole answer. P≥3 has no
	 * pad and is governed by `clampToRegion`, which tests HALF-PLANES — so widening it means raising those,
	 * and `limitUnits` is the verified bound they may be raised to.
	 */
	regions?: {
		id: string;
		P: number;
		exportedAxes: [number, number][];
		axes: [number, number][];
		axisStops: [string, string][];
		gainDeg: number;
		regionVertices?: [number, number][];
		regionStops?: Record<string, number>;
		/** Measured upper bound for every corner half-plane, in δ-units (1 unit = 15°). Null when unmeasured. */
		limitUnits?: number | null;
	}[];
}

export interface ApplyRangeOptions {
	planPath: string;
	logName: string;
	log: (m?: string) => void;
	root: string;
}

/**
 * Raise a single-parameter family's corner half-planes to clear its widened interval.
 *
 * Widening `alphaRangeDegOpen` alone is not enough when the family also ships `region`: `clampToRegion`
 * runs on EVERY evaluation regardless of P, so a corner still capped at 180° pulls the angle straight back
 * and the extra slider travel renders nothing — the readout climbs to 235° while the tiling sits frozen at
 * 180°. Measured on the period shelf, where the exporter emits `region` for P=1 too; a no-op on the mixed
 * and isotoxal shelves, whose single-parameter families carry no region at all.
 *
 * Only the upper bound moves. The lower one stays at 0, where the tile collapses.
 */
function raiseCornerLimits(pc: ParametricCellData, range: [number, number]): void {
	if (!pc.region?.length || pc.params.length !== 1) return;
	const p = pc.params[0];
	const du = range.map((a) => (a - p.alpha0Deg) / 15);
	for (const h of pc.region) {
		const at = du.map((d) => h.seedUnits + (h.coef[0] ?? 0) * d);
		h.limitUnits = Math.max(h.limitUnits, ...at) + 1e-6;
	}
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
		// not contain the entry's own default means the two are out of sync — refuse instead of shipping a
		// slider whose default sits outside its domain.
		if (!(lo <= p.defaultAlphaDeg && p.defaultAlphaDeg <= hi)) {
			log(`  ⚑ ${r.id}: plan range (${lo}, ${hi}) excludes default α=${p.defaultAlphaDeg} — SKIPPED`);
			continue;
		}
		if (r.gainDeg > 0.01) {
			p.alphaRangeDegOpen = [lo, hi];
			p.deltaRangeDeg = [lo - p.alpha0Deg + 0.4, hi - p.alpha0Deg - 0.4];
			t.alphaRange = [lo, hi];
			raiseCornerLimits(t.paramCell, [lo, hi]);
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

/**
 * Widen a multi-parameter family's REGION past the convexity cut, in place.
 *
 * Three things move together and all three must, or the widening is only cosmetic:
 *   params[j].alphaRangeDegOpen   the slider domain the readout and the per-axis clamp use
 *   region[].limitUnits           the half-planes `clampToRegion` enforces on every evaluation
 *   regionVertices                the polygon the pad draws and `nearestInRegionDeg` projects onto (P=2)
 * Raising the axes alone leaves `clampToRegion` pulling every drag back to 180°, which looks exactly like
 * the slider being ignored.
 *
 * The lower bounds are deliberately untouched. A corner angle reaching 0 collapses the tile and there is
 * nothing beyond it; only the 180° side is a species change with a tiling on the far side.
 */
export function applyRegionPlan(out: ReferenceTiling[], plan: RangePlan, log: (m?: string) => void): number {
	const regions = plan.regions ?? [];
	if (regions.length === 0) return 0;
	const byId = new Map(out.map((t) => [t.id, t]));
	let widened = 0;
	log("");
	log(`  --- region plan: ${regions.length} multi-parameter famil(ies) ---`);
	for (const r of regions) {
		const t = byId.get(r.id);
		if (!t?.paramCell) {
			log(`  ⚑ ${r.id}: not in this build (or has no paramCell) — skipped`);
			continue;
		}
		const pc = t.paramCell;
		if (pc.params.length !== r.P) {
			log(`  ⚑ ${r.id}: plan says P=${r.P}, entry has ${pc.params.length} — SKIPPED (out of sync)`);
			continue;
		}
		if (r.limitUnits == null) {
			log(`  ⚑ ${r.id}: no measured corner limit — left at the convex cut`);
			continue;
		}
		// The measured axes must still contain each slider's own default, or the entry and the plan were
		// built from different exports and widening would put the default outside its own domain.
		const bad = pc.params.findIndex((p, j) => !(r.axes[j][0] <= p.defaultAlphaDeg && p.defaultAlphaDeg <= r.axes[j][1]));
		if (bad >= 0) {
			log(`  ⚑ ${r.id}: measured axis ${bad} (${r.axes[bad].join(", ")}) excludes default ` +
				`α=${pc.params[bad].defaultAlphaDeg} — SKIPPED`);
			continue;
		}
		pc.params.forEach((p, j) => {
			p.alphaRangeDegOpen = [r.axes[j][0], r.axes[j][1]];
			p.deltaRangeDeg = [r.axes[j][0] - p.alpha0Deg + 0.4, r.axes[j][1] - p.alpha0Deg - 0.4];
		});
		if (pc.region) for (const h of pc.region) h.limitUnits = r.limitUnits;
		if (r.regionVertices?.length) pc.regionVertices = r.regionVertices;
		t.alphaRange = [r.axes[0][0], r.axes[0][1]];
		t.renderCell = evaluateParamCell(pc, pc.params.map((p) => p.defaultAlphaDeg)) as ReferenceTiling["renderCell"];
		widened++;
		log(`  ${r.id}  P=${r.P}  axes ${JSON.stringify(r.exportedAxes)} → ${JSON.stringify(r.axes)}  ` +
			`+${r.gainDeg.toFixed(2)}°  corner limit → ${(r.limitUnits * 15).toFixed(1)}°` +
			(r.regionVertices ? `  region ${r.regionVertices.length} pts` : ""));
	}
	log(`  widened ${widened} of ${regions.length} multi-parameter region(s)`);
	return widened;
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

/** Prose for a multi-parameter family whose whole region was widened past the convexity cut. */
export function regionNote(r: NonNullable<RangePlan["regions"]>[number]): string {
	const stops = Object.keys(r.regionStops ?? {}).sort();
	return (
		`REGION EXTENDED: the export clipped this ${r.P}-parameter family at the polytope where every tile ` +
		`corner stays under 180°. A corner passing 180° turns the tile concave, which changes its species ` +
		`but not whether it tiles, so the region now runs out to ${((r.limitUnits ?? 12) * 15).toFixed(0)}° ` +
		`per corner — to where a tile self-intersects or collapses` +
		(stops.length ? ` (measured stops: ${stops.join(", ")})` : "") +
		`. The lower bounds are unchanged: a corner reaching 0° collapses the tile, and there is no tiling ` +
		`on the far side of that.`
	);
}
