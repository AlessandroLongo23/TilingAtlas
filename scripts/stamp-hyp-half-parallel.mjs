/**
 * Parallel driver for scripts/stamp-hyp-poly-certification.ts over the HALVED-{p,q} shelf.
 *
 * Neither existing driver fits this shelf. The hyp-poly one deals whole shards to workers, which is fine
 * across 193 files and useless across 17 that run from 4 records to 15,443 — one worker would hold most
 * of the corpus. The developed-shelf one slices a single file. So this pools every record in
 * public/hyperbolic-half/, deals them round-robin into `jobs` slices, stamps each slice in its own
 * process, and writes the flags home by id.
 *
 * `certified` is CAPABILITY metadata, not catalogue policy: false means buildDirichletDomain refuses the
 * tiling (its deck orbit needs developing past the float64 rim) and the client should go straight to the
 * 2D developed renderer instead of paying a doomed attempt — median 210 ms, up to 1.2 s on the main
 * thread. Every tiling here is real and ships either way.
 *
 * ⚑ RE-EMITTING THE SHELF WIPES THESE FLAGS, because emit_hyp_half_shelf.py writes records that have
 * never carried one. That already happened once unnoticed: the 2026-08-14 run stamped {4,5} and {3,7}
 * (34 minutes), a later emit added the {5,4} board and rewrote all of them unstamped. Re-run this after
 * every emit, and check the count it prints.
 *
 * Usage: node scripts/stamp-hyp-half-parallel.mjs [jobs]
 */
import { readFileSync, writeFileSync, readdirSync, rmSync, appendFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DIR = join(ROOT, "public", "hyperbolic-half");
const jobs = Math.max(2, parseInt(process.argv[2] ?? "", 10) || os.cpus().length - 2);

const LOGDIR = join(ROOT, "experiments", "results");
mkdirSync(LOGDIR, { recursive: true });
const LOG = join(LOGDIR, `${new Date().toISOString().slice(0, 10)}-hyp-half-certification.log`);
const say = (line) => {
	const s = `[${new Date().toISOString().slice(11, 19)}] ${line}`;
	console.log(s);
	appendFileSync(LOG, s + "\n");
};

const files = readdirSync(DIR).filter((f) => f.startsWith("hyphalf-") && f.endsWith(".json")).sort();
const shards = files.map((f) => ({ f, rows: JSON.parse(readFileSync(join(DIR, f), "utf8")) }));
const flat = shards.flatMap((s) => s.rows);
if (new Set(flat.map((r) => r.id)).size !== flat.length) throw new Error("record ids are not unique");

// Round-robin across the POOLED records, so a 15,443-row shard and a 4-row one spread the same way.
const slices = Array.from({ length: jobs }, () => []);
flat.forEach((r, i) => slices[i % jobs].push(r));
const sliceFiles = slices.map((s, i) => {
	const f = join(os.tmpdir(), `hyphalf-stamp-${process.pid}-${i}.json`);
	writeFileSync(f, JSON.stringify(s));
	return f;
});

say(`${flat.length} tilings across ${files.length} shards -> ${jobs} slices`);
const t0 = Date.now();
await Promise.all(
	sliceFiles.map(
		(f, i) =>
			new Promise((res, rej) => {
				const child = spawn("pnpm", ["tsx", join(HERE, "stamp-hyp-poly-certification.ts"), f], {
					stdio: ["ignore", "ignore", "inherit"],
					cwd: ROOT,
				});
				child.on("exit", (code) => (code === 0 ? res() : rej(new Error(`slice ${i} exit ${code}`))));
			}),
	),
);
say(`stamped in ${Math.round((Date.now() - t0) / 1000)} s`);

const flag = new Map();
for (const f of sliceFiles) {
	for (const r of JSON.parse(readFileSync(f, "utf8"))) flag.set(r.id, r.certified);
	rmSync(f);
}
let ok = 0;
for (const s of shards) {
	for (const r of s.rows) {
		const c = flag.get(r.id);
		if (typeof c !== "boolean") throw new Error(`${r.id} came back unstamped`);
		r.certified = c;
		if (c) ok++;
	}
	writeFileSync(join(DIR, s.f), JSON.stringify(s.rows));
}
say(`${ok} / ${flat.length} certified for the per-pixel renderer; the rest take the 2D developed path`);
for (const s of shards) {
	const n = s.rows.filter((r) => r.certified).length;
	say(`  ${s.f.padEnd(30)} ${String(n).padStart(6)} / ${String(s.rows.length).padStart(6)}`);
}
