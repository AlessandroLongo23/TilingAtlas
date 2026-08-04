/**
 * Parallel driver for scripts/stamp-hyp-poly-certification.ts.
 *
 * Unlike the developed-shelf driver (which slices ONE json and merges the pieces back), hyp-poly is
 * already 193 shards, so each worker just takes a disjoint set of whole files and rewrites them in
 * place. No merge step, and a crashed worker can only affect its own shards.
 *
 * Shards are bin-packed by estimated cost, not by count: certification time grows steeply with k
 * (~9 ms/tiling at k=1, ~750 ms at k=34), so a naive round-robin leaves one worker holding every deep
 * board. Cost is modelled as rows × k², which is enough to balance the tail.
 *
 * Progress is appended to experiments/results/<date>-hyp-poly-certification.log as it runs, so the run
 * can be watched from another shell.
 *
 * Usage: node scripts/stamp-hyp-poly-parallel.mjs [jobs] [--skip-stamped]
 */
import { readFileSync, readdirSync, appendFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DIR = join(ROOT, "public", "hyperbolic-poly");
const argv = process.argv.slice(2);
const skipStamped = argv.includes("--skip-stamped");
const jobs = Math.max(2, parseInt(argv.find((a) => !a.startsWith("--")) ?? "", 10) || os.cpus().length - 2);

const LOGDIR = join(ROOT, "experiments", "results");
mkdirSync(LOGDIR, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const LOG = join(LOGDIR, `${stamp}-hyp-poly-certification.log`);
const say = (line) => {
	const s = `[${new Date().toISOString().slice(11, 19)}] ${line}`;
	console.log(s);
	appendFileSync(LOG, s + "\n");
};

// weigh each shard by rows × k² so the deep boards spread across workers
const shards = readdirSync(DIR)
	.filter((f) => f.endsWith(".json"))
	.map((f) => {
		const rows = JSON.parse(readFileSync(join(DIR, f), "utf8"));
		const k = rows[0]?.k ?? 1;
		const done = rows.length > 0 && rows.every((r) => typeof r.certified === "boolean");
		return { f, n: rows.length, k, done, w: rows.length * k * k };
	})
	.filter((s) => !(skipStamped && s.done))
	.sort((a, b) => b.w - a.w);

const totalRows = shards.reduce((s, x) => s + x.n, 0);
say(`hyp-poly certification stamp: ${shards.length} shards, ${totalRows} tilings, ${jobs} workers`);
say(`log: ${LOG}`);

// greedy longest-processing-time bin packing
const bins = Array.from({ length: jobs }, () => ({ w: 0, files: [], rows: 0 }));
for (const s of shards) {
	const b = bins.reduce((m, x) => (x.w < m.w ? x : m), bins[0]);
	b.w += s.w;
	b.files.push(join(DIR, s.f));
	b.rows += s.n;
}
bins.forEach((b, i) => say(`  worker ${i}: ${b.files.length} shards, ${b.rows} tilings`));

const t0 = Date.now();
let doneRows = 0;
const results = await Promise.all(
	bins
		.filter((b) => b.files.length)
		.map(
			(b, i) =>
				new Promise((res) => {
					const child = spawn(
						"pnpm",
						["tsx", join(HERE, "stamp-hyp-poly-certification.ts"), ...(skipStamped ? ["--skip-stamped"] : []), ...b.files],
						{ cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
					);
					let tail = "";
					child.stdout.on("data", (d) => {
						for (const line of String(d).split("\n")) {
							const m = line.match(/\]\s+(\S+\.json)\s+(\d+) rows/);
							if (m) {
								doneRows += Number(m[2]);
								const el = (Date.now() - t0) / 1000;
								const pct = (doneRows / totalRows) * 100;
								const eta = doneRows > 0 ? (el / doneRows) * (totalRows - doneRows) : 0;
								say(
									`w${i} ${m[1]} (+${m[2]})  ${doneRows}/${totalRows} = ${pct.toFixed(1)}%  elapsed ${(el / 60).toFixed(1)}m  ETA ${(eta / 60).toFixed(1)}m`,
								);
							} else if (line.includes("certified for the per-pixel")) tail = line.trim();
						}
					});
					child.stderr.on("data", (d) => process.stderr.write(d));
					child.on("exit", (code) => {
						say(`worker ${i} exit ${code}${tail ? ` :: ${tail}` : ""}`);
						res(code);
					});
				}),
		),
);

const bad = results.filter((c) => c !== 0).length;
say(`\ndone in ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min, ${bad} worker(s) failed`);

// final census straight off disk
let cert = 0;
let unc = 0;
let missing = 0;
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
	for (const r of JSON.parse(readFileSync(join(DIR, f), "utf8"))) {
		if (r.certified === true) cert++;
		else if (r.certified === false) unc++;
		else missing++;
	}
}
say(`corpus: ${cert} certified, ${unc} on the 2D path, ${missing} unstamped`);
process.exit(bad ? 1 : 0);
