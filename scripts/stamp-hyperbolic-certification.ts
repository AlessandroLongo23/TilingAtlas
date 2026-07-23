/**
 * Stamp per-pixel renderability onto public/hyperbolic-developed.json.
 *
 * For every patch, attempt the certified Dirichlet domain (the reduction the per-pixel Poincaré
 * renderer needs) and stamp `certified: true|false`. The flag is CAPABILITY metadata, not catalog
 * policy: an uncertified tiling is still a real tiling and still ships — the clients read the flag to
 * skip the doomed (~0.2–1 s) certification attempt and go straight to the 2D developed renderer.
 *
 * Why ~half the shelf fails: buildDirichletDomain must develop the deck orbit to
 * Rdev = 2·RD + 2·rMaxTile + margin, and refuses past tanh(Rdev/2) > 0.99995 — beyond that rim,
 * float64 Poincaré positions collide in the 1e-6 dedup grid and the certificate would be a lie. The
 * big-ℓ tail of the D-symbol shelf (ℓ ≈ 2.2–2.4, RD ≈ 3.8) lands at Rdev ≈ 11 > 10.6. A rim-safe
 * (matrix-keyed) developer would lift this; until then the 2D path draws those tilings.
 *
 * Usage: pnpm tsx scripts/stamp-hyperbolic-certification.ts [path/to/hyperbolic-developed.json]
 * Run after every export_hyperbolic_atlas.py --write. ~3 min per 1000 patches.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildDirichletDomain } from "../lib/render/hyperbolicDirichlet";
import type { Darts } from "../lib/render/hyperbolicDevelopClient";

interface Patch {
	id: string;
	edge: number;
	darts?: Darts;
	certified?: boolean;
}

const path = process.argv[2] ?? join(__dirname, "..", "public", "hyperbolic-developed.json");
const atlas: Patch[] = JSON.parse(readFileSync(path, "utf8"));
let ok = 0;
const reasons = new Map<string, number>();
const t0 = Date.now();
for (let i = 0; i < atlas.length; i++) {
	const p = atlas[i];
	if (!p.darts) {
		p.certified = false;
		continue;
	}
	const dom = buildDirichletDomain(p.darts, p.edge);
	p.certified = dom.certified === true;
	if (p.certified) ok++;
	else {
		const r = (dom as { reason?: string }).reason ?? "?";
		const bucket = r.replace(/[-0-9.()=]+/g, "#");
		reasons.set(bucket, (reasons.get(bucket) ?? 0) + 1);
	}
	if (i % 500 === 499) {
		const el = (Date.now() - t0) / 1000;
		console.log(`  ${i + 1}/${atlas.length}  ${el.toFixed(0)}s elapsed, ~${((el / (i + 1)) * (atlas.length - i - 1)).toFixed(0)}s left, ${ok} certified`);
	}
}
writeFileSync(path, JSON.stringify(atlas));
console.log(`${path}: ${atlas.length} patches, ${ok} certified for the per-pixel renderer, ${atlas.length - ok} on the 2D path (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
for (const [r, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${n}× ${r}`);
