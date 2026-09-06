// Emit public/atlas-manifest.json: how many tilings sit behind each lazy tier, so the browse tree
// can offer a row before its data exists.
//
//   pnpm tsx scripts/gen-atlas-manifest.ts            # dry run, prints the table
//   pnpm tsx scripts/gen-atlas-manifest.ts --write
//
// Only the tiers NOTHING in the UI can currently reach are listed. /play already pulls composable,
// isotoxal, period, tri45 and penrose eagerly (KNOWN_HIGHER_TIERS in _play-client.tsx), so adding
// them here would draw a row for records that are already in the list.
//
// Counts come from decoding the real shard and calling the real tileClassOf/subOf, not from a table
// of expected numbers. A hand-maintained count is a second source of truth, and the failure mode is
// the worst kind for this project: a row that promises 403 tilings and delivers 400, with nothing
// saying so.

import fs from "node:fs";
import path from "node:path";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import { tileClassOf, subOf, geometryOf, decorationOf, type ReferenceTiling } from "@/lib/services/referenceAtlas";
import type { AtlasManifest, ManifestTier, TierShelf } from "@/lib/services/atlasManifest";
import { HYP_POLY_BOARDS, hypPolySubOfBoard } from "@/lib/tilings/hyp-poly";

const write = process.argv.includes("--write");
const PUB = path.resolve("public");

/** (shelf, k) -> the file that holds it. Mirrors loadShelfShard / loadReferenceAtlasShard. */
const TIERS: { shelf: TierShelf; ks: number[]; file: (k: number) => string }[] = [
	// The regular catalogue's k8/9/10, HIGHER_K in reference-shelf.tsx.
	{ shelf: "ctrnact", ks: [8, 9, 10], file: (k) => `reference-atlas-k${k}.json` },
	// SCALED_SHARD_KS, EUHALF_SHARD_KS, MIXED_SHARD_KS in referenceAtlas.ts.
	{ shelf: "scaled", ks: [3, 4, 5, 6, 7], file: (k) => `reference-atlas-scaled-k${k}.json` },
	{ shelf: "euhalf", ks: [5, 6, 7, 8, 9], file: (k) => `reference-atlas-euhalf-k${k}.json` },
	{ shelf: "mixed", ks: [3, 4], file: (k) => `reference-atlas-mixed-k${k}.json` },
];

const tiers: ManifestTier[] = [];
let total = 0;
const missing: string[] = [];

for (const t of TIERS) {
	for (const k of t.ks) {
		const file = path.join(PUB, t.file(k));
		if (!fs.existsSync(file)) {
			missing.push(t.file(k));
			continue;
		}
		const records = decodeAtlas<ReferenceTiling>(JSON.parse(fs.readFileSync(file, "utf8")));
		// Group by exactly what the tree groups by, so a manifest row and a loaded row collide on the
		// same key and the set difference in unloadedTiers() actually cancels. Geometry and decoration
		// are measured off the records and grouped on too, never assumed: the tree filters to one
		// (geometry, decoration) cell BEFORE it groups, so a tier that does not carry its own cell is
		// drawn in all of them. Every shard listed above is Euclidean tilings today; measuring it is
		// what keeps the manifest right on the day one is not.
		//
		// The separator is an escaped \0, not a raw NUL byte. It was a raw one until 2026-08-19, which
		// made git classify this file as binary and print "Bin 0 -> 3749 bytes" instead of a diff.
		const by = new Map<string, { cls: string; sub: string; geometry: string; decoration: string; n: number }>();
		for (const r of records) {
			const cls = tileClassOf(r);
			const sub = subOf(r);
			const geometry = geometryOf(r);
			const decoration = decorationOf(r);
			const key = `${cls}\0${sub}\0${geometry}\0${decoration}`;
			const hit = by.get(key);
			if (hit) hit.n++;
			else by.set(key, { cls, sub, geometry, decoration, n: 1 });
		}
		for (const g of by.values()) {
			tiers.push({
				cls: g.cls as ManifestTier["cls"],
				sub: g.sub,
				k,
				count: g.n,
				shelf: t.shelf,
				geometry: g.geometry as ManifestTier["geometry"],
				decoration: g.decoration as ManifestTier["decoration"],
			});
			total += g.n;
		}
	}
}

// The HYPERBOLIC-POLY shelf, 271 boards and 2,191,775 tilings. Unlike the four above it is per BOARD,
// so a tier is a (board, k) pair and carries `board`.
//
// Its counts come from HYP_POLY_BOARDS rather than from decoding 702 shards, and that is NOT a second
// source of truth: scripts/pack-hyp-poly-shelf.mjs writes that table and the shards from one pass over
// one develop, and lib/tilings/hyp-poly.test.ts re-reads the shipped shards and asserts every count.
// Decoding them again here would cost minutes to re-derive numbers a test already guards.
//
// ⚑ WHY THIS SHELF NEEDED IT (2026-08-31). The sidebar tree builds its rows by grouping the records it
// HOLDS, so a family with no eager slice has no row at all: the abcd boards' 1,177,806 tilings were
// invisible there, and "3.4.n.4 boards" read 1357 — its eager count — against 412,532 shipped. That is
// exactly the circularity this manifest exists to break, and I had wrongly concluded the shelf did not
// need it because /library's board CHIPS are static and did show every board.
for (const b of HYP_POLY_BOARDS) {
	for (const k of [...b.eagerKs, ...b.lazyKs]) {
		const count = b.counts[k];
		if (!count) continue;
		tiers.push({
			// MEASURED, not assumed: these records classify as "hyperbolic", not "regular". Guessing put
			// all 2,191,775 into a second class row beside the real one instead of merging with it —
			// `unloadedTiers` cancels on (cls, sub, k), so a wrong cls cannot collide with a loaded row.
			cls: "hyperbolic",
			sub: hypPolySubOfBoard(b),
			k,
			count,
			shelf: "hyppoly",
			geometry: "hyperbolic",
			decoration: "tilings",
			board: b.id,
		});
		// EAGER slices are loaded on entering the geometry, so they are not "unreachable" and must not be
		// counted into the headline below — but they still belong in the manifest, because `unloadedTiers`
		// cancels a tier whose records have arrived and the tree needs the row's TRUE count either way.
		if (!b.eagerKs.includes(k)) total += count;
	}
}

tiers.sort((a, b) => a.cls.localeCompare(b.cls) || a.sub.localeCompare(b.sub) || a.k - b.k);

for (const t of tiers) {
	console.log(
		`  ${t.shelf.padEnd(9)} k=${String(t.k).padStart(2)}  ${t.cls.padEnd(12)} ${t.sub.padEnd(22)} ${String(t.count).padStart(6)}`,
	);
}
console.log("---");
console.log(`${tiers.length} tiers, ${total.toLocaleString()} tilings currently unreachable by browsing`);
if (missing.length) console.log(`missing shards (skipped): ${missing.join(", ")}`);

const manifest: AtlasManifest = { manifest: 1, tiers };
const out = path.join(PUB, "atlas-manifest.json");
if (write) {
	fs.writeFileSync(out, JSON.stringify(manifest) + "\n");
	console.log(`wrote ${out} (${(JSON.stringify(manifest).length / 1024).toFixed(1)} KB)`);
} else {
	console.log(`dry run — would be ${(JSON.stringify(manifest).length / 1024).toFixed(1)} KB; pass --write`);
}
