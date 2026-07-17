import { readFileSync, writeFileSync } from 'node:fs';
import type { ModuliGraph, GraphEdge, GraphNode } from './graphAssembler';

const LABELS: Record<string, string> = {
  'ctrnact-01_3-6a-1': '3⁶', 'ctrnact-01_34-5c-1': '3.3.3.4.4', 'ctrnact-01_34-5e-1': '3.3.4.3.4',
  'ctrnact-01_346-4l-1': '3.4.6.4', 'ctrnact-01_36-4f-1': '3.6.3.6', 'ctrnact-01_36-5b-1': '3.3.3.3.6',
  'ctrnact-01_3c-3a-1': '3.12.12', 'ctrnact-01_4-4n-1': '4⁴', 'ctrnact-01_46c-3c-1': '4.6.12', 'ctrnact-01_6-3d-1': '6³',
};
const label = (n: GraphNode): string =>
  n.kind === 'degenerate' ? '⊥' : n.kind === 'uncatalogued' ? n.label : (LABELS[n.label] ?? n.label);

const g = JSON.parse(readFileSync('experiments/results/moduli-graph.json', 'utf8')) as ModuliGraph;
const W = 900, H = 720, cx = W / 2, cy = 320, R = 240;

// genuine-tiling nodes on a ring; the single degenerate ⊥ node at the centre (compactification point).
const ring = g.nodes.filter((n) => n.kind !== 'degenerate');
const deg = g.nodes.find((n) => n.kind === 'degenerate');
const pos = new Map<string, [number, number]>();
ring.forEach((n, i) => {
  const a = (2 * Math.PI * i) / ring.length - Math.PI / 2;
  pos.set(n.key, [cx + R * Math.cos(a), cy + R * Math.sin(a)]);
});
if (deg) pos.set(deg.key, [cx, cy]);

const groups = new Map<string, GraphEdge[]>();
for (const e of g.edges) {
  const k = e.from === e.to ? `self:${e.from}` : [e.from, e.to].sort().join('|');
  const list = groups.get(k) ?? [];
  list.push(e);
  groups.set(k, list);
}
const isDeg = (key: string) => deg !== undefined && key === deg.key;
const stroke = (toDeg: boolean) => (toDeg ? 'stroke="#8a8f99" stroke-width="1.3" stroke-dasharray="5,4"' : 'stroke="#3b82c4" stroke-width="1.6"');

const parts: string[] = [];
for (const [k, es] of groups) {
  const toDeg = isDeg(es[0].from) || isDeg(es[0].to);
  if (k.startsWith('self:')) {
    const [x, y] = pos.get(es[0].from)!;
    const o = Math.hypot(x - cx, y - cy) || 1;
    const dx = (x - cx) / o, dy = (y - cy) / o;
    es.forEach((_, idx) => {
      const r = 13 + idx * 8;
      parts.push(`<circle cx="${(x + dx * r).toFixed(1)}" cy="${(y + dy * r).toFixed(1)}" r="${r}" fill="none" ${stroke(toDeg)}/>`);
    });
  } else {
    const [x1, y1] = pos.get(es[0].from)!;
    const [x2, y2] = pos.get(es[0].to)!;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    let nx = -(y2 - y1), ny = x2 - x1; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    es.forEach((_, idx) => {
      const off = (idx - (es.length - 1) / 2) * 26 + (es.length % 2 ? 0 : 13);
      parts.push(`<path d="M${x1.toFixed(1)},${y1.toFixed(1)} Q${(mx + nx * off).toFixed(1)},${(my + ny * off).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}" fill="none" ${stroke(toDeg)}/>`);
    });
  }
}

for (const n of g.nodes) {
  const [x, y] = pos.get(n.key)!;
  const fill = n.kind === 'uniform' ? '#1f2937' : '#fafafa';
  const line = n.kind === 'degenerate' ? '#8a8f99' : n.kind === 'uncatalogued' ? '#cc3333' : '#1f2937';
  const dash = n.kind === 'uniform' ? '' : ' stroke-dasharray="3"';
  const o = Math.hypot(x - cx, y - cy) || 1;
  const lx = n.kind === 'degenerate' ? x : x + ((x - cx) / o) * 22;
  const ly = n.kind === 'degenerate' ? y + 26 : y + ((y - cy) / o) * 22;
  parts.push(
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${n.kind === 'degenerate' ? 9 : 7}" fill="${fill}" stroke="${line}" stroke-width="2"${dash}/>`,
    `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="13" font-family="ui-monospace,monospace" text-anchor="middle" dominant-baseline="middle" fill="${n.kind === 'uncatalogued' ? '#cc3333' : '#1f2937'}">${label(n)}</text>`,
  );
}

const html =
  `<!doctype html><meta charset="utf8"><title>Tiling deformation graph — k=1 isotoxal</title>` +
  `<body style="margin:0;background:#fafafa;font-family:ui-monospace,monospace;color:#1f2937">` +
  `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">` +
  `<rect width="${W}" height="${H}" fill="#fafafa"/>${parts.join('\n')}</svg>` +
  `<p style="max-width:${W}px;padding:0 20px 20px;line-height:1.5">nodes=${g.nodes.length} edges=${g.edges.length} ` +
  `H₁=${g.h1} (with ⊥), ${g.h1NoDegenerate} (genuine tilings only). Solid blue = a deformation between genuine ` +
  `tilings; loops at a node = leave-and-return self-deformations; grey dashed spokes run to ⊥, the shared ` +
  `non-tiling limit. Dashed red = 4.8.8, the octagon tiling deliberately excluded from the catalogue.</p></body>`;
writeFileSync('experiments/results/moduli-graph.html', html);
console.log('wrote experiments/results/moduli-graph.html');
