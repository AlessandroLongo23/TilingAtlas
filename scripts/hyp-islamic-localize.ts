// Localize the Islamic HIGH-OFFSET cost that survives the distance-transform fill. Times getIslamicField
// end-to-end at increasing offsets for the worst tiling, so we can see whether the seconds live in the
// per-offset re-bake (arrangement + texel classification) rather than the fill. Pure math under tsx.
import { readFileSync } from "node:fs";
import { HyperbolicDeveloper, type Darts } from "@/lib/render/hyperbolicDevelopClient";
import { prepareShaderTiling } from "@/lib/render/hyperbolicReduce";
import { getIslamicField } from "@/lib/render/hyperbolicIslamic";
import { islamicNormalAngleFromSlider } from "@/lib/utils/islamicNoise";

const dev = JSON.parse(readFileSync("public/hyperbolic-developed.json", "utf8"));
const id = "hyp-k2-3-3-4-3-4-4__3-3-4-3-4-4"; // idx52
const p = dev.find((x: { id: string }) => x.id === id);
const darts: Darts = p.darts;
const edge: number = p.edge;
const meta = { id, name: p.name, config: p.config ?? "", edge };
const ms = (t: number) => `${t.toFixed(0)}ms`;

const st = prepareShaderTiling(darts, edge, meta);
if (!st) throw new Error("no shader tiling");
// touch the developer so its cache warms like the app (getBakePatch has its own cache)
void new HyperbolicDeveloper(darts, edge, { deepDedup: true });

const angle = islamicNormalAngleFromSlider(45);
console.log(`Islamic bake timing for ${id}  (fieldRes = full, up to 1024)`);
for (const off of [0.2, 0.5, 0.8, 0.99]) {
  // fresh key each offset → no fieldCache hit; time the whole re-bake
  const t = performance.now();
  const field = getIslamicField(st, darts, edge, meta, angle, off, { fieldRes: Math.min(st.field.res, 1024) });
  const dt = performance.now() - t;
  console.log(`  offset ${(off * 100).toFixed(0).padStart(3)}%: ${ms(dt).padStart(8)}   field=${field ? "ok" : "null"}`);
}
