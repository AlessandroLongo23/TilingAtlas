#!/usr/bin/env node
// The Tiling Searcher's downloads on GitHub: count them, and publish a new build without losing the count.
//
//   node tools/searcher/release.mjs                     downloads per version and platform
//   node tools/searcher/release.mjs publish [notes.md]  record them, upload app/release/*, retitle the release
//
// publish also uploads version.json, the version and the notes' "What's new" lines, which the app asks for at
// launch to offer the update (electron/main.ts). Each ask counts as a download of it: the report lists those
// as update checks, a count of launches, apart from the downloads.
//
// GitHub counts downloads per release file, and publishing a build replaces the files (`--clobber` deletes
// and re-uploads), so the new files start from 0 and the old counts vanish with the old files. downloads.tsv
// keeps each file's last count, one row per file GitHub ever served, and `publish` records before it uploads.
// Downloads started from the atlas's buttons also show in Vercel Web Analytics, as views of
// /searcher/download/<os> (app/searcher/download/[os]/page.tsx).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LEDGER = join(HERE, "downloads.tsv");
const REPO = "AlessandroLongo23/TilingAtlas";
const TAG = "the-tiling-searcher-latest"; // the tag lib/downloads.ts links
const OURS = /^(the-tiling-searcher|tilesearch)-/;
const FILES = ["TheTilingSearcher-mac-arm64.zip", "TheTilingSearcher-windows-x64-setup.exe", "TheTilingSearcher-windows-x64.zip"];
const COLUMNS = ["id", "tag", "version", "file", "uploaded", "downloads", "checked"];
const HEADER = `# The Tiling Searcher's downloads on GitHub, one row per release file (tools/searcher/release.mjs).
# A row stops changing when a new build replaces its file. The files on ${TAG} before 0.4.0 were
# replaced before this ledger existed, so their downloads (29 October to 4 November 2026) are not here.`;

const gh = (...args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

/** Every file's row: the ledger's, updated with what GitHub serves now. Writes the ledger back. */
function record() {
	const rows = new Map();
	if (existsSync(LEDGER)) {
		const lines = readFileSync(LEDGER, "utf8").split("\n").filter((l) => l && !l.startsWith("#"));
		for (const line of lines.slice(1)) {
			const row = Object.fromEntries(line.split("\t").map((cell, i) => [COLUMNS[i], cell]));
			rows.set(row.id, { ...row, downloads: Number(row.downloads) });
		}
	}
	const checked = new Date().toISOString().slice(0, 10);
	for (const r of JSON.parse(gh("api", `repos/${REPO}/releases?per_page=100`))) {
		if (!OURS.test(r.tag_name)) continue;
		const version = r.name.match(/\d+(\.\d+)+/)?.[0] ?? "?";
		for (const a of r.assets) {
			const row = { id: String(a.id), tag: r.tag_name, version, file: a.name, uploaded: a.created_at.slice(0, 10) };
			rows.set(row.id, { ...row, downloads: a.download_count, checked });
		}
	}
	const sorted = [...rows.values()].sort((a, b) => a.uploaded.localeCompare(b.uploaded) || a.file.localeCompare(b.file));
	writeFileSync(LEDGER, [HEADER, COLUMNS.join("\t"), ...sorted.map((r) => COLUMNS.map((c) => r[c]).join("\t")), ""].join("\n"));
	return sorted;
}

function report(all) {
	const checks = all.filter((r) => r.file === "version.json").reduce((n, r) => n + r.downloads, 0);
	const rows = all.filter((r) => r.file !== "version.json");
	const platforms = ["macOS", "Windows"];
	const count = (version, platform) =>
		rows
			.filter((r) => (!version || r.version === version) && (!platform || (/mac/i.test(r.file) ? "macOS" : "Windows") === platform))
			.reduce((n, r) => n + r.downloads, 0);
	const line = (label, cells) => label.padEnd(9) + cells.map((c) => String(c).padStart(9)).join("");
	console.log(line("version", [...platforms, "all"]));
	for (const v of new Set(rows.map((r) => r.version))) console.log(line(v, [...platforms.map((p) => count(v, p)), count(v)]));
	console.log(line("all", [...platforms.map((p) => count(null, p)), count()]));
	console.log(`\nupdate checks (app launches since 0.4.1): ${checks}`);
}

function publish(notes) {
	const files = FILES.map((f) => join(HERE, "app", "release", f));
	const missing = files.filter((f) => !existsSync(f));
	if (missing.length) throw new Error(`build first (tools/searcher/app/build.sh mac, then win); missing:\n  ${missing.join("\n  ")}`);
	const { version } = JSON.parse(readFileSync(join(HERE, "app", "package.json"), "utf8"));
	const section = notes ? readFileSync(notes, "utf8").split(/^## /m).find((s) => s.startsWith("What's new")) : "";
	const whatsNew = (section ?? "").split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
	const versionFile = join(HERE, "app", "release", "version.json");
	writeFileSync(versionFile, JSON.stringify({ version, notes: whatsNew }, null, "\t") + "\n");
	record(); // before the upload, which deletes the files these counts belong to
	const upload = (paths) =>
		execFileSync("gh", ["release", "upload", TAG, ...paths, "--clobber", "--repo", REPO], { stdio: "inherit" });
	upload(files);
	upload([versionFile]); // last: an app that sees the new version finds its installer already there
	const notesArgs = notes ? ["--notes-file", notes] : [];
	execFileSync("gh", ["release", "edit", TAG, "--repo", REPO, "--title", `The Tiling Searcher ${version}`, ...notesArgs], { stdio: "inherit" });
}

const [command, notes] = process.argv.slice(2);
if (command === "publish") publish(notes);
else if (command) {
	console.error("usage: node tools/searcher/release.mjs [publish [notes.md]]");
	process.exit(1);
}
report(record());
