/**
 * Parallel driver for scripts/stamp-hyperbolic-certification.ts.
 *
 * Splits public/hyperbolic-developed.json into N slices, stamps each in its own process (the stamp
 * script takes a path argument and rewrites it in place), then merges the slices back in order.
 * Certification is pure per-patch work, so slicing is safe; N defaults to cores-2. A 28k shelf stamps
 * in ~15 min instead of ~80.
 *
 * Usage: node scripts/stamp-hyperbolic-parallel.mjs [jobs]
 */
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const target = join(HERE, "..", "public", "hyperbolic-developed.json");
const jobs = Math.max(2, parseInt(process.argv[2] ?? "", 10) || os.cpus().length - 2);

const atlas = JSON.parse(readFileSync(target, "utf8"));
const slices = Array.from({ length: jobs }, () => []);
atlas.forEach((p, i) => slices[i % jobs].push(p));
const sliceFiles = slices.map((s, i) => {
	const f = join(os.tmpdir(), `hyp-stamp-slice-${process.pid}-${i}.json`);
	writeFileSync(f, JSON.stringify(s));
	return f;
});

console.log(`${atlas.length} patches -> ${jobs} slices`);
const t0 = Date.now();
await Promise.all(
	sliceFiles.map(
		(f, i) =>
			new Promise((res, rej) => {
				const child = spawn("pnpm", ["tsx", join(HERE, "stamp-hyperbolic-certification.ts"), f], {
					stdio: ["ignore", "inherit", "inherit"],
					cwd: join(HERE, ".."),
				});
				child.on("exit", (code) => (code === 0 ? res() : rej(new Error(`slice ${i} exit ${code}`))));
			}),
	),
);

// merge back in original order: slice files were dealt round-robin, so re-interleave by index
const stamped = sliceFiles.map((f) => JSON.parse(readFileSync(f, "utf8")));
const merged = atlas.map((_, i) => stamped[i % jobs][Math.floor(i / jobs)]);
const c = merged.filter((p) => p.certified === true).length;
writeFileSync(target, JSON.stringify(merged));
sliceFiles.forEach((f) => rmSync(f, { force: true }));
console.log(
	`${target}: ${merged.length} patches, ${c} certified, ${merged.length - c} on the 2D path ` +
		`(${((Date.now() - t0) / 1000).toFixed(0)}s on ${jobs} workers)`,
);
