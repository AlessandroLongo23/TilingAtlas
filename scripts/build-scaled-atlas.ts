/*
 * build-scaled-atlas.ts — emit the "Scaled" tile-class shelf: k-uniform tilings that mix regular
 * {3,4,6,12} tiles at side lengths 1, 2 AND 3. The superclass of the "Doubled" (sides 1-2) shelf.
 * A side-s N-gon is modeled (Čtrnáct engine, palette regular-scaled-123) as a degenerate sN-gon with
 * unit edges whose boundary word is (real corner θ_N, then s-1 flat 180° corners); flat corners are
 * noncounting, so mid-edge junctions are not k-vertices.
 *
 * Input: tools/ctrnact-oracle/run-k<K>-regular-scaled-123/ctrnact-cells-k<K>.json (cumulative: holds all
 * k'<=K). Each record: {id,k,T1,T2,faces:[{tile,verts}]}, verts exact ℤ[ζ₁₂] [a,b,c,d] power-basis vectors.
 *
 * TWO gates + a dedup, all decisive:
 *   1. T-JUNCTION filter — keep a tiling IFF a tile corner meets another tile's edge interior. That is
 *      exactly the condition a single-scale (×s) regular tiling can't meet, so it drops the mono-scale
 *      regular tilings at every scale (each ≡ the A068599-blind regular catalogue) and keeps only genuine
 *      size-mixers. Scale-agnostic.
 *   2. EXACT AREA CERTIFICATE — Σ face area == |det Λ| in ℚ(ζ₂₄) (the global-overlap gate). Never ship
 *      an unverified tiling.
 *   3. GEOMETRIC DEDUP (exact) — at scale ≥3, two flat corners per side let the engine emit the SAME
 *      geometric tiling on many fundamental-domain sizes (supercells); the WL pruner keeps them all as
 *      distinct duals. We collapse them with an EXACT congruence canonical key computed on the integer
 *      ℤ[ζ₁₂] coordinates (24 grid symmetries = exact integer maps ×ζ / conjugate, translation by
 *      anchoring on the rarest-fingerprint face) and keep the smallest-cell (primitive) representative.
 *      The merge is logged LOUDLY (raw→distinct). Scale ≤2 has no supercell freedom (verified: pure-scale-1
 *      and pure-scale-2 each canonicalize to exactly 10 = the regular k=1 count), so this is a no-op there.
 *
 * Exploratory: NO external oracle. Distinct counts are observations over this palette; completeness not claimed.
 *
 * Run:  pnpm tsx scripts/build-scaled-atlas.ts [cells.json]   (defaults to the highest-k run dir present)
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
type XY = { x: number; y: number };

// --- exact ℤ[ζ₁₂] integer arithmetic (power basis, ζ = ζ₁₂ = e^{iπ/6}, Φ₁₂ = x⁴−x²+1) ---
const add = (u: V4, v: V4): V4 => [u[0] + v[0], u[1] + v[1], u[2] + v[2], u[3] + v[3]];
const sub = (u: V4, v: V4): V4 => [u[0] - v[0], u[1] - v[1], u[2] - v[2], u[3] - v[3]];
const smul = (u: V4, s: number): V4 => [u[0] * s, u[1] * s, u[2] * s, u[3] * s];
const mulZeta = (u: V4): V4 => [-u[3], u[0], u[1] + u[3], u[2]]; // ×ζ  (rotate +30°)
const conj = (u: V4): V4 => [u[0] + u[2], u[1], -u[2], -u[1] - u[3]]; // complex conjugate (reflection)
// the 24 grid symmetries (D₁₂) as exact integer maps: {id, conj} × 12 rotations
const SYMS: Array<(u: V4) => V4> = [];
for (let refl = 0; refl < 2; refl++) for (let r = 0; r < 12; r++) {
	SYMS.push((u: V4) => { let x = refl ? conj(u) : u; for (let i = 0; i < r; i++) x = mulZeta(x); return x; });
}
const CO = [1, Math.cos(Math.PI / 6), Math.cos(Math.PI / 3), 0];
const SI = [0, Math.sin(Math.PI / 6), Math.sin(Math.PI / 3), 1];
const toX = (u: V4): number => u[0] * CO[0] + u[1] * CO[1] + u[2] * CO[2] + u[3] * CO[3];
const toY = (u: V4): number => u[0] * SI[0] + u[1] * SI[1] + u[2] * SI[2] + u[3] * SI[3];
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;

// [a,b,c,d] = a + b·ζ₁₂ + c·ζ₁₂² + d·ζ₁₂³, ζ₁₂ = ζ₂₄². (Same decode recipe as oracleReconstructExact.)
function dec(ring: Ring, [a, b, c, d]: number[]): Cyclotomic {
	return Cyclotomic.fromRational(ring, BigInt(a))
		.add(Cyclotomic.zeta(ring, 2).scaleRational(BigInt(b), 1n))
		.add(Cyclotomic.zeta(ring, 4).scaleRational(BigInt(c), 1n))
		.add(Cyclotomic.zeta(ring, 6).scaleRational(BigInt(d), 1n));
}

// interior angle (deg) at vertex b of the polygon corner a-b-d
function interiorDeg(a: XY, b: XY, d: XY): number {
	const ux = a.x - b.x, uy = a.y - b.y, wx = d.x - b.x, wy = d.y - b.y;
	const dot = (ux * wx + uy * wy) / (Math.hypot(ux, uy) * Math.hypot(wx, wy));
	return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

// per-face fingerprint from geometry: (real-corner count N, scale s = corners/N, sorted real angles).
// Rotation/reflection invariant; used for the family label and the canonical-key anchor.
function faceInfo(f: Face): { fp: string; n: number; s: number } {
	const V = f.verts.map((p) => ({ x: toX(p as V4), y: toY(p as V4) }));
	const m = V.length;
	let real = 0; const angs: number[] = [];
	for (let t = 0; t < m; t++) {
		const a = V[(t - 1 + m) % m], b = V[t], d = V[(t + 1) % m];
		const ang = interiorDeg(a, b, d);
		if (Math.abs(ang - 180) >= 1) { real++; angs.push(Math.round(ang)); }
	}
	angs.sort((x, y) => x - y);
	return { fp: `${real}:${Math.round(m / real)}:${angs.join("-")}`, n: real, s: Math.round(m / real) };
}

// True iff the tiling has a T-junction — a tile corner on another tile's edge interior — i.e. some point
// carries both a flat (180°) and a real (<180°) corner over a 3×3 lattice patch. No T-junction ⟺ every
// tile has the same scale AND that mono-scale tiling is edge-to-edge (a regular tiling drawn at ×s).
function hasTJunction(c: Cell): boolean {
	const T1 = c.T1 as V4, T2 = c.T2 as V4;
	const faces = c.faces.map((f) => f.verts.map((p) => ({ x: toX(p as V4), y: toY(p as V4) })));
	const pt = new Map<string, { flat: boolean; real: boolean }>();
	for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
		const ox = i * toX(T1) + j * toX(T2), oy = i * toY(T1) + j * toY(T2);
		for (const V of faces) {
			const n = V.length;
			for (let t = 0; t < n; t++) {
				const a = { x: V[(t - 1 + n) % n].x + ox, y: V[(t - 1 + n) % n].y + oy };
				const b = { x: V[t].x + ox, y: V[t].y + oy };
				const d = { x: V[(t + 1) % n].x + ox, y: V[(t + 1) % n].y + oy };
				const key = `${Math.round(b.x * 1e4)},${Math.round(b.y * 1e4)}`;
				const e = pt.get(key) ?? { flat: false, real: false };
				if (Math.abs(interiorDeg(a, b, d) - 180) < 1) e.flat = true; else e.real = true;
				pt.set(key, e);
			}
		}
	}
	for (const e of pt.values()) if (e.flat && e.real) return true;
	return false;
}

// EXACT congruence canonical key. Represents the tiling by face centroids scaled to integer ℤ[ζ₁₂]
// vectors (M·centroid, M = lcm of face vertex counts), replicated over a bounded patch. Canonicalizes
// over translation (anchor on each rarest-fingerprint face near origin) × the 24 exact grid symmetries,
// comparing sorted integer-tuple lists — no float rounding in the key, so congruent tilings (incl.
// supercell copies) produce byte-identical keys. Validated: pure-scale-1/2/3 → 10/10/9 at k=1.
const R_GATHER = 30, R_ANCHOR = 4.2, R_WINDOW = 12;
function canonKey(c: Cell): string {
	let M = 1;
	for (const f of c.faces) M = lcm(M, f.verts.length);
	const T1 = smul(c.T1 as V4, M), T2 = smul(c.T2 as V4, M);
	const base = c.faces.map((f) => {
		let s: V4 = [0, 0, 0, 0];
		for (const p of f.verts) s = add(s, p as V4);
		return { fp: faceInfo(f).fp, P: smul(s, M / f.verts.length) }; // M·centroid, exact integer
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
	for (const A of anchors) for (const g of SYMS) {
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

// Unicode subscript (2 -> "₂", 12 -> "₁₂").
const SUB = "₀₁₂₃₄₅₆₇₈₉";
const subDigits = (n: number): string => String(n).split("").map((d) => SUB[+d]).join("");

// readable composition label from GEOMETRY: token = underlying N with a subscript scale (side-1 = no
// subscript). Deduped, sorted by (N, scale).  e.g. "3.6₃" = side-1 triangle + side-3 hexagon.
function familyLabel(faces: Face[]): string {
	const keys: Array<{ n: number; s: number }> = [];
	const seen = new Set<string>();
	for (const f of faces) {
		const { n, s } = faceInfo(f);
		const k = `${n}|${s}`;
		if (!seen.has(k)) { seen.add(k); keys.push({ n, s }); }
	}
	keys.sort((x, y) => x.n - y.n || x.s - y.s);
	return keys.map(({ n, s }) => (s === 1 ? String(n) : `${n}${subDigits(s)}`)).join(".");
}

const ROOT = process.cwd();
const ORACLE = path.join(ROOT, "tools", "ctrnact-oracle");
// Default inputs: the highest-k run of EACH scaled-geometry palette, UNIONED. The `regular-doubled`
// palette (sides 1-2, no supercell freedom) is complete + certified to k=4, so it supplies the sides-1-2
// tilings at every k; the `regular-scaled-123` palette supplies the sides-1-3 (side-3-bearing) tilings.
// Both are geometry-only cells (faces + T1/T2); the exact congruence dedup merges the sides-1-2 tilings
// the scaled palette also produces, so the union never double-counts. Each run's cells file is cumulative.
function defaultInputs(): string[] {
	const best = new Map<string, { k: number; p: string }>();
	for (const d of fs.readdirSync(ORACLE)) {
		const m = /^run-k(\d+)-(regular-doubled|regular-scaled-123)$/.exec(d);
		if (!m) continue;
		const p = path.join(ORACLE, d, `ctrnact-cells-k${m[1]}.json`);
		if (!fs.existsSync(p)) continue;
		const prev = best.get(m[2]);
		if (!prev || +m[1] > prev.k) best.set(m[2], { k: +m[1], p });
	}
	return [...best.values()].map((x) => x.p);
}
const INPUTS = process.argv.length > 2 ? process.argv.slice(2) : defaultInputs();
const OUT = path.join(ROOT, "public", "reference-atlas-scaled.json");
const LOG = path.join(ROOT, "experiments", "results", "scaled-atlas-build.log");
const NOTE =
	"Regular {3,4,6,12} tiles at side lengths 1, 2 AND 3 together (side-s = degenerate sN-gon, unit edges, " +
	"one real corner then s-1 flat-180° corners per side; flat corners are noncounting). Exploratory: no " +
	"external oracle (A068599 is same-side-length only), so counts are observations, not an all-and-only " +
	"claim. Each shipped tiling is EXACTLY area-certified (Σ face area = |det Λ| in ℚ(ζ₂₄)). Kept only if it " +
	"has a T-junction (a tile corner on another tile's edge interior) — that drops the single-scale regular " +
	"tilings at every scale and keeps genuine size-mixers. At scale ≥3 the same geometric tiling recurs on " +
	"many fundamental-domain sizes; these supercell duplicates are collapsed by an exact ℤ[ζ₁₂] congruence " +
	"key (smallest-cell representative kept). The sides-1-2 subclass is drawn from the rigid regular-doubled " +
	"palette (complete + budget-certified to k=4); the side-3-bearing tilings from the regular-scaled-123 " +
	"palette. Filter by the 'Side lengths' sub-class facet: Sides 1–2 vs Sides 1–3.";

const logLines: string[] = [];
const log = (m = ""): void => { logLines.push(m); console.log(m); };

function main(): void {
	const t0 = Date.now();
	log(`=== build-scaled-atlas (side-1 + side-2 + side-3 regular {3,4,6,12}) ===`);
	const present = INPUTS.filter((p) => fs.existsSync(p));
	if (!present.length) { log(`  ⚑ no cells JSON found — run PALETTE=regular-scaled-123 ./run-oracle.sh <k> (and/or regular-doubled)`); process.exit(1); }
	const cells: Cell[] = [];
	for (const p of present) {
		const part: Cell[] = JSON.parse(fs.readFileSync(p, "utf8"));
		// tag by palette so ids stay unique across the merged sources (both number "ctrnact-…" from 1)
		const tag = /regular-doubled/.test(p) ? "d" : "s";
		for (const c of part) c.id = `${tag}-${c.id}`;
		cells.push(...part);
		log(`  loaded ${part.length} developed tilings from ${path.relative(ROOT, p)}`);
	}

	// pass 1: T-junction gate + exact area cert → candidate mixers, each with its exact congruence key
	type Cand = { tiling: ReferenceTiling; key: string; area: number; k: number };
	const cands: Cand[] = [];
	let dropped = 0, skipped = 0;
	for (const c of cells) {
		if (!hasTJunction(c)) { dropped++; continue; } // single-scale regular tiling — lives in the regular atlas
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
		}));
		cands.push({
			key: canonKey(c),
			area: Math.abs(uv.x * vv.y - uv.y * vv.x),
			k: c.k,
			tiling: {
				id: c.id,
				source: "scaled",
				k: c.k,
				family: familyLabel(c.faces),
				renderCell: { cellPolygons, basis: [[uv.x, uv.y], [vv.x, vv.y]] } as ReferenceTiling["renderCell"],
				discoverer: "Alessandro Longo",
				certification: "candidate",
				note: NOTE,
			},
		});
	}

	// pass 2: geometric dedup — one representative (smallest cell) per exact congruence key
	const byKey = new Map<string, Cand>();
	const kSeen = new Map<string, Set<number>>();
	for (const c of cands) {
		(kSeen.get(c.key) ?? kSeen.set(c.key, new Set()).get(c.key)!).add(c.k);
		const prev = byKey.get(c.key);
		if (!prev || c.area < prev.area) byKey.set(c.key, c);
	}
	for (const [key, ks] of kSeen) if (ks.size > 1) log(`  ⚑ k-conflict: one geometry carries k=${[...ks].sort().join("/")} across supercell duals (${byKey.get(key)!.tiling.family}) — kept min-cell rep`);

	const out = [...byKey.values()].map((c) => c.tiling);
	out.sort((a, b) => a.k - b.k || a.family.localeCompare(b.family) || a.id.localeCompare(b.id));
	fs.mkdirSync(path.dirname(OUT), { recursive: true });
	fs.writeFileSync(OUT, JSON.stringify(out, null, 0) + "\n");
	const kb = (fs.statSync(OUT).size / 1024).toFixed(1);

	const rawByK = new Map<number, number>(), distByK = new Map<number, number>();
	for (const c of cands) rawByK.set(c.k, (rawByK.get(c.k) ?? 0) + 1);
	for (const c of out) distByK.set(c.k, (distByK.get(c.k) ?? 0) + 1);
	const ks = [...new Set([...rawByK.keys(), ...distByK.keys()])].sort((a, b) => a - b);
	log(`  dropped ${dropped} single-scale regular tilings (no T-junction); ${skipped} area-cert skipped`);
	log(`  T-junction mixers: ${cands.length} raw duals → ${out.length} DISTINCT geometries (merged ${cands.length - out.length} supercell/dual duplicates)`);
	for (const k of ks) log(`    k=${k}: raw ${rawByK.get(k) ?? 0} → distinct ${distByK.get(k) ?? 0}`);
	log(`  wrote → ${path.relative(ROOT, OUT)} (${kb} KB), ${((Date.now() - t0) / 1000).toFixed(2)}s`);
	fs.mkdirSync(path.dirname(LOG), { recursive: true });
	fs.writeFileSync(LOG, logLines.join("\n") + "\n");
	if (skipped > 0) process.exit(1);
}

main();
