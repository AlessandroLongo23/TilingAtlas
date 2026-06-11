/**
 * F3b cap-discharge harness: targeted A/B comparison for seeds whose (seed,lattice) pairs need
 * block index range > BLOCK_INDEX_CAP.
 *
 * PURPOSE
 * -------
 * After the f3b-cap-census identifies the affected seeds (see experiments/results/f3b-cap-census-*.log),
 * this harness re-solves ONLY those seeds twice:
 *   (a) stock  — standard BLOCK_INDEX_CAP, reveals which cells (if any) are dropped
 *   (b) raised — a scratch checkout with BLOCK_INDEX_CAP raised to the proposed new cap, to verify
 *                that no additional tilings appear (proving the cap is non-binding for the oracle set)
 * It then byte-compares the emitted canonicalKey sets per seed and reports any delta.
 *
 * COMPLETENESS-KNOB DOCTRINE: BLOCK_INDEX_CAP is a `const` in lib/ — no env-var hook is added
 * (env knobs to lib would be completeness knobs, which "completeness knobs are not speed dials"
 * doctrine forbids).  Run (b) requires a scratch checkout with the constant edited:
 *
 *   1. Create a scratch checkout:
 *        cd /path/to/TilingAtlas
 *        git worktree add /tmp/discharge-raised feat/op123-sound-levers
 *
 *   2. Edit BLOCK_INDEX_CAP in the scratch checkout:
 *        # In /tmp/discharge-raised/lib/classes/algorithm/PeriodSolver.ts
 *        # Change: export const BLOCK_INDEX_CAP = 60;
 *        # To:     export const BLOCK_INDEX_CAP = <proposedCap>;  (from census summary)
 *
 *   3. Run stock (a) in the main worktree — pass the affected seed indices from the census:
 *        pnpm tsx scripts/f3b-cap-discharge.ts --label stock --seeds <comma-idxs> --out /tmp/discharge-stock.ndjson
 *        (get the indices from:  grep "^Seed " experiments/results/f3b-cap-census-2026-06-11.log | awk '{print $2}')
 *
 *   4. Run raised (b) in the scratch checkout:
 *        cd /tmp/discharge-raised
 *        pnpm tsx scripts/f3b-cap-discharge.ts --label raised --seeds <comma-idxs> --out /tmp/discharge-raised.ndjson
 *
 *   5. Compare:
 *        pnpm tsx scripts/f3b-cap-discharge.ts --compare /tmp/discharge-stock.ndjson /tmp/discharge-raised.ndjson
 *
 * The output files contain one NDJSON record per seed:
 *   { "label": "stock"|"raised", "seedIdx": N, "seedName": "...", "keys": ["canonKey1", ...], "count": N }
 *
 * DISCHARGE VERDICT SEMANTICS
 * ---------------------------
 * byte-equal (PASS): the raised cap emits no additional tilings beyond the stock run → the cap never
 *   bound on a real k=3 tiling in the oracle set; the certified record stands.
 * diff (FAIL): at least one tiling appears only under the raised cap → the stock cap was silently
 *   dropping it; escalate to TA (completeness violation — re-certification required).
 * A result present only in stock is impossible (raising the cap can only add, never remove) — indicates
 *   a bug in the harness or the comparison logic.
 *
 * AFFECTED SEED INDICES
 * ---------------------
 * Supplied via --seeds at runtime (comma-separated indices into the multi-VC-filtered k=3 seed list,
 * same ordering as scout-worker.ts). Run the census to determine the affected indices.
 */

import fs from 'node:fs';
import path from 'node:path';
import { PeriodSolver, defaultMaxCellPolys } from '@/classes/algorithm/PeriodSolver';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import { dedupeByCongruence } from '@/classes/algorithm/TilingCongruence';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
function parseArgs():
	| { mode: 'solve'; label: string; seeds: number[]; out: string }
	| { mode: 'compare'; fileA: string; fileB: string } {
	const args = process.argv.slice(2);
	if (args[0] === '--compare') {
		const fileA = args[1];
		const fileB = args[2];
		if (!fileA || !fileB) {
			console.error('Usage: --compare <fileA> <fileB>');
			process.exit(1);
		}
		return { mode: 'compare', fileA, fileB };
	}
	let label = 'stock';
	let out = '/tmp/discharge-out.ndjson';
	let seeds: number[] = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--label' && args[i + 1]) { label = args[++i]; }
		else if (args[i] === '--out' && args[i + 1]) { out = args[++i]; }
		else if (args[i] === '--seeds' && args[i + 1]) {
			seeds = args[++i].split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
		}
	}
	if (label !== 'stock' && label !== 'raised') {
		console.error('--label must be "stock" or "raised"');
		process.exit(1);
	}
	return { mode: 'solve', label, seeds, out };
}

// ---------------------------------------------------------------------------
// Compare mode
// ---------------------------------------------------------------------------
function runCompare(fileA: string, fileB: string): void {
	const readRecords = (f: string): Map<number, { label: string; seedName: string; keys: Set<string> }> => {
		const lines = fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim());
		const map = new Map<number, { label: string; seedName: string; keys: Set<string> }>();
		for (const line of lines) {
			const r = JSON.parse(line) as { label: string; seedIdx: number; seedName: string; keys: string[]; count: number };
			map.set(r.seedIdx, { label: r.label, seedName: r.seedName, keys: new Set(r.keys) });
		}
		return map;
	};

	const a = readRecords(fileA);
	const b = readRecords(fileB);
	const labelA = a.values().next().value?.label ?? 'A';
	const labelB = b.values().next().value?.label ?? 'B';

	console.log(`Comparing ${labelA} (${fileA}) vs ${labelB} (${fileB})`);
	let nDiff = 0;
	const allIdxs = new Set([...a.keys(), ...b.keys()]);
	for (const idx of [...allIdxs].sort((x, y) => x - y)) {
		const ra = a.get(idx);
		const rb = b.get(idx);
		if (!ra || !rb) {
			console.log(`  Seed ${idx}: ONLY IN ${ra ? labelA : labelB} — "${(ra ?? rb)!.seedName}"`);
			nDiff++;
			continue;
		}
		const onlyInA = [...ra.keys].filter((k) => !rb.keys.has(k));
		const onlyInB = [...rb.keys].filter((k) => !ra.keys.has(k));
		if (onlyInA.length > 0 || onlyInB.length > 0) {
			nDiff++;
			console.log(`  Seed ${idx} "${ra.seedName}": ${labelA}=${ra.keys.size}  ${labelB}=${rb.keys.size}`);
			for (const k of onlyInA) console.log(`    only in ${labelA}: ${k}`);
			for (const k of onlyInB) console.log(`    only in ${labelB}: ${k}`);
		}
	}
	if (nDiff === 0) {
		console.log(`✓ BYTE-IDENTICAL: all ${a.size} seeds produce the same canonicalKey sets under ${labelA} and ${labelB}.`);
		console.log('  The raised cap is non-binding for the oracle set — safe to promote to BLOCK_INDEX_CAP.');
	} else {
		console.log(`⚠ DELTA: ${nDiff} seed(s) differ between ${labelA} and ${labelB}.`);
		console.log('  A non-empty "only in raised" set means the raised cap uncovers previously-dropped tilings.');
		console.log('  A non-empty "only in stock" set is impossible (raising the cap can only add, never remove) — indicates a bug.');
	}
}

// ---------------------------------------------------------------------------
// Solve mode
// ---------------------------------------------------------------------------
function runSolve(label: string, seedIdxs: number[], outPath: string): void {
	// Ring + seed list — identical to probe-pipeline.ts and scout-worker.ts
	const k = 3;
	const ns = [3, 4, 6, 8, 12];
	const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
	const baseRing = computeRing(params);
	setActiveRing(baseRing.N === 24 ? baseRing : CyclotomicRing.create(24));

	const pg = new PolygonsGenerator(params, []);
	const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
	const adj: Record<string, string[]> = {};
	for (const vc of vcs) adj[vc.name] = [];
	for (let i = 0; i < vcs.length; i++)
		for (let j = i + 1; j < vcs.length; j++)
			if (vcs[i].isCompatible(vcs[j])) {
				adj[vcs[i].name].push(vcs[j].name);
				adj[vcs[j].name].push(vcs[i].name);
			}
	const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
	const seedSets = new SeedSetExtractor(graph).findSeedSets(k);
	const allSeeds = new SeedBuilder().buildSeeds(k, 1, { seedSetLoader: () => seedSets });
	const useSeeds = allSeeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2);

	if (seedIdxs.length === 0) {
		console.error('--seeds <comma-idxs> is required (and must be non-empty) — run the census first to determine affected seed indices.');
		process.exit(1);
	}

	const outStream = fs.createWriteStream(outPath, { flags: 'w' });
	const extractor = new TranslationalCellExtractor();
	const solver = new PeriodSolver(k);
	const ts0 = Date.now();

	console.log(`label=${label}  affected seeds: ${seedIdxs.length}  maxMs=0 (unlimited)`);
	console.log(`BLOCK_INDEX_CAP NOTE: the raised run requires a scratch checkout with BLOCK_INDEX_CAP edited`);
	console.log(`  in lib/classes/algorithm/PeriodSolver.ts — do NOT add an env knob (completeness-knob doctrine).`);

	for (let ii = 0; ii < seedIdxs.length; ii++) {
		const idx = seedIdxs[ii];
		const seed = useSeeds[idx];
		if (!seed) {
			console.error(`  Seed idx ${idx} out of range (useSeeds.length=${useSeeds.length})`);
			continue;
		}
		const ts = Date.now();
		process.stdout.write(`  [${ii + 1}/${seedIdxs.length}] seed ${idx} "${seed.name}" ... `);
		const { cells, diag } = solver.solve(seed, { maxMs: 0 }); // maxMs=0 = no wall-clock cap
		const deduped = dedupeByCongruence(cells, (c) => extractor.canonicalKey(c.cellPolygons));
		const keys = deduped.map((c) => extractor.canonicalKey(c.cellPolygons)).sort();
		const ms = Date.now() - ts;
		console.log(`${deduped.length} cells  blockCapTrunc=${diag.blockIndexCapTruncated}  ${ms}ms`);
		const record = { label, seedIdx: idx, seedName: seed.name, keys, count: keys.length };
		outStream.write(JSON.stringify(record) + '\n');
	}

	outStream.end();
	console.log(`Done in ${((Date.now() - ts0) / 1000).toFixed(1)}s  →  ${outPath}`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
const parsed = parseArgs();
if (parsed.mode === 'compare') {
	runCompare(parsed.fileA, parsed.fileB);
} else {
	runSolve(parsed.label, parsed.seeds, parsed.out);
}
