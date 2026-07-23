import { describe, it, expect } from 'vitest';
import type { FigureIR } from '../figures/ir/types';
import { emitTikz } from '../figures/emit/tikz';
import { emitSvg } from '../figures/emit/svg';
import { resolveStyle, tileStyleRef } from '../figures/style/palette';
import { compactVcTex } from '../figures/manifest';

/** Minimal hand-built IR: one square tile, one orbit marker, one label. */
const ir: FigureIR = {
	bbox: { minX: -0.5, minY: -0.5, maxX: 1.5, maxY: 1.5 },
	clip: { minX: -0.25, minY: -0.25, maxX: 1.25, maxY: 1.25 },
	elements: [
		{
			kind: 'poly',
			verts: [
				{ x: 0, y: 0 },
				{ x: 1, y: 0 },
				{ x: 1, y: 1 },
				{ x: 0, y: 1 },
			],
			styleRef: 'tile:n:4',
		},
		{ kind: 'marker', at: { x: 0, y: 0 }, styleRef: 'orbit:0' },
		{ kind: 'text', at: { x: 0.5, y: 0.5 }, tex: '$\\zeta^5$', styleRef: 'label' },
	],
};

describe('TikZ emitter', () => {
	const tex = emitTikz(ir, { edgeMm: 8 });

	it('is a self-contained standalone document', () => {
		expect(tex).toContain('\\documentclass[border=1mm]{standalone}');
		expect(tex).toContain('\\definecolor{figEdge}{HTML}{2B2B2B}');
		expect(tex).toContain('\\begin{tikzpicture}[x=8mm,y=8mm,line join=round,line cap=round]');
		expect(tex).toContain('\\useasboundingbox (-0.5,-0.5) rectangle (1.5,1.5);');
		expect(tex).toContain('\\clip (-0.25,-0.25) rectangle (1.25,1.25);');
	});

	it('fills and strokes the tile on the SAME path (crack avoidance)', () => {
		expect(tex).toContain(
			'\\path[fill=tileN4,draw=figEdge,line width=0.25mm] (0,0) -- (1,0) -- (1,1) -- (0,1) -- cycle;'
		);
	});

	it('emits absolute-mm markers and math labels', () => {
		expect(tex).toContain('\\path[fill=oiBlue] (0,0) circle [radius=0.9mm];');
		expect(tex).toContain('\\node[text=figEdge,font=\\small] at (0.5,0.5) {$\\zeta^5$};');
	});
});

describe('SVG emitter', () => {
	const svg = emitSvg(ir, { edgeMm: 8 });

	it('sizes physically from edgeMm and y-flips via a group', () => {
		expect(svg).toContain('width="16mm" height="16mm" viewBox="-0.5 -1.5 2 2"');
		expect(svg).toContain('<g transform="scale(1,-1)" clip-path="url(#figclip)">');
	});

	it('clip rect is in model coords (transforms with the flipped group)', () => {
		expect(svg).toContain('<clipPath id="figclip"><rect x="-0.25" y="-0.25" width="1.5" height="1.5"/></clipPath>');
	});

	it('converts mm line widths and radii to model units', () => {
		// 0.25mm at 8mm/edge = 0.03125 model units; marker 0.9mm = 0.1125
		expect(svg).toContain('stroke-width="0.03125"');
		expect(svg).toContain('r="0.1125"');
		// app-consistent fill: polygonHue(4)≈44.98° at S=40/B=100 (lib/utils/renderTiling.ts, after the
		// continuous-hue color refresh in 43fd70a)
		expect(svg).toContain('<polygon points="0,0 1,0 1,1 0,1" fill="#FFE599"');
	});
});

describe('style module', () => {
	it('rejects unknown styleRefs loudly', () => {
		expect(() => resolveStyle('tile:n:5')).toThrow();
		expect(() => resolveStyle('nonsense')).toThrow();
	});

	it('maps strategies to tile styleRefs', () => {
		expect(tileStyleRef('byNGon', 6)).toBe('tile:n:6');
		expect(tileStyleRef('byOrbit', 6)).toBe('tile:flat');
		expect(tileStyleRef('lineArt', 6)).toBe('tile:none');
	});
});

describe('compact vertex-type notation (literature convention)', () => {
	it('compresses ADJACENT runs only — cyclic order is type-distinguishing', () => {
		// 3.3.4.3.4 and 3.3.3.4.4 are DIFFERENT vertex types; sorting before compressing would
		// collapse both to 3^3.4^2-ish nonsense.
		expect(compactVcTex('3,3,4,3,4')).toBe('$3^{2}.4.3.4$');
		expect(compactVcTex('3,3,3,4,4')).toBe('$3^{3}.4^{2}$');
		expect(compactVcTex('3,3,3,3,3,3')).toBe('$3^{6}$');
		expect(compactVcTex('3,12,12')).toBe('$3.12^{2}$');
		expect(compactVcTex('4,8,8')).toBe('$4.8^{2}$');
		// no parenthesized grouping: alternating types stay expanded
		expect(compactVcTex('3,6,3,6')).toBe('$3.6.3.6$');
		expect(compactVcTex('3,4,6,4')).toBe('$3.4.6.4$');
	});
});
