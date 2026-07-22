// Non-invasive confirmation that the Islamic high-offset freeze is the TEXEL LOOP, not the arrangement:
// hold offset at 80% and sweep fieldRes. If wall-time ∝ res², the cost is the per-texel classification
// (the marker-Voronoi fallback that scans every center/contact for each wall-less texel); the arrangement
// is res-independent so it would show as a flat floor.
import { readFileSync } from "node:fs";
import { HyperbolicDeveloper, type Darts } from "@/lib/render/hyperbolicDevelopClient";
import { prepareShaderTiling } from "@/lib/render/hyperbolicReduce";
import { prepareIslamicField } from "@/lib/render/hyperbolicIslamic";
import { islamicNormalAngleFromSlider } from "@/lib/utils/islamicNoise";

const dev = JSON.parse(readFileSync("public/hyperbolic-developed.json", "utf8"));
const id = "hyp-k2-3-3-4-3-4-4__3-3-4-3-4-4";
const p = dev.find((x: { id: string }) => x.id === id);
const darts: Darts = p.darts;
const edge: number = p.edge;
const meta = { id, name: p.name, config: p.config ?? "", edge };
const st = prepareShaderTiling(darts, edge, meta)!;
void new HyperbolicDeveloper(darts, edge, { deepDedup: true });
const angle = islamicNormalAngleFromSlider(45);
const off = 0.8;

console.log(`${id}  offset ${off * 100}%  — texel-loop hypothesis: wall-time ∝ res²`);
console.log(`res    time      time/res² (µs)`);
for (const res of [128, 256, 512, 1024]) {
  // prepareIslamicField is the UNCACHED core (getIslamicField is the cached wrapper) → fresh bake each res
  const t = performance.now();
  prepareIslamicField(st, darts, edge, meta, angle, off, { fieldRes: res });
  const dt = performance.now() - t;
  const perTexel = (dt * 1000) / (res * res);
  console.log(`${String(res).padStart(4)}   ${dt.toFixed(0).padStart(6)}ms   ${perTexel.toFixed(3)}`);
}
