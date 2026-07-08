/**
 * Parallel-scout crash-resume reader, plus a re-export of the exact cell (de)serialization — which now
 * lives fs-free in `lib/classes/algorithm/cellCodec.ts` so BROWSER code (the Play symmetry overlay) can
 * import it. Kept here unchanged so the scout's many script/test importers of `scoutCodec` still work.
 * `readResumeNdjson` is the only `node:fs` user; keeping it here is what keeps the browser bundle clean.
 */
import fs from 'node:fs';
import type { SerializedCell } from '@/classes/algorithm/cellCodec';

export { serializeCell, deserializeCell } from '@/classes/algorithm/cellCodec';
export type { SerializedCell, EncCyc } from '@/classes/algorithm/cellCodec';

/**
 * Crash-resume: read a coordinator NDJSON file (one `{idx, cells}` line per finished seed) into the set
 * of completed seed indices + the flattened serialized cells. Missing file ⇒ empty (fresh run). A
 * TRUNCATED final line (the coordinator killed mid-write) is skipped, not fatal — the valid prefix is
 * kept, so resuming after an unclean shutdown loses at most the seed that was being written.
 */
export function readResumeNdjson(file: string): { done: Set<number>; cells: SerializedCell[] } {
	const done = new Set<number>();
	const cells: SerializedCell[] = [];
	let raw: string;
	try { raw = fs.readFileSync(file, 'utf8'); } catch { return { done, cells }; }
	for (const line of raw.split('\n')) {
		const s = line.trim();
		if (!s) continue;
		let rec: { idx?: number; cells?: SerializedCell[] };
		try { rec = JSON.parse(s); } catch { continue; } // truncated/partial tail ⇒ skip
		if (typeof rec.idx !== 'number') continue;
		done.add(rec.idx);
		if (Array.isArray(rec.cells)) for (const c of rec.cells) cells.push(c);
	}
	return { done, cells };
}
