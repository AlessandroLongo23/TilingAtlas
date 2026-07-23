import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Every id in the merged reference shelf must be unique — across files, not just within one.
// loadReferenceAtlas concatenates these lists straight into React lists keyed by id, and duplicate
// keys corrupt reconciliation: 12 duplicated hyperbolic ids (exporter id-assignment flaw) left ghost
// cards stranded across /library facet switches on 2026-07-23 (AL repro; NOTES §83). React's own
// warning is dev-only and easy to miss — this test makes the invariant loud.

const PUB = join(__dirname, "..", "public");
const FILES = [
	"reference-atlas.json",
	"reference-atlas-composable.json",
	"reference-atlas-isotoxal.json",
	"reference-atlas-mixed.json",
	"reference-atlas-scaled.json",
	"reference-atlas-polyomino.json",
	"reference-atlas-islamic.json",
	"reference-atlas-hyperbolic.json",
	"reference-atlas-spherical.json",
];

describe("reference shelf id uniqueness (React list keys)", () => {
	it("no id appears twice within or across the merged reference files", () => {
		const seen = new Map<string, string>(); // id -> first file
		const dups: string[] = [];
		for (const f of FILES) {
			const path = join(PUB, f);
			if (!existsSync(path)) continue; // best-effort shelves may be absent, matching the loader
			const entries: Array<{ id?: string }> = JSON.parse(readFileSync(path, "utf8"));
			for (const e of entries) {
				if (!e.id) continue;
				const prev = seen.get(e.id);
				if (prev) dups.push(`${e.id} (${prev} + ${f})`);
				else seen.set(e.id, f);
			}
		}
		expect(dups, `duplicate ids: ${dups.slice(0, 20).join("; ")}`).toEqual([]);
	});

	it("hyperbolic developed patches key uniquely too (thumbnail/tiling caches key on patch id)", () => {
		const path = join(PUB, "hyperbolic-developed.json");
		const patches: Array<{ id: string }> = JSON.parse(readFileSync(path, "utf8"));
		const c = new Map<string, number>();
		for (const p of patches) c.set(p.id, (c.get(p.id) ?? 0) + 1);
		const dups = [...c.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id}×${n}`);
		expect(dups, dups.join("; ")).toEqual([]);
	});
});
