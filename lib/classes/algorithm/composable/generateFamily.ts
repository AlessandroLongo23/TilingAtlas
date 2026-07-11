import { CyclotomicRing, Cyclotomic } from '@/classes';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';
import { Polyform } from './Polyform';

const REGULAR_ORDERS = [3, 4, 6, 12];

export type CompositeTile = { angles: number[]; name: string; sides: number; tileCounts: Record<number, number> };
export type FamilyRow = { sides: number; numTiles: number; numCornerClasses: number };

/** Fundamental rotation period of a cyclic word (smallest p | len with w[i]==w[i+p]). */
function period(w: number[]): number {
  const L = w.length;
  for (let p = 1; p <= L; p++) {
    if (L % p) continue;
    if (w.every((x, i) => x === w[(i + p) % L])) return p;
  }
  return L;
}

export function generateFamily(maxTiles: number): { tiles: CompositeTile[]; table: FamilyRow[]; peakFrontier: number } {
  const ring = CyclotomicRing.create(12);
  const origin = Cyclotomic.fromRational(ring, 0n); // exact 0
  const seen = new Set<string>();
  const results = new Map<string, CompositeTile>(); // keyed by canonical angle-word
  let frontier: Polyform[] = REGULAR_ORDERS.map(n =>
    new Polyform([RegularPolygon.fromAnchorAndDirExact(n, origin, 0)]));
  for (const pf of frontier) seen.add(pf.canonicalKey());
  let peak = frontier.length;

  for (let size = 1; size < maxTiles; size++) {
    const next: Polyform[] = [];
    for (const pf of frontier) {
      for (const n of REGULAR_ORDERS) {
        for (const grown of pf.glue(n)) {
          const key = grown.canonicalKey();
          if (seen.has(key)) continue;
          seen.add(key);
          next.push(grown);
          const word = grown.convexAngleWord();
          if (word && grown.tiles.length >= 2 && !isBareRegular(word)) {
            const wkey = word.join(',');
            if (!results.has(wkey)) results.set(wkey, toTile(grown, word));
          }
        }
      }
    }
    frontier = next;
    peak = Math.max(peak, next.length);
    if (next.length === 0) break;
  }
  return { tiles: [...results.values()], table: buildTable([...results.values()]), peakFrontier: peak };
}

/** A convex composite whose word equals a single regular n-gon (all angles equal, n∈{3,4,6,12}). */
function isBareRegular(word: number[]): boolean {
  const uniq = new Set(word);
  if (uniq.size !== 1) return false;
  const u = word[0];
  return (u === 2 && word.length === 3) || (u === 3 && word.length === 4)
      || (u === 4 && word.length === 6) || (u === 5 && word.length === 12);
}

function toTile(pf: Polyform, word: number[]): CompositeTile {
  const counts: Record<number, number> = {};
  for (const t of pf.tiles) counts[t.n] = (counts[t.n] ?? 0) + 1;
  return { angles: word, sides: word.length, name: nameFor(word), tileCounts: counts };
}

/** Stable name: side count + dash + the canonical angle-word (e.g. "cx4-2.4.2.4"). */
function nameFor(word: number[]): string { return `cx${word.length}-${word.join('.')}`; }

function buildTable(tiles: CompositeTile[]): FamilyRow[] {
  const bySides = new Map<number, CompositeTile[]>();
  for (const t of tiles) (bySides.get(t.sides) ?? bySides.set(t.sides, []).get(t.sides)!).push(t);
  return [...bySides.keys()].sort((a, b) => a - b).map(sides => {
    const fam = bySides.get(sides)!;
    return { sides, numTiles: fam.length, numCornerClasses: fam.reduce((s, t) => s + period(t.angles), 0) };
  });
}
