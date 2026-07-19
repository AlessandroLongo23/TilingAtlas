/*
 * build-islamic-atlas.ts — emit the "Islamic" tile-class shelf: curated historical underlying
 * tessellations (Bonner's design systems), hand-encoded as explicit-vertex translational cells and
 * VALIDATED to tile the plane (scripts/islamic/lib.ts validateTiling). These render on their own; the
 * optional "Islamic construction" (Hankin strapwork) overlays them in /play. See docs/ISLAMIC_TILINGS.md.
 *
 * These are transcriptions, NOT enumerated/certified results — they make no k-uniform completeness claim
 * (certification omitted; k is descriptive). Nothing ships that fails validation.
 *
 * Run:  pnpm tsx scripts/build-islamic-atlas.ts
 */
import fs from "node:fs";
import path from "node:path";
import type { ReferenceTiling, IslamicSystem } from "@/lib/services/referenceAtlas";
import {
	assemble, validateTiling, regular, girih, center, rotate, polygonFromTurns, polygonHue,
	parallelohexagonCell, parallelogramCell, area,
	type Placement, type Basis, type RenderCell, type Pt,
} from "./islamic/lib";

const ROOT = process.cwd();
const OUT_PATH = path.join(ROOT, "public", "reference-atlas-islamic.json");
const LOG_PATH = path.join(ROOT, "experiments", "results", "islamic-atlas-build.log");
const ATLAS_PATH = path.join(ROOT, "public", "reference-atlas.json");

const logLines: string[] = [];
function log(msg = ""): void { logLines.push(msg); console.log(msg); }

const SQRT2 = Math.SQRT2;

// A curated tiling spec. `build` returns the render cell; the validator is the ship gate. `k` is
// descriptive (see note). `reuseId` pulls a render cell from the base atlas verbatim (regular-system
// entries that already live there as certified regular tilings).
interface Spec {
	id: string;
	system: IslamicSystem;
	family: string; // composition label (n-values, like the rest of the atlas)
	k: number;
	name: string;
	note: string;
	build?: () => RenderCell;
	reuseId?: string;
}

// ── Fourfold system A: the 4.8.8 (octagon + square), the eight-point-star base ──────────────────────────
function fourfold488(): RenderCell {
	const p = 1 + SQRT2; // octagon flat-to-flat = lattice period
	const oct = center(regular(8)); // axis-aligned edges
	const sq = rotate(center(regular(4)), 45); // 45°-rotated unit square fills the diagonal gap
	const placements: Placement[] = [
		{ tile: oct, at: [0, 0], n: 8 },
		{ tile: sq, at: [p / 2, p / 2], n: 4 },
	];
	const basis: Basis = [[p, 0], [0, p]];
	return assemble(placements, basis);
}

// ── Fivefold system: the bobbin (elongated-hexagon) tessellation ────────────────────────────────────────
// The girih bobbin is a parallelohexagon, so it tiles by translation alone — a guaranteed-valid fivefold
// tessellation whose strapwork is a genuine 10-fold pattern. One tile per cell.
function fivefoldBobbin(): RenderCell {
	return parallelohexagonCell(girih.bobbin(), 6);
}

// ── Fivefold system: the wide-rhombus (torange) tessellation ────────────────────────────────────────────
// The girih rhombus (72°/108°) is a parallelogram, so it tiles by its two edge vectors. Bonner's fivefold
// "wide rhombic repeat" (§3.1.7) uses this rhombus as its repeat unit.
function fivefoldRhombus(): RenderCell {
	return parallelogramCell(girih.rhombus(), 4);
}

// ── Fivefold system: the bowtie (concave hexagon) tessellation ──────────────────────────────────────────
// The girih bowtie is non-convex but still a parallelohexagon (opposite edges parallel), so it tiles by
// translation — interlocking hourglasses. The engine's girih enumeration confirms the bowtie tiles
// 1-uniformly (the `w` family at k=1); this is one such arrangement, hand-authored for rendering.
function fivefoldBowtie(): RenderCell {
	return parallelohexagonCell(girih.bowtie(), 6);
}

// ── Sevenfold system: a heptagonal (14-gon-based) parallelohexagon ──────────────────────────────────────
// Angles are multiples of 180/7. Interior word 128.57°,128.57°,102.86° repeated (exterior units 2,2,3 of
// 180/7) — a parallelohexagon on the sevenfold grid, so it tiles by translation. A minimal faithful
// representative of the rare sevenfold system's angular geometry.
function sevenfold(): RenderCell {
	const u = 180 / 7;
	return parallelohexagonCell(polygonFromTurns([2 * u, 2 * u, 3 * u, 2 * u, 2 * u, 3 * u]), 6);
}

// ── Fourfold system B: an eightfold (22.5°-based) parallelohexagon ──────────────────────────────────────
// Fourfold B is the 8-fold system with 22.5° angular signature (dual of 4.8²). Interior word
// 112.5°,135°,112.5° repeated (exterior units 3,2,3 of 22.5°) — a parallelohexagon on the 22.5° grid.
function fourfoldB(): RenderCell {
	return parallelohexagonCell(polygonFromTurns([67.5, 45, 67.5, 67.5, 45, 67.5]), 6);
}

const SPECS: Spec[] = [
	{
		id: "isl-4a-488", system: "fourfold-a", family: "4.8.8", k: 1,
		name: "Octagon and square (eight-point star)",
		note: "Fourfold system A base tessellation (4.8.8, the truncated-square / octagon-square grid). The " +
			"acute strapwork on it is the classic eight-pointed khatam star. Bonner §3.1.3. Curated historical " +
			"transcription; k descriptive, not a completeness claim.",
		build: fourfold488,
	},
	{
		id: "isl-5f-bobbin", system: "fivefold", family: "6", k: 1,
		name: "Bobbin (elongated hexagon) tessellation",
		note: "Fivefold system, the girih bobbin (shesh band) tiling — a parallelohexagon, so it tiles by " +
			"translation. Its strapwork is a genuine 10-fold pattern. Bonner §3.1.5. Curated; k descriptive.",
		build: fivefoldBobbin,
	},
	{
		id: "isl-5f-rhombus", system: "fivefold", family: "4", k: 1,
		name: "Wide rhombus (torange) tessellation",
		note: "Fivefold system, the girih wide rhombus (torange, 72°/108°) as the repeat unit — Bonner's " +
			"'wide rhombic repeat' (§3.1.7). A parallelogram, so it tiles by translation. Curated; k descriptive.",
		build: fivefoldRhombus,
	},
	{
		id: "isl-5f-bowtie", system: "fivefold", family: "6", k: 1,
		name: "Bowtie (concave hexagon) tessellation",
		note: "Fivefold system, the girih bowtie (sormeh dan) — a non-convex parallelohexagon that tiles by " +
			"translation (interlocking hourglasses). The engine's girih enumeration confirms the bowtie tiles " +
			"1-uniformly; this is one such arrangement. Curated; k descriptive.",
		build: fivefoldBowtie,
	},
	{
		id: "isl-7f-parallelohex", system: "sevenfold", family: "6", k: 1,
		name: "Sevenfold parallelohexagon",
		note: "Sevenfold system (rare; Bonner §3.1.14): a heptagon-grid parallelohexagon (angles multiples of " +
			"180/7). Tiles by translation; its strapwork carries 7- and 14-point motifs. Minimal representative " +
			"of the sevenfold angular geometry. Curated; k descriptive.",
		build: sevenfold,
	},
	{
		id: "isl-4b-parallelohex", system: "fourfold-b", family: "6", k: 1,
		name: "Fourfold-B eightfold parallelohexagon",
		note: "Fourfold system B (Bonner §3.1.4): the 8-fold system with a 22.5° angular signature (dual of " +
			"4.8²). A 22.5°-grid parallelohexagon (angles 112.5°/135°), tiling by translation. Representative of " +
			"the fourfold-B geometry. Curated; k descriptive.",
		build: fourfoldB,
	},
	// regular-system entries reuse certified atlas cells (they ARE those tilings, re-framed under the
	// Islamic polygonal technique). 12-fold and 6-fold stars come from these on median/obtuse openings.
	{
		id: "isl-reg-3.4.6.4", system: "regular", family: "3.4.6.4", k: 1,
		name: "Rhombitrihexagonal (3.4.6.4)",
		note: "Regular-polygon system (Bonner §3.1.1): the 3.4.6.4 Archimedean grid, an underlying tessellation " +
			"for six- and twelve-point patterns. Same tiling as the certified atlas entry, re-framed.",
		reuseId: "t1006",
	},
	{
		id: "isl-reg-4.6.12", system: "regular", family: "4.6.12", k: 1,
		name: "Truncated trihexagonal (4.6.12)",
		note: "Regular-polygon system (Bonner §3.1.1): the 4.6.12 grid, base for twelve-point star patterns. " +
			"Same tiling as the certified atlas entry, re-framed.",
		reuseId: "t1003",
	},
	{
		id: "isl-reg-3.12.12", system: "regular", family: "3.12.12", k: 1,
		name: "Truncated hexagonal (3.12.12)",
		note: "Regular-polygon system (Bonner §3.1.1): the 3.12.12 grid — dodecagons carry twelve-point stars. " +
			"Same tiling as the certified atlas entry, re-framed.",
		reuseId: "t1004",
	},
	{
		id: "isl-reg-3.6.3.6", system: "regular", family: "3.6.3.6", k: 1,
		name: "Trihexagonal (3.6.3.6)",
		note: "Regular-polygon system (Bonner §3.1.1): the 3.6.3.6 (kagome) grid, base for six-point star " +
			"patterns. Same tiling as the certified atlas entry, re-framed.",
		reuseId: "t1007",
	},
];

// ── engine-developed girih tilings ─────────────────────────────────────────────────────────────────────
// The Čtrnáct engine enumerates fivefold girih k-uniform tilings (girih palette, D=20); develop_girih.py
// reconstructs their float geometry (area-certified). Here we deduplicate them by (k, tile multiset, cell
// area), re-validate each representative through the coverage validator (a second, independent geometric
// check beyond the developer's area cert), and import the distinct ones. These are combinatorial candidates
// developed to float geometry — genuinely new tilings the hand-curation could not reach (esp. decagonal).
const DEVELOPED_PATH = path.join(ROOT, "experiments", "results", "girih-developed.cells.json");
const GIRIH_N: Record<string, number> = {
	"10": 10, "5": 5, "rhomb-4.6.4.6": 4, "bobbin-4.8.8.4.8.8": 6, "bowtie-4.4.12.4.4.12": 6,
};
interface DevRec { id: string; k: number; T1: number[]; T2: number[]; areaOk: boolean; faces: { tile: string; verts: number[][] }[] }

// Congruence-invariant fingerprint of a translational tiling: (k, sorted multiset of tile areas, |detΛ|).
// Rotation, reflection, and translation preserve all three, so two congruent tilings share it. Used to drop
// engine-developed tilings that duplicate a CURATED one — the single-tile bobbin/rhombus/bowtie appear in
// both the hand-authored fivefold set and the engine's k=1 output (that's the visible cross-set dup). Side
// counts can't separate bobbin from bowtie (both n=6); tile AREA can, which is why the fingerprint uses it.
function tilingFingerprint(k: number, tileVerts: Pt[][], b1: number[], b2: number[]): string {
	const areas = tileVerts.map((v) => area(v)).sort((a, b) => a - b).map((a) => a.toFixed(3));
	const det = Math.abs(b1[0] * b2[1] - b1[1] * b2[0]).toFixed(3);
	return `${k}|${areas.join(",")}|${det}`;
}
function cellFingerprint(k: number, cell: RenderCell): string {
	return tilingFingerprint(k, cell.cellPolygons.map((p) => p.vertices), cell.basis[0], cell.basis[1]);
}

// A developed tiling is NON-PRIMITIVE (a supercell) if it has a tile-preserving translation FINER than its
// own basis — i.e. the true tiling repeats inside the cell. The engine's combinatorial enumeration emits
// such supercell descriptions for the girih palette (a side effect of admitting valence-2 vertices), which
// inflates the counts and mislabels k (an 8-bobbin supercell of a k=1 tiling gets tagged k=4). We drop
// them: every distinct PRIMITIVE geometry is also produced by a genuinely-primitive tiling (verified), so
// this is lossless, and the survivors carry a trustworthy k. Keyed by the true tile NAME (bobbin≠bowtie,
// both n=6), so a translation may not map one tile type onto another.
function isNonPrimitive(faces: DevRec["faces"], T1: number[], T2: number[]): boolean {
	const d = T1[0] * T2[1] - T1[1] * T2[0];
	const frac = (x: number, y: number): [number, number] => {
		const u = (x * T2[1] - y * T2[0]) / d, w = (T1[0] * y - T1[1] * x) / d;
		return [u - Math.floor(u + 1e-7), w - Math.floor(w + 1e-7)];
	};
	const cents = faces.map((f) => {
		const vs = f.verts, n = vs.length;
		return { cx: vs.reduce((s, v) => s + v[0], 0) / n, cy: vs.reduce((s, v) => s + v[1], 0) / n, t: f.tile };
	});
	const keyOf = (cx: number, cy: number, t: string) => {
		const [a, b] = frac(cx, cy);
		return `${Math.round(a * 1000)}:${Math.round(b * 1000)}:${t}`;
	};
	const cset = new Set(cents.map((c) => keyOf(c.cx, c.cy, c.t)));
	const a = cents[0];
	for (const bb of cents) {
		const vx = bb.cx - a.cx, vy = bb.cy - a.cy;
		if (Math.abs(vx) < 1e-6 && Math.abs(vy) < 1e-6) continue;
		if (cents.every((c) => cset.has(keyOf(c.cx + vx, c.cy + vy, c.t)))) return true;
	}
	return false;
}

function developedGirihTilings(curatedFps: Set<string>): ReferenceTiling[] {
	if (!fs.existsSync(DEVELOPED_PATH)) {
		log("  ⚑ no girih-developed.cells.json — engine import skipped (run develop_girih.py)");
		return [];
	}
	const rawRecs = JSON.parse(fs.readFileSync(DEVELOPED_PATH, "utf8")) as DevRec[];
	// Drop non-primitive (supercell) tilings first — they are combinatorial artifacts with mislabeled k, and
	// every distinct primitive geometry survives via a genuinely-primitive tiling (lossless, verified).
	const recs = rawRecs.filter((r) => !isNonPrimitive(r.faces, r.T1, r.T2));
	const droppedNonPrim = rawRecs.length - recs.length;
	// coarse pre-dedup on (k, full tile multiset, |detΛ|) — collapses congruent/rescaled duplicates so we
	// validate only the ~distinct representatives.
	const repSeen = new Set<string>();
	const repsAll: DevRec[] = [];
	for (const r of recs) {
		const tiles = r.faces.map((f) => GIRIH_N[f.tile] ?? f.verts.length).sort((a, b) => a - b);
		const det = Math.abs(r.T1[0] * r.T2[1] - r.T1[1] * r.T2[0]);
		const key = `${r.k}|${tiles.join(",")}|${det.toFixed(3)}`;
		if (repSeen.has(key)) continue;
		repSeen.add(key);
		repsAll.push(r);
	}
	// Cross-set dedup: drop reps that are congruent to a CURATED tiling (the single-tile bobbin/rhombus/bowtie
	// live in both sets — that's the visible k=1 duplication). Keep the curated version (historical name +
	// Bonner citation); the engine keeps only what hand-curation didn't already ship.
	let droppedCurated = 0;
	const reps = repsAll.filter((r) => {
		const fp = tilingFingerprint(r.k, r.faces.map((f) => f.verts as Pt[]), r.T1, r.T2);
		if (curatedFps.has(fp)) { droppedCurated++; return false; }
		return true;
	});
	const out: ReferenceTiling[] = [];
	const counters: Record<number, number> = {};
	let rejected = 0;
	for (const r of reps) {
		const cellPolygons = r.faces.map((f) => {
			const n = GIRIH_N[f.tile] ?? f.verts.length;
			return { vertices: f.verts.map(([x, y]) => [x, y] as Pt), n, hue: polygonHue(n) };
		});
		const cell: RenderCell = { cellPolygons, basis: [r.T1 as Pt, r.T2 as Pt] };
		const v = validateTiling(cell, 1600);
		if (!v.ok) { rejected++; continue; }
		const sides = r.faces.map((f) => GIRIH_N[f.tile] ?? f.verts.length);
		const family = [...new Set(sides)].sort((a, b) => a - b).join(".");
		counters[r.k] = (counters[r.k] ?? 0) + 1;
		out.push({
			id: `isl-girih-k${r.k}-${String(counters[r.k]).padStart(3, "0")}`,
			source: "islamic",
			k: r.k,
			family,
			renderCell: cell as ReferenceTiling["renderCell"],
			islamicSystem: "fivefold",
			discoverer: "Čtrnáct engine",
			note: "Fivefold girih k-uniform tiling — enumerated by the Čtrnáct engine (girih palette, D=20) and " +
				"developed to float geometry (area-certified Σface=|detΛ|, coverage-verified). A combinatorial " +
				"candidate developed for rendering, not exact-geometry certified. See docs/ISLAMIC_TILINGS.md.",
		});
	}
	log(`  developed girih: ${out.length} distinct primitive tilings imported (${droppedNonPrim} non-primitive supercells dropped, ${droppedCurated} curated duplicates dropped, ${rejected} failed coverage; ${rawRecs.length} developed → ${recs.length} primitive → ${repsAll.length} reps → ${reps.length} non-curated → ${out.length})`);
	for (const k of Object.keys(counters).map(Number).sort((a, b) => a - b)) log(`    k=${k}: ${counters[k]}`);
	return out;
}

function loadReuseCells(ids: Set<string>): Map<string, ReferenceTiling["renderCell"]> {
	const out = new Map<string, ReferenceTiling["renderCell"]>();
	if (!fs.existsSync(ATLAS_PATH)) {
		log(`  ⚑ base atlas missing (${path.relative(ROOT, ATLAS_PATH)}) — reuse entries will be skipped`);
		return out;
	}
	const atlas = JSON.parse(fs.readFileSync(ATLAS_PATH, "utf8")) as { id: string; renderCell: ReferenceTiling["renderCell"] }[];
	for (const t of atlas) if (ids.has(t.id)) out.set(t.id, t.renderCell);
	return out;
}

function main(): void {
	const t0 = Date.now();
	log("=== build-islamic-atlas (curated historical tessellations) ===");
	const reuseIds = new Set(SPECS.filter((s) => s.reuseId).map((s) => s.reuseId!));
	const reuse = loadReuseCells(reuseIds);

	const out: ReferenceTiling[] = [];
	let skipped = 0;
	for (const spec of SPECS) {
		let renderCell: ReferenceTiling["renderCell"];
		if (spec.reuseId) {
			const cell = reuse.get(spec.reuseId);
			if (!cell) { log(`  ⚑ ${spec.id}: reuse cell ${spec.reuseId} not found — SKIPPED`); skipped++; continue; }
			renderCell = cell;
			log(`  ${spec.id}  ${spec.family}  (reused ${spec.reuseId})`);
		} else if (spec.build) {
			const cell = spec.build();
			const v = validateTiling(cell);
			if (!v.ok) {
				log(`  ⚑ ${spec.id}: FAILED validation — SKIPPED. ${v.messages.join("; ")}`);
				skipped++;
				continue;
			}
			renderCell = cell as ReferenceTiling["renderCell"];
			log(`  ${spec.id}  ${spec.family}  Σarea=${v.areaSum.toFixed(4)} |detΛ|=${v.det.toFixed(4)} vconfigs=[${v.vertexConfigs.join(" ")}]`);
		} else {
			continue;
		}
		out.push({
			id: spec.id,
			source: "islamic",
			k: spec.k,
			family: spec.family,
			renderCell,
			islamicSystem: spec.system,
			discoverer: "Traditional",
			note: spec.note,
		});
	}

	// Fingerprint every curated tiling so the engine import can drop geometric duplicates of them.
	const curatedFps = new Set<string>();
	for (const t of out) curatedFps.add(cellFingerprint(t.k, t.renderCell as unknown as RenderCell));
	out.push(...developedGirihTilings(curatedFps));

	fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
	fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 0) + "\n");
	const sizeKB = (fs.statSync(OUT_PATH).size / 1024).toFixed(1);
	log(`  wrote ${out.length} Islamic tilings (${skipped} skipped) → ${path.relative(ROOT, OUT_PATH)} (${sizeKB} KB), elapsed ${((Date.now() - t0) / 1000).toFixed(2)}s`);
	fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
	fs.writeFileSync(LOG_PATH, logLines.join("\n") + "\n");
}

main();
