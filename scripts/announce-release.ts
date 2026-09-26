// Post release notes to the Discord updates channel.
//
//   pnpm updates:announce --dry-run              render the newest, post nothing
//   pnpm updates:announce --after 1.35.0         post every release newer than 1.35.0, oldest first
//   pnpm updates:announce --since <sha>          the same, taking the version <sha> served
//   pnpm updates:announce --site https://…       override the site the links point at
//
// Run by .github/workflows/release-discord.yml once the deploy is live, with --after set to the
// version the site served BEFORE the push. EVERY RELEASE GETS ITS OWN MESSAGE, IN ORDER (AL,
// 2026-09-24): a push that carries three releases posts three messages, oldest first, and one that
// carries none posts nothing. With no --after and no --since only the newest is posted, so a
// hand run can never replay the whole history into the channel.
//
// TEXT AND LINKS ONLY (AL, 2026-09-21). The previews on /updates are vector cells drawn in the
// browser and there is no raster of them anywhere, so nothing here tries to send a picture. Each
// change's key noun becomes the link instead, which is the one piece of markup the notes already
// carry: the house style bolds exactly one noun per line, so there is always something to link and
// never any ambiguity about what to link. Extra example tilings follow as numbered links.
//
// The message is one embed. Discord renders **bold** and [text](url) inside an embed description,
// which is the whole of the notes' markup, so the lines arrive as written.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { UPDATES, KIND_ORDER, KIND_LABEL, type Change, type UpdateEntry } from "@/lib/updates/entries";
import { compareVersions, releaseLevel } from "@/lib/updates/version";

/** The site the links point at. Overridden by --site or SITE_URL; no trailing slash. */
const DEFAULT_SITE = "https://the-tiling-atlas.vercel.app";

/** Discord's own ceilings. An embed description is 4096; stop well short and say so in the message. */
const DESCRIPTION_MAX = 3800;

/** Matches the /updates page's wording for the release level, so the two never drift apart. */
const BUMP_LABEL: Record<string, string> = {
	major: "major release",
	minor: "feature release",
	patch: "update",
};

const site = (raw: string): string => raw.replace(/\/+$/, "");

const hrefUrl = (base: string, href: string): string =>
	href.startsWith("http") ? href : `${base}${href.startsWith("/") ? "" : "/"}${href}`;

const tilingUrl = (base: string, id: string): string => `${base}/play?tiling=${encodeURIComponent(id)}`;

/**
 * Wrap the line's bold noun in a link. The notes bold exactly one noun per line and nothing else
 * (the house rules in lib/updates/entries.ts, which tests/updates.test.ts enforces), so the first
 * `**…**` is the subject of the sentence and the right thing to make clickable. A line that somehow
 * carries no bold is returned untouched and its link is appended by the caller instead.
 */
export function linkBold(text: string, url: string): string | null {
	const m = /\*\*(.+?)\*\*/.exec(text);
	if (!m) return null;
	return `${text.slice(0, m.index)}[**${m[1]}**](${url})${text.slice(m.index + m[0].length)}`;
}

/** One change as a Discord bullet: the linked line, its sub-items, then any extra examples. */
export function renderChange(change: Change, base: string): string {
	const ids = change.tilings ?? [];
	// The key noun links to the change's own href when it has one; otherwise it stands in for the
	// first example tiling, so a content change still leads somewhere without an href of its own.
	const primary = change.href ? hrefUrl(base, change.href) : ids.length ? tilingUrl(base, ids[0]) : null;
	const linked = primary ? linkBold(change.text, primary) : null;
	let line = `- ${linked ?? change.text}`;
	// A line with no bold to carry the link keeps the link rather than losing it.
	if (primary && !linked) line += ` ([open](${primary}))`;

	for (const item of change.items ?? []) line += `\n  - ${item}`;

	// The first id is already the link when there was no href, so numbering starts past it.
	const extras = change.href ? ids : ids.slice(1);
	if (extras.length) {
		const offset = change.href ? 1 : 2;
		line += `\n  examples: ${extras.map((id, i) => `[${i + offset}](${tilingUrl(base, id)})`).join(" ")}`;
	}
	return line;
}

/** The embed description: the entry's changes, grouped and ordered exactly as /updates groups them. */
export function renderEntry(entry: UpdateEntry, base: string): string {
	const blocks: string[] = [];
	for (const kind of KIND_ORDER) {
		const changes = entry.changes.filter((c) => c.kind === kind);
		if (!changes.length) continue;
		blocks.push(`**${KIND_LABEL[kind]}**\n${changes.map((c) => renderChange(c, base)).join("\n")}`);
	}

	const full = blocks.join("\n\n");
	if (full.length <= DESCRIPTION_MAX) return full;

	// Too long for one embed. Drop whole blocks from the end, never half a block, and say what was
	// dropped: a message that silently stops mid-list reads as a bug.
	const kept: string[] = [];
	let used = 0;
	const tail = `\n\n[The rest of this release is on the site.](${base}/updates)`;
	for (const block of blocks) {
		if (used + block.length + tail.length > DESCRIPTION_MAX) break;
		kept.push(block);
		used += block.length + 2;
	}
	// A first group larger than the whole budget would leave a message that is nothing but the link
	// out. Cut inside it instead, at a line boundary, so what arrives is whole lines and no half-
	// written link. Only a single change longer than ~3.7 KB reaches this, which the house rules
	// already forbid, so it is a floor and not a path anything should take.
	if (!kept.length) {
		const room = DESCRIPTION_MAX - tail.length;
		const head: string[] = [];
		let n = 0;
		for (const line of blocks[0].split("\n")) {
			if (n + line.length + 1 > room) break;
			head.push(line);
			n += line.length + 1;
		}
		// Whole lines are preferred, but a group heading on its own says nothing. If not one bullet
		// survived, cut mid-line instead: a clipped sentence beats a message that names a section and
		// then shows none of it.
		const whole = head.join("\n");
		return (head.some((l) => l.startsWith("- ")) ? whole : `${blocks[0].slice(0, room - 1)}…`) + tail;
	}
	return kept.join("\n\n") + tail;
}

export function buildPayload(entry: UpdateEntry, base: string): unknown {
	return {
		username: "Tiling Atlas",
		embeds: [
			{
				title: entry.title,
				url: `${base}/updates`,
				description: renderEntry(entry, base),
				footer: { text: `v${entry.version} · ${BUMP_LABEL[releaseLevel(entry.version)]}` },
				timestamp: new Date(`${entry.date}T12:00:00Z`).toISOString(),
			},
		],
	};
}

/**
 * The releases to announce, OLDEST FIRST, which is the order they go out in.
 *
 * `after` is the newest version the site served before this push. Null means that is unknown (a first
 * push, or a hand run with no bound), and then only the newest entry qualifies: replaying every
 * release since 1.0.0 into the channel is the one failure worse than missing a message.
 */
export function pendingReleases(updates: readonly UpdateEntry[], after: string | null): UpdateEntry[] {
	if (!updates.length) return [];
	if (after === null) return [updates[0]];
	return updates.filter((u) => compareVersions(u.version, after) > 0).sort((a, b) => compareVersions(a.version, b.version));
}

/**
 * POST one message and wait until Discord has created it (`wait=true`), so the next one cannot
 * overtake it. A 429 is Discord asking for a pause, not a failure: it says how long, and the same
 * message is sent again after that.
 */
async function post(webhook: string, payload: unknown): Promise<void> {
	const url = `${webhook}${webhook.includes("?") ? "&" : "?"}wait=true`;
	for (let attempt = 0; attempt < 5; attempt++) {
		const res = await fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
		});
		if (res.ok) return;
		if (res.status === 429) {
			const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
			await new Promise((r) => setTimeout(r, Math.ceil((body.retry_after ?? 2) * 1000) + 250));
			continue;
		}
		throw new Error(`Discord answered ${res.status} ${res.statusText}\n${await res.text()}`);
	}
	throw new Error("Discord kept rate-limiting after 5 attempts");
}

/** The newest version recorded at a past commit, or null if the file was not there yet. */
function versionAt(sha: string): string | null {
	try {
		const src = execFileSync("git", ["show", `${sha}:lib/updates/entries.ts`], { encoding: "utf8" });
		// UPDATES is newest-first, so the first version literal in the file is the release it served.
		return /version:\s*"(\d+\.\d+\.\d+)"/.exec(src)?.[1] ?? null;
	} catch {
		return null;
	}
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const flag = (name: string): string | null => {
		const i = args.indexOf(name);
		return i >= 0 ? (args[i + 1] ?? null) : null;
	};
	const dryRun = args.includes("--dry-run");
	const base = site(flag("--site") ?? process.env.SITE_URL ?? DEFAULT_SITE);
	const since = flag("--since");
	const after = flag("--after") || (since ? versionAt(since) : null);

	const entries = pendingReleases(UPDATES, after);
	if (!entries.length) {
		console.log(`announce: nothing newer than v${after}; nothing to post`);
		return;
	}
	console.log(`announce: ${after ?? "(unbounded)"} → ${entries.map((e) => e.version).join(", ")}`);

	if (dryRun) {
		for (const e of entries) console.log(JSON.stringify(buildPayload(e, base), null, 2));
		return;
	}

	const webhook = process.env.DISCORD_WEBHOOK_URL;
	if (!webhook) {
		console.error("announce: DISCORD_WEBHOOK_URL is not set");
		process.exit(1);
	}

	for (const [i, entry] of entries.entries()) {
		try {
			await post(webhook, buildPayload(entry, base));
		} catch (e) {
			// Say exactly what went out, so a rerun can start past it with --after.
			const sent = entries.slice(0, i).map((x) => x.version);
			console.error(`announce: v${entry.version} failed; already posted: ${sent.join(", ") || "none"}`);
			throw e;
		}
		console.log(`announce: posted v${entry.version} (${entry.title})`);
		// A beat between messages, well inside the webhook's rate limit, so a burst never meets a 429.
		if (i < entries.length - 1) await new Promise((r) => setTimeout(r, 1500));
	}
}

// Only when run as a command. tests/announce-release.test.ts imports the renderers above, and an
// unguarded main() would try to post a release note from the test run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((e) => {
		console.error(`announce: ${(e as Error).message}`);
		process.exit(1);
	});
}
