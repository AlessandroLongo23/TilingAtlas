// figures/trace/build-trace-figures.ts
/** Driver: read the frozen running-example traces and emit the trace-driven figures (F2/F3/F5/F6)
 *  as .svg (preview) + .tex (TikZ, thesis). Run: pnpm tsx figures/trace/build-trace-figures.ts
 *  Figures land in figures/out/trace/. Does NOT deliver to ../thesis. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FigureIR } from '../ir/types';
import { emitSvg } from '../emit/svg';
import { emitTikz } from '../emit/tikz';
import { polygonsFigure } from './polygonsFigure';
import { loadTrace, type TorusNode, type VcNode } from './loadTrace';
import { torusTreeFigure, vcTreeFigure } from './treeFigure';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'figures', 'out', 'trace');
const EDGE_MM = 8;

function write(id: string, ir: FigureIR): void {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${id}.svg`), emitSvg(ir, { edgeMm: EDGE_MM }));
  fs.writeFileSync(path.join(OUT, `${id}.tex`), emitTikz(ir, { edgeMm: EDGE_MM }));
  console.error(`[trace-figures] wrote ${id}.svg + ${id}.tex`);
}

// F2 — polygon set. (F3/F5 wired in later tasks.)
write('f2-polygons', polygonsFigure([3, 4, 6]));

const EX = path.join(ROOT, 'figures', 'traces', 'running-example');
// F6 — torus-fill DFS of the running example (fill 476, all 18 nodes).
write('f6-torus-fill', torusTreeFigure(loadTrace<TorusNode>(EX, 'torus')));

// F3 — VC search tree, curated, with the example's two VCs highlighted.
write('f3-vc-search', vcTreeFigure(loadTrace<VcNode>(EX, 'vc'), [['3','4','6','4'], ['3','6','3','6']]));
