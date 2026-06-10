/**
 * Committed figure-data snapshot: types + gated loader. The snapshot is produced by
 * scripts/export-figure-snapshot.ts (service-role, hard gates) — the figure build only ever reads
 * this file, never Supabase. Loading re-checks the certified counts: a tampered/stale snapshot must
 * fail loudly, not render quietly (completeness doctrine).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { SerializedCell } from '../scripts/scoutCodec';

export type SnapshotTiling = {
	canonicalKey: string;
	k: number;
	family: string;
	cellCodec: SerializedCell;
	runIds: string[];
};

export type FigureSnapshot = {
	exportedAt: string;
	source: string;
	digests: Record<string, string>;
	counts: Record<string, number>;
	tilings: SnapshotTiling[];
};

export const EXPECTED_COUNTS: Record<number, number> = { 1: 11, 2: 20, 3: 61 };

export const SNAPSHOT_PATH = path.join(process.cwd(), 'figures', 'data', 'catalogue-k1-3.json');

export function loadSnapshot(): FigureSnapshot {
	const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')) as FigureSnapshot;
	const counts: Record<number, number> = {};
	for (const t of snap.tilings) counts[t.k] = (counts[t.k] ?? 0) + 1;
	for (const k of [1, 2, 3]) {
		if ((counts[k] ?? 0) !== EXPECTED_COUNTS[k]) {
			throw new Error(
				`figure snapshot counts wrong: k=${k} has ${counts[k] ?? 0}, expected ${EXPECTED_COUNTS[k]} — re-run pnpm figures:data`
			);
		}
	}
	return snap;
}
