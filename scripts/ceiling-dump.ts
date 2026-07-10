/* Dump the tri+hex ceiling tiling structure in tube coordinates, to find the repeatable band. */
import { reconstructOracleCell } from './oracle-match';
import { getActiveRing } from '@/classes/Cyclotomic';
import fs from 'node:fs';
import path from 'node:path';

const ring = getActiveRing();
type T = { id: string; k: number; family: string; T1: number[]; T2: number[]; Seed: number[][] };
const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'figures/data/ctrnact.json'), 'utf8')) as { tilings: T[] };

for (const id of ['ctrnact-04_36-4j2_5b2-1', 'ctrnact-07_36-4e2_4j3_5b2-3']) {
	const t = d.tilings.find((x) => x.id === id)!;
	const rec = reconstructOracleCell(t.id, { T1: t.T1, T2: t.T2, Seed: t.Seed });
	if ('error' in rec) { console.log(id, 'ERR', rec.error); continue; }
	const [u, v] = rec.cell.basisExact;
	const uv = u.toVector(), vv = v.toVector();
	// tube axes: long = v (length p√3), short = u (length 2)
	const L = Math.hypot(vv.x, vv.y), S = Math.hypot(uv.x, uv.y);
	const lh = { x: vv.x / L, y: vv.y / L }, sh = { x: uv.x / S, y: uv.y / S };
	console.log(`\n=== ${id}  k=${t.k}  |long|=${L.toFixed(3)}=${(L/Math.sqrt(3)).toFixed(2)}√3  |short|=${S.toFixed(2)} ===`);
	const rows: { along: number; n: number; around: number }[] = [];
	for (const p of rec.cell.cellPolygons) {
		const vs = p.exactVertices!.map((q) => q.toVector());
		const cx = vs.reduce((s, q) => s + q.x, 0) / vs.length;
		const cy = vs.reduce((s, q) => s + q.y, 0) / vs.length;
		const along = cx * lh.x + cy * lh.y;
		const around = cx * sh.x + cy * sh.y;
		rows.push({ along, n: vs.length, around });
	}
	rows.sort((a, b) => a.along - b.along || a.around - b.around);
	for (const r of rows) console.log(`  along=${r.along.toFixed(3).padStart(7)}  ${r.n}-gon  around=${r.around.toFixed(2)}`);
}
