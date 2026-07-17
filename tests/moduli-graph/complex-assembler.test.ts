import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { assembleComplex } from '../../scripts/moduli-graph/complexAssembler';
import { assembleGraph } from '../../scripts/moduli-graph/graphAssembler';
import { loadCatalogueKeys } from '../../scripts/moduli-graph/catalogueKeys';
import { CyclotomicRing } from '@/classes/Cyclotomic';
import { homology, type CellComplex } from '../../scripts/moduli-graph/chainComplex';
import type { ParametricCellData } from '@/lib/utils/paramCell';

const atlas = JSON.parse(readFileSync('public/reference-atlas-isotoxal.json', 'utf8'));
const recs = (Array.isArray(atlas) ? atlas : atlas.records) as {
  id: string; k?: number; source?: string; family?: string; paramCell?: ParametricCellData;
}[];
const twoParam = (fam: string) =>
  recs.filter((r) => r.k === 2 && r.source === 'isotoxal' && r.family === fam && r.paramCell?.params?.length === 2);

describe('assembleComplex — a single genuine-boundary face', () => {
  it('one 3.3.3.3.4α face develops to a disk: genuine b=[1,0,0], χ=1', () => {
    // Its four corners are genuine uniform tilings and each side carries one interior node, so the
    // boundary is a simple 8-cycle the single 2-cell fills — a topological disk.
    const c = assembleComplex([twoParam('3.3.3.3.4α')[0]]);
    expect(c.faces.length).toBe(1);
    expect(c.betti).toEqual([1, 0, 0]);
    expect(c.chi).toBe(1);
  });

  it('one 4.4α face has a valid (∂1∂2=0) boundary and NO spurious sphere (b2=0)', () => {
    // The mid-α edge identity keeps the four sides distinct, so ∂2(face) is a genuine cycle, not the
    // self-cancelling zero that used to read as a sphere. b1 may be positive (boundary nodes coincide).
    const c = assembleComplex([twoParam('4.4α')[0]]);
    expect(c.faces.length).toBe(1);
    expect(c.betti[2]).toBe(0);
  });
});

describe('k=1 regression: the homology engine reproduces H1=15 on the k=1 graph', () => {
  it('feeds the existing k=1 nodes/edges (float-signature identity) through homology with no faces', () => {
    const k1 = recs.filter((r) => r.k === 1 && r.source === 'isotoxal' && r.paramCell?.params?.length === 1);
    const g = assembleGraph(k1 as never[], loadCatalogueKeys(CyclotomicRing.create(24)));
    const degKeys = new Set(g.nodes.filter((n) => n.kind === 'degenerate').map((n) => n.key));
    const nodes = g.nodes.filter((n) => !degKeys.has(n.key)).map((n) => n.key);
    const idx = new Map(nodes.map((k, i) => [k, i] as const));
    const edges = g.edges
      .filter((e) => !degKeys.has(e.from) && !degKeys.has(e.to))
      .map((e) => [idx.get(e.from)!, idx.get(e.to)!] as [number, number]);
    const h = homology({ nodes, edges, faces: [] } as CellComplex);
    expect(h.betti[1]).toBe(g.h1NoDegenerate); // engine agrees with the cyclomatic number E−V+C
    expect(h.betti[1]).toBe(15);
  });
});
