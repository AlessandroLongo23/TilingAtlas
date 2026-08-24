/*
 * build-polyform-atlas.ts — emit the Polyforms shelf: k-uniform tilings by the polyominoes,
 * polyiamonds and polyhexes of orders 2–4, from the Čtrnáct engine, one palette per board
 * (lib/tilings/polyform.ts lists the nine). Each piece is a union of atomic cells, modeled as a
 * degenerate unit-edge polygon; the geometry lives in ℤ[ζ₁₂] — Gaussian-integer directions for the
 * square lattice, 60° ones for the triangular and hexagonal.
 *
 * Input: tools/ctrnact-oracle/run-k<maxK>-<board>/ctrnact-cells-k<maxK>.json (cumulative). Each
 * record: {id,k,T1,T2,faces:[{tile,verts}]}, verts exact ℤ[ζ₁₂] [a,b,c,d] power-basis vectors.
 *
 * ONE gate + one dedup, both decisive, unchanged from the tetromino-only build this generalizes:
 *   1. EXACT AREA CERTIFICATE — Σ face area == |det Λ| in ℚ(ζ₂₄) (the global-overlap gate). Never
 *      ship an unverified tiling. (No T-junction gate: every polyform tiling is wanted, mono-piece
 *      and mixed alike, so nothing is filtered on size-mixing.)
 *   2. GEOMETRIC DEDUP (exact) — flat/reflex corners let the engine emit the SAME geometric tiling on
 *      many fundamental-domain sizes (supercells); the WL pruner keeps them all. We collapse them with
 *      an EXACT congruence canonical key on the integer ℤ[ζ₁₂] coordinates, anchoring on the
 *      rarest-piece face and minimising over the grid symmetries — but ROTATIONS ONLY (12, no
 *      reflections), because chirality is DISTINGUISHED for these families: a tiling and its mirror
 *      are DIFFERENT tilings (AL directive). The piece letter is folded into the per-face fingerprint
 *      so an S-tiling can never be identified with a Z-tiling. The mirror-merged count (full 24 syms)
 *      is logged too, for reference. Merges logged LOUDLY (raw→distinct).
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

setActiveRing(CyclotomicRing.create(24));
const RING = CyclotomicRing.create(24);

type V4 = [number, number, number, number];
type Face = { tile: string; verts: number[][] };
type Cell = { id: string; k: number; T1: number[]; T2: number[]; areaOk?: boolean; faces: Face[] };

// --- exact ℤ[ζ₁₂] integer arithmetic (power basis, ζ = ζ₁₂ = e^{iπ/6}, Φ₁₂ = x⁴−x²+1) ---
const add = (u: V4, v: V4): V4 => [u[0] + v[0], u[1] + v[1], u[2] + v[2], u[3] + v[3]];
const sub = (u: V4, v: V4): V4 => [u[0] - v[0], u[1] - v[1], u[2] - v[2], u[3] - v[3]];
const smul = (u: V4, s: number): V4 => [u[0] * s, u[1] * s, u[2] * s, u[3] * s];
const mulZeta = (u: V4): V4 => [-u[3], u[0], u[1] + u[3], u[2]]; // ×ζ  (rotate +30°)
const conj = (u: V4): V4 => [u[0] + u[2], u[1], -u[2], -u[1] - u[3]]; // complex conjugate (reflection)
// Two grid-symmetry groups: rotations-only (12 = C₁₂, orientation-preserving ⇒ chirality-distinguished)
// and the full D₁₂ (24, incl. reflections ⇒ mirror-merged). We ship the rotations-only dedup and log both.
function makeSyms(withReflections: boolean): Array<(u: V4) => V4> {
	const out: Array<(u: V4) => V4> = [];
	for (let refl = 0; refl < (withReflections ? 2 : 1); refl++)
		for (let r = 0; r < 12; r++) out.push((u: V4) => { let x = refl ? conj(u) : u; for (let i = 0; i < r; i++) x = mulZeta(x); return x; });
	return out;
}
const SYMS_ROT = makeSyms(false);
const SYMS_ALL = makeSyms(true);
const CO = [1, Math.cos(Math.PI / 6), Math.cos(Math.PI / 3), 0];
const SI = [0, Math.sin(Math.PI / 6), Math.sin(Math.PI / 3), 1];
const toX = (u: V4): number => u[0] * CO[0] + u[1] * CO[1] + u[2] * CO[2] + u[3] * CO[3];
const toY = (u: V4): number => u[0] * SI[0] + u[1] * SI[1] + u[2] * SI[2] + u[3] * SI[3];
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;

// [a,b,c,d] = a + b·ζ₁₂ + c·ζ₁₂² + d·ζ₁₂³, ζ₁₂ = ζ₂₄². (Same decode recipe as the scaled/oracle path.)
function dec(ring: Ring, [a, b, c, d]: number[]): Cyclotomic {
	return Cyclotomic.fromRational(ring, BigInt(a))
		.add(Cyclotomic.zeta(ring, 2).scaleRational(BigInt(b), 1n))
		.add(Cyclotomic.zeta(ring, 4).scaleRational(BigInt(c), 1n))
		.add(Cyclotomic.zeta(ring, 6).scaleRational(BigInt(d), 1n));
}

// EXACT congruence canonical key. Face-centroids scaled to integer ℤ[ζ₁₂] vectors (M·centroid, M = lcm of
// face vertex counts), replicated over a bounded patch; canonicalised over translation (anchor on each
// rarest-piece face) × the given grid symmetries, comparing sorted integer tuples — no float in the key,
// so congruent tilings (incl. supercell copies) get byte-identical keys. `fp` = the PIECE INDEX, so with
// rotations-only syms an S-tiling and a Z-tiling never collide (chirality distinguished).
//
// ⚑ THE ANCHOR SET IS ONE FACE PER ORBIT, not "every rare face within 4.2 of the origin", which is what
// it was until 2026-08-24. That rule read the ORIGIN, which is where the developer happened to put the
// cell and not a property of the tiling, so two presentations of one geometry could offer different
// anchor sets and take their minimum over different candidates — different key, missed merge, a
// duplicate on the shelf. Measured on the tetromino board: the same 27 geometries came out as 27 from
// one run's 39 presentations and 26 from another's 55. Anchoring on the faces of the fundamental domain
// instead makes the candidate set the tiling's own: a supercell has more faces, but each is a lattice
// translate of one of these and contributes the SAME key, so the minimum cannot move.
const R_WINDOW = 12;
type Row = [number, number, number, number, number]; // ℤ[ζ₁₂] coords + the piece's index in the palette
const rowCmp = (a: Row, b: Row): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3] || a[4] - b[4];
/** Lexicographic on the sorted rows — the numeric order the string join used to approximate. Any total
 *  order works for a canonical key, but comparing numbers beats building a 10 KB string per candidate:
 *  a monohedral board offers a dozen anchors × 12 symmetries, and the strings were 90% of the build. */
function lessThan(a: Row[], b: Row[]): boolean {
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) {
		const c = rowCmp(a[i], b[i]);
		if (c !== 0) return c < 0;
	}
	return a.length < b.length;
}
function canonKey(c: Cell, syms: Array<(u: V4) => V4>, pieceIdx: Map<string, number>): string {
	let M = 1;
	for (const f of c.faces) M = lcm(M, f.verts.length);
	const T1 = smul(c.T1 as V4, M), T2 = smul(c.T2 as V4, M);
	const base = c.faces.map((f) => {
		let s: V4 = [0, 0, 0, 0];
		for (const p of f.verts) s = add(s, p as V4);
		return { fp: pieceIdx.get(f.tile) ?? -1, P: smul(s, M / f.verts.length) }; // M·centroid, labelled by piece
	});
	// The RAREST piece in the fundamental domain. A supercell multiplies every count by the same factor,
	// so the argmin is the same on every presentation; ties go to the lowest palette index.
	const cnt = new Map<number, number>();
	for (const b of base) cnt.set(b.fp, (cnt.get(b.fp) ?? 0) + 1);
	let rare = -1, rc = Infinity;
	for (const [k, v] of [...cnt].sort((x, y) => x[0] - y[0])) if (v < rc) { rc = v; rare = k; }

	// One anchor per face of the fundamental domain carrying that piece, each taken at its translate
	// nearest the origin so the patch around it is inside the gather.
	const t1 = [toX(T1) / M, toY(T1) / M], t2 = [toX(T2) / M, toY(T2) / M];
	const det = t1[0] * t2[1] - t1[1] * t2[0];
	const anchors: V4[] = [];
	let rMax = 0;
	for (const b of base) {
		if (b.fp !== rare) continue;
		const px = toX(b.P) / M, py = toY(b.P) / M;
		const mc = (-px * t2[1] + py * t2[0]) / det, nc = (-t1[0] * py + t1[1] * px) / det;
		let bestP: V4 | null = null, bestN = Infinity;
		for (let m = Math.floor(mc) - 1; m <= Math.floor(mc) + 2; m++)
			for (let n = Math.floor(nc) - 1; n <= Math.floor(nc) + 2; n++) {
				const P = add(b.P, add(smul(T1, m), smul(T2, n)));
				const d = (toX(P) / M) ** 2 + (toY(P) / M) ** 2;
				if (d < bestN) { bestN = d; bestP = P; }
			}
		anchors.push(bestP!);
		rMax = Math.max(rMax, Math.sqrt(bestN));
	}

	// A point past (furthest anchor + window) cannot enter any candidate key, so that is the gather.
	const R_GATHER = rMax + R_WINDOW;
	const minT = Math.min(Math.hypot(...t1 as [number, number]), Math.hypot(...t2 as [number, number]));
	const K = Math.ceil((R_GATHER + 8) / Math.max(minT, 0.4)) + 2;
	const pts: Array<{ fp: number; P: V4 }> = [];
	for (let m = -K; m <= K; m++) for (let n = -K; n <= K; n++) {
		const off = add(smul(T1, m), smul(T2, n));
		for (const b of base) {
			const P = add(b.P, off);
			const x = toX(P) / M, y = toY(P) / M;
			if (x * x + y * y <= R_GATHER * R_GATHER) pts.push({ fp: b.fp, P });
		}
	}
	// g is linear, so g(P − A) = g(P) − g(A): rotate the patch ONCE per symmetry instead of once per
	// (anchor, symmetry, point). And |g(P − A)| = |P − A|, so which points fall in the window depends on
	// the anchor alone — the mask is shared by all twelve.
	const rot = syms.map((g) => pts.map((p) => g(p.P)));
	let best: Row[] | null = null;
	for (const A of anchors) {
		const inWin: number[] = [];
		for (let i = 0; i < pts.length; i++) {
			const d = sub(pts[i].P, A);
			const x = toX(d) / M, y = toY(d) / M;
			if (x * x + y * y <= R_WINDOW * R_WINDOW) inWin.push(i);
		}
		for (let s = 0; s < syms.length; s++) {
			const R = rot[s], gA = syms[s](A);
			const rel: Row[] = inWin.map((i) => {
				const Q = sub(R[i], gA);
				return [Q[0], Q[1], Q[2], Q[3], pts[i].fp] as Row;
			});
			rel.sort(rowCmp);
			if (best === null || lessThan(rel, best)) best = rel;
		}
	}
	return best ? `M${M}|` + best.map((r) => r.join(",")).join(";") : "";
}

// Tetris identity hue per piece (degrees) — matches lib/tiles/prototiles.ts so the Tiles page and the
// Library/Play thumbnails agree. Every other board spaces its pieces evenly round the wheel in PALETTE
// order, which is the enumeration order and therefore stable. Side count can't tell polyforms apart, so
// hue is the only thing that can.
const TETRIS_HUE: Record<string, number> = { I: 190, O: 51, T: 282, S: 125, Z: 4, J: 230, L: 30 };
function hueTable(b: PolyformBoard): Record<string, number> {
	if (b.id === "tetromino") return TETRIS_HUE;
	const spec = JSON.parse(fs.readFileSync(palettePath(b), "utf8")) as { tiles: { name: string }[] };
	const out: Record<string, number> = {};
	spec.tiles.forEach((t, i) => { out[t.name] = Math.round((20 + (360 * i) / spec.tiles.length) % 360); });
	return out;
}

const ROOT = process.cwd();
const ORACLE = path.join(ROOT, "tools", "ctrnact-oracle");
const palettePath = (b: PolyformBoard): string => path.join(ORACLE, "alphabets", "palettes", `${b.id}.json`);
// --cells=a.json,b.json overrides the input for a single board, which is how one run's catalogue is
// cross-checked against another's (the dedup has to give the same partition from either).
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
	if (CELLS_OVERRIDE) return CELLS_OVERRIDE.split(",");
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

const MIRROR_REPORT = process.argv.includes("--mirror-report");
const OUT = path.join(ROOT, "public", "reference-atlas-polyomino.json");
const LOG = path.join(ROOT, "experiments", "results", "polyform-atlas-build.log");

function note(b: PolyformBoard, pieces: string[]): string {
	const cell = { polyomino: "unit squares", polyiamond: "unit equilateral triangles", polyhex: "unit hexagons" }[b.family];
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
const log = (m = ""): void => { logLines.push(m); console.log(m); };

// ⚑ MIRROR CLOSURE, and why the shelf cannot do without it. The protoset of every board is ONE-SIDED —
// closed under reflection, S with Z and J with L — so the set of tilings is closed under reflection too,
// and a chirality-distinguishing catalogue must contain both halves of every pair. The engine does not
// deliver that: its dart set is chirality-doubled (mirro(i,b) = (i,1−b)), so the pruner can identify a
// configuration with its mirror and emit one of the two. Measured 2026-08-24 on tetromino k≤2: 26 of 51
// tile-multiset classes were asymmetric, mono-Z present 19 times and mono-S never. So the closure is
// taken HERE, exactly, by conjugating the ℤ[ζ₁₂] coordinates and swapping each piece for its twin. A
// mirror whose key is already present adds nothing, which is what keeps an achiral tiling single.
const ZK: V4[] = (() => { const z: V4[] = []; let v: V4 = [1, 0, 0, 0]; for (let i = 0; i < 12; i++) { z.push(v); v = mulZeta(v); } return z; })();
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

/** The same tiling on a doubled fundamental domain: same geometry, twice the faces, a presentation the
 *  engine emits by itself (its "supercell duplicates"). The canonical key must not notice. */
function supercell(c: Cell): Cell {
	const T2 = c.T2 as V4;
	return {
		...c,
		T2: smul(T2, 2),
		faces: [...c.faces, ...c.faces.map((f) => ({ tile: f.tile, verts: f.verts.map((p) => add(p as V4, T2)) }))],
	};
}

/** --selftest: assert the dedup key is presentation-invariant, which is the property the whole shelf
 *  count rests on. Cheap, and it is how the origin-relative anchor rule was caught (2026-08-24). */
function selfTest(cells: Cell[], pieceIdx: Map<string, number>): number {
	let bad = 0;
	for (const c of cells) {
		if (canonKey(c, SYMS_ROT, pieceIdx) !== canonKey(supercell(c), SYMS_ROT, pieceIdx)) {
			log(`  ⚑ SELFTEST FAIL ${c.id}: the doubled cell keys differently from the primitive one`);
			bad++;
		}
	}
	return bad;
}

function buildBoard(b: PolyformBoard): ReferenceTiling[] {
	const srcs = cellsPath(b).filter((p) => fs.existsSync(p));
	if (!srcs.length) {
		log(`  ⚑ ${b.id}: no cells JSON — run PALETTE=${b.id} ./run-oracle.sh ${b.maxK}`);
		return [];
	}
	const cells: Cell[] = srcs.flatMap((p, i) =>
		(JSON.parse(fs.readFileSync(p, "utf8")) as Cell[]).map((c) => (i ? { ...c, id: `x${i}-${c.id}` } : c)));
	const hue = hueTable(b);
	const pieces = Object.keys(hue);
	const pieceIdx = new Map(pieces.map((n, i) => [n, i]));
	if (process.argv.includes("--selftest")) {
		const bad = selfTest(cells.slice(0, 200), pieceIdx);
		log(`  selftest ${b.id}: ${bad} of ${Math.min(200, cells.length)} presentations keyed differently when doubled`);
	}
	const NOTE = note(b, pieces);

	// pass 1: exact area cert → candidates, each with its exact congruence keys (rotation + full-mirror)
	type Cand = { tiling: ReferenceTiling; cell: Cell; key: string; mkey: string; area: number; k: number };
	let skipped = 0;
	const toCand = (c: Cell): Cand | null => {
		const u = dec(RING, c.T1), v = dec(RING, c.T2);
		const cellArea = detSurd(u, v).abs();
		let sum = polygonAreaSurd(c.faces[0].verts.map((p) => dec(RING, p)));
		for (let i = 1; i < c.faces.length; i++) sum = sum.add(polygonAreaSurd(c.faces[i].verts.map((p) => dec(RING, p))));
		if (!sum.sub(cellArea).isZero()) {
			log(`  ⚑ ${b.id}/${c.id}: EXACT area cert FAIL (Σface ≠ |detΛ|) — SKIPPED (never ship an unverified tiling)`);
			skipped++;
			return null;
		}
		const uv = u.toVector(), vv = v.toVector();
		const cellPolygons = c.faces.map((f) => ({
			n: f.verts.length,
			vertices: f.verts.map((p) => { const w = dec(RING, p).toVector(); return [w.x, w.y]; }),
			hue: hue[f.tile] ?? 0, // per-piece identity colour (side count can't tell polyforms apart)
		}));
		return {
			cell: c,
			key: canonKey(c, SYMS_ROT, pieceIdx),
			mkey: MIRROR_REPORT ? canonKey(c, SYMS_ALL, pieceIdx) : "",
			area: Math.abs(uv.x * vv.y - uv.y * vv.x),
			k: c.k,
			tiling: {
				id: `${b.idPrefix}-${c.id}`,
				source: "polyomino",
				k: c.k,
				family: familyLabel(c.faces, pieces),
				polyformOrder: b.id,
				renderCell: { cellPolygons, basis: [[uv.x, uv.y], [vv.x, vv.y]] } as ReferenceTiling["renderCell"],
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

	// pass 2: geometric dedup — one representative per exact ROTATION-congruence key. The keeper is the
	// one with the SMALLEST k, then the smallest cell: a supercell presentation of a tiling splits its
	// vertex orbits and so reports a k the geometry does not have, and the engine emits both. Keeping the
	// min-area rep alone was not enough — a mirror can arrive only as somebody's supercell (2026-08-24).
	const byKey = new Map<string, Cand>();
	const kSeen = new Map<string, Set<number>>();
	const better = (a: Cand, b2: Cand): boolean => a.k < b2.k || (a.k === b2.k && a.area < b2.area);
	const keep = (c: Cand): void => {
		(kSeen.get(c.key) ?? kSeen.set(c.key, new Set()).get(c.key)!).add(c.k);
		const prev = byKey.get(c.key);
		if (!prev || better(c, prev)) byKey.set(c.key, c);
	};
	for (const c of cands) keep(c);
	let conflicts = 0;
	for (const ks of kSeen.values()) if (ks.size > 1) conflicts++;
	if (conflicts) log(`  ⚑ ${b.id}: ${conflicts} geometries arrived at more than one k (supercell presentations) — filed at the lowest`);
	// Reference figure: how many tilings there would be under the A068599 mirror-merge convention this
	// shelf departs from. A second canonical key over 24 symmetries instead of 12, so it triples the
	// build — opt in with --mirror-report when the number is wanted.
	const mirrorMerged = MIRROR_REPORT ? new Set(cands.map((c) => c.mkey)).size : null;

	// pass 3: mirror closure. Every kept tiling's reflection is a tiling of the same protoset, so it
	// belongs on the shelf; add the ones the engine did not emit (and let one that arrived only as a
	// supercell be re-filed at its own k by the same rule).
	const mm = mirrorMap(cells);
	let added = 0;
	for (const c of [...byKey.values()]) {
		const m = mirrorCell(c.cell, mm);
		if (!m) continue;
		const cand = toCand(m);
		if (!cand) continue;
		if (!byKey.has(cand.key)) added++;
		keep(cand);
	}
	if (added) log(`  ⚑ ${b.id}: mirror closure ADDED ${added} reflections the engine did not emit (see the note in this file)`);

	const out = [...byKey.values()].map((c) => c.tiling);
	out.sort((a, b2) => a.k - b2.k || a.family.localeCompare(b2.family) || a.id.localeCompare(b2.id));
	const rawByK = new Map<number, number>(), distByK = new Map<number, number>();
	for (const c of cands) rawByK.set(c.k, (rawByK.get(c.k) ?? 0) + 1);
	for (const c of out) distByK.set(c.k, (distByK.get(c.k) ?? 0) + 1);
	const perK = [...distByK.keys()].sort((x, y) => x - y)
		.map((k) => `k=${k}: ${rawByK.get(k) ?? 0}→${distByK.get(k) ?? 0}`).join("  ");
	log(`  ${b.label.padEnd(12)} ${String(cands.length).padStart(5)} raw → ${String(out.length).padStart(5)} distinct ` +
		`(${mirrorMerged === null ? "mirror-merged not computed" : `mirror-merged would be ${mirrorMerged}`}` +
		`${skipped ? `; ${skipped} area-cert SKIPPED` : ""})   ${perK}`);
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
	all.sort((a, b) => (order.get(a.polyformOrder!)! - order.get(b.polyformOrder!)!) || a.k - b.k
		|| a.family.localeCompare(b.family) || a.id.localeCompare(b.id));
	fs.mkdirSync(path.dirname(OUT), { recursive: true });
	fs.writeFileSync(OUT, stringifyAtlas(all) + "\n");
	const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
	log(`  TOTAL ${all.length} tilings → ${path.relative(ROOT, OUT)} (${kb} KB), ${((Date.now() - t0) / 1000).toFixed(1)}s`);
	fs.mkdirSync(path.dirname(LOG), { recursive: true });
	fs.writeFileSync(LOG, logLines.join("\n") + "\n");
}

main();
