/*
 * build-tetromino-atlas.ts — emit the "Polyominoes" tile-class shelf (subclass: Tetrominoes): k-uniform
 * tilings by the seven one-sided tetrominoes (I O T S Z J L), from the Čtrnáct engine, palette `tetromino`.
 * Each tetromino is a degenerate unit-edge polygon (corners 90°/180°/270°); the geometry lives in ℤ[ζ₁₂]
 * on the Gaussian-integer sublattice (edges E/N/W/S). See tools/ctrnact-oracle/alphabets/palettes/tetromino.json.
 *
 * Input: tools/ctrnact-oracle/run-k<K>-tetromino/ctrnact-cells-k<K>.json (cumulative). Each record:
 * {id,k,T1,T2,faces:[{tile,verts}]}, verts exact ℤ[ζ₁₂] [a,b,c,d] power-basis vectors, tile ∈ {I,O,T,S,Z,J,L}.
 *
 * ONE gate + one dedup, both decisive:
 *   1. EXACT AREA CERTIFICATE — Σ face area == |det Λ| in ℚ(ζ₂₄) (the global-overlap gate). Never ship
 *      an unverified tiling. (No T-junction gate here: unlike the scaled shelf, EVERY tetromino tiling is
 *      wanted — mono-piece and mixed alike — so nothing is filtered on size-mixing.)
 *   2. GEOMETRIC DEDUP (exact) — flat/reflex corners let the engine emit the SAME geometric tiling on many
 *      fundamental-domain sizes (supercells); the WL pruner keeps them all. We collapse them with an EXACT
 *      congruence canonical key on the integer ℤ[ζ₁₂] coordinates, anchoring on the rarest-piece face and
 *      minimising over the grid symmetries — but ROTATIONS ONLY (12, no reflections), because chirality is
 *      DISTINGUISHED for this family: S≠Z and J≠L, so a tiling and its mirror are DIFFERENT tilings (a
 *      deliberate departure from the A068599 mirror-merge convention — AL directive). The piece letter is
 *      folded into the per-face fingerprint so an S-tiling can never be identified with a Z-tiling. The
 *      mirror-merged count (full 24 syms) is logged too, for reference. Merges logged LOUDLY (raw→distinct).
 *
 * EXPLORATORY: NO external oracle exists for k-uniform tetromino tilings (k-uniform theory is regular-
 * polygon-only; Myers/Kaplan cover single-tile isohedral, not mixed protosets). Distinct counts are
 * observations to be cross-checked (a hand k=1 anchor is the intended independent check), not a target.
 *
 * Run:  pnpm tsx scripts/build-tetromino-atlas.ts [cells.json]   (defaults to the highest-k run dir present)
 */
import fs from "node:fs";
import path from "node:path";
import { Cyclotomic, CyclotomicRing, setActiveRing, type CyclotomicRing as Ring } from "@/classes/Cyclotomic";
import { detSurd, polygonAreaSurd } from "@/classes/algorithm/exact/Surd";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";

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
// rarest-piece face near origin) × the given grid symmetries, comparing sorted integer tuples — no float in
// the key, so congruent tilings (incl. supercell copies) get byte-identical keys. `fp` = the PIECE LETTER,
// so with rotations-only syms an S-tiling and a Z-tiling never collide (chirality distinguished).
const R_GATHER = 30, R_ANCHOR = 4.2, R_WINDOW = 12;
function canonKey(c: Cell, syms: Array<(u: V4) => V4>): string {
	let M = 1;
	for (const f of c.faces) M = lcm(M, f.verts.length);
	const T1 = smul(c.T1 as V4, M), T2 = smul(c.T2 as V4, M);
	const base = c.faces.map((f) => {
		let s: V4 = [0, 0, 0, 0];
		for (const p of f.verts) s = add(s, p as V4);
		return { fp: f.tile, P: smul(s, M / f.verts.length) }; // M·centroid (exact integer), labelled by piece
	});
	const minT = Math.min(Math.hypot(toX(T1), toY(T1)), Math.hypot(toX(T2), toY(T2))) / M;
	const K = Math.ceil((R_GATHER + 8) / Math.max(minT, 0.4)) + 2;
	const pts: Array<{ fp: string; P: V4 }> = [];
	for (let m = -K; m <= K; m++) for (let n = -K; n <= K; n++) {
		const off = add(smul(T1, m), smul(T2, n));
		for (const b of base) {
			const P = add(b.P, off);
			const x = toX(P) / M, y = toY(P) / M;
			if (x * x + y * y <= R_GATHER * R_GATHER) pts.push({ fp: b.fp, P });
		}
	}
	const cnt = new Map<string, number>();
	for (const p of pts) { const x = toX(p.P) / M, y = toY(p.P) / M; if (x * x + y * y <= R_ANCHOR * R_ANCHOR) cnt.set(p.fp, (cnt.get(p.fp) ?? 0) + 1); }
	let rare = "", rc = Infinity;
	for (const [k, v] of cnt) if (v < rc || (v === rc && k < rare)) { rc = v; rare = k; }
	const anchors = pts.filter((p) => { const x = toX(p.P) / M, y = toY(p.P) / M; return p.fp === rare && x * x + y * y <= R_ANCHOR * R_ANCHOR; });
	let best: string | null = null;
	for (const A of anchors) for (const g of syms) {
		const rel: Array<[number, number, number, number, string]> = [];
		for (const p of pts) {
			const Q = g(sub(p.P, A.P));
			const x = toX(Q) / M, y = toY(Q) / M;
			if (x * x + y * y <= R_WINDOW * R_WINDOW) rel.push([Q[0], Q[1], Q[2], Q[3], p.fp]);
		}
		rel.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3] || (a[4] < b[4] ? -1 : 1));
		const key = `M${M}|` + rel.map((r) => `${r[0]},${r[1]},${r[2]},${r[3]},${r[4]}`).join(";");
		if (best === null || key < best) best = key;
	}
	return best ?? "";
}

// Tetris identity hue per piece (degrees) — matches lib/tiles/prototiles.ts so the Tiles page and the
// Library/Play thumbnails agree. Chroma/brightness stay the renderer default; only the hue is the game's.
const TETRIS_HUE: Record<string, number> = { I: 190, O: 51, T: 282, S: 125, Z: 4, J: 230, L: 30 };

// Family label = the sorted, deduped set of pieces used, joined by "·" (e.g. "I", "O·S", "S·Z").
const PIECE_ORDER = "IOTSZJL";
function familyLabel(faces: Face[]): string {
	const used = [...new Set(faces.map((f) => f.tile))];
	used.sort((a, b) => PIECE_ORDER.indexOf(a) - PIECE_ORDER.indexOf(b));
	return used.join("·");
}

const ROOT = process.cwd();
const ORACLE = path.join(ROOT, "tools", "ctrnact-oracle");
function defaultInputs(): string[] {
	let best: { k: number; p: string } | null = null;
	for (const d of fs.readdirSync(ORACLE)) {
		const m = /^run-k(\d+)-tetromino$/.exec(d);
		if (!m) continue;
		const p = path.join(ORACLE, d, `ctrnact-cells-k${m[1]}.json`);
		if (!fs.existsSync(p)) continue;
		if (!best || +m[1] > best.k) best = { k: +m[1], p };
	}
	return best ? [best.p] : [];
}
const INPUTS = process.argv.length > 2 ? process.argv.slice(2) : defaultInputs();
const OUT = path.join(ROOT, "public", "reference-atlas-polyomino.json");
const LOG = path.join(ROOT, "experiments", "results", "tetromino-atlas-build.log");
const NOTE =
	"k-uniform tilings by the seven one-sided tetrominoes (I O T S Z J L). Each piece is a union of unit " +
	"squares, modeled as a degenerate unit-edge polygon (corners 90°/180°/270°); exact geometry in ℤ[ζ₁₂] on " +
	"the Gaussian-integer (square) lattice. A vertex counts toward k where ≥3 tiles meet (a '+' cross or a 'T'); " +
	"the only other junctions (180°+180° aligned, 270°+90° notch) are 2-tile noncounting points. Chirality is " +
	"DISTINGUISHED: S≠Z, J≠L, so a tiling and its mirror are counted separately (a deliberate departure from " +
	"the A068599 mirror-merge convention). Each shipped tiling is EXACTLY area-certified (Σ face area = |det Λ| " +
	"in ℚ(ζ₂₄)). The engine emits each geometric tiling on many fundamental-domain sizes (supercell duplicates); " +
	"these are collapsed by an exact ℤ[ζ₁₂] rotation-congruence key (smallest-cell representative kept). " +
	"EXPLORATORY: no external oracle exists for this family, so counts are observations, not an all-and-only claim.";

const logLines: string[] = [];
const log = (m = ""): void => { logLines.push(m); console.log(m); };

function main(): void {
	const t0 = Date.now();
	log(`=== build-tetromino-atlas (7 one-sided tetrominoes, chirality-distinguished) ===`);
	const present = INPUTS.filter((p) => fs.existsSync(p));
	if (!present.length) { log(`  ⚑ no cells JSON found — run PALETTE=tetromino ./run-oracle.sh <k>`); process.exit(1); }
	const cells: Cell[] = [];
	for (const p of present) {
		const part: Cell[] = JSON.parse(fs.readFileSync(p, "utf8"));
		for (const c of part) c.id = `tet-${c.id}`;
		cells.push(...part);
		log(`  loaded ${part.length} developed tilings from ${path.relative(ROOT, p)}`);
	}

	// pass 1: exact area cert → candidates, each with its exact congruence keys (rotation + full-mirror)
	type Cand = { tiling: ReferenceTiling; key: string; mkey: string; area: number; k: number };
	const cands: Cand[] = [];
	let skipped = 0;
	for (const c of cells) {
		const u = dec(RING, c.T1), v = dec(RING, c.T2);
		const cellArea = detSurd(u, v).abs();
		let sum = polygonAreaSurd(c.faces[0].verts.map((p) => dec(RING, p)));
		for (let i = 1; i < c.faces.length; i++) sum = sum.add(polygonAreaSurd(c.faces[i].verts.map((p) => dec(RING, p))));
		if (!sum.sub(cellArea).isZero()) {
			log(`  ⚑ ${c.id}: EXACT area cert FAIL (Σface ≠ |detΛ|) — SKIPPED (never ship an unverified tiling)`);
			skipped++;
			continue;
		}
		const uv = u.toVector(), vv = v.toVector();
		const cellPolygons = c.faces.map((f) => ({
			n: f.verts.length,
			vertices: f.verts.map((p) => { const w = dec(RING, p).toVector(); return [w.x, w.y]; }),
			hue: TETRIS_HUE[f.tile], // per-piece identity colour (side count can't tell tetrominoes apart)
		}));
		cands.push({
			key: canonKey(c, SYMS_ROT),
			mkey: canonKey(c, SYMS_ALL),
			area: Math.abs(uv.x * vv.y - uv.y * vv.x),
			k: c.k,
			tiling: {
				id: c.id,
				source: "polyomino",
				k: c.k,
				family: familyLabel(c.faces),
				polyominoOrder: "tetromino",
				renderCell: { cellPolygons, basis: [[uv.x, uv.y], [vv.x, vv.y]] } as ReferenceTiling["renderCell"],
				discoverer: "Alessandro Longo",
				certification: "candidate",
				note: NOTE,
			},
		});
	}

	// pass 2: geometric dedup — one representative (smallest cell) per exact ROTATION-congruence key
	const byKey = new Map<string, Cand>();
	const kSeen = new Map<string, Set<number>>();
	for (const c of cands) {
		(kSeen.get(c.key) ?? kSeen.set(c.key, new Set()).get(c.key)!).add(c.k);
		const prev = byKey.get(c.key);
		if (!prev || c.area < prev.area) byKey.set(c.key, c);
	}
	for (const [key, ks] of kSeen) if (ks.size > 1) log(`  ⚑ k-conflict: one geometry carries k=${[...ks].sort().join("/")} across supercell duals (${byKey.get(key)!.tiling.family}) — kept min-cell rep`);
	const mirrorMerged = new Set(cands.map((c) => c.mkey)).size; // reference: how many if mirrors were merged

	const out = [...byKey.values()].map((c) => c.tiling);
	out.sort((a, b) => a.k - b.k || a.family.localeCompare(b.family) || a.id.localeCompare(b.id));
	fs.mkdirSync(path.dirname(OUT), { recursive: true });
	fs.writeFileSync(OUT, JSON.stringify(out, null, 0) + "\n");
	const kb = (fs.statSync(OUT).size / 1024).toFixed(1);

	const rawByK = new Map<number, number>(), distByK = new Map<number, number>();
	for (const c of cands) rawByK.set(c.k, (rawByK.get(c.k) ?? 0) + 1);
	for (const c of out) distByK.set(c.k, (distByK.get(c.k) ?? 0) + 1);
	const ks = [...new Set([...rawByK.keys(), ...distByK.keys()])].sort((a, b) => a - b);
	log(`  ${cands.length} area-certified raw duals → ${out.length} DISTINCT tilings (merged ${cands.length - out.length} supercell/dual duplicates); ${skipped} area-cert skipped`);
	log(`  chirality-distinguished (rotations only, shipped): ${out.length}   |   mirror-merged (full 24 syms, reference): ${mirrorMerged}`);
	for (const k of ks) log(`    k=${k}: raw ${rawByK.get(k) ?? 0} → distinct ${distByK.get(k) ?? 0}`);
	log(`  wrote → ${path.relative(ROOT, OUT)} (${kb} KB), ${((Date.now() - t0) / 1000).toFixed(2)}s`);
	fs.mkdirSync(path.dirname(LOG), { recursive: true });
	fs.writeFileSync(LOG, logLines.join("\n") + "\n");
	if (skipped > 0) process.exit(1);
}

main();
