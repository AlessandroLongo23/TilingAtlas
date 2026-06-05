/* One-off backfill: populate found_tilings.render_cell from the exact cell_codec for rows written
 * before the emitter learned renderCellOf (M2). cell_codec is always present, so this is lossless.
 *   pnpm tsx --env-file=.env scripts/backfill-render-cell.ts
 */
import { createClient } from '@supabase/supabase-js';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import { deserializeCell, type SerializedCell } from './scoutCodec';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';

// Same float derivation the coordinator uses for renderCellOf (kept in sync deliberately).
function cellToRenderData(cell: PeriodCell): { cellPolygons: { n: number; vertices: number[][] }[]; basis: number[][] } {
	const u = cell.basisExact[0].toVector();
	const v = cell.basisExact[1].toVector();
	return {
		cellPolygons: cell.cellPolygons.map((p) => ({ n: p.n, vertices: p.vertices.map((vec) => [vec.x, vec.y]) })),
		basis: [[u.x, u.y], [v.x, v.y]],
	};
}

async function main(): Promise<void> {
	const url = process.env.PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) {
		console.error('missing PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env)');
		process.exit(1);
	}
	const sb = createClient(url, key, { auth: { persistSession: false } });
	const ring = CyclotomicRing.create(24); // the scout serializes all cells in the N=24 ring
	setActiveRing(ring);

	const { data, error } = await sb
		.from('found_tilings')
		.select('run_id,canonical_key,cell_codec')
		.is('render_cell', null);
	if (error) {
		console.error('select failed:', error.message);
		process.exit(1);
	}
	const rows = data ?? [];
	console.error(`backfilling ${rows.length} rows missing render_cell…`);
	let ok = 0;
	let fail = 0;
	for (const row of rows) {
		try {
			const cell = deserializeCell(ring, row.cell_codec as SerializedCell);
			const render = cellToRenderData(cell);
			const { error: upErr } = await sb
				.from('found_tilings')
				.update({ render_cell: render })
				.eq('run_id', row.run_id)
				.eq('canonical_key', row.canonical_key);
			if (upErr) {
				console.error('update failed:', upErr.message);
				fail++;
			} else {
				ok++;
			}
		} catch (e) {
			console.error('deserialize failed for', row.canonical_key, e);
			fail++;
		}
	}
	console.error(`★ backfilled ${ok} render_cell (${fail} failed)`);
}

main();
