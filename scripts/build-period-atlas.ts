/*
 * build-period-atlas.ts — emit the "Period-p" tile-class shelf for the library.
 *
 * The tiles are EQUILATERAL polygons whose interior-angle word has period p: a p·n-gon with angles
 * (a₁…a_p) repeated n times. The parameter generalizes what the atlas already carries — p=1 is the
 * regular polygons, p=2 is the isotoxal family (both the convex rhombi and the star species) — and
 * p=3 is the new tier: 19 convex tiles on the ζ₂₄ grid, 11 hexagons, 5 nonagons, 2 dodecagons and one
 * 18-gon (enumerated by tools/ctrnact-oracle/alphabets/enum_period_tiles.py, which reproduces the
 * p=2 counts exactly as a check).
 *
 * These were unreachable until 2026-08-08. A period-3 tile makes CLASS_NEXT a 3-cycle, which failed
 * the solver's BUCKET_OK test and switched off its whole filter stack AND its candidate index; k=2 on
 * this palette cost ~6,820s. The 4-bucket union (docs/ctrnact-solver-optimizations.md, fix 14) brought
 * that to 3s, same catalog, and made the shelf possible at all.
 *
 * Source: tools/ctrnact-oracle/export_composable_cells.py over the pruned equi3-cx-z24 solve, exact
 * ℤ[ζ₂₄] development with per-cell area and unit-edge checks (zero failures at k=1 and k=2).
 *
 * ⚑ Only solutions that actually USE a period-p tile enter the shelf. The palette includes the regular
 * set {3,4,6,8,12}, so a large share of its solutions are purely regular and already live in the
 * regular atlas; shipping them here would double-count them across two shelves.
 *
 * Run: pnpm tsx scripts/build-period-atlas.ts
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { trueVertexOrbitCount } from "@/classes/algorithm/composable/canonicalTilingKey";
import { exactComposableKeys, type ExactComposableCell } from "@/classes/algorithm/composable/exactComposableDedup";
import { evaluateParamCell, type ParametricCellData } from "@/lib/utils/paramCell";
import { applyRangePlan, applyRegionPlan, rangeNote, regionNote, type RangePlan } from "./range-plan";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";

const ROOT = path.resolve(__dirname, "..");
const IN_DIR = path.join(ROOT, "experiments", "period-oracle");
const PUBLIC_DIR = path.join(ROOT, "public");
const OUT_PATH = path.join(PUBLIC_DIR, "reference-atlas-period.json");
const FAMILIES_PATH = path.join(IN_DIR, "ctrnact-period-families.cells.json");
const RANGE_PLAN_PATH = path.join(IN_DIR, "period-range-plan.json");
/** Intrinsic parametric cells, keyed on the canonical map. See the attach step at the end of main(). */
const INTRINSIC_CELLS_PATH = path.join(IN_DIR, "intrinsic-cells.json");
/**
 * Families from the PERIOD-QUOTIENT search, which reaches k the grid enumeration cannot.
 *
 * Same record shape as the concrete exporter — `emit_records` is shared — but they are found without
 * enumerating grid angles at all: the alphabet carries (shape, position) corners, and each solution's
 * angles come from solving the tile/vertex linear system (tools/ctrnact-oracle/quotient_feasible.py).
 * That is what makes k=3 affordable: 509 s against a concrete run still unfinished after three hours.
 *
 * SHIPPING as of 2026-08-09, after the three things that were wrong with it got fixed:
 *
 *  1. The k LABELS. They came from the search's ABSTRACT vertex-orbit count, and distinct abstract corner
 *     classes can realise to one geometric figure. Every entry's k is now MEASURED from the developed cell
 *     by tools/ctrnact-oracle/vertex_orbits.py, which reproduces Galebach's published k on all 1,248
 *     tilings at k=1..6. It moved 7 families to k=1 and 25 pinned tilings to k=2.
 *  2. The SEED. `integer_seed` returned the first integer point of each polytope, systematically a
 *     symmetric one where two corner classes coincide, so 12 of 103 families rendered a tiling with fewer
 *     orbits than the family has. `generic_seed` maximises the sorted gap vector; that count is now 0.
 *  3. The DUPLICATES. Both the tier's internal dedup and the cross-tier check ran on sampled congruence,
 *     which has no recall on continuous families (0 of 27 shelf families found themselves). Replaced by
 *     tools/ctrnact-oracle/tiling_key.py: canonical dart map for the ambient angle space, affine subspace
 *     for the family inside it. It dropped 36 of 168 as internal duplicates and 5 more against the shelf.
 *
 * ⚑ Completeness at k=3 remains UNVERIFIED. The concrete cross-check was killed unfinished at 195 min, so
 * nothing independent confirms the quotient found everything there; at k≤2 it is verified block-for-block
 * (0 of 614 lost). This tier is a lower bound on k=3, and the note on each entry says so.
 *
 * ⚑ 4 of the shipped entries CONTAIN a concrete shelf family (the quotient found the larger family where
 * the concrete grid carries a slice). Both ship: dropping verified concrete content is an author call.
 */
const QUOTIENT_FAMILIES_PATHS: { cells: string; dedup?: string }[] = [
	{
		cells: path.join(IN_DIR, "ctrnact-quotient-families-k3-generic.cells.json"),
		dedup: path.join(IN_DIR, "quotient-k3-dedup.json"),
	},
	// CONCAVE period-3, re-done as families. The first attempt shipped fixed-angle SNAPSHOTS, because a
	// concave palette pins its tile to one angle word; AL found the duplicates that follows from within
	// the hour. These come from the QUOTIENT search on the same 63 productive concave species, with the
	// corner bound raised to 23 D-units (345°), so a family may carry a REFLEX corner and its slider
	// sweeps the concave regime instead of stopping at the convexity cut.
	//
	// No `dedup` file: the shelf-wide one-appearance check at the end of this script is downstream of
	// every producer and subsumes it.
	{ cells: path.join(IN_DIR, "ctrnact-period3-concave-families.cells.json") },
];
const QUOTIENT_MIN_K = 1;
const LOG_PATH = path.join(ROOT, "experiments", "results", "period-atlas-build.log");
const MAIN_MAX_K = 2; // k≤2 eager with the base atlas; each higher k gets its own lazy shard
const shardPath = (k: number): string => path.join(PUBLIC_DIR, `reference-atlas-period-k${k}.json`);

const INPUTS: { k: number; files: string[] }[] = [
	{ k: 1, files: ["ctrnact-period3-k1.cells.json"] },
	{ k: 2, files: ["ctrnact-period3-k2.cells.json"] },
	// CONCAVE period-3 tiles — WITHHELD 2026-08-09, same day they were built. AL, on the shipped tier:
	//   "duplicate tilings: period-k2-072 and period-k2-088 are the same tiling"
	//   "snapshots instead of parameter: period-k2-42, 46, 64, 88 and 93 are the same tiling, with a
	//    different value of the parameter that controls the hexagon angles"
	//   "period-k2-002 is a snapshot at 195 degrees of the tiling period-family-k2-012"
	//
	// All three are the same defect: a concave palette pins its tile to ONE angle word, so every solution
	// it yields is a fixed-angle SNAPSHOT — a point on a continuous family, not a tiling in its own right.
	// Exact ℤ[ζ₂₄] congruence merges identical tilings and cannot merge different points of one curve, and
	// `memberIds` absorption only reaches snapshots the family exporter itself grouped, so these arrived
	// unabsorbed and multiplied the shelf with re-parameterisations of what it already had.
	//
	// The corpus is sound (2,574 developed cells, k measured, geometry certified); what is wrong is the
	// SHAPE it ships in. It returns as families, not snapshots. See docs/DEVELOPMENT_NOTES.md 2026-08-09 (6).
	// const CONCAVE_INPUTS = [ ...ctrnact-period3-concave-k{1..6}.cells.json ]
];

const NOTE =
	"Tilings using a period-p equilateral tile (p≥3); distinct-tiling counts are exact (ℤ[ζ₂₄] congruence dedup).";

/** A period-p tile is named e<p>-<sides>-<angle word> by alphabets/enum_period_tiles.py. */
const PERIOD_TILE = /^e(\d+)-/;
function periodOfTileName(name: string): number | null {
	const m = PERIOD_TILE.exec(name);
	return m ? parseInt(m[1], 10) : null;
}

interface CellPoly {
	n: number;
	vertices: number[][];
	star?: boolean;
	name?: string;
	exact?: number[][];
}
interface CellRecord {
	id: string;
	k: number;
	/** Present when the cells file already carries a MEASURED vertex-orbit count; `k` is that value and
	 *  `engineK` the search's original. Its presence is what tells the relabel below to keep its hands off. */
	engineK?: number;
	family: string;
	tiles?: string[];
	renderCell: { cellPolygons: CellPoly[]; basis: number[][]; exactBasis?: number[][] };
}
/** A pinned (P=0) quotient solution: a real tiling with forced angles and therefore no parametric cell. */
interface RigidRecord {
	id: string; k: number; P: 0; vertype: string;
	renderCell: { cellPolygons: { n: number; star?: boolean; vertices: number[][] }[]; basis: number[][] };
}

/** A record from either family exporter — they share `emit_records`, so the shape is one shape. */
interface QuotientRecord {
	id: string; k: number; P: number; vertype: string;
	params: ParametricCellData["params"]; cellPolygons: ParametricCellData["cellPolygons"];
	basis: ParametricCellData["basis"]; region?: ParametricCellData["region"];
	regionVertices?: ParametricCellData["regionVertices"];
}

interface PeriodTiling {
	alphaRange?: [number, number];
	paramCell?: ParametricCellData;
	id: string;
	source: "period";
	k: number;
	family: string;
	/**
	 * The cells-file id of the snapshot this entry came from — the join key for family absorption.
	 *
	 * ⚑ NOT `family`. A vertype string is not unique: two tilings can carry the same vertex-type multiset
	 * and be glued differently. Keying absorption on it removed BOTH snapshots when a family absorbed one
	 * of them, which is the second half of why AL's aligned-strip variant of k2-019 was missing.
	 */
	snapshotId: string;
	/** True when this entry's k came from vertex_orbits.py, not the engine — the relabel must skip it. */
	measuredK?: boolean;
	renderCell: CellRecord["renderCell"];
	discoverer: string;
	tilePeriod: number; // the largest p among the tiles it uses — the shelf's sub-facet
	note: string;
}

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
	const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as { records?: CellRecord[] } | CellRecord[];
	return Array.isArray(parsed) ? parsed : (parsed.records ?? []);
}

function resolveFile(files: string[]): string | null {
	for (const f of files) if (fs.existsSync(path.join(IN_DIR, f))) return f;
	return null;
}

/** Same exact ℤ[ζ₂₄] congruence dedup the composable shelf uses; see build-composable-atlas.ts. */
function dedupe(out: PeriodTiling[]): PeriodTiling[] {
	if (out.length === 0) return out;
	const cellArea = (t: PeriodTiling): number => {
		const [[ux, uy], [vx, vy]] = t.renderCell.basis;
		return Math.abs(ux * vy - uy * vx);
	};
	const cells: ExactComposableCell[] = out.map((t, i) => {
		const rc = t.renderCell;
		if (!rc.exactBasis || rc.cellPolygons.some((cp) => !cp.exact || !cp.name)) {
			throw new Error(
				`[build-period-atlas] ${out[i].id} lacks exact ℤ[ζ₂₄] coords — regenerate with export_composable_cells.py`,
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
	const survivors: PeriodTiling[] = [];
	let merged = 0;
	for (const [, idxs] of groups) {
		idxs.sort((a, b) => {
			const pa = out[a].renderCell.cellPolygons.length;
			const pb = out[b].renderCell.cellPolygons.length;
			if (pa !== pb) return pa - pb;
			const aa = cellArea(out[a]);
			const ab = cellArea(out[b]);
			if (Math.abs(aa - ab) > 1e-6) return aa - ab;
			return a - b;
		});
		survivors.push(out[idxs[0]]);
		if (idxs.length > 1) merged += idxs.length - 1;
	}
	survivors.sort((a, b) => a.id.localeCompare(b.id));
	log(
		`  dedup (EXACT ℤ[ζ₂₄] congruence): ${out.length} → ${distinct} distinct tilings ` +
			`(${merged} duplicate representations merged; ${reduced} supercells primitive-reduced)`,
	);
	return survivors;
}

function main(): void {
	log("=== build-period-atlas ===");
	const out: PeriodTiling[] = [];
	const periodsSeen = new Map<number, number>();

	for (const { k, files } of INPUTS) {
		const file = resolveFile(files);
		if (!file) {
			log(`  k=${k}: no cells file present (${files.join(", ")}) — skipped`);
			continue;
		}
		const records = readRecords(file);
		// Keep only the records that use at least one period-p tile — the rest are pure-regular
		// solutions of the same palette and already ship in the regular atlas.
		const usesPeriod = records.filter((r) => (r.tiles ?? []).some((t) => periodOfTileName(t) != null));
		usesPeriod.forEach((r, i) => {
			const ps = (r.tiles ?? []).map(periodOfTileName).filter((p): p is number => p != null);
			const tilePeriod = Math.max(...ps);
			periodsSeen.set(tilePeriod, (periodsSeen.get(tilePeriod) ?? 0) + 1);
			out.push({
				id: `period-k${k}-${String(i).padStart(3, "0")}`,
				source: "period",
				k: r.k,
				measuredK: r.engineK !== undefined,
				family: r.family,
				snapshotId: r.id,
				renderCell: r.renderCell,
				discoverer: "Alessandro Longo",
				tilePeriod,
				note: NOTE,
			});
		});
		log(`  k=${k} [${file}]: ${usesPeriod.length} use a period-p tile, of ${records.length} records`);
	}

	if (out.length === 0) {
		log("  nothing to write — no period cells present");
		fs.writeFileSync(LOG_PATH, logLines.join("\n") + "\n");
		return;
	}

	// Families first: a family record is a CONTINUOUS deformation, and the fixed-angle snapshots it lists
	// in memberVertypes are points on it. Shipping both would show the same tiling ~6 times over (the
	// period-3 shelf had 307 snapshots of 52 families), so the snapshots it absorbs leave the shelf.
	const families: PeriodTiling[] = [];
	const absorbed = new Set<string>();
	if (fs.existsSync(FAMILIES_PATH)) {
		const fam = JSON.parse(fs.readFileSync(FAMILIES_PATH, "utf8")) as {
			records: {
				id: string; k: number; P: number; members: number; memberVertypes: string[];
				memberIds?: string[];
				params: ParametricCellData["params"]; cellPolygons: ParametricCellData["cellPolygons"];
				basis: ParametricCellData["basis"]; region?: ParametricCellData["region"];
				regionVertices?: ParametricCellData["regionVertices"]; vertype: string;
			}[];
		};
		const noIds = fam.records.filter((r) => (r.memberIds?.length ?? 0) !== r.memberVertypes.length);
		if (noIds.length > 0) {
			throw new Error(
				`[build-period-atlas] ${noIds.length}/${fam.records.length} family records lack memberIds. ` +
					"Absorption must join on the snapshot id: a vertype is shared by tilings that differ only " +
					"in how a half-edge is glued, so joining on it drops the twin. Re-run " +
					"export_period_families.py with --palette and --cells.",
			);
		}
		for (const r of fam.records) {
			const paramCell: ParametricCellData = {
				params: r.params, cellPolygons: r.cellPolygons, basis: r.basis,
				...(r.region ? { region: r.region } : {}),
				...(r.regionVertices ? { regionVertices: r.regionVertices } : {}),
			};
			let renderCell: PeriodTiling["renderCell"];
			try {
				renderCell = evaluateParamCell(paramCell, r.params.map((q) => q.defaultAlphaDeg)) as PeriodTiling["renderCell"];
			} catch (e) {
				log(`  ⚑ ${r.id}: paramCell will not evaluate at its default — SKIPPED (${(e as Error).message})`);
				continue;
			}
			for (const v of r.memberIds!) absorbed.add(v);
			families.push({
				id: r.id, source: "period", k: r.k, family: r.vertype, renderCell,
				snapshotId: r.memberIds![0],
				discoverer: "Alessandro Longo", tilePeriod: 3,
				note: `${NOTE} Continuous ${r.P}-parameter family; absorbs ${r.members} fixed-angle snapshot(s).`,
				alphaRange: r.params[0].alphaRangeDegOpen,
				paramCell,
				members: r.members,
				memberIds: r.memberIds,
			} as unknown as PeriodTiling);
		}
		log(`  families: ${families.length} continuous families absorbing ${absorbed.size} snapshots`);

		// Widen to the TRUE region before anything downstream reads a range. The exporter stops every
		// corner at 180°, where the tile flattens and its species changes — not where the tiling stops.
		// Past that the corner goes reflex, the tile is concave and simple, and it keeps tiling until a
		// tile self-intersects or collapses. AL, on k2-036: "nothing prevents them from going concave, as
		// long as the polygon doesn't self-intersect, that's the true degeneration."
		const asRef = families as unknown as ReferenceTiling[];
		applyRangePlan(asRef, { planPath: RANGE_PLAN_PATH, logName: "period-family", log, root: ROOT });
		if (fs.existsSync(RANGE_PLAN_PATH)) {
			const plan = JSON.parse(fs.readFileSync(RANGE_PLAN_PATH, "utf8")) as RangePlan;
			applyRegionPlan(asRef, plan, log);
			const byId = new Map(asRef.map((t) => [t.id, t]));
			for (const r of plan.ranges) {
				const t = byId.get(r.id);
				if (t && r.gainDeg > 0.01) t.note = `${t.note ?? NOTE} ${rangeNote(r)}`;
			}
			for (const r of plan.regions ?? []) {
				const t = byId.get(r.id);
				if (t && r.gainDeg > 0.01 && r.limitUnits != null) t.note = `${t.note ?? NOTE} ${regionNote(r)}`;
			}
		}
	} else {
		log("  ⚑ no families file — shipping snapshots only (run export_period_families.py)");
	}

	// The quotient families. Loaded after the range plan deliberately: the plan is keyed on the concrete
	// exporter's ids and has nothing to say about these, and their region already comes from the same
	// exact half-plane computation, so passing them through it would only log misses.
	// Ids that survived both dedup passes. A missing verdict file is a hard stop, not a warning: shipping
	// this tier unfiltered would put 41 proven duplicates on the shelf, which is the failure the whole
	// exercise exists to prevent.
	for (const { cells: qp, dedup } of QUOTIENT_FAMILIES_PATHS) {
		if (!fs.existsSync(qp)) {
			log(`  ⚑ no quotient families at ${path.relative(ROOT, qp)} — k≥${QUOTIENT_MIN_K} not shipped`);
			continue;
		}
		// A per-tier ship list, when the tier has one. Absent is fine and deliberate: the shelf-wide
		// one-appearance check runs after everything is written and catches whatever a tier let through.
		let quotientShip: Set<string> | null = null;
		if (dedup) {
			if (!fs.existsSync(dedup)) {
				throw new Error(
					`[build-period-atlas] ${path.basename(qp)} declares a dedup verdict at ` +
						`${path.relative(ROOT, dedup)} and it is missing. Run scripts/cross-tier-dedup.py.`,
				);
			}
			const verdicts = JSON.parse(fs.readFileSync(dedup, "utf8")) as
				{ id: string; verdict: string; match: string | null; ship: boolean }[];
			quotientShip = new Set(verdicts.filter((v) => v.ship).map((v) => v.id));
			const byVerdict = new Map<string, number>();
			for (const v of verdicts) byVerdict.set(v.verdict, (byVerdict.get(v.verdict) ?? 0) + 1);
			log("");
			log(`  quotient dedup [${path.basename(qp)}]: ${quotientShip.size} of ${verdicts.length} ship — ` +
				[...byVerdict].sort().map(([k, n]) => `${k}: ${n}`).join(", "));
		}
		const qf = JSON.parse(fs.readFileSync(qp, "utf8")) as { records: QuotientRecord[]; rigid?: RigidRecord[] };
		let added = 0;
		let skipped = 0;
		for (const r of qf.records) {
			if (r.k < QUOTIENT_MIN_K || (quotientShip && !quotientShip.has(r.id))) {
				skipped++;
				continue;
			}
			const paramCell: ParametricCellData = {
				params: r.params, cellPolygons: r.cellPolygons, basis: r.basis,
				...(r.region ? { region: r.region } : {}),
				...(r.regionVertices ? { regionVertices: r.regionVertices } : {}),
			};
			let renderCell: PeriodTiling["renderCell"];
			try {
				renderCell = evaluateParamCell(paramCell, r.params.map((q) => q.defaultAlphaDeg)) as PeriodTiling["renderCell"];
			} catch (e) {
				log(`  ⚑ ${r.id}: paramCell will not evaluate at its default — SKIPPED (${(e as Error).message})`);
				continue;
			}
			families.push({
				id: r.id, source: "period", k: r.k, family: r.vertype, renderCell,
				snapshotId: r.id,
				discoverer: "Alessandro Longo", tilePeriod: 3,
				note: `${NOTE} Continuous ${r.P}-parameter family, found by the period-QUOTIENT search: the ` +
					"alphabet carries (shape, position) corners with no grid angle word, and these angles come " +
					"from solving the tile/vertex linear system instead of from enumeration. Its k is measured " +
					"from the developed cell at a generic parameter (vertex_orbits.py, which reproduces " +
					"Galebach's published k on all 1,248 tilings at k=1..6), not taken from the search's " +
					"abstract orbit count. COVERAGE: at k=3 this tier is a lower bound — the concrete " +
					"cross-check that would confirm completeness was killed unfinished at 195 minutes, so " +
					"more k=3 tilings may exist. At k≤2 the quotient is verified block-for-block.",
				alphaRange: r.params[0].alphaRangeDegOpen,
				paramCell,
				members: 1,
				memberIds: [r.id],
			} as unknown as PeriodTiling);
			added++;
		}
		log(`  quotient families [${path.basename(qp)}]: ${added} added (k≥${QUOTIENT_MIN_K}), ${skipped} skipped below k=${QUOTIENT_MIN_K}`);

		// PINNED tilings: the quotient search's 0-dimensional solutions. Real tilings that carry a plain
		// cell and no slider — a P=0 family record would give the UI an empty parameter panel and a
		// paramCell with nothing to evaluate. They ship because they are tilings.
		//
		// ⚑ "Pinned IN THIS PALETTE", never "rigid". `6` here is the REGULAR hexagon — one corner class,
		// six angles locked at 120° — so the linear system holds it constant and finds no freedom. AL, on
		// rigid-k3-039: "the regular hexagon can be squeezed and the irregular morph to accommodate for
		// it." He is right; that deformation turns the tile into a NON-REGULAR equilateral hexagon, a
		// different alphabet symbol, which the model cannot name. Same species cut the α-sliders hit at
		// 180°, one level up. P is a statement about the palette, not about the tiling.
		//
		// ⚑ And a pinned type can BE one parameter value of a continuous family, which would list the same
		// tiling twice; the exporter now drops those (10 of 70 at k=3, e.g. rigid-004 = k2-029 at α=150°).
		let rigidAdded = 0;
		for (const r of qf.rigid ?? []) {
			if (r.k < QUOTIENT_MIN_K || (quotientShip && !quotientShip.has(r.id))) continue;
			families.push({
				id: r.id, source: "period", k: r.k, family: r.vertype,
				renderCell: r.renderCell as PeriodTiling["renderCell"],
				snapshotId: r.id,
				discoverer: "Alessandro Longo", tilePeriod: 3,
				note: `${NOTE} PINNED IN THIS PALETTE: the tile/vertex linear system has a single solution ` +
					"over this alphabet, so there is no slider — but the alphabet's regular tiles carry one " +
					"corner class each and cannot deform, so a richer palette may well give this tiling a " +
					"parameter. Found by the period-QUOTIENT search, angles solved rather than enumerated.",
			} as unknown as PeriodTiling);
			rigidAdded++;
		}
		if (rigidAdded) log(`  quotient RIGID tilings [${path.basename(qp)}]: ${rigidAdded} added`);
	}

	// ⚑ MERGE FAMILIES THAT SHARE A TILING. The exporter groups blocks by the canonical form of the labelled
	// dart map, which quotients away the angles but keeps the gluing — but the pruned catalog still holds
	// several representations of one tiling (supercells, relabelings), and two of those can canonicalize
	// apart. AL reported k2-018/021/031 and k2-043/052 as surviving duplicates.
	//
	// The sound criterion is geometric, not textual: a tiling determines its deformation class, so if two
	// families absorb snapshots that are the SAME tiling under exact ℤ[ζ₂₄] congruence, they are one
	// family. That congruence is already computed for the snapshots, so this is a union-find over it and
	// adds no new geometry. Merging on a shared member cannot over-merge — sharing one tiling IS being
	// the same family.
	if (families.length > 0) {
		const keyOf = new Map<string, string>(); // snapshot id → congruence key
		try {
			const cells: ExactComposableCell[] = out.map((t) => ({
				cellPolygons: t.renderCell.cellPolygons.map((cp) => ({
					n: cp.n, name: cp.name!, exact: cp.exact!, star: cp.star,
				})),
				exactBasis: t.renderCell.exactBasis!,
			}));
			const { keys } = exactComposableKeys(cells);
			out.forEach((t, i) => keyOf.set(t.snapshotId, keys[i]));
		} catch (e) {
			log(`  ⚑ could not key snapshots for the family merge: ${(e as Error).message}`);
		}
		const parent = families.map((_, i) => i);
		const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
		const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
		// Keyed on (congruence, P). Sharing a tiling makes two families the same only at the same
		// DIMENSION: a P=2 family that shares a snapshot with a P=3 one is a slice of it, not a copy of
		// it, and unioning across P swallowed every 2-parameter family — including all three k=1 ones —
		// into the 3-parameter groups and left the shelf with no k=1 entries at all.
		const seen = new Map<string, number>();
		families.forEach((f, i) => {
			const P = f.paramCell?.params.length ?? 0;
			for (const v of (f as unknown as { memberIds: string[] }).memberIds ?? []) {
				const k = keyOf.get(v);
				if (!k) continue;
				const prev = seen.get(`${k}|P${P}`);
				if (prev == null) seen.set(`${k}|P${P}`, i);
				else union(prev, i);
			}
		});
		const groups = new Map<number, number[]>();
		families.forEach((_, i) => (groups.get(find(i)) ?? groups.set(find(i), []).get(find(i))!).push(i));
		const survivors: PeriodTiling[] = [];
		let merged = 0;
		for (const [, idxs] of groups) {
			// Keep the widest family: most parameters, then the LOWEST k, then most snapshots absorbed.
			// k is load-bearing and was not here at first: two families merge because they share a tiling,
			// and if one of them files that tiling at k=1 and the other at k=2 the k=2 side is a
			// non-primitive representation of it. Taking the larger k relabelled every k=1 family as k=2
			// and emptied the shelf's k=1 group.
			idxs.sort((a, b) => {
				const pa = families[a].paramCell?.params.length ?? 0, pb = families[b].paramCell?.params.length ?? 0;
				if (pa !== pb) return pb - pa;
				if (families[a].k !== families[b].k) return families[a].k - families[b].k;
				const ma = (families[a] as unknown as { members?: number }).members ?? 0;
				const mb = (families[b] as unknown as { members?: number }).members ?? 0;
				return mb - ma;
			});
			survivors.push(families[idxs[0]]);
			merged += idxs.length - 1;
		}
		if (merged > 0) log(`  family merge (shared tiling, exact congruence): ${families.length} → ${survivors.length} (${merged} duplicates merged)`);
		families.length = 0;
		families.push(...survivors);
	}

	log("");
	const kept = out.filter((t) => !absorbed.has(t.snapshotId));
	log(`  snapshots: ${out.length} → ${kept.length} after removing those a family absorbs`);
	out.length = 0;
	out.push(...kept);
	const deduped = dedupe(out);

	// Same chirality correction the composable shelf applies: the engine counts vertex orbits under the
	// orientation-preserving subgroup, so an achiral tiling's k is inflated. Always ≤ the engine k.
	//
	// SNAPSHOTS ONLY, deliberately. These come off the 24-direction grid, which is trueVertexOrbitCount's
	// validated domain. Family records must NOT be passed through it — their cells are evaluated at solved
	// angles, where its 24 fixed rotations cannot find the symmetry and the count inflates (see the domain
	// note on the function). Families arrive with k already measured by tools/ctrnact-oracle/vertex_orbits.py
	// when the exporter ran with --true-k (concrete) or at all (quotient), and that value stands.
	log("");
	let relabeled = 0;
	let preMeasured = 0;
	for (const t of deduped) {
		// ⚑ Skip anything whose k was measured upstream. trueVertexOrbitCount assumes the engine k is an
		// upper bound (orbits under the full group are unions of the chiral ones), and on a CONCAVE palette
		// that assumption fails: dent-fill vertices are noncounting for the solver, so the engine k can be
		// LOWER than the true orbit count. Running it here would drag a correct label back down.
		if (t.measuredK) {
			preMeasured++;
			continue;
		}
		const tk = trueVertexOrbitCount(t.renderCell, t.k);
		if (tk !== t.k) {
			relabeled++;
			t.k = tk;
		}
	}
	log(`  relabel k → true vertex-orbit count: ${relabeled} of ${deduped.length} were chirally over-counted` +
		(preMeasured ? ` (${preMeasured} skipped: k already measured by vertex_orbits.py)` : ""));

	const byNewK = new Map<number, PeriodTiling[]>();
	for (const t of [...deduped].sort((a, b) => a.id.localeCompare(b.id))) {
		(byNewK.get(t.k) ?? byNewK.set(t.k, []).get(t.k)!).push(t);
	}
	for (const [k, list] of byNewK) list.forEach((t, i) => (t.id = `period-k${k}-${String(i).padStart(3, "0")}`));

	// Strip the exact fields — renderTiling consumes only n/vertices/star + basis, and keeping the
	// ℤ[ζ₂₄] coords would multiply the shelf size for no display benefit.
	for (const t of deduped) {
		delete t.renderCell.exactBasis;
		for (const cp of t.renderCell.cellPolygons) {
			delete cp.exact;
			delete cp.name;
		}
	}

	fs.mkdirSync(PUBLIC_DIR, { recursive: true });
	// Shard over EVERYTHING that ships, snapshots and families alike. Families used to be k≤2 by
	// construction and the shard list was built from snapshots only; the quotient search supplies k=3
	// families, and with the old line they were computed, logged and then silently dropped.
	const shipping = [...deduped, ...families];
	const main_ = shipping.filter((t) => t.k <= MAIN_MAX_K);
	const shardKs = [...new Set(shipping.filter((t) => t.k > MAIN_MAX_K).map((t) => t.k))].sort((a, b) => a - b);
	const sizeKB = (p: string): string => (fs.statSync(p).size / 1024).toFixed(1);
	fs.writeFileSync(OUT_PATH, JSON.stringify(main_, null, 0) + "\n");
	log("");
	log(`=== period atlas written (main + ${shardKs.length} shard${shardKs.length === 1 ? "" : "s"}) ===`);
	log(`  main  k≤${MAIN_MAX_K}: ${main_.length} tilings → ${path.relative(ROOT, OUT_PATH)}  (${sizeKB(OUT_PATH)} KB)`);
	for (const k of shardKs) {
		const entries = shipping.filter((t) => t.k === k);
		const p = shardPath(k);
		fs.writeFileSync(p, JSON.stringify(entries, null, 0) + "\n");
		log(`  shard k=${k}: ${entries.length} tilings → ${path.relative(ROOT, p)}  (${sizeKB(p)} KB)`);
	}
	for (const f of fs.readdirSync(PUBLIC_DIR)) {
		const m = /^reference-atlas-period-k(\d+)\.json$/.exec(f);
		if (m && !shardKs.includes(Number(m[1]))) fs.unlinkSync(path.join(PUBLIC_DIR, f));
	}

	// count what actually SHIPS (families + any snapshot no family absorbed), not just the snapshots —
	// with a full fold `deduped` is empty and the line read "by k:" with nothing after it.
	const shipped = shipping;
	const byK = new Map<number, number>();
	for (const t of shipped) byK.set(t.k, (byK.get(t.k) ?? 0) + 1);
	log("");
	log(`  by k: ${[...byK].sort((a, b) => a[0] - b[0]).map(([k, n]) => `k=${k}: ${n}`).join(", ")}`);
	log(`  by tile period: ${[...periodsSeen].sort((a, b) => a[0] - b[0]).map(([p, n]) => `p=${p}: ${n} (pre-dedup)`).join(", ")}`);
	fs.writeFileSync(LOG_PATH, logLines.join("\n") + "\n");

	// ── ONE APPEARANCE PER TILING ─────────────────────────────────────────────────────────────────────
	// AL, 2026-08-09: "I want every tiling to appear only once ... if it's truly rigid, no parameter,
	// otherwise the snapshots must not appear on their own: all instances must be gathered under the same
	// parametric tiling, with the full parameter sweep."
	//
	// Neither dedup above can enforce that. Exact ℤ[ζ₂₄] congruence merges IDENTICAL tilings, and two
	// different points of one curve are not identical; `memberIds` absorption only reaches snapshots the
	// family exporter itself grouped. So the rule is checked downstream of every producer, on what this
	// script actually wrote, by the subspace test in tools/ctrnact-oracle/tiling_key.py: a family is an
	// affine subspace of its map's angle space, a rigid tiling is a point in it, and only maximal entries
	// survive. Running it here rather than by hand is the point — a producer added later cannot skip it.
	log("");
	try {
		const out = execFileSync("python3", [
			path.join(ROOT, "scripts", "shelf-dedup.py"),
			"--shelf", OUT_PATH,
			"--log", path.join(ROOT, "experiments", "results", "period-shelf-dedup.log"),
			"--json", path.join(IN_DIR, "period-shelf-dedup.json"),
			"--write",
		], { encoding: "utf8" });
		for (const line of out.trimEnd().split("\n").slice(-8)) log(`  ${line}`);
	} catch (e) {
		throw new Error(
			"[build-period-atlas] shelf-dedup.py failed; the shelf may contain a tiling more than once. " +
				`Fix it rather than skipping it. ${(e as Error).message}`,
		);
	}

	// ── INTRINSIC PARAMETERS ──────────────────────────────────────────────────────────────────────────
	// Every P above is palette-relative: the exporters count freedom over the ALPHABET's corner classes,
	// so a tile the alphabet calls `6` is a constant and a tiling that deforms is filed as rigid. Measured
	// on what this script wrote: only 10 of 470 entries are intrinsically rigid, and 237 ship with no
	// slider while having between 1 and 19 parameters (docs/period-intrinsic-plan-2026-08-09.md).
	//
	// So the parameters are re-derived from each tiling's own combinatorial map and attached here, last,
	// for the same reason shelf-dedup runs here: this is downstream of every producer.
	//
	// The solve costs ~17 minutes and is CACHED in the cells file, keyed on the canonical map rather than
	// on the id — ids are assigned by shelf-dedup and move whenever the shelf's contents do. A rebuild
	// that changes no tilings re-attaches; one that adds tilings reports them as unmatched and needs the
	// exporter re-run without --attach.
	log("");
	if (!fs.existsSync(INTRINSIC_CELLS_PATH)) {
		log(`  ⚑ no intrinsic cells at ${path.relative(ROOT, INTRINSIC_CELLS_PATH)} — the shelf ships with ` +
			"palette-relative parameters, so entries that deform will read as rigid. Run " +
			"tools/ctrnact-oracle/export_intrinsic_cells.py.");
	} else {
		try {
			const out = execFileSync("python3", [
				path.join(ROOT, "tools", "ctrnact-oracle", "export_intrinsic_cells.py"),
				"--attach", "--write",
				"--out", INTRINSIC_CELLS_PATH,
				"--shelf", OUT_PATH,
				"--log", path.join(ROOT, "experiments", "results", "period-intrinsic-attach.log"),
			], { encoding: "utf8" });
			for (const line of out.trimEnd().split("\n").slice(-6)) log(`  ${line}`);
		} catch (e) {
			throw new Error(
				"[build-period-atlas] attaching intrinsic cells failed. An unmatched entry means the shelf " +
					"gained a tiling the solver has not seen; re-run export_intrinsic_cells.py without " +
					`--attach to extend the cache. ${(e as Error).message}`,
			);
		}
	}
	fs.writeFileSync(LOG_PATH, logLines.join("\n") + "\n");
}

main();
