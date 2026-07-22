// Localize the base-bake freeze: time buildDirichletDomain vs develop vs the field texel-loop for the
// catastrophic tiling (4.4.3.4.3.3 + 4.4.3.4.3.3) and a near-identical fast neighbour. Pure math — no DOM
// — so it runs under tsx. Confirms WHICH sub-phase of prepareShaderTiling burns the seconds.
import { readFileSync } from "node:fs";
import { buildDirichletDomain } from "@/lib/render/hyperbolicDirichlet";
import { HyperbolicDeveloper, type Darts } from "@/lib/render/hyperbolicDevelopClient";
import { prepareShaderTiling } from "@/lib/render/hyperbolicReduce";

const dev = JSON.parse(readFileSync("public/hyperbolic-developed.json", "utf8"));
const pick = (id: string) => dev.find((p: { id: string }) => p.id === id);

const CASES = [
  { tag: "CATASTROPHIC idx52", id: "hyp-k2-3-3-4-3-4-4__3-3-4-3-4-4" },
  { tag: "fast-twin  idx47", id: "hyp-k2-3-3-3-4-4-4__3-3-3-4-4-4" },
  { tag: "baseline   {5,4}", id: "hyp-5-5-5-5" },
];

const ms = (t: number) => `${t.toFixed(0)}ms`;
for (const c of CASES) {
  const p = pick(c.id);
  const darts: Darts = p.darts;
  const edge: number = p.edge;
  console.log(`\n=== ${c.tag}  (${c.id})  edge=${edge.toFixed(4)} ===`);

  let t = performance.now();
  const dom = buildDirichletDomain(darts, edge);
  const tDom = performance.now() - t;
  const gens = (dom as { gens?: unknown[] }).gens?.length ?? "?";
  const RD = (dom as { RD?: number }).RD;
  console.log(`  buildDirichletDomain: ${ms(tDom)}  gens=${gens} RD=${RD?.toFixed?.(4)} certified=${(dom as {certified?:unknown}).certified}`);

  // develop to the same bound prepareShaderTiling uses (mirrors hyperbolicReduce)
  t = performance.now();
  const d2 = new HyperbolicDeveloper(darts, edge, { deepDedup: true });
  // bound ~ what reduce computes; use a generous 0.999 to see the dart count and time
  const patch = d2.develop({ id: c.id, name: "", config: "", edge }, { a: { x: 1, y: 0 }, b: { x: 0, y: 0 } }, 0.999, 400_000);
  const tDev = performance.now() - t;
  console.log(`  develop(0.999,cap400k): ${ms(tDev)}  faces=${patch.faces.length} verts=${patch.vertices.length}`);

  // full prepareShaderTiling (default res → up to 2048) with its internal bake
  t = performance.now();
  const st = prepareShaderTiling(darts, edge, { id: c.id, name: "", config: "", edge });
  const tPrep = performance.now() - t;
  const res = st?.field?.res;
  const bake = (st as { bake?: { unresolved?: number; unresolvedDeep?: number } } | null)?.bake;
  console.log(`  prepareShaderTiling(FULL): ${ms(tPrep)}  res=${res}  unresolved=${bake?.unresolved} unresolvedDeep=${bake?.unresolvedDeep}`);
}
