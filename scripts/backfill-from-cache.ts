/* Backfill found_tilings + a runs row from an EXISTING .scout-cache NDJSON — WITHOUT re-running the
 * scout (FRONTEND_ROADMAP.md Phase 0.0/0.1). For families where the certified run's output is already
 * cached on disk (e.g. k=3 {3,4,6,12}), this mirrors it into Supabase so /play + /library can show it,
 * avoiding the multi-hour recompute.
 *
 * §0 doctrine: inserts the run as UNCERTIFIED. Certification stays the deliberate human step
 * (scripts/certify-run.ts), which re-checks digest == target before flipping runs.certified.
 *
 * THREE honesty gates (all checked in the default DRY RUN; --write refuses unless all pass):
 *   1. digest (recomputed with CURRENT dedup code, IDENTICAL reduce to scout-parallel.ts:131-135)
 *      must equal the recorded KNOWN_TARGET — proves the cache is complete + my reduce matches.
 *   2. distinct(canonical_key) must equal the congruence-deduped count — else the found_tilings
 *      upsert key (run_id, canonical_key) would silently collapse two congruence classes that share a
 *      canonical_key BUCKET, under-counting the catalogue (a §0 completeness violation in display).
 *   3. a KNOWN_TARGET must exist for this k — refuse to backfill a set I cannot verify.
 *
 * Usage:  pnpm tsx --env-file=.env scripts/backfill-from-cache.ts <k> <tiles> [--write]
 *   e.g.  pnpm tsx --env-file=.env scripts/backfill-from-cache.ts 3 3,4,6,12          (dry run)
 *         pnpm tsx --env-file=.env scripts/backfill-from-cache.ts 3 3,4,6,12 --write  (insert, uncertified)
 */
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { PolygonType, type GeneratorParameters } from '@/classes';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import { dedupeByCongruence } from '@/classes/algorithm/TilingCongruence';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';
import { deserializeCell, serializeCell, type SerializedCell } from './scoutCodec';
import { makeEmitter, makeTaskQueue } from './emitter';

const KNOWN_TARGETS: Record<number, string> = {
	1: '6f9ca9cf2d16c75f',
	2: 'f3e2e0517191362c',
	3: 'eb34499d5fba3457',
};

// Float render-ready cell (TranslationalCellData) — MIRRORS scout-parallel.ts:53-60 exactly so the
// browser gallery renders backfilled cells identically to live ones (render-only; not the claim).
function cellToRenderData(cell: PeriodCell): { cellPolygons: { n: number; vertices: number[][] }[]; basis: number[][] } {
	const u = cell.basisExact[0].toVector();
	const v = cell.basisExact[1].toVector();
	return {
		cellPolygons: cell.cellPolygons.map((p) => ({ n: p.n, vertices: p.vertices.map((vec) => [vec.x, vec.y]) })),
		basis: [[u.x, u.y], [v.x, v.y]],
	};
}

async function main(): Promise<void> {
	const k = parseInt(process.argv[2] ?? '', 10);
	const tiles = process.argv[3] ?? '';
	const write = process.argv.includes('--write');
	if (!k || !tiles) {
		console.error('usage: pnpm tsx --env-file=.env scripts/backfill-from-cache.ts <k> <tiles> [--write]');
		process.exit(1);
	}

	// Ring + extractor — identical setup to scout-parallel.ts:37-41.
	const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: tiles.split(',').map(Number) } };
	const baseRing = computeRing(params);
	const ring = baseRing.N === 24 ? baseRing : CyclotomicRing.create(24);
	setActiveRing(ring);
	const extractor = new TranslationalCellExtractor();

	// Read the cache (one {idx, cells} line per finished seed).
	const cachePath = `.scout-cache/k${k}_${tiles.replace(/,/g, '.')}_cap0.ndjson`;
	let raw: string;
	try {
		raw = fs.readFileSync(cachePath, 'utf8');
	} catch {
		console.error(`✗ cache not found: ${cachePath}`);
		process.exit(1);
	}
	let seedCount = 0;
	const allCells: SerializedCell[] = [];
	for (const line of raw.split('\n')) {
		const s = line.trim();
		if (!s) continue;
		let rec: { idx?: number; cells?: SerializedCell[] };
		try {
			rec = JSON.parse(s);
		} catch {
			continue; // truncated/partial tail
		}
		if (typeof rec.idx !== 'number' || !Array.isArray(rec.cells)) continue;
		seedCount++;
		for (const c of rec.cells) allCells.push(c);
	}

	// --- IDENTICAL final reduce to scout-parallel.ts:131-135 (guard #1) ---
	const cells: PeriodCell[] = allCells.map((sc) => deserializeCell(ring, sc));
	const reps = dedupeByCongruence(cells, (c) => extractor.canonicalKey(c.cellPolygons));
	const ids = reps.map((c) => extractor.canonicalKey(c.cellPolygons)).sort();
	let h = 5381n;
	for (const ch of ids.join('|')) h = ((h * 33n) ^ BigInt(ch.codePointAt(0)!)) & 0xffffffffffffffffn;
	const digest = h.toString(16);
	const count = reps.length;
	const distinctKeys = new Set(ids).size;
	const target = KNOWN_TARGETS[k];

	console.error(`cache ${cachePath}: ${seedCount} seeds, ${allCells.length} raw cells → ${count} distinct (by congruence)`);
	console.error(`  digest         = ${digest}`);
	console.error(`  target k=${k}     = ${target ?? '(none)'}   ${target ? (digest === target ? '✓ MATCH' : '✗ MISMATCH') : ''}`);
	console.error(`  distinct keys  = ${distinctKeys} / ${count}   ${distinctKeys === count ? '✓ canonical_key is injective on reps' : '✗ canonical_key COLLISION — found_tilings would under-count'}`);

	// --- honesty gates ---
	let ok = true;
	if (!target) {
		console.error(`✗ no KNOWN_TARGET for k=${k} — refusing to backfill a set I cannot verify.`);
		ok = false;
	}
	if (target && digest !== target) {
		console.error('✗ digest mismatch — the cache is incomplete or stale, OR the dedup code changed. NOT safe to certify.');
		ok = false;
	}
	if (distinctKeys !== count) {
		console.error('✗ canonical_key is NOT injective on the congruence reps — upserting found_tilings by (run_id, canonical_key) would drop tilings. Backfill blocked (schema/keying fix needed first).');
		ok = false;
	}
	if (!ok) {
		console.error('\nABORTING — no writes, no certification.');
		process.exit(1);
	}

	if (!write) {
		console.error('\nDRY RUN ✓ — all gates pass. Re-run with --write to insert (UNCERTIFIED), then:');
		console.error(`  pnpm tsx --env-file=.env scripts/certify-run.ts <run_id>`);
		process.exit(0);
	}

	// --- WRITE: drive the emitter so rows are byte-for-byte what a live run would insert ---
	const url = process.env.PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) {
		console.error('✗ missing PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env)');
		process.exit(1);
	}
	const client = createClient(url, key, { auth: { persistSession: false } });
	// A bounded queue sized well above the task count (reps + events) so nothing is dropped on overflow.
	const emit = makeEmitter({
		client,
		queue: makeTaskQueue({ maxQueue: 100000, retries: 3 }),
		canonicalKeyOf: (sc) => extractor.canonicalKey(deserializeCell(ring, sc as SerializedCell).cellPolygons),
		renderCellOf: (sc) => cellToRenderData(deserializeCell(ring, sc as SerializedCell)),
	});
	let commit = '';
	try {
		commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
	} catch {
		/* best-effort */
	}
	const runId = randomUUID();
	// Emit the congruence-deduped reps (re-serialized; codec round-trip preserves canonicalKey +
	// congruence, see tests/scout-codec.test.ts) under one synthetic seed — seed_idx is unused display
	// provenance and the catalogue reads only (k, family, canonical_key, render_cell, certified).
	const repCells: SerializedCell[] = reps.map(serializeCell);
	emit.runStarted({
		runId,
		k,
		family: tiles,
		params: { maxMs: 0, mode: 'certified', source: 'backfill-from-cache', cache: cachePath, seeds: seedCount },
		commit,
	});
	emit.seedCompleted({ idx: 0, name: 'backfill-from-cache', cells: repCells, timedOut: false, ms: 0, workerId: 0 });
	emit.runFinished({ count, digest, timeouts: 0, incomplete: false });
	await emit.flush();
	console.error(`\n★ backfilled run ${runId}  (k=${k}, family ${tiles}, ${count} tilings, UNCERTIFIED, commit ${commit || '—'})`);
	console.error(`  Next (the §0 human certify step):  pnpm tsx --env-file=.env scripts/certify-run.ts ${runId}`);
	process.exit(0);
}

main();
