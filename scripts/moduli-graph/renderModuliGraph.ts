import { readFileSync, writeFileSync } from 'node:fs';
import type { ModuliGraph, GraphEdge } from './graphAssembler';

const LABELS: Record<string, string> = {
  'ctrnact-01_3-6a-1': '3⁶', 'ctrnact-01_34-5c-1': '3.3.3.4.4', 'ctrnact-01_34-5e-1': '3.3.4.3.4',
  'ctrnact-01_346-4l-1': '3.4.6.4', 'ctrnact-01_36-4f-1': '3.6.3.6', 'ctrnact-01_36-5b-1': '3.3.3.3.6',
  'ctrnact-01_3c-3a-1': '3.12.12', 'ctrnact-01_4-4n-1': '4⁴', 'ctrnact-01_46c-3c-1': '4.6.12', 'ctrnact-01_6-3d-1': '6³',
};
const label = (raw: string): string => LABELS[raw] ?? (raw.replace(/^unresolved\(/, '').replace(/\)$/, '') || '?');

const g = JSON.parse(readFileSync('experiments/results/moduli-graph.json', 'utf8')) as ModuliGraph;
const W = 960, H = 820, cx = W / 2, cy = H / 2 - 30, R = 300;
const pos = new Map<string, [number, number]>();
g.nodes.forEach((n, i) => {
  const a = (2 * Math.PI * i) / g.nodes.length - Math.PI / 2;
  pos.set(n.key, [cx + R * Math.cos(a), cy + R * Math.sin(a)]);
});

const groups = new Map<string, GraphEdge[]>();
for (const e of g.edges) {
  const k = e.from === e.to ? `self:${e.from}` : [e.from, e.to].sort().join('|');
  const list = groups.get(k) ?? [];
  list.push(e);
  groups.set(k, list);
}

const parts: string[] = [];
for (const [k, es] of groups) {
  if (k.startsWith('self:')) {
    const [x, y] = pos.get(es[0].from)!;
    const out = Math.hypot(x - cx, y - cy) || 1;
    const dx = (x - cx) / out, dy = (y - cy) / out; // radial-outward direction
    es.forEach((_, idx) => {
      const r = 12 + idx * 8;
      const lx = x + dx * r, ly = y + dy * r;
      parts.push(`<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="${r}" fill="none" stroke="#3b82c4" stroke-width="1.3" opacity="0.85"/>`);
    });
  } else {
    const [x1, y1] = pos.get(es[0].from)!;
    const [x2, y2] = pos.get(es[0].to)!;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    let nx = -(y2 - y1), ny = x2 - x1;
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    es.forEach((_, idx) => {
      const off = (idx - (es.length - 1) / 2) * 28;
      const qx = mx + nx * off, qy = my + ny * off;
      parts.push(`<path d="M${x1.toFixed(1)},${y1.toFixed(1)} Q${qx.toFixed(1)},${qy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}" fill="none" stroke="#3b82c4" stroke-width="1.5"/>`);
    });
  }
}

for (const n of g.nodes) {
  const [x, y] = pos.get(n.key)!;
  const out = Math.hypot(x - cx, y - cy) || 1;
  const lx = x + ((x - cx) / out) * 22, ly = y + ((y - cy) / out) * 22;
  parts.push(
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="${n.resolved ? '#1f2937' : '#fff'}" stroke="${n.resolved ? '#1f2937' : '#cc3333'}" stroke-width="2"${n.resolved ? '' : ' stroke-dasharray="3"'}/>`,
    `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="13" font-family="ui-monospace,monospace" text-anchor="middle" dominant-baseline="middle">${label(n.label)}</text>`,
  );
}

const html =
  `<!doctype html><meta charset="utf8"><title>Tiling deformation graph — k=1 isotoxal</title>` +
  `<body style="margin:0;background:#fafafa;font-family:ui-monospace,monospace;color:#1f2937">` +
  `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">` +
  `<rect width="${W}" height="${H}" fill="#fafafa"/>${parts.join('\n')}</svg>` +
  `<p style="max-width:${W}px;padding:0 20px 20px;line-height:1.5">nodes=${g.nodes.length} edges=${g.edges.length} ` +
  `H1=${g.h1} unresolved=${g.unresolved} — dashed red node = unresolved (octagon 4.8.8, deliberately excluded); ` +
  `loops at a node = deformations that leave a tiling and return to it.</p></body>`;
writeFileSync('experiments/results/moduli-graph.html', html);
console.log('wrote experiments/results/moduli-graph.html');
