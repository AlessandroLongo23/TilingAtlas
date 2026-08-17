#!/usr/bin/env node
// Re-encode shipped shelf files through the atlas container format (scripts/atlas/encode.mjs).
//
//   node scripts/atlas-compact.mjs                 # every public/reference-atlas*.json, dry run
//   node scripts/atlas-compact.mjs --write         # …and actually rewrite them
//   node scripts/atlas-compact.mjs --write public/reference-atlas-scaled-k7.json
//
// One-shot migration for files that already shipped. New output comes out packed because the builders
// call stringifyAtlas directly, so this is not part of any build.
//
// SAFETY, in order of how much they matter:
//   1. Every file is round-tripped IN MEMORY and compared deep-equal before anything is written. A
//      file that does not come back identical is reported and skipped, never written.
//   2. Files with UNSTAGED edits are skipped unless --force. Those are another session's in-flight
//      work and git holds no copy of them; a rewrite there is unrecoverable. Committed and staged
//      files are safe because their bytes are in the object store.
//   3. Writes go to a temp file and are renamed into place, so an interrupted run cannot leave a
//      half-written shelf behind.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { encodeAtlas, encodeShard, decodeAtlas, decodeShard, sameRecords } from "./atlas/encode.mjs";

const args = process.argv.slice(2);
const write = args.includes("--write");
const force = args.includes("--force");
const targets = args.filter((a) => !a.startsWith("--"));

const PUB = path.join(process.cwd(), "public");

/** Shelf directories whose files are RECORD ARRAYS. */
const SHELF_DIRS = [
	"isohedral-edges",
	"hyperbolic-edges",
	"colors",
	"freedraw",
	"hyperbolic-poly",
	"hyperbolic-colors",
	"pentagon-edges",
	"freedraw-ico",
	"spherical-colors",
	"hyperbolic-half",
	"penrose",
	"tri45",
	"vertex-configs",
];

/**
 * Shelf directories whose files WRAP their records under `patterns`, alongside board metadata the
 * renderer needs. Same tables, different on-disk shape — see encodeShard / decodeShard.
 */
const WRAPPED_DIRS = ["spherical-edges", "schwarz-sph", "schwarz-hyp"];

/** Wrapper files whose record array sits under a different key than `patterns`. */
const WRAPPER_KEY = { "vertex-configs": "configs" };

function defaultTargets() {
	const out = fs
		.readdirSync(PUB)
		.filter((f) => /^reference-atlas.*\.json$/.test(f))
		.sort()
		.map((f) => path.join(PUB, f));
	for (const dir of [...SHELF_DIRS, ...WRAPPED_DIRS]) {
		const p = path.join(PUB, dir);
		if (!fs.existsSync(p)) continue;
		for (const f of fs.readdirSync(p).filter((f) => f.endsWith(".json")).sort()) {
			out.push(path.join(p, f));
		}
	}
	return out;
}

const files = targets.length ? targets.map((t) => path.resolve(t)) : defaultTargets();

/** Paths git reports as modified-but-not-staged: another session's work, with no copy in the repo. */
function unstaged() {
	try {
		const out = execFileSync("git", ["status", "--porcelain", "--", "public"], { encoding: "utf8" });
		return new Set(
			out
				.split("\n")
				.filter((l) => l.length > 3 && l[1] === "M") // worktree differs from index
				.map((l) => path.resolve(l.slice(3).trim())),
		);
	} catch {
		return new Set();
	}
}

const risky = unstaged();
const MB = (n) => (n / 1e6).toFixed(1).padStart(7);

let before = 0;
let after = 0;
let packed = 0;
let skipped = 0;

for (const file of files) {
	const name = path.basename(file);
	if (!fs.existsSync(file)) {
		console.log(`${name.padEnd(38)} SKIP  no such file`);
		skipped++;
		continue;
	}
	if (risky.has(file) && !force) {
		console.log(`${name.padEnd(38)} SKIP  unstaged edits in another session (--force to override)`);
		skipped++;
		continue;
	}

	const rawText = fs.readFileSync(file, "utf8");
	// Decode first, so the script is IDEMPOTENT and can upgrade a file packed by an older version
	// (dict only) to the current one (dict + refs + geom). Bare legacy arrays come through unchanged.
	let parsed;
	try {
		parsed = JSON.parse(rawText);
	} catch {
		console.log(`${name.padEnd(38)} SKIP  not JSON`);
		skipped++;
		continue;
	}
	// Two on-disk shapes: the file IS a record array, or it WRAPS one under `patterns`.
	const key = WRAPPER_KEY[path.basename(path.dirname(file))] ?? "patterns";
	const wrapped = !Array.isArray(parsed) && Array.isArray(parsed?.[key]);
	let records;
	try {
		records = wrapped ? decodeShard(parsed, key)[key] : decodeAtlas(parsed);
	} catch {
		console.log(`${name.padEnd(38)} SKIP  not a shape this format owns`);
		skipped++;
		continue;
	}
	if (!Array.isArray(records)) {
		console.log(`${name.padEnd(38)} SKIP  not a record array`);
		skipped++;
		continue;
	}

	const decoded = wrapped ? { ...decodeShard(parsed, key), [key]: records } : records;
	const container = wrapped ? encodeShard(decoded, key) : encodeAtlas(records);
	if (wrapped ? container === decoded : Array.isArray(container)) {
		before += rawText.length;
		after += rawText.length;
		console.log(`${name.padEnd(38)} keep  ${MB(rawText.length)} MB  nothing worth hoisting`);
		continue;
	}

	// Safety 1: it has to come back the same, or it does not get written. Structural with a 1e-9
	// tolerance on coordinates, because the geom layer quantises — see sameRecords.
	const why = wrapped
		? sameRecords(records, decodeShard(container, key)[key]) ??
			(JSON.stringify({ ...decodeShard(container, key), [key]: 0 }) ===
			JSON.stringify({ ...decoded, [key]: 0 })
				? null
				: "wrapper metadata differs")
		: sameRecords(records, decodeAtlas(container));
	if (why) {
		console.log(`${name.padEnd(38)} FAIL  round trip differed (${why}) — NOT written`);
		skipped++;
		continue;
	}

	const outText = JSON.stringify(container);
	before += rawText.length;
	after += outText.length;
	packed++;
	const fields = [
		...Object.entries(container.dict ?? {}).map(([k, v]) => `${k}(${v.length})`),
		...Object.entries(container.refs ?? {}).map(([k, v]) => `${k}→${v.length}`),
		...Object.entries(container.elems ?? {}).map(([k, v]) => `${k}[]→${v.length}`),
		...(container.geom ? [`geom(${container.geom.s.length} shapes/${container.geom.v.length} anchors)`] : []),
	].join(",");
	console.log(
		`${name.padEnd(38)} ${write ? "pack " : "would"} ${MB(rawText.length)} ->${MB(outText.length)} MB  ${fields}`,
	);

	if (write) {
		// Safety 3: temp + rename, so an interrupt cannot truncate a shelf.
		const tmp = `${file}.tmp-compact`;
		fs.writeFileSync(tmp, outText);
		fs.renameSync(tmp, file);
	}
}

console.log("---");
console.log(
	`${packed} packed, ${skipped} skipped  |  ${MB(before)} MB -> ${MB(after)} MB  ` +
		`(saved ${MB(before - after)} MB, ${before ? ((100 * (before - after)) / before).toFixed(0) : 0}%)`,
);
if (!write) console.log("dry run — pass --write to apply");
