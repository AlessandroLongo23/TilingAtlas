import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { unloadedTiers, tierKey, type AtlasManifest } from "./atlasManifest";
import { decodeAtlas } from "./atlasCodec";
import { tileClassOf, subOf, type ReferenceTiling } from "./referenceAtlas";

const manifest = (tiers: AtlasManifest["tiers"]): AtlasManifest => ({ manifest: 1, tiers });
const tier = (cls: string, sub: string, k: number, count = 1) =>
	({ cls, sub, k, count, shelf: "scaled" }) as AtlasManifest["tiers"][number];

describe("unloadedTiers", () => {
	it("reports a tier nothing has loaded", () => {
		const out = unloadedTiers(manifest([tier("scaled", "s", 4, 1602)]), []);
		expect(out).toHaveLength(1);
		expect(out[0].count).toBe(1602);
		expect(out[0].key).toBe(tierKey("scaled", "s", 4));
	});

	it("cancels a tier whose records are already loaded", () => {
		// The row must not appear beside the real one. This is the case that fires after a click, and
		// the reason the key is (class, sub, k) and not the shelf: records can arrive by another route.
		const out = unloadedTiers(manifest([tier("scaled", "s", 4)]), [{ cls: "scaled" as never, sub: "s", k: 4 }]);
		expect(out).toEqual([]);
	});

	it("does not cancel on a partial key match", () => {
		const m = manifest([tier("scaled", "s", 4)]);
		expect(unloadedTiers(m, [{ cls: "scaled" as never, sub: "s", k: 5 }])).toHaveLength(1);
		expect(unloadedTiers(m, [{ cls: "scaled" as never, sub: "other", k: 4 }])).toHaveLength(1);
	});

	it("degrades to no rows when the manifest is missing", () => {
		// loadAtlasManifest resolves null on any failure; the tree must fall back to today's behaviour
		// (rows appear as data loads) rather than blanking.
		expect(unloadedTiers(null, [])).toEqual([]);
	});
});

describe("the shipped manifest", () => {
	const file = path.join(process.cwd(), "public", "atlas-manifest.json");

	it("is present and versioned", () => {
		if (!fs.existsSync(file)) return; // corpus not present in this checkout
		const m: AtlasManifest = JSON.parse(fs.readFileSync(file, "utf8"));
		expect(m.manifest).toBe(1);
		expect(m.tiers.length).toBeGreaterThan(0);
	});

	it("states the counts the shards actually hold", () => {
		// The whole value of this file is that a row promises a number before the data exists. A count
		// that is merely close is worse than none: it is a completeness claim the atlas cannot honour.
		if (!fs.existsSync(file)) return;
		const m: AtlasManifest = JSON.parse(fs.readFileSync(file, "utf8"));
		const shardFile = (shelf: string, k: number) =>
			shelf === "ctrnact" ? `reference-atlas-k${k}.json` : `reference-atlas-${shelf}-k${k}.json`;

		// Group the manifest by shard, then recount that shard the way the tree groups it.
		const byShard = new Map<string, typeof m.tiers>();
		for (const t of m.tiers) {
			const key = shardFile(t.shelf, t.k);
			byShard.set(key, [...(byShard.get(key) ?? []), t]);
		}
		let checked = 0;
		for (const [name, tiers] of byShard) {
			const p = path.join(process.cwd(), "public", name);
			if (!fs.existsSync(p)) continue;
			const records = decodeAtlas<ReferenceTiling>(JSON.parse(fs.readFileSync(p, "utf8")));
			const actual = new Map<string, number>();
			for (const r of records) {
				const key = tierKey(tileClassOf(r), subOf(r), r.k);
				actual.set(key, (actual.get(key) ?? 0) + 1);
			}
			for (const t of tiers) {
				expect(t.count, `${name} ${t.cls}/${t.sub} k=${t.k}`).toBe(actual.get(tierKey(t.cls, t.sub, t.k)));
				checked++;
			}
			// And nothing in the shard may be missing from the manifest, or a row silently disappears.
			expect([...actual.keys()].sort(), `${name} coverage`).toEqual(
				tiers.map((t) => tierKey(t.cls, t.sub, t.k)).sort(),
			);
		}
		expect(checked).toBeGreaterThan(0);
	});
});
