/*
 * Acceptance gate (spec §Acceptance criterion 3): every oracle atlas cell must reconstruct and classify
 * to one of the 17 wallpaper groups. Runs the SAME browser path (reconstruct/deserialize → seedFromPeriodCell
 * → analyzeSymmetry) over all galebach (loadOracle) + all ctrnact k≤8. Logs per-source pass/fail to
 * experiments/results/oracle-symmetry-validate-2026-07-09.log. Read that as it runs.
 *
 * Run: pnpm tsx scripts/validate-oracle-symmetry.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { symmetryFromExactSource } from '@/lib/services/oracleSymmetry';
import { WALLPAPER_GROUPS } from '@/lib/classes/symmetry/types';
import { loadOracle } from './oracle-match';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const ROOT = process.cwd();
const LOG = path.join(ROOT, 'experiments', 'results', `oracle-symmetry-validate-2026-07-09.log`);
const lines: string[] = [];
const log = (m: string) => {
	lines.push(m);
	console.log(m);
	fs.mkdirSync(path.dirname(LOG), { recursive: true });
	fs.writeFileSync(LOG, lines.join('\n') + '\n');
};

type Seed = { id: string; T1: number[]; T2: number[]; Seed: number[][] };
const bySource: Record<string, { ok: number; fail: number; bad: string[] }> = {};
function run(source: string, seeds: Seed[]) {
	bySource[source] = { ok: 0, fail: 0, bad: [] };
	const b = bySource[source];
	seeds.forEach((s, i) => {
		const d = symmetryFromExactSource(ring, s.id, { kind: 'seed', T1: s.T1, T2: s.T2, Seed: s.Seed });
		if (d && WALLPAPER_GROUPS.includes(d.group)) b.ok++;
		else {
			b.fail++;
			if (b.bad.length < 20) b.bad.push(s.id);
		}
		if ((i + 1) % 200 === 0) log(`  ${source}: ${i + 1}/${seeds.length} (${b.fail} fail)`);
	});
	log(`=== ${source}: ${b.ok} ok, ${b.fail} FAIL ===`);
	if (b.bad.length) log(`  first failures: ${b.bad.join(', ')}`);
}

const gal: Seed[] = Object.entries(loadOracle())
	.filter(([k]) => k !== 't1002') // 4.8.8: no {T1,T2,Seed}, carried as a serialized cell in the atlas
	.map(([id, o]) => ({ id, T1: o.T1, T2: o.T2, Seed: o.Seed }));
run('galebach', gal);

const ctr = JSON.parse(fs.readFileSync(path.join(ROOT, 'figures', 'data', 'ctrnact.json'), 'utf8')) as {
	tilings: { id: string; T1?: number[]; T2?: number[]; Seed?: number[][] }[];
};
run(
	'ctrnact',
	ctr.tilings.filter((t) => t.T1 && t.T2 && t.Seed).map((t) => ({ id: t.id, T1: t.T1!, T2: t.T2!, Seed: t.Seed! })),
);

const total = Object.values(bySource).reduce((a, b) => ({ ok: a.ok + b.ok, fail: a.fail + b.fail }), {
	ok: 0,
	fail: 0,
});
log(`\nTOTAL: ${total.ok} ok, ${total.fail} FAIL`);
if (total.fail > 0) process.exitCode = 1;
