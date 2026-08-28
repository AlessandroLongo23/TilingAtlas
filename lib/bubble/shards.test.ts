import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BUBBLE_FILES, BUBBLE_GRID_ORDER, BUBBLE_ID_PREFIXES, isBubbleId } from "@/lib/bubble/pattern";

// The three lists that describe a bubble board — its grid string, its shards, and its record-id prefix —
// live in one file but are still three lists, and a board added to two of them is BROKEN SILENTLY: a deep
// link to a record whose prefix /play does not recognise loads the atlas's default tiling instead of
// failing. That is how the rhombic mixtures shipped unreachable by link on 2026-08-27. So this reads what
// is actually on disk rather than trusting any of the three.

const shards = BUBBLE_FILES.map((url) => {
	const path = `${process.cwd()}/public${url}`;
	return { url, rows: JSON.parse(readFileSync(path, "utf8")) as { id: string; k: number; grid: string }[] };
});

describe("bubble shards", () => {
	it("every shipped record's id is one /play will load the catalogue for", () => {
		const unmatched = new Set<string>();
		for (const { rows } of shards)
			for (const r of rows) if (!isBubbleId(r.id)) unmatched.add(r.id.replace(/-\d+-\d+$/, ""));
		expect([...unmatched]).toEqual([]);
	});

	it("every prefix is earned by a shipped record", () => {
		const used = new Set(shards.flatMap(({ rows }) => rows.map((r) => BUBBLE_ID_PREFIXES.find((p) => r.id.startsWith(p)))));
		expect(BUBBLE_ID_PREFIXES.filter((p) => !used.has(p))).toEqual([]);
	});

	it("every shipped grid is in the facet order, and every shard is non-empty", () => {
		for (const { url, rows } of shards) {
			expect(rows.length, `${url} is empty — a board with no rows is a folder with nothing in it`).toBeGreaterThan(0);
			for (const r of rows) expect(BUBBLE_GRID_ORDER, `${url} grid ${r.grid}`).toContain(r.grid);
		}
	});

	it("names each shard's k in its filename", () => {
		for (const { url, rows } of shards) {
			const k = Number(url.match(/-k(\d+)\.json$/)?.[1]);
			for (const r of rows) expect(r.k, url).toBe(k);
		}
	});
});
