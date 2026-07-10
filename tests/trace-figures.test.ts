// tests/trace-figures.test.ts
import { describe, it, expect } from 'vitest';
import { loadTrace, type VcNode, type TorusNode } from '../figures/trace/loadTrace';

const EX = 'figures/traces/running-example';

describe('loadTrace', () => {
  it('loads vc nodes with the expected shape', () => {
    const vc = loadTrace<VcNode>(EX, 'vc');
    expect(vc.length).toBe(64);
    expect(vc[0]).toMatchObject({ id: 1, parentId: -1, verdict: 'extend' });
    expect(Array.isArray(vc[0].path)).toBe(true);
    expect(vc.filter((n) => n.verdict === 'emit').length).toBe(11);
  });

  it('loads torus nodes for fill 476 (18 nodes, root has reps)', () => {
    const torus = loadTrace<TorusNode>(EX, 'torus');
    expect(torus.length).toBe(18);
    const root = torus.find((n) => n.verdict === 'root')!;
    expect(root.k).toBe(2);
    expect(root.reps!.length).toBeGreaterThan(0);
    expect(Array.isArray(root.reps![0].verts[0])).toBe(true);
  });

  it('returns [] for a missing stage', () => {
    expect(loadTrace(EX, 'seed')).toEqual([]);
  });
});

// append to tests/trace-figures.test.ts
import { regularPolygonAtCorner, bboxOfPts, fitInto } from '../figures/trace/geometry';
import type { V2 } from '../figures/ir/types';

describe('geometry', () => {
  it('regularPolygonAtCorner: unit triangle at corner angle 0 has 3 verts, corner at origin', () => {
    const tri = regularPolygonAtCorner(3, 0);
    expect(tri.length).toBe(3);
    expect(tri[0].x).toBeCloseTo(0, 9);
    expect(tri[0].y).toBeCloseTo(0, 9);
    expect(Math.hypot(tri[1].x - tri[0].x, tri[1].y - tri[0].y)).toBeCloseTo(1, 9);
    expect(Math.atan2(tri[2].y - tri[0].y, tri[2].x - tri[0].x)).toBeCloseTo(Math.PI / 3, 9);
  });

  it('regularPolygonAtCorner: square has 4 verts, interior angle 90', () => {
    const sq = regularPolygonAtCorner(4, 0);
    expect(sq.length).toBe(4);
    expect(Math.atan2(sq[3].y - sq[0].y, sq[3].x - sq[0].x)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('fitInto maps a bbox into the target box preserving aspect (centered)', () => {
    const pts: V2[] = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }];
    const box = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const t = fitInto(bboxOfPts(pts), box, 1);
    const out = pts.map(t);
    for (const p of out) { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(10); expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(10); }
    expect(out[1].x - out[0].x).toBeCloseTo(8, 6);
    expect(out[2].y - out[1].y).toBeCloseTo(4, 6);
  });
});

// append to tests/trace-figures.test.ts
import { resolveStyle } from '../figures/style/palette';

describe('palette tree refs', () => {
  it('registers the tree/figure styleRefs without throwing', () => {
    for (const ref of ['tree:box', 'tree:edge', 'tree:pathedge', 'tree:prune', 'tree:success', 'vec:pool', 'vec:winner']) {
      expect(() => resolveStyle(ref)).not.toThrow();
    }
  });
});

// append to tests/trace-figures.test.ts
import { polygonsFigure } from '../figures/trace/polygonsFigure';

describe('F2 polygons figure', () => {
  it('emits one poly element per input n, each labeled', () => {
    const ir = polygonsFigure([3, 4, 6]);
    const polys = ir.elements.filter((e) => e.kind === 'poly');
    const labels = ir.elements.filter((e) => e.kind === 'text');
    expect(polys.length).toBe(3);
    expect(labels.length).toBeGreaterThanOrEqual(3);
    const xs = polys.map((p) => Math.min(...(p as { verts: { x: number }[] }).verts.map((v) => v.x)));
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
  });
});

// append to tests/trace-figures.test.ts
import { layoutTree, type TreeInput } from '../figures/trace/treeLayout';
import { torusTreeFigure } from '../figures/trace/treeFigure';
import { loadTrace as load2, type TorusNode as TN } from '../figures/trace/loadTrace';

describe('treeLayout', () => {
  it('assigns depth by ancestry and non-overlapping x to leaves', () => {
    const nodes: TreeInput[] = [
      { id: 1, parentId: -1 }, { id: 2, parentId: 1 }, { id: 3, parentId: 1 }, { id: 4, parentId: 2 },
    ];
    const pos = layoutTree(nodes);
    expect(pos.get(1)!.depth).toBe(0);
    expect(pos.get(4)!.depth).toBe(2);
    expect(pos.get(2)!.x).not.toBeCloseTo(pos.get(3)!.x, 6);
  });
});

describe('F6 torus tree', () => {
  it('renders all 18 fill-476 nodes with per-node geometry + edges', () => {
    const torus = load2<TN>('figures/traces/running-example', 'torus');
    const ir = torusTreeFigure(torus);
    const polys = ir.elements.filter((e) => e.kind === 'poly');
    const edges = ir.elements.filter((e) => e.kind === 'polyline');
    expect(polys.length).toBeGreaterThan(18);
    expect(edges.length).toBeGreaterThanOrEqual(17);
  });
});

// append to tests/trace-figures.test.ts
import { curateVcTree } from '../figures/trace/curate';
import { vcTreeFigure } from '../figures/trace/treeFigure';
import { loadTrace as load3, type VcNode as VN } from '../figures/trace/loadTrace';

describe('curateVcTree', () => {
  it('keeps paths to highlighted VCs + one stub per prune reason + an ellipsis, deterministically', () => {
    const vc = load3<VN>('figures/traces/running-example', 'vc');
    const a = curateVcTree(vc, [['3', '4', '6', '4'], ['3', '6', '3', '6']]);
    const b = curateVcTree(vc, [['3', '4', '6', '4'], ['3', '6', '3', '6']]);
    expect(a.kept.map((n) => n.id)).toEqual(b.kept.map((n) => n.id));
    const emits = a.kept.filter((n) => n.verdict === 'emit').map((n) => n.path.join('.'));
    expect(emits).toContain('3.4.6.4');
    expect(emits).toContain('3.6.3.6');
    expect(a.kept.length).toBeLessThan(vc.length);
    expect(a.droppedCount).toBe(vc.length - a.kept.length);
  });
});

describe('F3 vc tree figure', () => {
  it('builds a FigureIR with fan polys + edges + the ellipsis label', () => {
    const vc = load3<VN>('figures/traces/running-example', 'vc');
    const ir = vcTreeFigure(vc, [['3', '4', '6', '4'], ['3', '6', '3', '6']]);
    expect(ir.elements.filter((e) => e.kind === 'poly').length).toBeGreaterThan(5);
    expect(ir.elements.some((e) => e.kind === 'text' && (e as { tex: string }).tex.includes('explored'))).toBe(true);
  });
});
