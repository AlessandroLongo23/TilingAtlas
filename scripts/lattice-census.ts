/* OP-2/OP-9: Σ (seed,lattice) work items vs DISTINCT lattices, per holohedry class.
 * Run after a sweep with PS_LATTICE_CENSUS=1:  pnpm tsx scripts/lattice-census.ts 3
 *
 * PRECONDITION: delete stale lattice-census-k<k>.*.ndjson before a fresh census run — files
 * append across runs (a leftover file double-counts its seeds; see the duplicate-seed warning).
 *
 * NOTE: per-hol distinct sets are DISJOINT — a lattice has exactly one holohedry class, so the
 * ALL row's distinct count equals the sum of the per-hol counts. We compute the union anyway
 * (cheap, self-checking). */
import fs from 'node:fs';
const k = process.argv[2] ?? '3';
if (!fs.existsSync('.scout-cache')) {
	console.error(`no census files for k=${k} in .scout-cache/ (run with PS_LATTICE_CENSUS=1)`);
	process.exit(1);
}
const files = fs.readdirSync('.scout-cache').filter((f) => f.startsWith(`lattice-census-k${k}.`));
if (files.length === 0) { console.error(`no census files for k=${k} in .scout-cache/ (run with PS_LATTICE_CENSUS=1)`); process.exit(1); }
const sigma = new Map<number, number>();
const distinct = new Map<number, Set<string>>();
const seedCount = new Map<string, number>(); // keyed on the DISPLAY NAME, which is NOT unique across concrete seeds (distinct (rot,refl) seed maps and orbit-equivalent VC permutations share a name), so a repeat is expected and benign — NOT a staleness signal on its own
let seeds = 0;
for (const f of files) {
	const lines = fs.readFileSync(`.scout-cache/${f}`, 'utf8').split('\n');
	for (let i = 0; i < lines.length; i++) {
		if (!lines[i].trim()) continue;
		let r: { seed: string; lattices: { key: string; hol: number }[] };
		try {
			r = JSON.parse(lines[i]);
		} catch {
			console.error(`malformed NDJSON at ${f}:${i + 1} — truncated write? delete the file and re-run the census`);
			process.exit(1);
		}
		seeds++;
		seedCount.set(r.seed, (seedCount.get(r.seed) ?? 0) + 1);
		for (const { key, hol } of r.lattices) {
			sigma.set(hol, (sigma.get(hol) ?? 0) + 1);
			let d = distinct.get(hol);
			if (!d) { d = new Set(); distinct.set(hol, d); }
			d.add(key);
		}
	}
}
// Note only (no exit): the census keys on DISPLAY NAMES, which are non-unique across concrete
// seeds — repeated names are EXPECTED (many solve-calls share a name), not a staleness signal.
// Σ/multiplicity count per solve-call (correct); the distinct lattice sets stay correct regardless.
// A true staleness signal is solve-calls exceeding the known seed count for the run, not this.
const repeats = seeds - seedCount.size;
if (repeats > 0) console.error(`note: ${seeds} solve-calls span ${seedCount.size} distinct display names (${repeats} name repeats — benign; names are non-unique across concrete seeds). Delete stale lattice-census-k${k}.* only if solve-calls exceeds the run's known seed count.`);
console.log(`k=${k}  solve-calls=${seeds}  distinct-names=${seedCount.size}  files=${files.length}`);
console.log('hol | Σ work items | distinct lattices | multiplicity');
for (const hol of [...sigma.keys()].sort((a, b) => a - b)) {
	const s = sigma.get(hol)!, d = distinct.get(hol)!.size;
	console.log(`${String(hol).padStart(3)} | ${String(s).padStart(12)} | ${String(d).padStart(17)} | ${(s / d).toFixed(1)}×`);
}
const S = [...sigma.values()].reduce((a, b) => a + b, 0);
const D = new Set([...distinct.values()].flatMap((x) => [...x])).size;
console.log(`ALL | ${String(S).padStart(12)} | ${String(D).padStart(17)} | ${(S / D).toFixed(1)}×`);
