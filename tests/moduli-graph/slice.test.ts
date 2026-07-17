import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CyclotomicRing } from '@/classes/Cyclotomic';
import { loadCatalogueKeys } from '../../scripts/moduli-graph/catalogueKeys';
import { assembleGraph, type FamilyRecord } from '../../scripts/moduli-graph/graphAssembler';

const atlas = JSON.parse(readFileSync('public/reference-atlas-isotoxal.json', 'utf8'));
const records = (Array.isArray(atlas) ? atlas : atlas.records) as FamilyRecord[];
const families = records.filter(
  (r) => (r as { k?: number }).k === 1 && (r as { source?: string }).source === 'isotoxal' && r.paramCell?.params?.length === 1,
);

describe('k=1 isotoxal slice', () => {
  const g = assembleGraph(families, loadCatalogueKeys(CyclotomicRing.create(24)));

  it('has no chiral nodes (no family reaches the one chiral k=1 tiling)', () => {
    expect(g.nodes.filter((n) => n.chirality !== 'achiral')).toHaveLength(0);
  });

  it('its only unresolved node is the deliberately-excluded octagon (4.8.8)', () => {
    const unresolved = g.nodes.filter((n) => !n.resolved);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].label).toContain('4.8.8');
  });

  it('contains the 3^6 <-> 3.3.3.4.4 bigon nodes', () => {
    const labels = new Set(g.nodes.map((n) => n.label));
    expect(labels.has('ctrnact-01_3-6a-1')).toBe(true);
    expect(labels.has('ctrnact-01_34-5c-1')).toBe(true);
  });
});
