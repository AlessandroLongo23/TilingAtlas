// Localize the Islamic high-offset freeze WITHOUT touching production code: faithfully replay
// prepareIslamicField's pipeline via its exported pieces and time each phase (segment gen →
// buildArrangement(split) → extractFaces) at offset 50% vs 80%, printing segment/edge/face counts so
// we can see whether the seconds are combinatorial blow-up (more geometry) or an O(n²) algorithm.
import { readFileSync } from "node:fs";
import { HyperbolicDeveloper, type Darts } from "@/lib/render/hyperbolicDevelopClient";
import { prepareShaderTiling } from "@/lib/render/hyperbolicReduce";
import { islamicSegmentsForTile } from "@/lib/render/hyperbolicIslamic";
import { buildArrangement, extractFaces, type Segment } from "@/lib/utils/islamicArrangement";
import { islamicNormalAngleFromSlider } from "@/lib/utils/islamicNoise";
import { Vector } from "@/classes/Vector";

const COLLAR = 0.15;
const dev = JSON.parse(readFileSync("public/hyperbolic-developed.json", "utf8"));
const id = "hyp-k2-3-3-4-3-4-4__3-3-4-3-4-4"; // idx52, the 6s tiling
const p = dev.find((x: { id: string }) => x.id === id);
const darts: Darts = p.darts;
const edge: number = p.edge;
const meta = { id, name: p.name, config: p.config ?? "", edge };
const ms = (t: number) => `${t.toFixed(0)}ms`;

const st = prepareShaderTiling(darts, edge, meta)!;
let rMaxTile = 0;
for (const q of darts.lvert) rMaxTile = Math.max(rMaxTile, Math.asinh(Math.sinh(edge / 2) / Math.sin(Math.PI / q)));
const boundEu = Math.min(0.9995, Math.tanh((st.domain.RD + COLLAR + 2 * rMaxTile + 0.2) / 2));
const patch = new HyperbolicDeveloper(darts, edge, { deepDedup: true }).develop(meta, { a: { x: 1, y: 0 }, b: { x: 0, y: 0 } }, boundEu, 400_000);
const angle = islamicNormalAngleFromSlider(45);
console.log(`${id}  patch faces=${patch.faces.length}`);

for (const off of [0.5, 0.8]) {
  const frac = Math.min(Math.max(off, 0), 0.998);
  let t = performance.now();
  const segments: Segment[] = [];
  for (const face of patch.faces) {
    const polyP = face.map((i) => ({ x: patch.vertices[i][0], y: patch.vertices[i][1] }));
    for (const [a, b] of islamicSegmentsForTile(polyP, angle, frac, id)) segments.push([new Vector(a.x, a.y), new Vector(b.x, b.y)]);
  }
  const tSeg = performance.now() - t;

  t = performance.now();
  const arr = buildArrangement(segments, frac > 0);
  const tArr = performance.now() - t;

  // pendant prune (cheap, replicated)
  const deg = new Array<number>(arr.pts.length).fill(0);
  for (const [a, b] of arr.edges) { deg[a]++; deg[b]++; }
  const prunedSegs: Segment[] = arr.edges.map(([a, b]) => [arr.pts[a], arr.pts[b]] as Segment);

  t = performance.now();
  const faces = extractFaces(prunedSegs, false);
  const tFaces = performance.now() - t;

  console.log(`\noffset ${(off * 100).toFixed(0)}%  (frac ${frac})`);
  console.log(`  segments  = ${segments.length}   [gen ${ms(tSeg)}]`);
  console.log(`  arrangement: pts=${arr.pts.length} edges=${arr.edges.length}   [buildArrangement(split) ${ms(tArr)}]`);
  console.log(`  faces     = ${faces.length}   [extractFaces ${ms(tFaces)}]`);
  console.log(`  PHASE TOTAL ≈ ${ms(tSeg + tArr + tFaces)}`);
}
