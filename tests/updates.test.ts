import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CURRENT_VERSION, KIND_LABEL, KIND_ORDER, UPDATES, type UpdateEntry } from "@/lib/updates/entries";
import { formatMonth, groupByMonth } from "@/lib/updates/grouping";
import { bumpBetween, compareVersions, isVersion, parseVersion, releaseLevel } from "@/lib/updates/version";
import { previewIdsIn, shouldAutoOpen, unseenSince } from "@/lib/updates/unseen";

// Guards for the update notes. Atlas ids are opaque strings — "ctrnact-07_34-5c2_5e_5f3_6f-1" is a
// real one — so a typo in an entry fails silently in the browser as a card that never appears. That
// is the main thing here; the ordering and markup checks are cheap and catch a hand-edit that the
// release ritual would otherwise ship.

const ATLAS_FILES = [
	"reference-atlas.json",
	"reference-atlas-composable.json",
	"reference-atlas-composable-k3.json",
	"reference-atlas-isotoxal.json",
	"reference-atlas-isotoxal-k3.json",
	"reference-atlas-isotoxal-k4.json",
	"reference-atlas-mixed.json",
	"reference-atlas-scaled.json",
	"reference-atlas-polyomino.json",
	"reference-atlas-islamic.json",
	"reference-atlas-hollow.json",
	"reference-atlas-hyperbolic.json",
	"reference-atlas-spherical.json",
];

function atlasIds(): Set<string> {
	const dir = path.join(process.cwd(), "public");
	const ids = new Set<string>();
	for (const name of ATLAS_FILES) {
		const file = path.join(dir, name);
		if (!existsSync(file)) continue;
		try {
			for (const t of JSON.parse(readFileSync(file, "utf8")) as { id?: string }[]) {
				if (t.id) ids.add(t.id);
			}
		} catch {
			// A shard that will not parse is another test's problem.
		}
	}
	return ids;
}

describe("update entries", () => {
	it("has at least one release, newest first", () => {
		expect(UPDATES.length).toBeGreaterThan(0);
		for (let i = 1; i < UPDATES.length; i++) {
			expect(
				compareVersions(UPDATES[i - 1].version, UPDATES[i].version),
				`${UPDATES[i - 1].version} must be newer than ${UPDATES[i].version}`,
			).toBeGreaterThan(0);
		}
	});

	it("never goes backwards in time", () => {
		for (let i = 1; i < UPDATES.length; i++) {
			expect(
				UPDATES[i - 1].date >= UPDATES[i].date,
				`${UPDATES[i - 1].version} (${UPDATES[i - 1].date}) predates ${UPDATES[i].version} (${UPDATES[i].date})`,
			).toBe(true);
		}
	});

	it("CURRENT_VERSION is the newest entry, and package.json agrees", () => {
		expect(CURRENT_VERSION).toBe(UPDATES[0].version);
		const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
		expect(pkg.version).toBe(CURRENT_VERSION);
	});

	it("every entry is well formed", () => {
		const seen = new Set<string>();
		for (const entry of UPDATES) {
			expect(isVersion(entry.version), `bad version ${entry.version}`).toBe(true);
			expect(seen.has(entry.version), `duplicate version ${entry.version}`).toBe(false);
			seen.add(entry.version);
			expect(entry.date, `bad date on ${entry.version}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(entry.commit, `bad commit on ${entry.version}`).toMatch(/^[0-9a-f]{7,40}$/);
			expect(entry.title.length, `empty title on ${entry.version}`).toBeGreaterThan(0);
			expect(entry.changes.length, `no changes on ${entry.version}`).toBeGreaterThan(0);
		}
	});

	it("every change is one line, bold-only, with a known kind", () => {
		for (const entry of UPDATES) {
			for (const change of entry.changes) {
				const where = `${entry.version}: ${change.text.slice(0, 40)}`;
				expect(KIND_ORDER, `unknown kind on ${where}`).toContain(change.kind);
				expect(change.text.includes("\n"), `multi-line change on ${where}`).toBe(false);
				// The modal renders **bold** and nothing else (components/updates/change-text.tsx).
				const withoutBold = change.text.replace(/\*\*[^*]+\*\*/g, "");
				expect(withoutBold.includes("*"), `stray markup on ${where}`).toBe(false);
				expect(withoutBold, `raw HTML or a link on ${where}`).not.toMatch(/<[a-z]|\]\(/i);
				// Bold pairs must close.
				expect((change.text.match(/\*\*/g) ?? []).length % 2, `unclosed bold on ${where}`).toBe(0);
			}
		}
	});

	it("every kind has a label", () => {
		for (const kind of KIND_ORDER) expect(KIND_LABEL[kind]?.length).toBeGreaterThan(0);
	});

	it("never mentions the unlisted /defense route", () => {
		for (const entry of UPDATES) {
			const blob = `${entry.title} ${entry.changes.map((c) => `${c.text} ${c.href ?? ""}`).join(" ")}`;
			expect(blob.toLowerCase(), `${entry.version} mentions defense`).not.toContain("defense");
		}
	});

	it("every href is an in-app absolute path", () => {
		for (const entry of UPDATES) {
			for (const change of entry.changes) {
				if (!change.href) continue;
				// Rooted, and not protocol-relative ("//host" would leave the site). A bare "/" is the
				// landing page and is fine.
				expect(change.href, `${entry.version}: ${change.href}`).toMatch(/^\/(?!\/)/);
			}
		}
	});

	it("every preview id exists in the atlas", () => {
		const ids = atlasIds();
		// Guard the guard: if the shards are absent (a lean checkout) this test would pass vacuously.
		expect(ids.size, "no atlas ids loaded — cannot validate preview ids").toBeGreaterThan(1000);
		for (const entry of UPDATES) {
			for (const change of entry.changes) {
				for (const id of change.tilings ?? []) {
					expect(ids.has(id), `${entry.version} references unknown tiling ${id}`).toBe(true);
				}
			}
		}
	});

	it("keeps preview strips small enough to read", () => {
		for (const entry of UPDATES) {
			for (const change of entry.changes) {
				expect((change.tilings ?? []).length, `${entry.version} has a preview gallery`).toBeLessThanOrEqual(4);
			}
		}
	});
});

describe("public/updates-cells.json", () => {
	const file = path.join(process.cwd(), "public", "updates-cells.json");

	it("covers only ids the modal can reach", () => {
		if (!existsSync(file)) {
			// Generated by `pnpm updates:data`, which `pnpm build` runs. Absent in a fresh checkout.
			return;
		}
		const cells = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
		// RECENT_RELEASES in scripts/gen-updates-data.ts.
		const reachable = new Set(previewIdsIn(UPDATES.slice(0, 6)));
		for (const id of Object.keys(cells)) {
			expect(reachable.has(id), `${id} is in updates-cells.json but no recent release uses it`).toBe(true);
		}
	});
});

describe("release level (the /updates index indentation)", () => {
	it("reads the kind off the version alone", () => {
		expect(releaseLevel("2.0.0")).toBe("major");
		expect(releaseLevel("1.0.0")).toBe("major");
		expect(releaseLevel("1.7.0")).toBe("minor");
		expect(releaseLevel("1.10.0")).toBe("minor");
		expect(releaseLevel("1.6.1")).toBe("patch");
		expect(releaseLevel("1.10.1")).toBe("patch");
	});

	it("agrees with the diff-based bump on every consecutive pair we ship", () => {
		// The indentation and the "feature release" label now come from the version alone. If that ever
		// disagreed with what actually changed between two releases, the page would misdescribe itself.
		for (let i = 0; i < UPDATES.length - 1; i++) {
			const older = UPDATES[i + 1].version;
			const newer = UPDATES[i].version;
			expect(releaseLevel(newer), `${older} → ${newer}`).toBe(bumpBetween(older, newer));
		}
	});
});

describe("month grouping (the /updates index dividers)", () => {
	const at = (date: string, version: string): UpdateEntry => ({
		version,
		date,
		title: "x",
		commit: "0000000",
		changes: [{ kind: "fix", text: "x" }],
	});

	it("splits across months and keeps the given order", () => {
		const groups = groupByMonth([
			at("2026-08-02", "2.0.0"),
			at("2026-07-29", "1.10.1"),
			at("2026-07-08", "1.0.0"),
			at("2025-05-31", "0.9.0"),
		]);
		expect(groups.map((g) => g.month)).toEqual(["August 2026", "July 2026", "May 2025"]);
		expect(groups.map((g) => g.items.length)).toEqual([1, 2, 1]);
		expect(groups[1].items.map((e) => e.version)).toEqual(["1.10.1", "1.0.0"]);
	});

	it("puts a single month in one group", () => {
		const groups = groupByMonth(UPDATES);
		expect(groups.length).toBeGreaterThan(0);
		expect(groups.flatMap((g) => g.items)).toHaveLength(UPDATES.length);
	});

	it("reads the month in UTC, so a late release does not slip", () => {
		// 23:00 local on the 31st in a positive-offset zone would otherwise roll into the next month.
		expect(formatMonth("2026-07-31")).toBe("July 2026");
		expect(formatMonth("2026-08-01")).toBe("August 2026");
	});

	it("is empty for no entries", () => {
		expect(groupByMonth([])).toEqual([]);
	});
});

describe("unseen logic", () => {
	const newest = UPDATES[0].version;

	it("shows a first visitor nothing", () => {
		expect(unseenSince(null)).toEqual([]);
		expect(shouldAutoOpen(null)).toBe(false);
	});

	it("shows a current visitor nothing", () => {
		expect(unseenSince(newest)).toEqual([]);
		expect(shouldAutoOpen(newest)).toBe(false);
	});

	it("treats a garbage marker as a first visit instead of throwing", () => {
		expect(() => unseenSince("not-a-version")).not.toThrow();
		expect(unseenSince("not-a-version")).toEqual([]);
		expect(shouldAutoOpen("banana")).toBe(false);
	});

	it("shows a marker ahead of this build nothing", () => {
		const [maj, min, pat] = parseVersion(newest);
		expect(unseenSince(`${maj + 1}.${min}.${pat}`)).toEqual([]);
	});

	it("returns exactly the releases newer than the marker", () => {
		if (UPDATES.length < 3) return;
		const marker = UPDATES[2].version;
		const unseen = unseenSince(marker);
		expect(unseen.map((e) => e.version)).toEqual([UPDATES[0].version, UPDATES[1].version]);
	});

	it("auto-opens for a MINOR but not for a PATCH", () => {
		// Constructed, not taken from the array, so this holds whatever ships next.
		const [maj, min, pat] = parseVersion(newest);
		expect(bumpBetween(`${maj}.${min}.${pat > 0 ? pat - 1 : pat}`, newest)).toBe(pat > 0 ? "patch" : "none");
		if (min > 0) {
			const olderMinor = `${maj}.${min - 1}.0`;
			expect(shouldAutoOpen(olderMinor), "a MINOR behind must open").toBe(true);
		}
		if (pat > 0) {
			const olderPatch = `${maj}.${min}.${pat - 1}`;
			expect(shouldAutoOpen(olderPatch), "a PATCH behind must NOT open").toBe(false);
		}
	});

	it("dedupes preview ids in order", () => {
		const ids = previewIdsIn(UPDATES);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
