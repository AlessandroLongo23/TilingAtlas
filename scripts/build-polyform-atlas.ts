/*
 * build-polyform-atlas.ts — emit the Polyforms shelf: k-uniform tilings by the polyominoes,
 * polyiamonds and polyhexes of orders 2–4, from the Čtrnáct engine, one palette per board
 * (lib/tilings/polyform.ts lists the nine). Each piece is a union of atomic cells, modeled as a
 * degenerate unit-edge polygon; the geometry lives in ℤ[ζ₁₂] — Gaussian-integer directions for the
 * square lattice, 60° ones for the triangular and hexagonal.
 *
 * Input: tools/ctrnact-oracle/run-k<maxK>-<board>/ctrnact-cells-k<maxK>.json (cumulative). Each
 * record: {id,k,T1,T2,faces:[{tile,verts}]}, verts exact ℤ[ζ₁₂] [a,b,c,d] power-basis vectors.
 * Or, with --cells, the same records from Tiling Searcher runs (scripts/build-polyform-from-searcher.sh does
 * the whole chain): one record per tiling, where eu_solver writes a tiling on many cells, so the exact dedup
 * below takes seconds on them and hours on eu_solver's (12,217 cells for the same 1,181 tilings, 2026-11-10).
 *
 * ONE gate + one dedup, both decisive, unchanged from the tetromino-only build this generalizes:
 *   1. EXACT AREA CERTIFICATE — Σ face area == |det Λ| in ℚ(ζ₂₄) (the global-overlap gate). Never
 *      ship an unverified tiling. (No T-junction gate: every polyform tiling is wanted, mono-piece
 *      and mixed alike, so nothing is filtered on size-mixing.)
 *   2. GEOMETRIC DEDUP (exact) — flat/reflex corners let the engine emit the SAME geometric tiling on
 *      many fundamental-domain sizes (supercells); the WL pruner keeps them all. They are collapsed by
 *      EXACT congruence of the tilings themselves (exactComposableKeys: primitive reduction, then one
 *      tile carried onto another by a grid ROTATION and a translation, every tile checked) — no
 *      reflections, because chirality is DISTINGUISHED for these families: a tiling and its mirror are
 *      DIFFERENT tilings (AL directive). A tile carries its piece's letter, so an S is never an image of
 *      a Z. The mirror-merged count is logged too, for reference.
 *      (Until 2026-11-10 the key was the pattern of tile CENTROIDS. Centroids do not say which way a
 *      piece lies: it merged a lattice tiling by dihexes with its mirror image and kept a rotated copy
 *      of another as a third tiling, and the shelf carried repeats and lacked tilings.)
 *
 * EXPLORATORY: NO external oracle exists for k-uniform polyform tilings (k-uniform theory is
 * regular-polygon-only; Myers/Kaplan cover single-tile isohedral, not mixed protosets). Distinct
 * counts are observations, and each board is complete only at and below its own k.
 *
 * Run:  pnpm tsx scripts/build-polyform-atlas.ts [board …]   (default: every board with a run dir)
 */
import fs from "node:fs";
import path from "node:path";
import { Cyclotomic, CyclotomicRing, setActiveRing, type CyclotomicRing as Ring } from "@/classes/Cyclotomic";
import { detSurd, polygonAreaSurd } from "@/classes/algorithm/exact/Surd";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";
import { POLYFORM_BOARDS, type PolyformBoard } from "@/lib/tilings/polyform";
import { stringifyAtlas } from "./atlas/encode.mjs"; // plain .mjs: shared with the bare-node builders
import { writeDataFile } from "./atlas/io.mjs";
import { exactComposableKeys, type ExactComposableCell } from "@/classes/algorithm/composable/exactComposableDedup";

setActiveRing(CyclotomicRing.create(24));
const RING = CyclotomicRing.create(24);

type V4 = [number, number, number, number];
type Face = { tile: string; verts: number[][] };
type Cell = { id: string; k: number; T1: number[]; T2: number[]; areaOk?: boolean; faces: Face[] };

// --- exact ℤ[ζ₁₂] integer arithmetic (power basis, ζ = ζ₁₂ = e^{iπ/6}, Φ₁₂ = x⁴−x²+1) ---
const sub = (u: V4, v: V4): V4 => [u[0] - v[0], u[1] - v[1], u[2] - v[2], u[3] - v[3]];
const mulZeta = (u: V4): V4 => [-u[3], u[0], u[1] + u[3], u[2]]; // ×ζ  (rotate +30°)
const conj = (u: V4): V4 => [u[0] + u[2], u[1], -u[2], -u[1] - u[3]]; // complex conjugate (reflection)

// [a,b,c,d] = a + b·ζ₁₂ + c·ζ₁₂² + d·ζ₁₂³, ζ₁₂ = ζ₂₄². (Same decode recipe as the scaled/oracle path.)
function dec(ring: Ring, [a, b, c, d]: number[]): Cyclotomic {
	return Cyclotomic.fromRational(ring, BigInt(a))
		.add(Cyclotomic.zeta(ring, 2).scaleRational(BigInt(b), 1n))
		.add(Cyclotomic.zeta(ring, 4).scaleRational(BigInt(c), 1n))
		.add(Cyclotomic.zeta(ring, 6).scaleRational(BigInt(d), 1n));
}

/** A cell as the exact congruence test reads it: ζ₁₂'s power basis written in ζ₂₄'s (even powers). */
const z24 = ([a, b, c, d]: number[]): number[] => [a, 0, b, 0, c, 0, d, 0];
const toExact = (c: Cell): ExactComposableCell => ({
	cellPolygons: c.faces.map((f) => ({ n: f.verts.length, name: f.tile, exact: f.verts.map(z24) })),
	exactBasis: [z24(c.T1), z24(c.T2)],
});

// Tetris identity hue per piece (degrees) — matches lib/tiles/prototiles.ts so the Tiles page and the
// Library/Play thumbnails agree. Every other board spaces its pieces evenly round the wheel in PALETTE
// order, which is the enumeration order and therefore stable. Side count can't tell polyforms apart, so
// hue is the only thing that can.
const TETRIS_HUE: Record<string, number> = { I: 190, O: 51, T: 282, S: 125, Z: 4, J: 230, L: 30 };
function hueTable(b: PolyformBoard): Record<string, number> {
	if (b.id === "tetromino") return TETRIS_HUE;
	const spec = JSON.parse(fs.readFileSync(palettePath(b), "utf8")) as { tiles: { name: string }[] };
	const out: Record<string, number> = {};
	spec.tiles.forEach((t, i) => {
		out[t.name] = Math.round((20 + (360 * i) / spec.tiles.length) % 360);
	});
	return out;
}

const ROOT = process.cwd();
const ORACLE = path.join(ROOT, "tools", "ctrnact-oracle");
const palettePath = (b: PolyformBoard): string => path.join(ORACLE, "alphabets", "palettes", `${b.id}.json`);
// --cells=a.json,b.json overrides the input, which is how one run's catalogue is cross-checked against
// another's (the dedup has to give the same partition from either). `{board}` in a name stands for each
// board's id, so one flag feeds every board: the cells scripts/tilesearch-polyform-cells.ts writes from
// Tiling Searcher runs.
const CELLS_OVERRIDE = process.argv.find((a) => a.startsWith("--cells="))?.slice(8);
/**
 * EVERY run this board has on disk, not only the deepest.
 *
 * The engine reports k per PRESENTATION, and a supercell presentation splits vertex orbits and so
 * reports a k the geometry does not have. Dedup files each geometry at the lowest k it was ever seen
 * with, so more presentations can only sharpen that: merging an older tetromino k=1 run into the k≤2
 * one moved 5 of 38 geometries down from k=2, where the deeper run alone had left them. Records above
 * the board's maxK are dropped, so a shallower run never widens the coverage claim.
 */
function cellsPath(b: PolyformBoard): string[] {
	if (CELLS_OVERRIDE) return CELLS_OVERRIDE.replaceAll("{board}", b.id).split(",");
	const out: { k: number; p: string }[] = [];
	for (const d of fs.readdirSync(ORACLE)) {
		const m = new RegExp(`^run-k(\\d+)-${b.id}$`).exec(d);
		if (!m) continue;
		const p = path.join(ORACLE, d, `ctrnact-cells-k${m[1]}.json`);
		if (fs.existsSync(p)) out.push({ k: +m[1], p });
	}
	return out.sort((x, y) => y.k - x.k).map((x) => x.p);
}

// Family label = the sorted, deduped set of pieces used, joined by "·" (e.g. "I", "O·S", "S·Z"). Sorted
// in palette order so "O·S" and "S·O" can never both appear.
function familyLabel(faces: Face[], order: string[]): string {
	const used = [...new Set(faces.map((f) => f.tile))];
	used.sort((a, b) => order.indexOf(a) - order.indexOf(b));
	return used.join("·");
}

// --out=<file> writes the shelf somewhere else (a rebuild to compare with the shipped one)
// --ids=<file>: {engine id: final id}, so a tiling the shelf already had keeps its id
// (tools/ctrnact-oracle/check_rigid_shelf.py --ids writes it from scripts/atlas/plans/polyform-ids.json).
const IDS_FILE = process.argv.find((a) => a.startsWith("--ids="))?.slice(6);
const IDS: Record<string, string> = IDS_FILE ? JSON.parse(fs.readFileSync(IDS_FILE, "utf8")) : {};
const OUT =
	process.argv.find((a) => a.startsWith("--out="))?.slice(6) ??
	path.join(ROOT, "public", "reference-atlas-polyomino.json.br");
const LOG = path.join(ROOT, "experiments", "results", "polyform-atlas-build.log");

function note(b: PolyformBoard, pieces: string[]): string {
	const cell = { polyomino: "unit squares", polyiamond: "unit equilateral triangles", polyhex: "unit hexagons" }[
		b.family
	];
	return (
		`k-uniform tilings by the ${b.pieces} one-sided ${b.label.toLowerCase()} (${pieces.join(" ")}; ${b.free} free, ` +
		`counting a shape and its mirror once). Each piece is a union of ${b.order} ${cell}, modeled as a degenerate ` +
		`unit-edge polygon whose corners are multiples of ${b.family === "polyomino" ? "90°" : "60°"}; exact geometry in ` +
		`ℤ[ζ₁₂]. A vertex counts toward k where ≥3 tiles meet; a 2-tile junction (two flat corners meeting mid-edge, or a ` +
		`reflex corner filled by one convex one) is a noncounting point. Chirality is DISTINGUISHED: a tiling and its ` +
		`mirror are counted separately (a deliberate departure from the A068599 mirror-merge convention). Each shipped ` +
		`tiling is EXACTLY area-certified (Σ face area = |det Λ| in ℚ(ζ₂₄)). The engine emits each geometric tiling on ` +
		`many fundamental-domain sizes (supercell duplicates); these are collapsed by an exact ℤ[ζ₁₂] rotation-congruence ` +
		`key, and each geometry is filed at the lowest k any of its presentations reported. The search emits only one of ` +
		`each mirror pair, so the missing reflections are restored here by exact conjugation. Complete at and below ` +
		`k=${b.maxK}, which is a compute budget and not a bound on the family. EXPLORATORY: no external oracle exists for ` +
		`this family, so counts are observations, not an all-and-only claim.`
	);
}

const logLines: string[] = [];
const log = (m = ""): void => {
	logLines.push(m);
	console.log(m);
};

// ⚑ MIRROR CLOSURE, and why the shelf cannot do without it. The protoset of every board is ONE-SIDED —
// closed under reflection, S with Z and J with L — so the set of tilings is closed under reflection too,
// and a chirality-distinguishing catalogue must contain both halves of every pair. The engine does not
// deliver that: its dart set is chirality-doubled (mirro(i,b) = (i,1−b)), so the pruner can identify a
// configuration with its mirror and emit one of the two. Measured 2026-08-24 on tetromino k≤2: 26 of 51
// tile-multiset classes were asymmetric, mono-Z present 19 times and mono-S never. So the closure is
// taken HERE, exactly, by conjugating the ℤ[ζ₁₂] coordinates and swapping each piece for its twin. A
// mirror whose key is already present adds nothing, which is what keeps an achiral tiling single.
const ZK: V4[] = (() => {
	const z: V4[] = [];
	let v: V4 = [1, 0, 0, 0];
	for (let i = 0; i < 12; i++) {
		z.push(v);
		v = mulZeta(v);
	}
	return z;
})();
const dirIdx = (d: V4): number => ZK.findIndex((z) => z[0] === d[0] && z[1] === d[1] && z[2] === d[2] && z[3] === d[3]);
/** A tile's shape as a cyclic TURN word — rotation-invariant, and a reflection reverses it. */
function turnWord(verts: number[][]): number[] {
	const n = verts.length;
	const dirs = verts.map((v, i) => dirIdx(sub(verts[(i + 1) % n] as V4, v as V4)));
	return dirs.map((d, i) => (((dirs[(i + 1) % n] - d) % 12) + 12) % 12);
}
const cyc = (w: number[]): string => {
	let best: string | null = null;
	for (let i = 0; i < w.length; i++) {
		const k = [...w.slice(i), ...w.slice(0, i)].join(",");
		if (best === null || k < best) best = k;
	}
	return best ?? "";
};
/** piece → its mirror piece, read off the tile SHAPES in the data (no palette lookup, so it cannot drift
 *  from what the developer actually emitted). An achiral piece maps to itself. */
function mirrorMap(cells: Cell[]): Map<string, string> {
	const word = new Map<string, number[]>();
	for (const c of cells) for (const f of c.faces) if (!word.has(f.tile)) word.set(f.tile, turnWord(f.verts));
	const byCanon = new Map<string, string>();
	for (const [t, w] of word) byCanon.set(cyc(w), t);
	const out = new Map<string, string>();
	for (const [t, w] of word) {
		const twin = byCanon.get(cyc([...w].reverse()));
		if (twin) out.set(t, twin);
	}
	return out;
}
function mirrorCell(c: Cell, mm: Map<string, string>): Cell | null {
	const faces: Face[] = [];
	for (const f of c.faces) {
		const twin = mm.get(f.tile);
		if (!twin) return null; // the mirror piece never appeared in the data — cannot state its letter
		faces.push({ tile: twin, verts: f.verts.map((p) => conj(p as V4)).reverse() });
	}
	return { ...c, id: `${c.id}m`, T1: conj(c.T1 as V4), T2: conj(c.T2 as V4), faces };
}

function buildBoard(b: PolyformBoard): ReferenceTiling[] {
	const srcs = cellsPath(b).filter((p) => fs.existsSync(p));
	if (!srcs.length) {
		log(`  ⚑ ${b.id}: no cells JSON — run PALETTE=${b.id} ./run-oracle.sh ${b.maxK}`);
		return [];
	}
	const cells: Cell[] = srcs.flatMap((p, i) =>
		(JSON.parse(fs.readFileSync(p, "utf8")) as Cell[]).map((c) => (i ? { ...c, id: `x${i}-${c.id}` } : c)),
	);
	const hue = hueTable(b);
	const pieces = Object.keys(hue);
	const NOTE = note(b, pieces);

	// pass 1: exact area cert → candidates
	type Cand = { tiling: ReferenceTiling; cell: Cell; key: string; area: number; k: number; mirrorOf?: Cand };
	let skipped = 0;
	const toCand = (c: Cell): Cand | null => {
		const u = dec(RING, c.T1),
			v = dec(RING, c.T2);
		const cellArea = detSurd(u, v).abs();
		let sum = polygonAreaSurd(c.faces[0].verts.map((p) => dec(RING, p)));
		for (let i = 1; i < c.faces.length; i++) sum = sum.add(polygonAreaSurd(c.faces[i].verts.map((p) => dec(RING, p))));
		if (!sum.sub(cellArea).isZero()) {
			log(`  ⚑ ${b.id}/${c.id}: EXACT area cert FAIL (Σface ≠ |detΛ|) — SKIPPED (never ship an unverified tiling)`);
			skipped++;
			return null;
		}
		const uv = u.toVector(),
			vv = v.toVector();
		const cellPolygons = c.faces.map((f) => ({
			n: f.verts.length,
			vertices: f.verts.map((p) => {
				const w = dec(RING, p).toVector();
				return [w.x, w.y];
			}),
			hue: hue[f.tile] ?? 0, // per-piece identity colour (side count can't tell polyforms apart)
		}));
		return {
			cell: c,
			key: "",
			area: Math.abs(uv.x * vv.y - uv.y * vv.x),
			k: c.k,
			tiling: {
				id: IDS[`${b.idPrefix}-${c.id}`] ?? `${b.idPrefix}-${c.id}`,
				source: "polyomino",
				k: c.k,
				family: familyLabel(c.faces, pieces),
				polyformOrder: b.id,
				renderCell: {
					cellPolygons,
					basis: [
						[uv.x, uv.y],
						[vv.x, vv.y],
					],
				} as ReferenceTiling["renderCell"],
				discoverer: "Alessandro Longo",
				certification: "candidate",
				note: NOTE,
			},
		};
	};
	const cands: Cand[] = [];
	for (const c of cells) {
		if (c.k > b.maxK) continue;
		const cand = toCand(c);
		if (cand) cands.push(cand);
	}

	// pass 2: mirror closure and geometric dedup together. Every tiling's reflection is a tiling of the same
	// protoset, so it belongs on the shelf: each candidate is joined by its mirror image, and one representative
	// is kept per class of exact congruence without reflections, so an achiral tiling stays single. The keeper
	// is the one with the SMALLEST k, then the smallest cell (a supercell presentation of a tiling splits its
	// vertex orbits and so reports a k the geometry does not have, and the engine emits both), then an
	// engine's own record before a reflection made here.
	const mm = mirrorMap(cells);
	for (const c of [...cands]) {
		const m = mirrorCell(c.cell, mm);
		const cand = m && toCand(m);
		if (cand) cands.push({ ...cand, mirrorOf: c });
	}
	exactComposableKeys(
		cands.map((c) => toExact(c.cell)),
		false,
	).keys.forEach((key, i) => (cands[i].key = key));
	const byKey = new Map<string, Cand>();
	const kSeen = new Map<string, Set<number>>();
	const better = (a: Cand, b2: Cand): boolean =>
		a.k < b2.k || (a.k === b2.k && (a.area < b2.area || (a.area === b2.area && !a.mirrorOf && !!b2.mirrorOf)));
	for (const c of cands) {
		(kSeen.get(c.key) ?? kSeen.set(c.key, new Set()).get(c.key)!).add(c.k);
		const prev = byKey.get(c.key);
		if (!prev || better(c, prev)) byKey.set(c.key, c);
	}
	let conflicts = 0;
	for (const ks of kSeen.values()) if (ks.size > 1) conflicts++;
	if (conflicts)
		log(
			`  ⚑ ${b.id}: ${conflicts} geometries arrived at more than one k (supercell presentations) — filed at the lowest`,
		);
	const added = [...byKey.values()].filter((c) => c.mirrorOf).length;
	if (added) log(`  ⚑ ${b.id}: mirror closure ADDED ${added} reflections the engine did not emit`);
	// How many tilings there would be under the A068599 mirror-merge convention this shelf departs from: a
	// candidate and its reflection are one, so the classes are the kept keys joined along those pairs.
	const twin = new Map<string, string>();
	const root = (x: string): string => (twin.get(x) === undefined || twin.get(x) === x ? x : root(twin.get(x)!));
	for (const m of cands) {
		if (!m.mirrorOf) continue;
		const [a, b2] = [root(m.mirrorOf.key), root(m.key)];
		if (a !== b2) twin.set(a, b2);
	}
	const mirrorMerged = new Set([...byKey.keys()].map(root)).size;

	const out = [...byKey.values()].map((c) => c.tiling);
	out.sort((a, b2) => a.k - b2.k || a.family.localeCompare(b2.family) || a.id.localeCompare(b2.id));
	const rawByK = new Map<number, number>(),
		distByK = new Map<number, number>();
	for (const c of cands) rawByK.set(c.k, (rawByK.get(c.k) ?? 0) + 1);
	for (const c of out) distByK.set(c.k, (distByK.get(c.k) ?? 0) + 1);
	const perK = [...distByK.keys()]
		.sort((x, y) => x - y)
		.map((k) => `k=${k}: ${rawByK.get(k) ?? 0}→${distByK.get(k) ?? 0}`)
		.join("  ");
	log(
		`  ${b.label.padEnd(12)} ${String(cands.length).padStart(5)} raw → ${String(out.length).padStart(5)} distinct ` +
			`(mirror-merged would be ${mirrorMerged}` +
			`${skipped ? `; ${skipped} area-cert SKIPPED` : ""})   ${perK}`,
	);
	if (skipped > 0) process.exitCode = 1;
	return out;
}

function main(): void {
	const t0 = Date.now();
	const want = process.argv.slice(2).filter((a) => !a.startsWith("--"));
	const boards = want.length ? POLYFORM_BOARDS.filter((b) => want.includes(b.id)) : POLYFORM_BOARDS;
	log(`=== build-polyform-atlas (${boards.length} boards, chirality-distinguished) ===`);
	const all: ReferenceTiling[] = [];
	for (const b of boards) all.push(...buildBoard(b));

	const order = new Map(POLYFORM_BOARDS.map((b, i) => [b.id, i]));
	all.sort(
		(a, b) =>
			order.get(a.polyformOrder!)! - order.get(b.polyformOrder!)! ||
			a.k - b.k ||
			a.family.localeCompare(b.family) ||
			a.id.localeCompare(b.id),
	);
	fs.mkdirSync(path.dirname(OUT), { recursive: true });
	writeDataFile(OUT, stringifyAtlas(all) + "\n");
	const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
	log(
		`  TOTAL ${all.length} tilings → ${path.relative(ROOT, OUT)} (${kb} KB), ${((Date.now() - t0) / 1000).toFixed(1)}s`,
	);
	fs.mkdirSync(path.dirname(LOG), { recursive: true });
	fs.writeFileSync(LOG, logLines.join("\n") + "\n");
}

main();
