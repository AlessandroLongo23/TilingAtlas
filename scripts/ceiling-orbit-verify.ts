/*
 * Ceiling family (C) — orbit-count verification.
 *
 * Reconstructs the exact cell of the tri+hex λ₁=2 ceiling tilings from ctrnact.json
 * {T1,T2,Seed} and runs the REAL KUniformityChecker.countVertexOrbits, confirming it
 * reproduces the catalogue's k. This validates the reconstruct→count toolchain before
 * we feed it SYNTHETIC seeds for p > 10 (scripts/ceiling-extend.ts).
 *
 * Run:  pnpm tsx scripts/ceiling-orbit-verify.ts
 */
import { reconstructOracleCell } from './oracle-match'; // sets the active N=24 ring at import
import { getActiveRing } from '@/classes/Cyclotomic';
import { KUniformityChecker } from '@/classes/algorithm/KUniformityChecker';
import fs from 'node:fs';
import path from 'node:path';

const ring = getActiveRing();
if (ring.N !== 24) throw new Error(`active ring N=${ring.N}, expected 24`);

type Tiling = { id: string; k: number; family: string; T1: number[]; T2: number[]; Seed: number[][] };
const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'figures/data/ctrnact.json'), 'utf8')) as {
	tilings: Tiling[];
};
const checker = new KUniformityChecker();

// The per-k max-s* 3.6 ceiling representatives (from the reverse-engineering pass).
const EXTREMAL = [
	'ctrnact-04_36-4j2_5b2-1',
	'ctrnact-05_36-4d2_4j_5b2-1',
	'ctrnact-06_36-4e2_4i_4j_5b2-1',
	'ctrnact-07_36-4e2_4j3_5b2-3',
	'ctrnact-08_36-4e_4j3_5b4-1',
];

function run(list: Tiling[], label: string) {
	let ok = 0, err = 0, mismatch = 0;
	console.log(`\n=== ${label}: ${list.length} tilings ===`);
	for (const t of list) {
		const rec = reconstructOracleCell(t.id, { T1: t.T1, T2: t.T2, Seed: t.Seed });
		if ('error' in rec) {
			err++;
			console.log(`  ${t.id.padEnd(34)} k=${t.k}  ✗ reconstruct: ${rec.error}`);
			continue;
		}
		const [u, v] = rec.cell.basisExact;
		const orbits = checker.countVertexOrbits(rec.cell.cellPolygons, u, v);
		const tag = orbits === t.k ? '✓' : orbits === null ? '∅(null)' : `✗ MISMATCH`;
		if (orbits === t.k) ok++; else mismatch++;
		console.log(`  ${t.id.padEnd(34)} catK=${t.k}  counted=${orbits}  polys=${rec.cell.cellPolygons.length}  ${tag}`);
	}
	console.log(`  → ${ok} agree, ${mismatch} mismatch, ${err} reconstruct-error`);
	return { ok, mismatch, err };
}

// 1) the extremal ceiling reps
const extr = EXTREMAL.map((id) => d.tilings.find((t) => t.id === id)).filter(Boolean) as Tiling[];
run(extr, 'extremal ceiling reps (p=5,7,9,10)');

// 2) a broader sample of the 3.6 family across k, to stress the counter
const all36 = d.tilings.filter((t) => t.family === '3.6' && t.k >= 4 && t.k <= 8);
const sample = all36.filter((_, i) => i % Math.max(1, Math.floor(all36.length / 40)) === 0).slice(0, 40);
run(sample, 'random 3.6 sample across k=4..8');
