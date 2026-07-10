/*
 * Matched torusFill benchmark (TS side). Solve a few real seeds, and for each emitted cell time the TS
 * torusFill on (a) the closed cell and (b) a single-vertex fan of it. Writes the serialized (ctx, core)
 * cases to native-engine/tf-cases.txt so bench-tf.cpp times the SAME inputs. This measures the inner DFS
 * engine (per (seed,lattice) call) — the bulk of a full solve's runtime — not the outer candidate-lattice
 * driver (which the native port does not yet have).
 *   pnpm tsx native-engine/bench-tf.ts [itersPerCase]
 */
import fs from "node:fs";
import path from "node:path";
import { computeRing } from "@/classes/algorithm/PolygonsGenerator";
import { setActiveRing } from "@/classes/Cyclotomic";
import { PeriodSolver, defaultMaxCellPolys } from "@/classes/algorithm/PeriodSolver";
import { KUniformityChecker } from "@/classes/algorithm/KUniformityChecker";
import { VertexConfiguration } from "@/classes/algorithm/VertexConfiguration";
import { SeedConfiguration } from "@/classes/algorithm/SeedConfiguration";
import { PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder, PolygonType } from "@/classes";
import type { Polygon } from "@/classes";

const params = { [PolygonType.REGULAR]: { ns: [3, 4, 6, 8, 12] } } as any;
const ring = computeRing(params);
setActiveRing(ring);
const checker = new KUniformityChecker();
const ITERS = parseInt(process.argv[2] ?? "300", 10);

const b = new ArrayBuffer(8); const dv = new DataView(b);
const f2h = (x: number) => { dv.setFloat64(0, x); return dv.getBigUint64(0).toString(16).padStart(16, "0"); };
const encC = (c: any) => `${c.num.join(",")}:${c.den}`;
const encS = (s: any) => `${s.P},${s.Q},${s.R},${s.S},${s.D}`;
const polyEnc = (P: Polygon) => `${P.n}~${P.isStar ? 1 : 0}~${(P as any).alphaU ?? 0}~${P.exactVertices!.map(encC).join(";")}~${P.edgeDirs!.join(",")}`;
const packCtxFull = (ctx: any, k: number) =>
  `${encC(ctx.u)}~${encC(ctx.v)}~${f2h(ctx.uV.x)},${f2h(ctx.uV.y)}~${f2h(ctx.vV.x)},${f2h(ctx.vV.y)}~${f2h(ctx.det)}~${f2h(ctx.cellDiam)}~${f2h(ctx.maxCircum)}~${f2h(ctx.cellArea)}~${encS(ctx.cellAreaSurd)}~${ctx.orbitFloor}~${ctx.maxCellPolys}~${k}~${ctx.polySizes.join(",")}`;
const mkDiag = (): any => ({ candidateLattices: 0, latticesTried: 0, rawCells: 0, emitted: 0, gateRejected: 0, earlyGateRejected: 0, fanLattices: 0, p0Skipped: 0, orbitSkipped: 0, p1Pruned: 0, p2Skipped: 0, vBelowKSkipped: 0, seedStateDedup: 0, obliqueCandidates: 0, obliqueTruncated: null, supercellRejected: 0, primitivityGuardMisses: 0, primitivityGuardAreaSuppressed: 0, starLadderTruncated: false, blockIndexCapTruncated: 0, timedOut: false });

function harvestAllowed(reps: Polygon[], ctx: any): Set<string> {
  const block: Polygon[] = ctx && (new PeriodSolver(1) as any).buildBlock ? [] : [];
  const ps: any = new PeriodSolver(1);
  const bl: Polygon[] = ps.buildBlock(reps, ctx, 5);
  const judgeR = ctx.cellDiam + 0.5, incR = judgeR + ctx.maxCircum + 0.01;
  const inc = new Map<string, any>();
  for (const p of bl) { const cf = p.exactCentroid!.toVector(); if (Math.hypot(cf.x, cf.y) > incR) continue; p.exactVertices!.forEach((w: any) => { const kk = w.key(); let e = inc.get(kk); if (!e) { e = { v: w, polys: [] }; inc.set(kk, e); } e.polys.push(p); }); }
  const out = new Set<string>();
  for (const { v, polys } of inc.values()) { const vf = v.toVector(); if (Math.hypot(vf.x, vf.y) > judgeR) continue; if (new Set(polys.map((p: any) => p.exactKey())).size < 3) continue; out.add(ps.vcNameAt(v, polys)); }
  return out;
}

function ctxFor(cell: any, k: number) {
  const [u, v] = cell.basisExact;
  const cps: Polygon[] = cell.cellPolygons;
  const psK: any = new PeriodSolver(k);
  const polySizes = [...new Set(cps.filter((p) => !p.isStar).map((p) => p.n))].sort((a: number, bb: number) => a - bb);
  const ctx0 = psK.makeCtx(u, v, ring, new Set(), polySizes, defaultMaxCellPolys(k), [], new Set(), new Set());
  const allowed = harvestAllowed(cps, ctx0);
  const ctx = psK.makeCtx(u, v, ring, allowed, polySizes, defaultMaxCellPolys(k), [], new Set(), new Set());
  ctx.gate = (r: Polygon[]) => checker.countVertexOrbits(r, u, v);
  return { ctx, allowed, cps, psK };
}

// Build the case list from real solves.
type Case = { label: string; core: Polygon[]; ctx: any; allowed: Set<string>; k: number; ps: any };
const cases: Case[] = [];
const oneVcSeeds: [string, number][] = [["4,4,4,4", 1], ["3,3,3,3,3,3", 1], ["6,6,6", 1], ["3,4,6,4", 1], ["3,6,3,6", 1], ["4,6,12", 1]];
for (const [name, k] of oneVcSeeds) {
  const psK: any = new PeriodSolver(k);
  let cells: any[] = [];
  try { cells = psK.solve(new SeedConfiguration([VertexConfiguration.fromName(name)]), {}).cells; } catch { continue; }
  for (const cell of cells) {
    const { ctx, allowed, cps, psK: pk } = ctxFor(cell, k);
    cases.push({ label: `${name} (closed)`, core: cps, ctx, allowed, k, ps: pk });
    const vk = cps[0].exactVertices![0];
    const fan = cps.filter((p) => p.vertexKeySet().has(vk.key()));
    if (fan.length >= 1 && fan.length < cps.length) cases.push({ label: `${name} (fan)`, core: fan, ctx, allowed, k, ps: pk });
  }
}
// one k=2 seed (heaviest: gate returns 2)
try {
  const pg = new PolygonsGenerator(params, []);
  const vcs = (new VCGenerator(pg.polygons) as any).generateVertexConfigurations();
  const adj: Record<string, string[]> = {}; for (const vc of vcs) adj[vc.name] = [];
  for (let i = 0; i < vcs.length; i++) for (let j = i + 1; j < vcs.length; j++) if (vcs[i].isCompatible(vcs[j])) { adj[vcs[i].name].push(vcs[j].name); adj[vcs[j].name].push(vcs[i].name); }
  const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
  const seedSets = (new SeedSetExtractor(graph) as any).findSeedSets(2);
  const seeds2 = (new SeedBuilder() as any).buildSeeds(2, 1, { seedSetLoader: () => seedSets });
  const ps2: any = new PeriodSolver(2);
  const { cells } = ps2.solve(seeds2[0], {});
  for (const cell of cells) { const { ctx, allowed, cps } = ctxFor(cell, 2); cases.push({ label: "k=2 3.3.3.3.3.3+3.3.3.3.6 (closed)", core: cps, ctx, allowed, k: 2, ps: ps2 }); }
} catch { /* skip */ }

// Time TS torusFill per case; serialize each case for the native side.
const lines: string[] = [];
let tsTotalMs = 0, totalCalls = 0;
console.log(`torusFill benchmark — ${cases.length} cases, ${ITERS} iters each\n`);
console.log(`${"case".padEnd(38)}  ${"TS ms/call".padStart(12)}`);
for (const c of cases) {
  for (let w = 0; w < 5; w++) c.ps.torusFill(c.core, c.ctx, () => false, mkDiag()); // warm up
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) c.ps.torusFill(c.core, c.ctx, () => false, mkDiag());
  const ms = (performance.now() - t0) / ITERS;
  tsTotalMs += ms; totalCalls++;
  console.log(`${c.label.padEnd(38)}  ${ms.toFixed(4).padStart(12)}`);
  lines.push(`${packCtxFull(c.ctx, c.k)}\t${[...c.allowed].join(String.fromCharCode(0x1f))}\t\t${c.core.map(polyEnc).join("|")}`);
}
console.log(`\nTS total ms/call (sum over cases): ${tsTotalMs.toFixed(3)}  (${(1000 / (tsTotalMs / totalCalls)).toFixed(0)} calls/s avg)`);
const outFile = path.join(__dirname, "tf-cases.txt");
fs.writeFileSync(outFile, lines.join("\n") + "\n");
console.log(`wrote ${lines.length} cases -> ${outFile}  (run: ./bench-tf tf-cases.txt ${ITERS})`);
