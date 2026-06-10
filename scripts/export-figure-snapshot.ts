/* Figure-pipeline data snapshot (figures/README.md).
 *
 * Exports the CERTIFIED k=1..3 catalogue — one row per canonical_key, WITH the exact cell_codec —
 * into the committed figures/data/catalogue-k1-3.json, so `pnpm figures` is deterministic and
 * offline (never reads Supabase at build time).
 *
 * Completeness doctrine: this snapshot feeds thesis figures, so it HARD-FAILS unless the certified
 * counts are exactly 11/20/61 AND each k has a contributing certified run carrying the known
 * byte-identical digest (mirrors scripts/certify-run.ts). A wrong snapshot must never render.
 *
 *   pnpm tsx --env-file=.env scripts/export-figure-snapshot.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SerializedCell } from './scoutCodec';
import { EXPECTED_COUNTS, type FigureSnapshot, type SnapshotTiling } from '../figures/snapshot';

const KNOWN_TARGETS: Record<number, string> = {
	1: '6f9ca9cf2d16c75f',
	2: 'f3e2e0517191362c',
	3: 'eb34499d5fba3457',
};

type RunRow = { id: string; k: number; family: string; certified: boolean; digest: string | null };
type FoundRow = { run_id: string; canonical_key: string; cell_codec: SerializedCell | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllFound(sb: SupabaseClient<any, any, any, any, any>): Promise<FoundRow[]> {
	// Paginate — found_tilings holds one row per (run, tiling) rediscovery and cell_codec is heavy.
	const out: FoundRow[] = [];
	const PAGE = 500;
	for (let from = 0; ; from += PAGE) {
		const { data, error } = await sb
			.from('found_tilings')
			.select('run_id,canonical_key,cell_codec')
			.order('first_seen_at', { ascending: true })
			.range(from, from + PAGE - 1);
		if (error) throw new Error(`found_tilings page ${from}: ${error.message}`);
		out.push(...((data ?? []) as FoundRow[]));
		if (!data || data.length < PAGE) break;
	}
	return out;
}

async function main(): Promise<void> {
	const url = process.env.PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) {
		console.error('missing PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env)');
		process.exit(1);
	}
	const sb = createClient(url, key, { auth: { persistSession: false } });

	const { data: runsData, error: runsErr } = await sb
		.from('runs')
		.select('id,k,family,certified,digest');
	if (runsErr) throw new Error(`runs: ${runsErr.message}`);
	const runs = (runsData ?? []) as RunRow[];
	const certifiedRuns = new Map(runs.filter((r) => r.certified).map((r) => [r.id, r]));

	const found = await fetchAllFound(sb);

	// Mirror dedupeCatalogue semantics (lib/services/catalogueService.ts), certified-only, keeping
	// cell_codec: one entry per canonical_key, k/family from the contributing certified run, first
	// non-null cell_codec wins (all copies of a canonical_key are exact-identical by construction).
	const byKey = new Map<string, SnapshotTiling>();
	for (const f of found) {
		const run = certifiedRuns.get(f.run_id);
		if (!run) continue; // uncertified or unknown provenance → never in thesis figures
		if (run.k > 3) continue;
		const existing = byKey.get(f.canonical_key);
		if (!existing) {
			if (!f.cell_codec) {
				// cell_codec may be lazily backfilled; only fatal if it stays null across all copies.
				byKey.set(f.canonical_key, {
					canonicalKey: f.canonical_key,
					k: run.k,
					family: run.family,
					cellCodec: null as unknown as SerializedCell,
					runIds: [f.run_id],
				});
			} else {
				byKey.set(f.canonical_key, {
					canonicalKey: f.canonical_key,
					k: run.k,
					family: run.family,
					cellCodec: f.cell_codec,
					runIds: [f.run_id],
				});
			}
		} else {
			if (existing.cellCodec == null && f.cell_codec != null) existing.cellCodec = f.cell_codec;
			if (!existing.runIds.includes(f.run_id)) existing.runIds.push(f.run_id);
		}
	}

	const tilings = Array.from(byKey.values()).sort(
		(a, b) => a.k - b.k || a.canonicalKey.localeCompare(b.canonicalKey)
	);

	// --- Hard gates: counts, digests, exact payloads. ---
	const failures: string[] = [];
	const counts: Record<number, number> = {};
	for (const t of tilings) counts[t.k] = (counts[t.k] ?? 0) + 1;
	for (const k of [1, 2, 3]) {
		if ((counts[k] ?? 0) !== EXPECTED_COUNTS[k]) {
			failures.push(`k=${k}: expected ${EXPECTED_COUNTS[k]} certified tilings, got ${counts[k] ?? 0}`);
		}
		const hasDigest = runs.some((r) => r.certified && r.k === k && r.digest === KNOWN_TARGETS[k]);
		if (!hasDigest) {
			failures.push(`k=${k}: no certified run carries the known digest ${KNOWN_TARGETS[k]}`);
		}
	}
	const missingCodec = tilings.filter((t) => t.cellCodec == null);
	if (missingCodec.length > 0) {
		failures.push(
			`${missingCodec.length} tilings lack cell_codec (run scripts/backfill or investigate): ` +
				missingCodec.slice(0, 5).map((t) => t.canonicalKey).join(', ')
		);
	}
	if (failures.length > 0) {
		console.error('✗ snapshot REFUSED — figure data must be provably the certified catalogue:');
		for (const f of failures) console.error('  ✗ ' + f);
		process.exit(1);
	}

	const snapshot: FigureSnapshot = {
		exportedAt: new Date().toISOString(),
		source: 'found_tilings (certified runs only)',
		digests: KNOWN_TARGETS,
		counts,
		tilings,
	};
	const outPath = path.join(process.cwd(), 'figures', 'data', 'catalogue-k1-3.json');
	fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 1) + '\n');
	console.error(
		`★ snapshot written: ${outPath}  (${tilings.length} tilings: ` +
			`k1=${counts[1]} k2=${counts[2]} k3=${counts[3]})`
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
