import { describe, expect, it } from "vitest";
import { UPDATES, KIND_LABEL } from "@/lib/updates/entries";
import { buildPayload, linkBold, pendingReleases, renderChange, renderEntry } from "@/scripts/announce-release";

// The Discord announcement is written once and then fires unattended, so what it can get wrong it
// gets wrong silently in a channel nobody is watching at the time. These lock the two things that
// would be invisible: a line that loses its link, and a message Discord refuses for length.
const SITE = "https://example.test";

describe("linkBold", () => {
	it("wraps the first bold noun and leaves the rest of the line alone", () => {
		expect(linkBold("**Nine polyform boards** replace the shelf.", "u")).toBe(
			"[**Nine polyform boards**](u) replace the shelf.",
		);
	});

	it("answers null when there is no bold to carry the link", () => {
		expect(linkBold("no bold here", "u")).toBeNull();
	});
});

describe("renderChange", () => {
	it("links the key noun at the change's own href", () => {
		const line = renderChange({ kind: "fix", text: "**A board survives Copy link**, now.", href: "/library" }, SITE);
		expect(line).toBe("- [**A board survives Copy link**](https://example.test/library), now.");
	});

	it("falls back to the first example tiling when there is no href", () => {
		const line = renderChange({ kind: "content", text: "**Nine boards** land.", tilings: ["a-1", "b-2"] }, SITE);
		expect(line).toContain("[**Nine boards**](https://example.test/play?tiling=a-1)");
		// The first id is spent on the noun, so the numbered examples start at 2 and never repeat it.
		expect(line).toContain("examples: [2](https://example.test/play?tiling=b-2)");
		expect(line).not.toContain("[1](");
	});

	it("keeps the link on a line with no bold instead of dropping it", () => {
		const line = renderChange({ kind: "perf", text: "plain line", href: "/play" }, SITE);
		expect(line).toBe("- plain line ([open](https://example.test/play))");
	});

	it("carries items as sub-bullets", () => {
		const line = renderChange({ kind: "content", text: "**X** y.", items: ["one", "two"] }, SITE);
		expect(line).toBe("- **X** y.\n  - one\n  - two");
	});
});

describe("the live entry", () => {
	const entry = UPDATES[0];

	it("renders every change, grouped under the same labels the site uses", () => {
		const body = renderEntry(entry, SITE);
		const kinds = new Set(entry.changes.map((c) => c.kind));
		for (const kind of kinds) expect(body).toContain(`**${KIND_LABEL[kind]}**`);
		// Nothing silently dropped: one bullet per change, since every change starts a "- " line.
		expect(body.split("\n").filter((l) => l.startsWith("- ")).length).toBe(entry.changes.length);
	});

	it("fits inside Discord's limits", () => {
		const payload = buildPayload(entry, SITE) as { embeds: { title: string; description: string }[] };
		const embed = payload.embeds[0];
		expect(embed.description.length).toBeLessThanOrEqual(4096);
		expect(embed.title.length).toBeLessThanOrEqual(256);
		expect(JSON.stringify(payload).length).toBeLessThanOrEqual(6000);
	});

	it("points its links at the site it was given, never at a bare path", () => {
		const body = renderEntry(entry, SITE);
		expect(body).not.toMatch(/\]\(\//);
	});
});

describe("truncation", () => {
	it("drops whole groups and says where the rest is", () => {
		const long = {
			version: "9.9.9",
			date: "2026-01-01",
			commit: "abc1234",
			title: "Long",
			changes: [
				{ kind: "content" as const, text: `**A** ${"x".repeat(1900)}` },
				{ kind: "fix" as const, text: `**B** ${"y".repeat(1900)}` },
			],
		};
		const body = renderEntry(long, SITE);
		expect(body.length).toBeLessThanOrEqual(3800);
		expect(body).toContain("The rest of this release is on the site.");
		expect(body).toContain("**A**");
		expect(body).not.toContain("**B**");
	});
});

describe("a group larger than the whole budget", () => {
	it("still carries content, never just the link out", () => {
		const body = renderEntry(
			{
				version: "9.9.9",
				date: "2026-01-01",
				commit: "abc1234",
				title: "Huge",
				changes: [{ kind: "content" as const, text: `**A** ${"x".repeat(5000)}` }],
			},
			SITE,
		);
		expect(body.length).toBeLessThanOrEqual(3800);
		expect(body).toContain("**A**");
		expect(body).toContain("The rest of this release is on the site.");
	});
});

describe("pendingReleases", () => {
	const at = (version: string) => ({ version, date: "2026-01-01", commit: "abc1234", title: version, changes: [] });
	// Newest first, as UPDATES is.
	const updates = [at("1.38.0"), at("1.37.0"), at("1.36.0"), at("1.35.0"), at("1.34.0")];

	it("announces every release a push carries, oldest first", () => {
		expect(pendingReleases(updates, "1.35.0").map((u) => u.version)).toEqual(["1.36.0", "1.37.0", "1.38.0"]);
	});

	it("announces nothing when the push carries no release", () => {
		expect(pendingReleases(updates, "1.38.0")).toEqual([]);
	});

	it("posts only the newest when the previous version is unknown, never the whole history", () => {
		expect(pendingReleases(updates, null).map((u) => u.version)).toEqual(["1.38.0"]);
	});

	it("orders by version, not string order", () => {
		expect(pendingReleases([at("1.10.0"), at("1.9.0")], "1.8.0").map((u) => u.version)).toEqual(["1.9.0", "1.10.0"]);
	});
});
