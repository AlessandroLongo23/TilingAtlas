// reshard-star-shards.mjs — move the star catalogue's k ≥ 8 entries out of the eager base atlas and
// into the per-k lazy shards that already carry the Čtrnáct tiers at those k.
//
// Phase 3b of build-reference-atlas.ts states the rule: "the base reference-atlas.json stays k≤7 and
// small", and writes k=8..10 of the regular catalogue to public/reference-atlas-k{k}.json. Phase 4
// (the star catalogue) never followed it, so extending the star shelf to k=9 put 9,487 entries and
// 80.4 MB into the file every library visitor fetches whole (referenceAtlas.ts, loadReferenceAtlas).
// At 110.33 MB that file also crossed GitHub's hard 100 MB per-file limit and could not be pushed.
//
// The shards need no loader work: loadReferenceAtlasShard(k) already fetches reference-atlas-k{k}.json
// when the k chip is selected and merges the records into the same list the shelf filters and pages,
// and the k = 8/9/10 chips are declared (HIGHER_K in reference-shelf.tsx), not derived from what the
// base atlas happens to hold. So a star tiling moved here stays reachable by exactly the route the
// regular k ≥ 8 tilings already use.
//
// Idempotent: a second run finds nothing left to move, and merging dedupes by id.
//
// This is a POST-BUILD step, not part of build-reference-atlas.ts — the build script had uncommitted
// edits when this was written and folding it in would have silently reverted them. Run it after every
// atlas rebuild, or fold it into Phase 4 once that file is quiet.

import fs from "node:fs";
import path from "node:path";

const PUBLIC = path.join(process.cwd(), "public");
const BASE = path.join(PUBLIC, "reference-atlas.json");
/** Only the star catalogue moves. The regular tiers are already sharded by the build script. */
const MOVES = (t) => t.source === "ctrnact-star" && t.k >= 8;

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
// Same encoding the build script uses for both the base atlas and the shards, so a rebuild that later
// takes this over produces a byte-identical file instead of a whole-file reformat.
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 0) + "\n");
const mb = (p) => (fs.statSync(p).size / 1e6).toFixed(1);

const base = read(BASE);
const moving = base.filter(MOVES);
if (moving.length === 0) {
	console.log("nothing to move: the base atlas already holds no star entries at k >= 8");
	process.exit(0);
}

// Base atlas: keep the original order, just without the movers.
const kept = base.filter((t) => !MOVES(t));
const byK = new Map();
for (const t of moving) {
	if (!byK.has(t.k)) byK.set(t.k, []);
	byK.get(t.k).push(t);
}

console.log(`base ${path.basename(BASE)}: ${base.length} -> ${kept.length} entries (${mb(BASE)} MB before)`);

for (const k of [...byK.keys()].sort((a, b) => a - b)) {
	const shardPath = path.join(PUBLIC, `reference-atlas-k${k}.json`);
	const existing = fs.existsSync(shardPath) ? read(shardPath) : [];
	const have = new Set(existing.map((t) => t.id));
	const added = byK.get(k).filter((t) => !have.has(t.id));
	// Sorted by id, as Phase 3b writes its shards.
	const merged = [...existing, ...added].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	const before = fs.existsSync(shardPath) ? mb(shardPath) : "0.0";
	write(shardPath, merged);
	console.log(
		`  k=${k}: +${added.length} star entries -> ${merged.length} total ` +
			`(${before} -> ${mb(shardPath)} MB)`,
	);
}

write(BASE, kept);
console.log(`base ${path.basename(BASE)}: ${mb(BASE)} MB after`);
