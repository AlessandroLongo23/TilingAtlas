import { describe, it, expect } from 'vitest';
import { CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { deserializeCell, type SerializedCell } from '@/classes/algorithm/cellCodec';
import { seedFromCell, seedFromPeriodCell } from '@/lib/services/cellCodecService';
import catalogue from '../figures/data/catalogue-k1-3.json';

describe('seedFromPeriodCell', () => {
  const ring = CyclotomicRing.create(24);
  setActiveRing(ring);
  const sc = (catalogue as unknown as { tilings: { cellCodec: SerializedCell | null }[] }).tilings
    .find((t) => t.cellCodec)!.cellCodec as SerializedCell;

  it('matches seedFromCell (same T1/T2 and same vertex key set)', () => {
    const viaCodec = seedFromCell(ring, sc);
    const viaCell = seedFromPeriodCell(deserializeCell(ring, sc));
    expect(viaCell.T1.equals(viaCodec.T1)).toBe(true);
    expect(viaCell.T2.equals(viaCodec.T2)).toBe(true);
    const a = viaCell.seed.map((c) => c.key()).sort();
    const b = viaCodec.seed.map((c) => c.key()).sort();
    expect(a).toEqual(b);
  });
});
