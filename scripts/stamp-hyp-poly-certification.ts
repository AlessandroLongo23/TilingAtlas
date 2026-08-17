/**
 * Stamp per-pixel renderability onto the SHARDED public/hyperbolic-poly/hp<n>-k<k>.json corpus.
 *
 * The sibling of scripts/stamp-hyperbolic-certification.ts, which does the same for the single-file
 * developed shelf. Same flag, same meaning: `certified: true|false` is CAPABILITY metadata, not catalog
 * policy. An uncertified tiling is a real tiling and still ships; the clients read the flag to skip a
 * doomed certification attempt and go straight to the 2D developed renderer.
 *
 * Why this shelf needed it. The colours and edge-pattern corpora already ship `certified`; hyp-poly was
 * the one that did not, so every hyp-poly selection paid buildDirichletDomain at runtime on the main
 * thread, and 37% of a 92-tiling sample over ten boards FAILS (median 210 ms, max 1197 ms) before
 * falling back. The failure is the float64 rim: the deck orbit has to develop to Rdev = 2·RD +
 * 2·rMaxTile + margin, and past tanh(Rdev/2) > 0.99995 the Poincaré positions collide in the dedup grid
 * and the certificate would be a lie. On these boards the k≥9 tail lands at Rdev ≈ 10.7–12.8 > 10.6.
 *
 * Shards are rewritten in place, so a partial run is resumable: pass --skip-stamped to leave shards that
 * already carry the flag on every record.
 *
 * Usage:
 *   pnpm tsx scripts/stamp-hyp-poly-certification.ts [--skip-stamped] [shard.json ...]
 * With no shard arguments it stamps every shard in public/hyperbolic-poly/. Prefer the parallel driver
 * (node scripts/stamp-hyp-poly-parallel.mjs) for the full 193-shard corpus.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildDirichletDomain } from "../lib/render/hyperbolicDirichlet";
import type { Darts } from "../lib/render/hyperbolicDevelopClient";
import { decodeAtlas } from "@/lib/services/atlasCodec";

interface PolyPattern {
	id: string;
	edge: number;
	darts?: Darts;
	certified?: boolean;
}

const args = process.argv.slice(2);
const skipStamped = args.includes("--skip-stamped");
const explicit = args.filter((a) => !a.startsWith("--"));
const dir = join(__dirname, "..", "public", "hyperbolic-poly");
const shards = explicit.length
	? explicit
	: readdirSync(dir)
			.filter((f) => f.endsWith(".json"))
			.sort()
			.map((f) => join(dir, f));

let total = 0;
let ok = 0;
let skipped = 0;
const reasons = new Map<string, number>();
const t0 = Date.now();

for (let s = 0; s < shards.length; s++) {
	const path = shards[s];
	const rows = decodeAtlas<PolyPattern>(JSON.parse(readFileSync(path, "utf8")));
	if (skipStamped && rows.length && rows.every((r) => typeof r.certified === "boolean")) {
		skipped += rows.length;
		continue;
	}
	for (const p of rows) {
		if (!p.darts) {
			p.certified = false;
			total++;
			continue;
		}
		const dom = buildDirichletDomain(p.darts, p.edge);
		p.certified = dom.certified === true;
		total++;
		if (p.certified) ok++;
		else {
			const r = (dom as { reason?: string }).reason ?? "?";
			const bucket = r.replace(/[-0-9.()=]+/g, "#");
			reasons.set(bucket, (reasons.get(bucket) ?? 0) + 1);
		}
	}
	writeFileSync(path, JSON.stringify(rows));
	const el = (Date.now() - t0) / 1000;
	const left = ((el / (s + 1)) * (shards.length - s - 1)).toFixed(0);
	console.log(
		`  [${s + 1}/${shards.length}] ${path.split("/").pop()}  ${rows.length} rows, ${ok}/${total} certified, ${el.toFixed(0)}s elapsed, ~${left}s left`,
	);
}

console.log(
	`\nhyperbolic-poly: ${total} tilings stamped (${skipped} skipped), ${ok} certified for the per-pixel renderer, ${total - ok} on the 2D path (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
);
for (const [r, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${n}× ${r}`);
