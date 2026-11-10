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
import { stringifyAtlas } from "./atlas/encode.mjs";
import { readDataJson, writeDataFile } from "./atlas/io.mjs";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import { hydrateRenderCells } from "@/lib/services/renderCellDerive";
import {
	assemble,
	validateTiling,
	regular,
	girih,
	center,
	rotate,
	polygonFromTurns,
	polygonHue,
	parallelohexagonCell,
	parallelogramCell,
	type Placement,
	type Basis,
	type RenderCell,
	type Pt,
} from "./islamic/lib";

const ROOT = process.cwd();
// --out=<file> writes the shelf somewhere else (a rebuild to check before it replaces the shipped one)
const OUT_PATH =
	process.argv.find((a) => a.startsWith("--out="))?.slice(6) ??
	path.join(ROOT, "public", "reference-atlas-islamic.json.br");
const LOG_PATH = path.join(ROOT, "experiments", "results", "islamic-atlas-build.log");
const ATLAS_PATH = path.join(ROOT, "public", "reference-atlas.json.br");

const logLines: string[] = [];
function log(msg = ""): void {
	logLines.push(msg);
	console.log(msg);
}

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
	const basis: Basis = [
		[p, 0],
		[0, p],
	];
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
		id: "isl-4a-488",
		system: "fourfold-a",
		family: "4.8.8",
		k: 1,
		name: "Octagon and square (eight-point star)",
		note:
			"Fourfold system A base tessellation (4.8.8, the truncated-square / octagon-square grid). The " +
			"acute strapwork on it is the classic eight-pointed khatam star. Bonner §3.1.3. Curated historical " +
			"transcription; k descriptive, not a completeness claim.",
		build: fourfold488,
	},
	{
		id: "isl-5f-bobbin",
		system: "fivefold",
		family: "6",
		k: 1,
		name: "Bobbin (elongated hexagon) tessellation",
		note:
			"Fivefold system, the girih bobbin (shesh band) tiling — a parallelohexagon, so it tiles by " +
			"translation. Its strapwork is a genuine 10-fold pattern. Bonner §3.1.5. Curated; k descriptive.",
		build: fivefoldBobbin,
	},
	{
		id: "isl-5f-rhombus",
		system: "fivefold",
		family: "4",
		k: 1,
		name: "Wide rhombus (torange) tessellation",
		note:
			"Fivefold system, the girih wide rhombus (torange, 72°/108°) as the repeat unit — Bonner's " +
			"'wide rhombic repeat' (§3.1.7). A parallelogram, so it tiles by translation. Curated; k descriptive.",
		build: fivefoldRhombus,
	},
	{
		id: "isl-5f-bowtie",
		system: "fivefold",
		family: "6",
		k: 1,
		name: "Bowtie (concave hexagon) tessellation",
		note:
			"Fivefold system, the girih bowtie (sormeh dan) — a non-convex parallelohexagon that tiles by " +
			"translation (interlocking hourglasses). The engine's girih enumeration confirms the bowtie tiles " +
			"1-uniformly; this is one such arrangement. Curated; k descriptive.",
		build: fivefoldBowtie,
	},
	{
		id: "isl-7f-parallelohex",
		system: "sevenfold",
		family: "6",
		k: 1,
		name: "Sevenfold parallelohexagon",
		note:
			"Sevenfold system (rare; Bonner §3.1.14): a heptagon-grid parallelohexagon (angles multiples of " +
			"180/7). Tiles by translation; its strapwork carries 7- and 14-point motifs. Minimal representative " +
			"of the sevenfold angular geometry. Curated; k descriptive.",
		build: sevenfold,
	},
	{
		id: "isl-4b-parallelohex",
		system: "fourfold-b",
		family: "6",
		k: 1,
		name: "Fourfold-B eightfold parallelohexagon",
		note:
			"Fourfold system B (Bonner §3.1.4): the 8-fold system with a 22.5° angular signature (dual of " +
			"4.8²). A 22.5°-grid parallelohexagon (angles 112.5°/135°), tiling by translation. Representative of " +
			"the fourfold-B geometry. Curated; k descriptive.",
		build: fourfoldB,
	},
	// regular-system entries reuse certified atlas cells (they ARE those tilings, re-framed under the
	// Islamic polygonal technique). 12-fold and 6-fold stars come from these on median/obtuse openings.
	{
		id: "isl-reg-3.4.6.4",
		system: "regular",
		family: "3.4.6.4",
		k: 1,
		name: "Rhombitrihexagonal (3.4.6.4)",
		note:
			"Regular-polygon system (Bonner §3.1.1): the 3.4.6.4 Archimedean grid, an underlying tessellation " +
			"for six- and twelve-point patterns. Same tiling as the certified atlas entry, re-framed.",
		reuseId: "t1006",
	},
	{
		id: "isl-reg-4.6.12",
		system: "regular",
		family: "4.6.12",
		k: 1,
		name: "Truncated trihexagonal (4.6.12)",
		note:
			"Regular-polygon system (Bonner §3.1.1): the 4.6.12 grid, base for twelve-point star patterns. " +
			"Same tiling as the certified atlas entry, re-framed.",
		reuseId: "t1003",
	},
	{
		id: "isl-reg-3.12.12",
		system: "regular",
		family: "3.12.12",
		k: 1,
		name: "Truncated hexagonal (3.12.12)",
		note:
			"Regular-polygon system (Bonner §3.1.1): the 3.12.12 grid — dodecagons carry twelve-point stars. " +
			"Same tiling as the certified atlas entry, re-framed.",
		reuseId: "t1004",
	},
	{
		id: "isl-reg-3.6.3.6",
		system: "regular",
		family: "3.6.3.6",
		k: 1,
		name: "Trihexagonal (3.6.3.6)",
		note:
			"Regular-polygon system (Bonner §3.1.1): the 3.6.3.6 (kagome) grid, base for six-point star " +
			"patterns. Same tiling as the certified atlas entry, re-framed.",
		reuseId: "t1007",
	},
];

// ── girih tilings from the Tiling Searcher ─────────────────────────────────────────────────────────────
// The fivefold girih k-uniform tilings, searched and developed by the Tiling Searcher
// (scripts/build-girih-from-searcher.sh: the girih palette as a board, the search, float cells, ids). Each is
// re-validated here through the coverage validator before it ships. The engine writes each tiling once, on its
// primitive cell, so nothing is merged here.
// (Until 2026-11-10 the source was eu_solver's developed cells, kept one per (k, tile multiset, cell area):
// that key is not an identity, and the shelf had 182 of the 585 tilings to k = 4, 14 of them under too high a k.)
const GIRIH_DIR = path.join(ROOT, "experiments", "girih-searcher");
const GIRIH_MAX_K = 4;

function searchedGirihTilings(): ReferenceTiling[] {
	if (!fs.existsSync(path.join(GIRIH_DIR, "ids.json"))) {
		log("  ⚑ no experiments/girih-searcher — girih import skipped (run scripts/build-girih-from-searcher.sh)");
		return [];
	}
	const cells = JSON.parse(fs.readFileSync(path.join(GIRIH_DIR, "cells.json"), "utf8")) as {
		id: string;
		k: number;
		renderCell: { cellPolygons: { n: number; vertices: Pt[] }[]; basis: Pt[] };
	}[];
	// {run id: final id}: a tiling the shelf already has keeps its id, and one whose id is not a girih id is a
	// curated tiling (the bobbin, rhombus and bowtie alone), which keeps its historical entry above.
	const ids = JSON.parse(fs.readFileSync(path.join(GIRIH_DIR, "ids.json"), "utf8")) as Record<string, string>;
	const round = ([x, y]: Pt): Pt => [Math.round(x * 1e9) / 1e9, Math.round(y * 1e9) / 1e9];
	const out: ReferenceTiling[] = [];
	const counters: Record<number, number> = {};
	let rejected = 0,
		curated = 0;
	for (const r of cells) {
		if (r.k > GIRIH_MAX_K) continue;
		if (!ids[r.id].startsWith("isl-girih-")) {
			curated++;
			continue;
		}
		const cellPolygons = r.renderCell.cellPolygons.map((p) => ({
			vertices: p.vertices.map(round),
			n: p.n,
			hue: polygonHue(p.n),
		}));
		const cell: RenderCell = { cellPolygons, basis: r.renderCell.basis.map(round) as Basis };
		if (!validateTiling(cell, 1600).ok) {
			rejected++;
			continue;
		}
		counters[r.k] = (counters[r.k] ?? 0) + 1;
		out.push({
			id: ids[r.id],
			source: "islamic",
			k: r.k,
			family: [...new Set(cellPolygons.map((p) => p.n))].sort((a, b) => a - b).join("."),
			renderCell: cell as ReferenceTiling["renderCell"],
			islamicSystem: "fivefold",
			discoverer: "Čtrnáct engine (Tiling Searcher)",
			note:
				"Fivefold girih k-uniform tiling, found by the Čtrnáct engine in the Tiling Searcher (the five girih tiles, " +
				"k from 1 to 4) and developed to float geometry (the tiles of a period cell cover it exactly once: " +
				"area-certified and coverage-verified). A combinatorial candidate developed for rendering, not " +
				"exact-geometry certified. See docs/ISLAMIC_TILINGS.md.",
		});
	}
	out.sort((a, b) => a.k - b.k || a.id.localeCompare(b.id));
	log(`  girih: ${out.length} tilings from the Searcher (${curated} are curated entries, ${rejected} failed coverage)`);
	for (const k of Object.keys(counters)
		.map(Number)
		.sort((a, b) => a - b))
		log(`    k=${k}: ${counters[k]}`);
	if (rejected) process.exitCode = 1;
	return out;
}

function loadReuseCells(ids: Set<string>): Map<string, ReferenceTiling["renderCell"]> {
	const out = new Map<string, ReferenceTiling["renderCell"]>();
	if (!fs.existsSync(ATLAS_PATH)) {
		log(`  ⚑ base atlas missing (${path.relative(ROOT, ATLAS_PATH)}) — reuse entries will be skipped`);
		return out;
	}
	// hydrated: the base atlas ships no renderCell where its exact source reproduces it
	const atlas = hydrateRenderCells(decodeAtlas<ReferenceTiling>(readDataJson(ATLAS_PATH)));
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
			if (!cell) {
				log(`  ⚑ ${spec.id}: reuse cell ${spec.reuseId} not found — SKIPPED`);
				skipped++;
				continue;
			}
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
			log(
				`  ${spec.id}  ${spec.family}  Σarea=${v.areaSum.toFixed(4)} |detΛ|=${v.det.toFixed(4)} vconfigs=[${v.vertexConfigs.join(" ")}]`,
			);
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

	out.push(...searchedGirihTilings());

	fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
	writeDataFile(OUT_PATH, stringifyAtlas(out) + "\n");
	const sizeKB = (fs.statSync(OUT_PATH).size / 1024).toFixed(1);
	log(
		`  wrote ${out.length} Islamic tilings (${skipped} skipped) → ${path.relative(ROOT, OUT_PATH)} (${sizeKB} KB), elapsed ${((Date.now() - t0) / 1000).toFixed(2)}s`,
	);
	fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
	fs.writeFileSync(LOG_PATH, logLines.join("\n") + "\n");
}

main();
