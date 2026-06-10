/**
 * Pilot/calibration utility: render a few representative tilings in all three color strategies at
 * gallery + single-figure sizes into figures/out/pilots/. Used to calibrate edgeMm/line widths
 * before batch runs; kept around for style iterations.
 *
 *   pnpm tsx figures/pilot.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadSnapshot } from './snapshot';
import { loadOrbitCache } from './tiling/orbits';
import { buildCellModel } from './tiling/cellModel';
import { tilingFigure } from './tiling/tilingFigure';
import { emitTikz } from './emit/tikz';
import { emitSvg } from './emit/svg';
import type { ColorStrategy } from './style/palette';

const OUT = path.join(process.cwd(), 'figures', 'out', 'pilots');
fs.mkdirSync(OUT, { recursive: true });

const snap = loadSnapshot();
const orbits = loadOrbitCache();

// Pilots: simplest k=1, the chiral snub-hex k=1, and the largest k=3 cell.
const square = snap.tilings.find((t) => t.k === 1 && orbits[t.canonicalKey].vcOfOrbit[0] === '4,4,4,4')!;
const snub = snap.tilings.find((t) => t.k === 1 && orbits[t.canonicalKey].vcOfOrbit[0] === '3,3,3,3,6')!;
const largestK3 = snap.tilings
	.filter((t) => t.k === 3)
	.reduce((max, t) => (t.cellCodec.polys.length > max.cellCodec.polys.length ? t : max));

const pilots: [string, typeof square][] = [
	['square', square],
	['snubhex', snub],
	['bigk3', largestK3],
];
const strategies: ColorStrategy[] = ['byOrbit', 'byNGon', 'lineArt'];
const sizes: [string, { windowMm: number; edgeMm: number }][] = [
	['gal', { windowMm: 34, edgeMm: 3.8 }],
	['single', { windowMm: 80, edgeMm: 8 }],
];

for (const [name, t] of pilots) {
	const model = buildCellModel(t.cellCodec, orbits[t.canonicalKey]);
	for (const strategy of strategies) {
		for (const [sizeName, size] of sizes) {
			const { ir, edgeMm } = tilingFigure(model, { strategy, ...size });
			const stem = `${name}-${strategy}-${sizeName}`;
			fs.writeFileSync(path.join(OUT, `${stem}.tex`), emitTikz(ir, { edgeMm }));
			fs.writeFileSync(path.join(OUT, `${stem}.svg`), emitSvg(ir, { edgeMm }));
			console.error(
				`[pilot] ${stem}: cellDiam=${model.cellDiam.toFixed(2)} edgeMm=${edgeMm.toFixed(2)} ` +
					`polys=${ir.elements.filter((e) => e.kind === 'poly').length} ` +
					`markers=${ir.elements.filter((e) => e.kind === 'marker').length}`
			);
		}
	}
}
console.error(`★ pilots emitted to ${OUT}`);
