/*
 * Generate the differential-test trace: exercise the REAL TS exact-arithmetic (Cyclotomic + Surd +
 * bridges) on random and chained inputs, dump each op with its canonical TS result. The native port
 * (difftest.cpp) must reproduce every line byte-identically. This is the firewall: the native engine
 * is trusted only where it matches the TS oracle.
 *   pnpm tsx native-engine/gen-trace.ts [outfile]   (default native-engine/difftrace.txt)
 *
 * Fields are TAB-separated (Cyclotomic.key() contains '|', so '|' can't be the delimiter).
 */
import fs from "node:fs";
import path from "node:path";
import { Cyclotomic, CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { Surd, imSurd, reSurd, detSurd, tileAreaSurd, polygonAreaSurd } from "@/classes/algorithm/exact/Surd";
import { orient2D, segmentsProperlyCross, collinearSameSideOverlap, pointInPolygon, exactPolygonsOverlap } from "@/classes/algorithm/exact/exactOverlap";
import { ExactStarPolygon } from "@/classes/polygons/ExactStarPolygon";
import { RegularPolygon } from "@/classes/polygons/RegularPolygon";
import { Vector } from "@/classes/Vector";
import { sdf, isWithinConvexHull, segmentsIntersect } from "@/utils/geometry";
import { tolerance } from "@/utils/tolerance";
import { PeriodSolver, vertexClassCount, latticeEquivExact, defaultMaxCellPolys } from "@/classes/algorithm/PeriodSolver";
import { KUniformityChecker } from "@/classes/algorithm/KUniformityChecker";
import { VertexConfiguration } from "@/classes/algorithm/VertexConfiguration";
import { SeedConfiguration } from "@/classes/algorithm/SeedConfiguration";
import { PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder, PolygonType } from "@/classes";
import type { Polygon } from "@/classes";

const ring = CyclotomicRing.create(24);
setActiveRing(ring);

const encC = (c: Cyclotomic) => `${c.num.join(",")}:${c.den}`;
const encS = (s: Surd) => `${s.P},${s.Q},${s.R},${s.S},${s.D}`;

let _st = 0x9e3779b9 >>> 0;
function rnd(): number { _st |= 0; _st = (_st + 0x6d2b79f5) | 0; let t = Math.imul(_st ^ (_st >>> 15), 1 | _st); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const ri = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const DENS = [1n, 2n, 3n, 4n, 6n, 12n];
const pickDen = () => DENS[ri(0, DENS.length - 1)];
function randC(range = 200): Cyclotomic {
  const num = Array.from({ length: 8 }, () => BigInt(ri(-range, range)));
  return new Cyclotomic(ring, num, pickDen());
}
function randS(range = 500): Surd {
  return new Surd(BigInt(ri(-range, range)), BigInt(ri(-range, range)), BigInt(ri(-range, range)), BigInt(ri(-range, range)), pickDen());
}

const lines: string[] = [];
const row = (...f: (string | number)[]) => lines.push(f.map(String).join("\t"));

// ---- Cyclotomic single ops ----
for (let i = 0; i < 1500; i++) {
  const a = randC(), b = randC();
  row("cyclo.add", encC(a), encC(b), encC(a.add(b)));
  row("cyclo.sub", encC(a), encC(b), encC(a.sub(b)));
  row("cyclo.mul", encC(a), encC(b), encC(a.mul(b)));
  row("cyclo.neg", encC(a), encC(a.neg()));
  row("cyclo.conj", encC(a), encC(a.conj()));
  row("cyclo.normSquared", encC(a), encC(a.normSquared()));
  const k = ri(-30, 30);
  row("cyclo.mulZeta", encC(a), k, encC(a.mulZeta(k)));
  const p = BigInt(ri(-50, 50)), q = pickDen();
  row("cyclo.scaleRational", encC(a), `${p},${q}`, encC(a.scaleRational(p, q)));
  row("cyclo.key", encC(a), a.key());
  row("cyclo.equals", encC(a), encC(a), 1);
  row("cyclo.equals", encC(a), encC(b), a.equals(b) ? 1 : 0);
  row("cyclo.isZero", encC(a), a.isZero() ? 1 : 0);
}
// ---- Cyclotomic chains (build realistic magnitude + denominator growth) ----
for (let i = 0; i < 400; i++) {
  let a = randC(20);
  for (let step = 0; step < 12; step++) {
    const b = randC(20);
    const which = step % 3;
    a = which === 0 ? a.add(b) : which === 1 ? a.sub(b) : a.mul(b);
    row("cyclo.key", encC(a), a.key());
  }
}

// ---- Surd single ops ----
for (let i = 0; i < 1500; i++) {
  const a = randS(), b = randS();
  row("surd.add", encS(a), encS(b), encS(a.add(b)));
  row("surd.sub", encS(a), encS(b), encS(a.sub(b)));
  row("surd.mul", encS(a), encS(b), encS(a.mul(b)));
  row("surd.neg", encS(a), encS(a.neg()));
  const p = BigInt(ri(-50, 50)), q = pickDen();
  row("surd.scaleRational", encS(a), `${p},${q}`, encS(a.scaleRational(p, q)));
  row("surd.sign", encS(a), a.sign());
  row("surd.cmp", encS(a), encS(b), a.cmp(b));
  row("surd.isZero", encS(a), a.isZero() ? 1 : 0);
  row("surd.isRational", encS(a), a.isRational() ? 1 : 0);
  row("surd.abs", encS(a), encS(a.abs()));
  if (!a.isZero()) row("surd.inverse", encS(a), encS(a.inverse()));
}
// near-zero sign cases to exercise signExact
for (let i = 0; i < 400; i++) {
  const a = randS(300);
  row("surd.cmp", encS(a), encS(a), 0);
  const b = a.add(new Surd(1n, 0n, 0n, 0n, BigInt(ri(2, 1000))));
  row("surd.cmp", encS(a), encS(b), a.cmp(b));
}

// ---- bridges (N=24) ----
for (let i = 0; i < 1500; i++) {
  const a = randC(), b = randC();
  row("bridge.imSurd", encC(a), encS(imSurd(a)));
  row("bridge.reSurd", encC(a), encS(reSurd(a)));
  row("bridge.detSurd", encC(a), encC(b), encS(detSurd(a, b)));
}
for (const n of [3, 4, 6, 8, 12]) row("bridge.tileAreaSurd", n, encS(tileAreaSurd(n)));
for (let i = 0; i < 600; i++) {
  const L = ri(3, 8);
  const verts = Array.from({ length: L }, () => randC(30));
  row("bridge.polygonAreaSurd", verts.map(encC).join(";"), encS(polygonAreaSurd(verts)));
}

// ---- exact geometry (overlap.ts) ----
const zeta = (k: number) => Cyclotomic.zeta(ring, ((k % 24) + 24) % 24);
const encV = (vs: Cyclotomic[]) => vs.map(encC).join(";");
function randPoint(range = 6): Cyclotomic {
  return new Cyclotomic(ring, Array.from({ length: 8 }, () => BigInt(ri(-range, range))), 1n);
}
function regularVerts(n: number, anchor: Cyclotomic, dir: number): Cyclotomic[] {
  const step = 24 / n; // exterior turn, integer for n | 24
  const verts: Cyclotomic[] = [];
  let p = anchor, d = dir;
  for (let i = 0; i < n; i++) { verts.push(p); p = p.add(zeta(d)); d = (d + step) % 24; }
  return verts;
}
const REG = [3, 4, 6, 12];
const STAR: [number, number][] = [[4, 3], [6, 2], [3, 2], [12, 5]];
function randPoly(anchor: Cyclotomic, dir: number): Cyclotomic[] {
  if (rnd() < 0.5) return regularVerts(REG[ri(0, REG.length - 1)], anchor, dir);
  const [n, a] = STAR[ri(0, STAR.length - 1)];
  return ExactStarPolygon.isotoxal(n, a, anchor, dir).exactVertices!;
}
// sub-primitives on random cyclos
for (let i = 0; i < 2000; i++) {
  const a = randC(20), b = randC(20), c = randC(20);
  row("overlap.orient2D", encC(a), encC(b), encC(c), orient2D(a, b, c));
  const a1 = randC(20), a2 = randC(20), b1 = randC(20), b2 = randC(20);
  row("overlap.segCross", encV([a1, a2, b1, b2]), segmentsProperlyCross(a1, a2, b1, b2) ? 1 : 0);
  row("overlap.collinear", encV([a1, a2, b1, b2]), collinearSameSideOverlap(a1, a2, b1, b2) ? 1 : 0);
}
// pointInPolygon + full polygon overlap on real regular/star polygons across overlap scenarios
for (let i = 0; i < 2500; i++) {
  const anchorA = randPoint(6), dirA = ri(0, 23);
  const A = randPoly(anchorA, dirA);
  const p = rnd() < 0.5 ? randPoint(6) : A[ri(0, A.length - 1)].add(A[ri(0, A.length - 1)]).scaleRational(1n, 2n);
  row("overlap.pointInPoly", encV(A), encC(p), pointInPolygon(A, p));
  const mode = ri(0, 3);
  const anchorB = mode === 0 ? anchorA
    : mode === 1 ? anchorA.add(zeta(ri(0, 23)))   // one edge over (adjacency/overlap)
    : mode === 2 ? anchorA.add(randPoint(2))       // small offset
    : randPoint(20);                               // far (likely disjoint)
  const B = randPoly(anchorB, ri(0, 23));
  row("overlap.polygons", encV(A), encV(B), exactPolygonsOverlap(A, B) ? 1 : 0);
}

// ---- convex float geometry (Polygon.intersects fast path + sdf/isWithinConvexHull/segmentsIntersect) ----
// Doubles are serialized as their raw IEEE-754 bits (16 hex), so the native double is bit-identical to
// the V8 double it came from — no decimal round-trip. Driven by REAL RegularPolygon float caches.
const _fb = new ArrayBuffer(8); const _fdv = new DataView(_fb);
const f2h = (x: number) => { _fdv.setFloat64(0, x); return _fdv.getBigUint64(0).toString(16).padStart(16, "0"); };
const encVec = (v: Vector) => `${f2h(v.x)},${f2h(v.y)}`;
const encVecs = (vs: Vector[]) => vs.map(encVec).join(";");
const TOLH = f2h(tolerance);
const buildPoly = (n: number, anchor: Cyclotomic, dir: number) => RegularPolygon.fromAnchorAndDirExact(n, anchor, dir);

// sdf + isWithinConvexHull on real convex polygons: points inside / on-boundary / outside.
for (let i = 0; i < 2000; i++) {
  const n = REG[ri(0, REG.length - 1)];
  const P = buildPoly(n, randPoint(6), ri(0, 23));
  const pv = encVecs(P.vertices);  // capture pristine order (sdf sorts P.vertices in place)
  const cx = P.centroid.x, cy = P.centroid.y;
  const cand: Vector[] = [
    P.centroid.copy(),                                             // inside
    P.vertices[ri(0, P.vertices.length - 1)].copy(),              // on boundary (vertex)
    P.halfways[ri(0, P.halfways.length - 1)].copy(),              // on boundary (edge midpoint)
    new Vector(cx + (rnd() - 0.5) * 0.1, cy + (rnd() - 0.5) * 0.1), // near-centroid, inside
    Vector.midpoint(P.vertices[0], P.centroid),                    // interior chord point
    new Vector(cx + (rnd() - 0.5) * 6, cy + (rnd() - 0.5) * 6),   // possibly outside
  ];
  for (const pt of cand) {
    row("float.sdf", pv, encVec(pt), f2h(sdf(P.vertices, pt)));
    row("float.containsPoint", pv, encVec(pt), TOLH, isWithinConvexHull(P.vertices, pt, tolerance) ? 1 : 0);
  }
}
// segmentsIntersect: coords on a coarse half-integer grid so crossings, parallels, collinear overlaps
// and shared endpoints all occur; pure float arithmetic (no atan2), so any inputs are bit-safe.
const randSegV = () => new Vector(ri(-4, 4) * 0.5, ri(-4, 4) * 0.5);
for (let i = 0; i < 3000; i++) {
  const a = randSegV(), b = randSegV(), c = randSegV(), d = randSegV();
  row("float.segIntersect", encVecs([a, b, c, d]), TOLH, segmentsIntersect(a, b, c, d, tolerance) ? 1 : 0);
}
// full convex intersects: placements chosen to hit overlap / edge-adjacent / disjoint.
for (let i = 0; i < 1500; i++) {
  const anchorA = randPoint(6), dirA = ri(0, 23);
  const A = buildPoly(REG[ri(0, REG.length - 1)], anchorA, dirA);
  const mode = ri(0, 3);
  const anchorB = mode === 0 ? anchorA
    : mode === 1 ? anchorA.add(Cyclotomic.zeta(ring, ri(0, 23)))   // one edge over (adjacency)
    : mode === 2 ? anchorA.add(randPoint(2))                       // small offset (overlap)
    : randPoint(30);                                              // far (disjoint)
  const B = buildPoly(REG[ri(0, REG.length - 1)], anchorB, ri(0, 23));
  // capture pristine float caches BEFORE intersects (it sorts A/B vertices in place)
  row("float.intersects",
    encVecs(A.vertices), encVecs(A.halfways), encVec(A.centroid),
    encVecs(B.vertices), encVecs(B.halfways), encVec(B.centroid),
    TOLH, A.intersects(B) ? 1 : 0);
}

// ---- Math.hypot pin: the DFS's float culls all compare toVector positions against radii via
//      Math.hypot; the exact canonicalRep sits on top of those culls, so hypot must reproduce V8
//      bit-for-bit. Probe realistic magnitudes to decide the matching native formula (std::hypot vs
//      naive sqrt(x*x+y*y)). Expected = V8 Math.hypot bits.
for (let i = 0; i < 4000; i++) {
  const x = (rnd() - 0.5) * 120, y = (rnd() - 0.5) * 120;
  row("float.hypot", f2h(x), f2h(y), f2h(Math.hypot(x, y)));
}
// toVector: the exact→float bridge every cull uses. Random cyclos (dense coeffs) + real polygon
// vertices/centroids (den = n or 2n). Baked basis ⇒ must be bit-identical.
for (let i = 0; i < 2500; i++) {
  const a = randC(200);
  const v = a.toVector();
  row("cyclo.toVector", encC(a), `${f2h(v.x)},${f2h(v.y)}`);
}
for (let i = 0; i < 300; i++) {
  const P = rnd() < 0.5
    ? RegularPolygon.fromAnchorAndDirExact(REG[ri(0, REG.length - 1)], randPoint(6), ri(0, 23))
    : (() => { const [n, al] = ([[3, 2], [4, 3], [6, 2], [12, 5]] as [number, number][])[ri(0, 3)]; return ExactStarPolygon.isotoxal(n, al, randPoint(6), ri(0, 23)); })();
  for (const w of P.exactVertices!) { const v = w.toVector(); row("cyclo.toVector", encC(w), `${f2h(v.x)},${f2h(v.y)}`); }
  const c = P.exactCentroid!.toVector();
  row("cyclo.toVector", encC(P.exactCentroid!), `${f2h(c.x)},${f2h(c.y)}`);
}

// ---- placed-polygon exact object (RegularPolygon.fromAnchorAndDirExact / ExactStarPolygon.isotoxal +
//      Polygon.exactKey / cornerToken / cornerAngleUnits / translateExact) ----
// One blob per polygon pins the constructor's ordered vertices, edgeDirs, centroid (inside exactKey),
// and the three corner methods against the TS simultaneously.
const polyBlob = (P: Polygon): string => {
  const ov = P.exactVertices!.map((v) => v.key()).join(";");
  const ds = P.edgeDirs!.join(",");
  const tk = P.exactVertices!.map((_, i) => P.cornerToken(i)).join(";");
  const ag = P.exactVertices!.map((_, i) => P.cornerAngleUnits(i)).join(",");
  return `${P.exactKey()}#${ov}#${ds}#${tk}#${ag}`;
};
for (let iter = 0; iter < 400; iter++) {
  const n = REG[ri(0, REG.length - 1)];
  const anchor = randPoint(6), dir = ri(0, 23);
  const P = RegularPolygon.fromAnchorAndDirExact(n, anchor, dir);
  row("poly.reg", n, encC(anchor), dir, polyBlob(P));       // pristine blob captured before the mutate below
  const t = randPoint(8);
  row("poly.regTrans", n, encC(anchor), dir, encC(t), P.translateExact(t).exactKey());  // P.translateExact mutates P, but polyBlob(P) already emitted
}
// star variants across all valid (n, alpha): 0 < alpha < 12(n-2)/n.
const STARV: [number, number][] = [[3, 1], [3, 2], [4, 3], [4, 5], [6, 2], [6, 7], [12, 5], [12, 9]];
for (let iter = 0; iter < 400; iter++) {
  const [n, a] = STARV[ri(0, STARV.length - 1)];
  const anchor = randPoint(6), dir = ri(0, 23);
  const P = ExactStarPolygon.isotoxal(n, a, anchor, dir);
  row("poly.star", n, a, encC(anchor), dir, polyBlob(P));
  const t = randPoint(8);
  row("poly.starTrans", n, a, encC(anchor), dir, encC(t), ExactStarPolygon.isotoxal(n, a, anchor, dir).translateExact(t).exactKey());
}

// ---- lattice reduction & block geometry (PeriodSolver.reducePolygon / canonicalRep / dedupModLattice /
//      buildBlock). Drives the REAL (private) methods via `as any`, on a real makeCtx, and compares the
//      exact keys. Exact identity on a float broadphase — all float primitives are already bit-pinned. ----
const ps: any = new PeriodSolver(2);
const RS = 0x1f; // record separator for key-set fields (absent from keys; not TAB/newline)
const packCtx = (ctx: any) =>
  `${encC(ctx.u)}~${encC(ctx.v)}~${f2h(ctx.uV.x)},${f2h(ctx.uV.y)}~${f2h(ctx.vV.x)},${f2h(ctx.vV.y)}~${f2h(ctx.det)}~${f2h(ctx.cellDiam)}~${f2h(ctx.maxCircum)}~${f2h(ctx.cellArea)}`;
const polyEnc = (P: Polygon) =>
  `${P.n}~${P.isStar ? 1 : 0}~${(P as any).alphaU ?? 0}~${P.exactVertices!.map(encC).join(";")}~${P.edgeDirs!.join(",")}`;
const sortedKeys = (ps2: Polygon[]) => ps2.map((p) => p.exactKey()).sort().join(String.fromCharCode(RS));
// small integer-combo lattices in ℤ[ζ₂₄]; keep the ones makeCtx accepts (minLen≥0.9, non-degenerate).
const zc = (k: number) => Cyclotomic.zeta(ring, ((k % 24) + 24) % 24);
const LATTICES: [Cyclotomic, Cyclotomic][] = [];
for (let t = 0; t < 60 && LATTICES.length < 24; t++) {
  const u = zc(ri(0, 23)).scaleRational(BigInt(ri(1, 3)), 1n).add(zc(ri(0, 23)));
  const v = zc(ri(0, 23)).scaleRational(BigInt(ri(1, 3)), 1n).add(zc(ri(0, 23)));
  const ctx = ps.makeCtx(u, v, ring, new Set<string>(), [3, 4, 6, 12], 400, [], new Set<string>(), new Set<string>());
  if (ctx) LATTICES.push([u, v]);
}
const STARC: [number, number][] = [[3, 2], [4, 3], [6, 2], [12, 5]];
for (const [u, v] of LATTICES) {
  const ctx = ps.makeCtx(u, v, ring, new Set<string>(), [3, 4, 6, 12], 400, [], new Set<string>(), new Set<string>());
  const pc = packCtx(ctx);
  const Rabs = ctx.cellDiam + 8;
  // place polygons at random anchors (often outside the cell ⇒ reduction is non-trivial)
  const group: Polygon[] = [];
  for (let i = 0; i < 8; i++) {
    const anchor = randPoint(10), dir = ri(0, 23);
    const P: Polygon = rnd() < 0.6
      ? RegularPolygon.fromAnchorAndDirExact(REG[ri(0, REG.length - 1)], anchor, dir)
      : (() => { const [n, al] = STARC[ri(0, STARC.length - 1)]; return ExactStarPolygon.isotoxal(n, al, anchor, dir); })();
    group.push(P);
    row("ctx.reduce", pc, polyEnc(P), ps.reducePolygon(P, ctx).exactKey());
    row("ctx.canon", pc, polyEnc(P), ps.canonicalRep(P, ctx, new Map()).key);
  }
  row("ctx.dedup", pc, group.map(polyEnc).join("|"), sortedKeys(ps.dedupModLattice(group, ctx, new Map())));
  // build the block from the deduped reps and compare the (sorted) block key-set
  const reps: Polygon[] = ps.dedupModLattice(group, ctx, new Map());
  const block: Polygon[] = ps.buildBlock(reps, ctx, Rabs);
  row("ctx.block", pc, f2h(Rabs), reps.map(polyEnc).join("|"), sortedKeys(block));
  // collision predicates on the real reps + block
  const bl = block.map(polyEnc).join("|");
  row("col.blockhas", bl, ps.blockHasProperOverlap(block, ctx) ? 1 : 0);
  row("col.blockperiodic", pc, f2h(Rabs), reps.map(polyEnc).join("|"), bl, ps.blockOverlapPeriodic(reps, block, ctx, Rabs) ? 1 : 0);
  row("col.selfoverlap", pc, reps.map(polyEnc).join("|"), ps.coreSelfOverlapsNearest(reps, ctx) ? 1 : 0);
  for (const P of reps) row("col.properblock", pc, polyEnc(P), bl, ps.properOverlapWithBlock(P, block, ctx) ? 1 : 0);
  // a fresh placed tile (often overlapping the cell) vs the block
  const Pn = RegularPolygon.fromAnchorAndDirExact(REG[ri(0, REG.length - 1)], randPoint(4), ri(0, 23));
  row("col.properblock", pc, polyEnc(Pn), bl, ps.properOverlapWithBlock(Pn, block, ctx) ? 1 : 0);
}
// FALSE-path coverage: a single tile in a big (5×5) lattice never overlaps its translates, so every
// block predicate must return false. Guards against a native bug that always finds an overlap.
{
  const ZERO = new Cyclotomic(ring, Array.from({ length: 8 }, () => 0n), 1n);
  const bigU = zc(0).scaleRational(5n, 1n), bigV = zc(6).scaleRational(5n, 1n);
  const ctx = ps.makeCtx(bigU, bigV, ring, new Set<string>(), [3, 4, 6, 12], 400, [], new Set<string>(), new Set<string>());
  if (ctx) {
    const pc = packCtx(ctx);
    const Rabs = ctx.cellDiam + 8;
    const cells: Polygon[] = [
      ...REG.map((n) => RegularPolygon.fromAnchorAndDirExact(n, ZERO, 0) as Polygon),
      ExactStarPolygon.isotoxal(4, 3, ZERO, 0),
    ];
    for (const cell of cells) {
      const reps: Polygon[] = ps.dedupModLattice([cell], ctx, new Map());
      const block: Polygon[] = ps.buildBlock(reps, ctx, Rabs);
      const bl = block.map(polyEnc).join("|");
      row("col.blockhas", bl, ps.blockHasProperOverlap(block, ctx) ? 1 : 0);
      row("col.blockperiodic", pc, f2h(Rabs), reps.map(polyEnc).join("|"), bl, ps.blockOverlapPeriodic(reps, block, ctx, Rabs) ? 1 : 0);
      row("col.selfoverlap", pc, reps.map(polyEnc).join("|"), ps.coreSelfOverlapsNearest(reps, ctx) ? 1 : 0);
      for (const P of reps) row("col.properblock", pc, polyEnc(P), bl, ps.properOverlapWithBlock(P, block, ctx) ? 1 : 0);
    }
  }
}
// targeted intersects/equiv pairs across regular+star and overlap/adjacent/offset/far placements —
// exercises Polygon.intersects's star gate and the exact-key isEquivalent directly.
for (let i = 0; i < 1500; i++) {
  const mkPoly = (anchor: Cyclotomic, dir: number): Polygon => rnd() < 0.5
    ? RegularPolygon.fromAnchorAndDirExact(REG[ri(0, REG.length - 1)], anchor, dir)
    : (() => { const [n, al] = STARC[ri(0, STARC.length - 1)]; return ExactStarPolygon.isotoxal(n, al, anchor, dir); })();
  const anchorA = randPoint(6), dirA = ri(0, 23);
  const A = mkPoly(anchorA, dirA);
  const mode = ri(0, 3);
  const anchorB = mode === 0 ? anchorA
    : mode === 1 ? anchorA.add(zc(ri(0, 23)))     // one edge over (adjacency)
    : mode === 2 ? anchorA.add(randPoint(2))       // small offset (overlap)
    : randPoint(20);                              // far (disjoint)
  const B = mkPoly(anchorB, ri(0, 23));
  row("col.intersects", polyEnc(A), polyEnc(B), A.intersects(B) ? 1 : 0);
  row("col.equiv", polyEnc(A), polyEnc(B), A.isEquivalent(B) ? 1 : 0);
}

// ---- block analysis (PeriodSolver.analyze + coveredIntervals / gapStartRay / vcRingNames /
//      canonicalVCName). Compares the decision: contradiction / open (vertex key + gapStartRay d0 +
//      sorted covered-interval multiset) / closed. Drives the REAL private methods via `as any`. ----
const RSs = String.fromCharCode(0x1f);
// harvested occurring VC set = exactly what analyze needs to not reject on VC grounds. vcNameAt gives
// the canonical name (dihedral-invariant, so its atan2 sort matches vcRingNames' edge-dir sort).
const harvestAllowed = (reps: Polygon[], ctx: any): Set<string> => {
  const block: Polygon[] = ps.buildBlock(reps, ctx, 5);
  const judgeR = ctx.cellDiam + 0.5, incR = judgeR + ctx.maxCircum + 0.01;
  const inc = new Map<string, { v: Cyclotomic; polys: Polygon[] }>();
  for (const p of block) {
    const cf = p.exactCentroid!.toVector(); if (Math.hypot(cf.x, cf.y) > incR) continue;
    p.exactVertices!.forEach((w) => { const kk = w.key(); let e = inc.get(kk); if (!e) { e = { v: w, polys: [] }; inc.set(kk, e); } e.polys.push(p); });
  }
  const out = new Set<string>();
  for (const { v, polys } of inc.values()) {
    const vf = v.toVector(); if (Math.hypot(vf.x, vf.y) > judgeR) continue;
    if (new Set(polys.map((p) => p.exactKey())).size < 3) continue;
    out.add(ps.vcNameAt(v, polys));
  }
  return out;
};
const encodeAnalyzeTS = (r: any, N: number): string => {
  if (r.contradiction) return "C";
  if (r.openVertex) {
    const ivs = r.openVertex.intervals.slice()
      .sort((a: any, b: any) => a.start - b.start || a.units - b.units || a.n - b.n)
      .map((it: any) => `${it.start}:${it.units}:${it.n}`).join(",");
    return `O~${r.openVertex.vertex.key()}~${ps.gapStartRay(r.openVertex.intervals, N)}~${ivs}`;
  }
  return "closed";
};
const analyzeCase = (reps: Polygon[], ctx: any, allowed: Set<string>) => {
  ctx.allowed = allowed;
  const enc = [...allowed].join(RSs);
  row("analyze", packCtx(ctx), enc, reps.map(polyEnc).join("|"), encodeAnalyzeTS(ps.analyze(reps, ctx), ctx.N));
};
// random reps (from the lattice loop's placements): allowed=∅ (contradiction/open) and harvested.
for (const [u, v] of LATTICES) {
  const ctx = ps.makeCtx(u, v, ring, new Set<string>(), [3, 4, 6, 12], 400, [], new Set<string>(), new Set<string>());
  const group: Polygon[] = [];
  for (let i = 0; i < 6; i++) {
    const P: Polygon = rnd() < 0.6
      ? RegularPolygon.fromAnchorAndDirExact(REG[ri(0, REG.length - 1)], randPoint(10), ri(0, 23))
      : (() => { const [n, al] = STARC[ri(0, STARC.length - 1)]; return ExactStarPolygon.isotoxal(n, al, randPoint(10), ri(0, 23)); })();
    group.push(P);
  }
  const reps: Polygon[] = ps.dedupModLattice(group, ctx, new Map());
  analyzeCase(reps, ps.makeCtx(u, v, ring, new Set<string>(), [3, 4, 6, 12], 400, [], new Set<string>(), new Set<string>()), new Set<string>());
  analyzeCase(reps, ps.makeCtx(u, v, ring, new Set<string>(), [3, 4, 6, 12], 400, [], new Set<string>(), new Set<string>()), harvestAllowed(reps, ctx));
}
// hand-built valid regular cells: unit square (closed) and big-lattice square (open corners).
{
  const ZERO = new Cyclotomic(ring, Array.from({ length: 8 }, () => 0n), 1n);
  const sq = (mult: bigint) => {
    const u = zc(0).scaleRational(mult, 1n), v = zc(6).scaleRational(mult, 1n);
    const ctx = ps.makeCtx(u, v, ring, new Set(["4,4,4,4"]), [3, 4, 6, 12], 400, [], new Set<string>(), new Set<string>());
    if (!ctx) return;
    const reps: Polygon[] = ps.dedupModLattice([RegularPolygon.fromAnchorAndDirExact(4, ZERO, 0)], ctx, new Map());
    analyzeCase(reps, ctx, new Set(["4,4,4,4"]));
  };
  sq(1n);  // unit cell → the 4.4.4.4 tiling → closed
  sq(3n);  // 3×3 cell → the lone square's corners are open
  // disallowed-VC contradiction: the unit-square tiling but with the wrong allowed set.
  {
    const u = zc(0), v = zc(6);
    const ctx = ps.makeCtx(u, v, ring, new Set<string>(), [3, 4, 6, 12], 400, [], new Set<string>(), new Set<string>());
    if (ctx) {
      const reps: Polygon[] = ps.dedupModLattice([RegularPolygon.fromAnchorAndDirExact(4, ZERO, 0)], ctx, new Map());
      analyzeCase(reps, ctx, new Set<string>());                 // 4.4.4.4 vertex ∉ ∅ ⇒ contradiction
      analyzeCase(reps, ps.makeCtx(u, v, ring, new Set<string>(), [3, 4, 6, 12], 400, [], new Set<string>(), new Set<string>()), new Set(["3,3,3,3,3,3"])); // wrong VC ⇒ contradiction
    }
  }
  // over-full contradiction: five squares all cornered at the origin in a big lattice ⇒ Σ angle > 2π.
  {
    const u = zc(0).scaleRational(6n, 1n), v = zc(6).scaleRational(6n, 1n);
    const ctx = ps.makeCtx(u, v, ring, new Set<string>(), [3, 4, 6, 12], 400, [], new Set<string>(), new Set<string>());
    if (ctx) {
      const group = [0, 1, 2, 3, 4].map((d) => RegularPolygon.fromAnchorAndDirExact(4, ZERO, d) as Polygon);
      const reps: Polygon[] = ps.dedupModLattice(group, ctx, new Map());
      analyzeCase(reps, ctx, new Set<string>());                 // vertex 0 covered by 30 units > 24 ⇒ contradiction
    }
  }
}

// ---- soundness core: certificate (isCompleteTiling) / primitivity (isPrimitive) / orbit gate
//      (countVertexOrbits) + helpers (vertexClassCount, extendV, stateKey). Drives the REAL methods. ----
const checker = new KUniformityChecker();
const ZERO0 = new Cyclotomic(ring, Array.from({ length: 8 }, () => 0n), 1n);
const ONE0 = zc(0);
const fakeDiag = () => ({ supercellRejected: 0, primitivityGuardMisses: 0, primitivityGuardAreaSuppressed: 0, starLadderTruncated: false } as any);
// hand-built VALID regular cells: 4.4.4.4 (unit), 3^6 (rhombic 2-triangle), and a 2×2 square supercell.
const validCells: { cell: Polygon[]; u: Cyclotomic; v: Cyclotomic; allowed: Set<string> }[] = [
  { cell: [RegularPolygon.fromAnchorAndDirExact(4, ZERO0, 0)], u: zc(0), v: zc(6), allowed: new Set(["4,4,4,4"]) },
  { cell: [RegularPolygon.fromAnchorAndDirExact(3, ZERO0, 0), RegularPolygon.fromAnchorAndDirExact(3, ONE0, 4)], u: zc(0), v: zc(4), allowed: new Set(["3,3,3,3,3,3"]) },
  { cell: [0, 1].flatMap((a) => [0, 1].map((b) => RegularPolygon.fromAnchorAndDirExact(4, zc(0).scaleRational(BigInt(a), 1n).add(zc(6).scaleRational(BigInt(b), 1n)), 0))), u: zc(0).scaleRational(2n, 1n), v: zc(6).scaleRational(2n, 1n), allowed: new Set(["4,4,4,4"]) },
];
for (const { cell, u, v, allowed } of validCells) {
  const ctx = ps.makeCtx(u, v, ring, allowed, [3, 4, 6, 12], 400, [], new Set<string>(), new Set<string>());
  if (!ctx) continue;
  const reps: Polygon[] = ps.dedupModLattice(cell, ctx, new Map());
  const rl = reps.map(polyEnc).join("|");
  row("cert.complete", packCtx(ctx), [...allowed].join(RSs), encS(ctx.cellAreaSurd), rl, ps.isCompleteTiling(reps, ctx) ? 1 : 0);
  row("cert.primitive", packCtx(ctx), rl, ps.isPrimitive(reps, ctx, new Map(), fakeDiag()) ? 1 : 0);
  row("gate.orbits", encC(u), encC(v), rl, checker.countVertexOrbits(reps, u, v) ?? -1);
  row("cert.vcount", encC(u), encC(v), rl, vertexClassCount(reps, u, v));
  row("cert.stateKey", rl, ps.stateKey(reps));
}
// INVALID cells (self-overlapping random reps): certificate must reject; gate returns a count or null.
for (const [u, v] of LATTICES) {
  const ctx = ps.makeCtx(u, v, ring, new Set<string>(), [3, 4, 6, 12], 400, [], new Set<string>(), new Set<string>());
  const group: Polygon[] = [];
  for (let i = 0; i < 5; i++) group.push(RegularPolygon.fromAnchorAndDirExact(REG[ri(0, REG.length - 1)], randPoint(8), ri(0, 23)));
  const reps: Polygon[] = ps.dedupModLattice(group, ctx, new Map());
  const rl = reps.map(polyEnc).join("|");
  row("cert.complete", packCtx(ctx), "", encS(ctx.cellAreaSurd), rl, ps.isCompleteTiling(reps, ctx) ? 1 : 0);
  row("cert.primitive", packCtx(ctx), rl, ps.isPrimitive(reps, ctx, new Map(), fakeDiag()) ? 1 : 0);
  row("gate.orbits", encC(u), encC(v), rl, checker.countVertexOrbits(reps, u, v) ?? -1);
  row("cert.vcount", encC(u), encC(v), rl, vertexClassCount(reps, u, v));
  row("cert.stateKey", rl, ps.stateKey(reps));
}
// extendV: parent classes extended by one placed poly (regular AND star, to exercise the dent skip).
// Faithful to torusFill's private extendV — decisions via the REAL exported latticeEquivExact.
const extendVTS = (parent: Cyclotomic[], poly: Polygon, u: Cyclotomic, v: Cyclotomic): Cyclotomic[] => {
  const out = parent.slice();
  const verts = poly.exactVertices!;
  for (let i = 0; i < verts.length; i++) {
    if (poly.isStar && i % 2 === 1) continue;
    const w = verts[i];
    if (!out.some((r) => latticeEquivExact(w, r, u, v))) out.push(w);
  }
  return out;
};
for (const [u, v] of LATTICES) {
  // direct latticeEquivExact: a and a+lattice-vector (true), a and a+random (usually false)
  for (let i = 0; i < 4; i++) {
    const a = randPoint(6);
    const bTrue = a.add(u.scaleRational(BigInt(ri(-2, 2)), 1n)).add(v.scaleRational(BigInt(ri(-2, 2)), 1n));
    const bRand = a.add(randPoint(3));
    row("cert.latEquiv", encC(u), encC(v), encC(a), encC(bTrue), latticeEquivExact(a, bTrue, u, v) ? 1 : 0);
    row("cert.latEquiv", encC(u), encC(v), encC(a), encC(bRand), latticeEquivExact(a, bRand, u, v) ? 1 : 0);
  }
  let parent: Cyclotomic[] = [];
  for (let i = 0; i < 4; i++) {
    const P: Polygon = rnd() < 0.5
      ? RegularPolygon.fromAnchorAndDirExact(REG[ri(0, REG.length - 1)], randPoint(6), ri(0, 23))
      : (() => { const [n, al] = STARC[ri(0, STARC.length - 1)]; return ExactStarPolygon.isotoxal(n, al, randPoint(6), ri(0, 23)); })();
    row("cert.extendV", encC(u), encC(v), parent.map(encC).join(";"), polyEnc(P), extendVTS(parent, P, u, v).map((c) => c.key()).join(";"));
    parent = extendVTS(parent, P, u, v);
  }
}

// ---- coverage-gap closers (from the adversarial-verification workflow, 2026-07-09): exercise the
//      guard/edge branches that real valid tilings never trigger. All were confirmed as un-exercised. ----
// [15a] jsHypot Inf/NaN/±0/subnormal branches (I wrote them; the finite ~[-60,60] sampler never drove them).
{
  const specials = [Infinity, -Infinity, NaN, 0, -0, Number.MIN_VALUE, -Number.MIN_VALUE, 3.5, 1e300, 5e-324];
  for (const x of specials) for (const y of specials) row("float.hypot", f2h(x), f2h(y), f2h(Math.hypot(x, y)));
}
// [15b] toVector with coefficients above 2^53 — pins (double)i128 == Number(bigint) rounding past exactness.
for (const big of [2n ** 53n + 7n, 2n ** 55n + 12345n, 2n ** 60n + 98765n, -(2n ** 58n) - 3n, 2n ** 70n + 1n]) {
  const c = new Cyclotomic(ring, [big, big / 3n, -big / 7n, big / 11n, 0n, 0n, 0n, 0n], 1n);
  const v = c.toVector();
  row("cyclo.toVector", encC(c), `${f2h(v.x)},${f2h(v.y)}`);
}
// [12] latticeEquivExact degenerate (parallel u,v ⇒ det≈0 guard) — makeCtx never yields such a basis.
for (const [pu, pv] of [[zc(0), zc(0).scaleRational(2n, 1n)], [zc(0), zc(12)], [zc(4), zc(4).scaleRational(-3n, 1n)]] as [Cyclotomic, Cyclotomic][]) {
  const a = randPoint(6), b = randPoint(6);
  row("cert.latEquiv", encC(pu), encC(pv), encC(a), encC(b), latticeEquivExact(a, b, pu, pv) ? 1 : 0);
  row("cert.latEquiv", encC(pu), encC(pv), encC(a), encC(a), latticeEquivExact(a, a, pu, pv) ? 1 : 0);  // a==b ⇒ true before the det guard
}
// [8] dedupModLattice COLLAPSE — a poly and its lattice translate must reduce to one class (0/24 random
//     groups ever collapsed). [11] blockOverlapPeriodic FALLBACK — small Rabs forces the guard TRUE.
for (const [u, v] of LATTICES.slice(0, 12)) {
  const ctx = ps.makeCtx(u, v, ring, new Set<string>(), [3, 4, 6, 12], 400, [], new Set<string>(), new Set<string>());
  const P = RegularPolygon.fromAnchorAndDirExact(REG[ri(0, REG.length - 1)], randPoint(4), ri(0, 23));
  const Pu = P.clone().translateExact(u), Pv = P.clone().translateExact(v);
  const group = [P, Pu, Pv, RegularPolygon.fromAnchorAndDirExact(REG[ri(0, REG.length - 1)], randPoint(4), ri(0, 23))];
  row("ctx.dedup", packCtx(ctx), group.map(polyEnc).join("|"), sortedKeys(ps.dedupModLattice(group, ctx, new Map())));
  const reps: Polygon[] = ps.dedupModLattice(group, ctx, new Map());
  const block: Polygon[] = ps.buildBlock(reps, ctx, ctx.cellDiam + 8);
  const bl = block.map(polyEnc).join("|");
  // Rabs=1 ⇒ 1.5·cellDiam+0.1+2·maxCircum > 1+cellDiam+2 ⇒ witness-containment guard TRUE ⇒ O(block²) fallback
  row("col.blockperiodic", packCtx(ctx), f2h(1), reps.map(polyEnc).join("|"), bl, ps.blockOverlapPeriodic(reps, block, ctx, 1) ? 1 : 0);
}

// ---- END-TO-END: run REAL seeds through solve to get genuine cells, then feed each cell (and a
//      single-vertex fan of it) through BOTH the TS torusFill and the native one, comparing the emitted
//      cell SET. This exercises the DFS capstone on real geometry — closing the multi-orbit, hexagon,
//      mixed-VC, star, and certificate-accept coverage gaps the 39-agent audit flagged. ----
const packCtxFull = (ctx: any, k: number) =>
  `${encC(ctx.u)}~${encC(ctx.v)}~${f2h(ctx.uV.x)},${f2h(ctx.uV.y)}~${f2h(ctx.vV.x)},${f2h(ctx.vV.y)}~${f2h(ctx.det)}~${f2h(ctx.cellDiam)}~${f2h(ctx.maxCircum)}~${f2h(ctx.cellArea)}~${encS(ctx.cellAreaSurd)}~${ctx.orbitFloor}~${ctx.maxCellPolys}~${k}~${ctx.polySizes.join(",")}`;
const encodeCellsTS = (cells: Polygon[][]): string =>
  cells.map((cell) => cell.map((p) => p.exactKey()).sort().join(String.fromCharCode(0x1e))).sort().join(String.fromCharCode(0x1f));
const mkDiag = (): any => ({ candidateLattices: 0, latticesTried: 0, rawCells: 0, emitted: 0, gateRejected: 0, earlyGateRejected: 0, fanLattices: 0, p0Skipped: 0, orbitSkipped: 0, p1Pruned: 0, p2Skipped: 0, vBelowKSkipped: 0, seedStateDedup: 0, obliqueCandidates: 0, obliqueTruncated: null, supercellRejected: 0, primitivityGuardMisses: 0, primitivityGuardAreaSuppressed: 0, starLadderTruncated: false, blockIndexCapTruncated: 0, timedOut: false });
// build a torusFill-ready ctx for a solved cell (allowed harvested from the cell; regular seeds ⇒ no stars)
const ctxForCell = (cell: any, k: number) => {
  const [u, v] = cell.basisExact;
  const cps: Polygon[] = cell.cellPolygons;
  const polySizes = [...new Set(cps.filter((p) => !p.isStar).map((p) => p.n))].sort((a, b) => a - b);
  const ctx0 = ps.makeCtx(u, v, ring, new Set<string>(), polySizes, defaultMaxCellPolys(k), [], new Set<string>(), new Set<string>());
  const allowed = harvestAllowed(cps, ctx0);
  const ctx = ps.makeCtx(u, v, ring, allowed, polySizes, defaultMaxCellPolys(k), [], new Set<string>(), new Set<string>());
  ctx.gate = (r: Polygon[]) => checker.countVertexOrbits(r, u, v);
  return { ctx, allowed, cps, u, v };
};
const e2eSeeds: [string, number][] = [
  ["4,4,4,4", 1], ["3,3,3,3,3,3", 1], ["6,6,6", 1], ["3,6,3,6", 1], ["3,4,6,4", 1], ["3,3,3,3,6", 1], ["3,3,4,3,4", 1], ["4,6,12", 1],
];
for (const [name, k] of e2eSeeds) {
  let cells: any[] = [];
  const psK: any = new PeriodSolver(k);   // torusFill reads this.k for the early gate — must match the seed's k
  try { cells = psK.solve(new SeedConfiguration([VertexConfiguration.fromName(name)]), {}).cells; }
  catch { continue; }
  for (const cell of cells) {
    const { ctx, allowed, cps } = ctxForCell(cell, k);
    const allowedEnc = [...allowed].join(RSs);
    // (a) full closed cell as core: exercises analyze-closed + early gate + certificate + primitivity
    const tsFull = psK.torusFill(cps, ctx, () => false, mkDiag());
    row("torusfill", packCtxFull(ctx, k), allowedEnc, "", cps.map(polyEnc).join("|"), encodeCellsTS(tsFull));
    // (b) a single-vertex fan of the cell as core: exercises the place() expansion / DFS branching
    const vk = cps[0].exactVertices![0];
    const fan = cps.filter((p) => p.vertexKeySet().has(vk.key()));
    if (fan.length >= 1 && fan.length < cps.length) {
      const tsFan = psK.torusFill(fan, ctx, () => false, mkDiag());
      row("torusfill", packCtxFull(ctx, k), allowedEnc, "", fan.map(polyEnc).join("|"), encodeCellsTS(tsFan));
    }
  }
}

// k=2: one real 2-uniform seed so the orbit gate's multi-orbit union-find actually RETURNS ≥2 (the
// k=1 cells above only exercise the merge-to-1 path). 3.3.3.3.3.3 + 3.3.3.3.6 → cells with 2 orbits.
try {
  const params = { [PolygonType.REGULAR]: { ns: [3, 4, 6, 8, 12] } } as any;
  const pg = new PolygonsGenerator(params, []);
  const vcs = (new VCGenerator(pg.polygons) as any).generateVertexConfigurations();
  const adj: Record<string, string[]> = {};
  for (const vc of vcs) adj[vc.name] = [];
  for (let i = 0; i < vcs.length; i++) for (let j = i + 1; j < vcs.length; j++)
    if (vcs[i].isCompatible(vcs[j])) { adj[vcs[i].name].push(vcs[j].name); adj[vcs[j].name].push(vcs[i].name); }
  const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
  const seedSets = (new SeedSetExtractor(graph) as any).findSeedSets(2);
  const seeds2 = (new SeedBuilder() as any).buildSeeds(2, 1, { seedSetLoader: () => seedSets });
  const ps2: any = new PeriodSolver(2);
  const { cells } = ps2.solve(seeds2[0], {});
  for (const cell of cells) {
    const { ctx, allowed, cps } = ctxForCell(cell, 2);
    const [u2, v2] = cell.basisExact;
    row("gate.orbits", encC(u2), encC(v2), cps.map(polyEnc).join("|"), checker.countVertexOrbits(cps, u2, v2) ?? -1);  // expect 2
    row("torusfill", packCtxFull(ctx, 2), [...allowed].join(RSs), "", cps.map(polyEnc).join("|"), encodeCellsTS(ps2.torusFill(cps, ctx, () => false, mkDiag())));
  }
} catch { /* pipeline unavailable ⇒ skip the k=2 closer */ }

const out = path.resolve(process.argv[2] ?? path.join(__dirname, "difftrace.txt"));
fs.writeFileSync(out, lines.join("\n") + "\n");
console.log(`wrote ${lines.length} test cases -> ${out}`);
