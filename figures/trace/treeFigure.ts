// figures/trace/treeFigure.ts
/** Compose a trace tree into a FigureIR: each node is a small box holding its rendered partial
 *  geometry; parent->child edges are colored by the child's verdict (success bold-green, prune red).
 *  Torus nodes render their `reps` directly. */
import type { FigureIR, FigureElement, V2, Rect } from '../ir/types';
import type { TorusNode, VcNode } from './loadTrace';
import { bboxOfPts, fitInto, regularPolygonAtCorner } from './geometry';
import { layoutTree, type TreeInput } from './treeLayout';
import { curateVcTree } from './curate';

const BOX = 9;
const GAPX = 4;
const GAPY = 7;
const NODEMARGIN = 1;

const pruneVerdict = (v: string) => v.startsWith('prune-') || v === 'contradiction' || v === 'cap-skip' || v === 'reject-supercell' || v === 'cert-fail' || v === 'dedup';

export function torusTreeFigure(nodes: TorusNode[]): FigureIR {
  // The raw trace is NOT a clean id/parentId tree: prune leaves never persist a state, so they
  // carry no `id` at all (only `parentId`); and a placement's terminal verdict (emit/contradiction)
  // is logged as a SEPARATE line reusing that placement's `id` with `parentId` omitted (it's the
  // outcome of that state, not a new placement). Render every JSONL line as its own node — keyed by
  // array index, which is always unique — and resolve each node's parent by looking back through
  // the most recent line that established the referenced raw id.
  const lastByRawId = new Map<number, number>();
  const parentOf: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    let parent = -1;
    if (n.parentId != null) parent = n.parentId === -1 ? -1 : (lastByRawId.get(n.parentId) ?? -1);
    else if (n.id != null) parent = lastByRawId.get(n.id) ?? -1;
    parentOf.push(parent);
    if (n.id != null) lastByRawId.set(n.id, i);
  }

  const input: TreeInput[] = nodes.map((_, i) => ({ id: i, parentId: parentOf[i] }));
  const pos = layoutTree(input);

  const boxOf = (i: number): Rect => {
    const p = pos.get(i)!;
    const cx = p.x * (BOX + GAPX);
    const cy = -p.depth * (BOX + GAPY);
    return { minX: cx, minY: cy - BOX / 2, maxX: cx + BOX, maxY: cy + BOX / 2 };
  };
  const boxCenter = (r: Rect): V2 => ({ x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2 });

  const elements: FigureElement[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (r: Rect) => { minX = Math.min(minX, r.minX); minY = Math.min(minY, r.minY); maxX = Math.max(maxX, r.maxX); maxY = Math.max(maxY, r.maxY); };

  for (let i = 0; i < nodes.length; i++) {
    const parent = parentOf[i];
    if (parent === -1) continue;
    const n = nodes[i];
    const a = boxCenter(boxOf(parent));
    const b = boxCenter(boxOf(i));
    const ref = n.verdict === 'emit' ? 'tree:success' : pruneVerdict(n.verdict) ? 'tree:prune' : 'tree:pathedge';
    elements.push({ kind: 'polyline', verts: [a, b], styleRef: ref });
  }
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const box = boxOf(i);
    grow(box);
    elements.push({ kind: 'polyline', verts: [
      { x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY },
      { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY },
    ], closed: true, styleRef: 'tree:box' });
    if (n.reps && n.reps.length) {
      const allPts: V2[] = n.reps.flatMap((p) => p.verts.map(([x, y]) => ({ x, y })));
      const t = fitInto(bboxOfPts(allPts), box, NODEMARGIN);
      for (const p of n.reps) elements.push({ kind: 'poly', verts: p.verts.map(([x, y]) => t({ x, y })), styleRef: `tile:n:${p.n}` });
    }
    elements.push({ kind: 'text', at: { x: (box.minX + box.maxX) / 2, y: box.minY - 1.2 }, tex: n.verdict.replace(/_/g, '\\_'), styleRef: 'label' });
  }

  const bbox: Rect = { minX: minX - 2, minY: minY - 3, maxX: maxX + 2, maxY: maxY + 2 };
  return { bbox, elements };
}

/** Reconstruct a VC fan from a path of corner sizes: place each polygon at the shared vertex,
 *  opening from the running angle sum. */
function vcFan(pathStr: string[]): { n: number; verts: V2[] }[] {
  const out: { n: number; verts: V2[] }[] = [];
  let angle = 0;
  for (const s of pathStr) {
    const n = Number(s);
    out.push({ n, verts: regularPolygonAtCorner(n, angle) });
    angle += (Math.PI * (n - 2)) / n;
  }
  return out;
}

export function vcTreeFigure(nodes: VcNode[], highlightPaths: string[][]): FigureIR {
  const { kept, droppedCount, highlightIds } = curateVcTree(nodes, highlightPaths);
  const input: TreeInput[] = kept.map((n) => ({ id: n.id, parentId: n.parentId }));
  const pos = layoutTree(input);
  const boxOf = (id: number): Rect => {
    const p = pos.get(id)!; const cx = p.x * (BOX + GAPX); const cy = -p.depth * (BOX + GAPY);
    return { minX: cx, minY: cy - BOX / 2, maxX: cx + BOX, maxY: cy + BOX / 2 };
  };
  const boxCenter = (r: Rect): V2 => ({ x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2 });
  const keptIds = new Set(kept.map((n) => n.id));

  const elements: FigureElement[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of kept) { const b = boxOf(n.id); minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY); }

  for (const n of kept) {
    if (n.parentId === -1 || !keptIds.has(n.parentId)) continue;
    const a = boxCenter(boxOf(n.parentId)); const b = boxCenter(boxOf(n.id));
    const ref = n.verdict === 'emit' ? 'tree:success' : n.verdict.startsWith('prune') || n.verdict.startsWith('reject') ? 'tree:prune' : 'tree:pathedge';
    elements.push({ kind: 'polyline', verts: [a, b], styleRef: ref });
  }
  for (const n of kept) {
    const box = boxOf(n.id);
    elements.push({ kind: 'polyline', verts: [
      { x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }, { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY },
    ], closed: true, styleRef: highlightIds.has(n.id) ? 'tree:success' : 'tree:box' });
    const fan = vcFan(n.path);
    if (fan.length) {
      const pts = fan.flatMap((f) => f.verts);
      const t = fitInto(bboxOfPts(pts), box, NODEMARGIN);
      for (const f of fan) elements.push({ kind: 'poly', verts: f.verts.map(t), styleRef: `tile:n:${f.n}` });
    } else {
      elements.push({ kind: 'text', at: boxCenter(box), tex: 'root', styleRef: 'label' });
    }
    elements.push({ kind: 'text', at: { x: (box.minX + box.maxX) / 2, y: box.minY - 1.2 }, tex: `${n.path.join('.') || '\\varnothing'}`, styleRef: 'label' });
  }
  elements.push({ kind: 'text', at: { x: maxX + 4, y: minY }, tex: `+${droppedCount}\\ \\mathrm{explored}`, styleRef: 'label' });

  return { bbox: { minX: minX - 2, minY: minY - 3, maxX: maxX + 14, maxY: maxY + 2 }, elements };
}
