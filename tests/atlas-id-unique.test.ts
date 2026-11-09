import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import { readDataText } from "../scripts/atlas/io.mjs";

// Every id in the merged reference shelf must be unique — across files, not just within one.
// loadReferenceAtlas concatenates these lists straight into React lists keyed by id, and duplicate
// keys corrupt reconciliation: 12 duplicated hyperbolic ids (exporter id-assignment flaw) left ghost
// cards stranded across /library facet switches on 2026-07-23 (AL repro; NOTES §83). React's own
// warning is dev-only and easy to miss — this test makes the invariant loud.

const PUB = join(__dirname, "..", "public");
// Every shelf file and lazy shard there is, read the way the builders read them. A fixed list of `.json`
// names checked nothing from 2026-10-21, when the data went to `.json.gz` and every name stopped existing.
const FILES = readdirSync(PUB).filter((f) => /^reference-atlas.*\.json(\.br)?$/.test(f));

describe("reference shelf id uniqueness (React list keys)", () => {
	it("no id appears twice within or across the merged reference files", () => {
		expect(FILES.length, "no reference-atlas files found").toBeGreaterThan(0);
		const seen = new Map<string, string>(); // id -> first file
		const dups: string[] = [];
		for (const f of FILES) {
			const entries = decodeAtlas<{ id?: string }>(JSON.parse(readDataText(join(PUB, f))));
			for (const e of entries) {
				if (!e.id) continue;
				const prev = seen.get(e.id);
				if (prev) dups.push(`${e.id} (${prev} + ${f})`);
				else seen.set(e.id, f);
			}
		}
		expect(seen.size, "no ids read").toBeGreaterThan(0);
		expect(dups, `duplicate ids: ${dups.slice(0, 20).join("; ")}`).toEqual([]);
	}, 300_000);

	it("hyperbolic developed patches key uniquely too (thumbnail/tiling caches key on patch id)", () => {
		const patches = ["hyperbolic-developed.json", "hyperbolic-developed-stars.json"].flatMap((f) =>
			decodeAtlas<{ id: string }>(JSON.parse(readDataText(join(PUB, f)))),
		);
		const c = new Map<string, number>();
		for (const p of patches) c.set(p.id, (c.get(p.id) ?? 0) + 1);
		const dups = [...c.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id}×${n}`);
		expect(dups, dups.join("; ")).toEqual([]);
	});
});
