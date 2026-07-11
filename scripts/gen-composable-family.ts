// Run: pnpm tsx scripts/gen-composable-family.ts
import { writeFileSync } from 'node:fs';
import { CyclotomicRing } from '@/classes';
import { generateFamily, type ComposableTile } from '@/classes/algorithm/composable/generateFamily';

const ring = CyclotomicRing.create(12);
const { convex, decomposable, tableA } = generateFamily(ring);

console.log('Table A — convex composable tiles (B) vs. decomposable subset (A), family = side count:');
console.log('sides | #convex(B) | #decomp(A) | #corner-classes');
for (const r of tableA) {
  console.log(
    `${String(r.sides).padStart(5)} | ${String(r.convexCount).padStart(10)} | ` +
    `${String(r.decomposableCount).padStart(9)} | ${r.cornerClasses}`,
  );
}
console.log(
  `total | ${String(convex.length).padStart(10)} | ` +
  `${String(decomposable.length).padStart(9)} | ${tableA.reduce((s, r) => s + r.cornerClasses, 0)}`,
);
console.log(`\nFamily A (decomposable) words: ${decomposable.map(t => t.word.join('.')).join(', ')}`);

const REGULAR = [
  { kind: 'regular', n: 3, name: '3', famchar: '3' },
  { kind: 'regular', n: 4, name: '4', famchar: '4' },
  { kind: 'regular', n: 6, name: '6', famchar: '6' },
  { kind: 'regular', n: 12, name: '12', famchar: 'c' },
];

const COMMENT =
  'Palette-agnosticism DEMO. Regular {3,4,6,12} + composable tiles on the 30deg grid ' +
  '(gen-composable-family.ts, exact zeta24-signed dissect oracle). Counts are NOT all-and-only: ' +
  'a decomposable composite admits multiple dissections, so this is NOT a completeness target.';

const compositeTiles = (tiles: ComposableTile[]) =>
  tiles.map((t, i) => ({ kind: 'composite', name: t.name, angles: t.word, famchar: `x${i}` }));

const writePalette = (file: string, name: string, tiles: ComposableTile[]): void => {
  const palette = {
    name,
    D: 12,
    pinnedLegacy: false,
    comment: COMMENT,
    tiles: [...REGULAR, ...compositeTiles(tiles)],
  };
  writeFileSync(file, JSON.stringify(palette, null, 2) + '\n');
  console.log(`[gen] wrote ${file} (${tiles.length} composites + ${REGULAR.length} regulars)`);
};

console.log('');
writePalette('tools/ctrnact-oracle/alphabets/palettes/composite-decomp.json', 'composite-decomp', decomposable);
writePalette('tools/ctrnact-oracle/alphabets/palettes/composite-convex.json', 'composite-convex', convex);
