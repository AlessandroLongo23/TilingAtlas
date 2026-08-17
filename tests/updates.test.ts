import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CURRENT_VERSION, KIND_LABEL, KIND_ORDER, UPDATES, type UpdateEntry } from "@/lib/updates/entries";
import { formatMonth, groupByMonth } from "@/lib/updates/grouping";
import { bumpBetween, compareVersions, isVersion, parseVersion, releaseLevel } from "@/lib/updates/version";
import { shelfPreviewCell } from "@/lib/updates/preview-cells";
import { parseShelfPreviewId, previewHref } from "@/lib/updates/preview-ids";
import { previewIdsIn, shouldAutoOpen, unseenSince } from "@/lib/updates/unseen";
import { decodeAtlas } from "@/lib/services/atlasCodec";

// Guards for the update notes. Atlas ids are opaque strings — "ctrnact-07_34-5c2_5e_5f3_6f-1" is a
// real one — so a typo in an entry fails silently in the browser as a card that never appears. That
// is the main thing here; the ordering and markup checks are cheap and catch a hand-edit that the
// release ritual would otherwise ship.

// Every reference shard on disk, found rather than listed. A hardcoded list is a fourth place to
// remember a new shelf in, and the failure it causes is a preview id that is real but reads as a typo.
function atlasIds(): Set<string> {
	const dir = path.join(process.cwd(), "public");
	const ids = new Set<string>();
	for (const name of readdirSync(dir)) {
		if (!/^reference-atlas.*\.json$/.test(name)) continue;
		try {
			// decodeAtlas, not a bare JSON.parse: the shelves are moving to the packed container format
			// ({atlas, dict, records}), and a packed file read as an array yields no ids at all — which
			// reads here as "1.27.1 references unknown tiling", i.e. a real preview id looking like a typo.
			for (const t of decodeAtlas<{ id?: string }>(JSON.parse(readFileSync(path.join(dir, name), "utf8")))) {
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
				// The lead line and every bullet under it go through the same renderer, so they live
				// under the same rules.
				for (const line of [change.text, ...(change.items ?? [])]) {
					expect(line.includes("\n"), `multi-line change on ${where}`).toBe(false);
					// The modal renders **bold** and nothing else (components/updates/change-text.tsx).
					const withoutBold = line.replace(/\*\*[^*]+\*\*/g, "");
					expect(withoutBold.includes("*"), `stray markup on ${where}`).toBe(false);
					expect(withoutBold, `raw HTML or a link on ${where}`).not.toMatch(/<[a-z]|\]\(/i);
					// Bold pairs must close.
					expect((line.match(/\*\*/g) ?? []).length % 2, `unclosed bold on ${where}`).toBe(0);
				}
				expect((change.items ?? []).length, `bullet wall on ${where}`).toBeLessThanOrEqual(6);
				expect(
					(change.items ?? []).some((i) => i.trim().length === 0),
					`empty bullet on ${where}`,
				).toBe(false);
			}
		}
	});

	it("carries no em dashes", () => {
		// AL's standing rule for anything a reader sees. The house shape here is "**key noun** —
		// gloss", which is exactly where the dash keeps creeping back in: use a colon, a comma, a
		// semicolon, or split the sentence. Catches the `--` stand-in too.
		for (const entry of UPDATES) {
			for (const line of [entry.title, ...entry.changes.flatMap((c) => [c.text, ...(c.items ?? [])])]) {
				expect(line, `em dash in "${line.slice(0, 60)}"`).not.toMatch(/—|--/);
			}
		}
	});

	it("every kind has a label", () => {
		for (const kind of KIND_ORDER) expect(KIND_LABEL[kind]?.length).toBeGreaterThan(0);
	});

	it("never mentions the unlisted /defense route", () => {
		for (const entry of UPDATES) {
			const blob = `${entry.title} ${entry.changes
				.map((c) => `${c.text} ${(c.items ?? []).join(" ")} ${c.href ?? ""}`)
				.join(" ")}`;
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

	it("every preview id resolves, in the atlas or on a shelf", () => {
		const ids = atlasIds();
		// Guard the guard: if the shards are absent (a lean checkout) this test would pass vacuously.
		expect(ids.size, "no atlas ids loaded — cannot validate preview ids").toBeGreaterThan(1000);
		for (const entry of UPDATES) {
			for (const change of entry.changes) {
				for (const id of change.tilings ?? []) {
					// A shelf id names a type on /isohedral or /pentagons, which ship no shard and solve
					// their geometry instead — so the check is that the builder answers for it, not that
					// a shard holds it. shelfPreviewCell returns null for a type that does not exist, one
					// of the twelve marked isohedral types, and a pentagon with no derived unit.
					if (parseShelfPreviewId(id)) {
						expect(shelfPreviewCell(id), `${entry.version}: ${id} builds no cell`).not.toBe(null);
						continue;
					}
					expect(ids.has(id), `${entry.version} references unknown tiling ${id}`).toBe(true);
				}
			}
		}
	});

	it("sends every preview somewhere that can show it", () => {
		// The failure this catches is a shelf preview keeping /play's deep-link: /play reads the atlas,
		// so "pentagon-t15" would land on a page that cannot find it.
		for (const entry of UPDATES) {
			for (const change of entry.changes) {
				for (const id of change.tilings ?? []) {
					const href = previewHref(id);
					const shelf = parseShelfPreviewId(id);
					if (shelf) {
						expect(href, `${id} still points at /play`).toMatch(
							shelf.kind === "pentagon" ? /^\/pentagons\?type=\d+$/ : /^\/isohedral\?type=IH\d{2}$/,
						);
					} else {
						expect(href, `${id} should deep-link to /play`).toContain("/play?");
					}
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
