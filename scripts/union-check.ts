/* C1 cross-mode set-identity check (memory: "cross-mode checks use dedupeByCongruence; canonicalKey is a
 * bucket hash"). Reads two scout-cache NDJSON files (e.g. the fast-path and the PROVEN-config caches for
 * the same k), unions their cells, and dedupes by CONGRUENCE. If each dedupes to the certified count C and
 * the UNION also dedupes to C, the two catalogues are the SAME tiling set — proven mode lost nothing and
 * added nothing spurious. Run: pnpm tsx scripts/union-check.ts <fast.ndjson> <proven.ndjson> */
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import { dedupeByCongruence } from '@/classes/algorithm/TilingCongruence';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';
import { deserializeCell, readResumeNdjson } from './scoutCodec';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const extractor = new TranslationalCellExtractor();

const load = (path: string): PeriodCell[] => readResumeNdjson(path).cells.map((sc) => deserializeCell(ring, sc));
const dedup = (cells: PeriodCell[]) => dedupeByCongruence(cells, (c) => extractor.canonicalKey(c.cellPolygons));

const [pathA, pathB] = [process.argv[2], process.argv[3]];
if (!pathA || !pathB) { console.error('usage: union-check.ts <a.ndjson> <b.ndjson>'); process.exit(1); }

const a = load(pathA), b = load(pathB);
const dA = dedup(a), dB = dedup(b);
const dU = dedup([...a, ...b]);
console.log(`A (${pathA}): ${a.length} raw → ${dA.length} distinct`);
console.log(`B (${pathB}): ${b.length} raw → ${dB.length} distinct`);
console.log(`UNION: ${a.length + b.length} raw → ${dU.length} distinct`);
const identical = dA.length === dB.length && dU.length === dA.length;
console.log(identical ? `✅ SET-IDENTICAL: both = union = ${dU.length} distinct tilings (no loss, no spurious)` : `❌ DIFFER: A=${dA.length} B=${dB.length} union=${dU.length}`);
