/* Oracle t-code mapping for the figure pipeline (figures/README.md).
 *
 * The Soto-Sánchez/Galebach oracle (pinned: figures/data/galebach.json) stores, per tiling, the
 * translation basis T1/T2 and `Seed` = the vertex representatives per cell — all as [a,b,c,d] in
 * the ζ₁₂ power basis (decode recipe proven in scripts/oracle-characterize.ts). No polygons. We
 * therefore RECONSTRUCT each oracle tiling exactly:
 *
 *   vertices (seed ⊕ lattice window) → unit edges (float broadphase grid + EXACT normSquared()==1)
 *   → faces (directed-edge tracing; each interior face appears exactly once as a positive-area
 *   cycle ≤ 12-gon, so orientation conventions cancel) → one face per lattice class →
 *   RegularPolygon.fromAnchorAndDirExact → PeriodCell
 *
 * and match against the certified snapshot with cellsCongruent (the authoritative equality —
 * canonicalKey is only a bucket hash). Every failure mode reports loudly: degenerate oracle bases,
 * reconstruction area mismatches, 0- or ≥2-fold matches. Output: figures/data/oracle-map.json.
 *
 *   pnpm tsx scripts/oracle-match.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { cellsCongruent } from '@/classes/algorithm/TilingCongruence';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';
import {
	reconstructOracleCell as reconstructOracleCellWithRing,
	type OracleSeed,
} from '@/classes/algorithm/oracleCellReconstruct';
import { deserializeCell } from './scoutCodec';
import { loadSnapshot } from '../figures/snapshot';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);

// --- oracle decode (recipe from scripts/oracle-characterize.ts) ---
const GALEBACH_PATH = path.join(process.cwd(), 'figures', 'data', 'galebach.json');
const raw = fs
	.readFileSync(GALEBACH_PATH, 'utf8')
	.replace(/^Galebach=/, '')
	.replace(/,(\s*[}\]])/g, '$1');
const oracle: Record<string, { T1: number[]; T2: number[]; Seed: number[][] }> = JSON.parse(raw);

export function loadOracle(): Record<string, { T1: number[]; T2: number[]; Seed: number[][] }> {
	return oracle;
}

// 2-arg wrapper preserving the pre-extraction API (module `ring`); the impl now lives in the
// browser-safe module so the Play viewer can share it.
export function reconstructOracleCell(
	tCode: string,
	o: OracleSeed
): { cell: PeriodCell } | { error: string } {
	return reconstructOracleCellWithRing(ring, tCode, o);
}

/**
 * Manual assignments — each carries its justification; applied AFTER exact matching and only to
 * residuals (an exact-match conflict with a manual entry is a hard error).
 *
 * t1002 → 4.8.8: the oracle's [a,b,c,d] ζ₁₂ integer format cannot represent the 4.8.8 translation
 * basis (length 1+√2; √2 ∉ ℤ[ζ₁₂] — the 4.8.8 obstruction, NOTES §12.3), so its entry carries
 * T1=T2=0 and a placeholder unit-square Seed. Assignment is by elimination: the 11 1-uniform
 * tilings are fixed, the other 10 exact-match, and our sole unmatched k=1 tiling is 4.8.8
 * (vertex figure recomputed exactly — figures/data/orbits.json).
 */
const MANUAL_BY_VC: { tCode: string; k: number; vcMultiset: string }[] = [
	{ tCode: 't1002', k: 1, vcMultiset: '4,8,8' },
];

// --- main: reconstruct all oracle k≤3 entries, congruence-match against the snapshot ---
function main(): void {
	const snap = loadSnapshot();
	const ours = snap.tilings.map((t) => ({
		canonicalKey: t.canonicalKey,
		k: t.k,
		cell: deserializeCell(ring, t.cellCodec),
	}));

	const matched: Record<string, string> = {}; // canonicalKey → tCode
	const skipped: { tCode: string; reason: string }[] = [];
	const unmatchedOracle: string[] = [];
	const ambiguous: { tCode: string; keys: string[] }[] = [];
	const memo = new Map<string, string>();

	for (const k of [1, 2, 3]) {
		const entries = Object.entries(oracle).filter(([key]) => new RegExp(`^t${k}\\d\\d\\d$`).test(key));
		const mine = ours.filter((t) => t.k === k);
		console.error(`--- k=${k}: ${entries.length} oracle vs ${mine.length} certified ---`);
		entries.forEach(([tCode, o], idx) => {
			const rec = reconstructOracleCell(tCode, o);
			if ('error' in rec) {
				skipped.push({ tCode, reason: rec.error });
				console.error(`  ✗ ${tCode}: SKIP — ${rec.error}`);
				return;
			}
			const hits = mine.filter((t) => cellsCongruent(rec.cell, t.cell, memo));
			if (hits.length === 1) {
				const ck = hits[0].canonicalKey;
				if (matched[ck]) {
					ambiguous.push({ tCode, keys: [ck] });
					console.error(`  ✗ ${tCode}: collides with ${matched[ck]} on the same certified tiling`);
				} else {
					matched[ck] = tCode;
				}
			} else if (hits.length === 0) {
				unmatchedOracle.push(tCode);
				console.error(`  ✗ ${tCode}: NO congruent certified tiling (cell ${rec.cell.cellPolygons.length} polys)`);
			} else {
				ambiguous.push({ tCode, keys: hits.map((h) => h.canonicalKey) });
				console.error(`  ✗ ${tCode}: AMBIGUOUS — ${hits.length} congruent certified tilings`);
			}
			if ((idx + 1) % 10 === 0) console.error(`  [${idx + 1}/${entries.length}]`);
		});
	}

	// Manual assignments (residuals only; exact matches always win).
	const orbitCache = JSON.parse(
		fs.readFileSync(path.join(process.cwd(), 'figures', 'data', 'orbits.json'), 'utf8')
	) as Record<string, { vcOfOrbit: string[] }>;
	const manualApplied: { tCode: string; canonicalKey: string }[] = [];
	for (const m of MANUAL_BY_VC) {
		if (Object.values(matched).includes(m.tCode)) {
			throw new Error(`manual assignment ${m.tCode} conflicts with an exact match`);
		}
		const candidates = ours.filter(
			(t) =>
				t.k === m.k &&
				!matched[t.canonicalKey] &&
				orbitCache[t.canonicalKey]?.vcOfOrbit.slice().sort().join('|') === m.vcMultiset
		);
		if (candidates.length !== 1) {
			console.error(`  ✗ manual ${m.tCode}: expected exactly 1 residual candidate, got ${candidates.length}`);
			continue;
		}
		matched[candidates[0].canonicalKey] = m.tCode;
		manualApplied.push({ tCode: m.tCode, canonicalKey: candidates[0].canonicalKey });
		const i = skipped.findIndex((s) => s.tCode === m.tCode);
		if (i >= 0) skipped[i].reason += ' → MANUALLY ASSIGNED by elimination (see script header)';
		console.error(`  ★ manual: ${m.tCode} → ${candidates[0].canonicalKey.slice(0, 30)}… (by elimination)`);
	}

	const unmatchedOurs = ours.filter((t) => !matched[t.canonicalKey]).map((t) => t.canonicalKey);
	const out = {
		generatedAt: new Date().toISOString(),
		source: 'figures/data/galebach.json (pinned from chequesoto.info)',
		matchedCount: Object.keys(matched).length,
		matched,
		manualApplied,
		unmatchedOracle,
		unmatchedOurs,
		ambiguous,
		skipped,
	};
	const outPath = path.join(process.cwd(), 'figures', 'data', 'oracle-map.json');
	fs.writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
	console.error(
		`★ oracle map written: ${outPath} — matched ${out.matchedCount}/92, ` +
			`oracle-unmatched ${unmatchedOracle.length}, skipped ${skipped.length}, ambiguous ${ambiguous.length}`
	);
	if (unmatchedOracle.length + skipped.length + ambiguous.length > 0) {
		console.error('⚑ residuals above need manual assignment or investigation — see oracle-map.json');
	}
}

if (process.argv[1] && path.basename(process.argv[1]) === 'oracle-match.ts') {
	main();
}
