#!/usr/bin/env node
// Aggregate a V8 .cpuprofile into per-function self-time and roll it up into the fill's semantic
// buckets. Self-time = Σ timeDeltas over samples whose sampled node is that function (µs → ms).
// Usage: node scripts/analyze-cpuprofile.mjs <file.cpuprofile> [topN] [--subtree <fnName>]
//   --subtree <fnName>: count only samples whose call stack passes through <fnName> (e.g. torusFill),
//   so a polluted whole-process profile (pair-stage + fills) is restricted to the fill call tree.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args[0];
const subtreeIdx = args.indexOf('--subtree');
const subtreeFn = subtreeIdx >= 0 ? args[subtreeIdx + 1] : null;
const topN = parseInt(args[1] && !args[1].startsWith('--') ? args[1] : '35', 10);
if (!file) { console.error('usage: analyze-cpuprofile.mjs <file.cpuprofile> [topN] [--subtree <fnName>]'); process.exit(1); }

const prof = JSON.parse(readFileSync(file, 'utf8'));
const nodeById = new Map();
const parentOf = new Map();
for (const n of prof.nodes) nodeById.set(n.id, n);
for (const n of prof.nodes) for (const ch of n.children ?? []) parentOf.set(ch, n.id);

// Is node `id` inside the <subtreeFn> call subtree? Walk ancestors for a frame with that functionName.
const inSubtreeCache = new Map();
function inSubtree(id) {
	if (!subtreeFn) return true;
	if (inSubtreeCache.has(id)) return inSubtreeCache.get(id);
	let cur = id, hit = false, guard = 0;
	while (cur !== undefined && guard++ < 10000) {
		const n = nodeById.get(cur);
		if (n && n.callFrame.functionName === subtreeFn) { hit = true; break; }
		cur = parentOf.get(cur);
	}
	inSubtreeCache.set(id, hit);
	return hit;
}

// self-time per node id (µs)
const selfUs = new Map();
const { samples, timeDeltas } = prof;
for (let i = 0; i < samples.length; i++) {
	const id = samples[i];
	const dt = timeDeltas[i] ?? 0;
	if (!inSubtree(id)) continue;
	selfUs.set(id, (selfUs.get(id) ?? 0) + dt);
}

// aggregate by function identity (name @ file:line)
const byFn = new Map();
let totalUs = 0;
for (const [id, us] of selfUs) {
	const n = nodeById.get(id);
	if (!n) continue;
	const cf = n.callFrame;
	const fnName = cf.functionName || '(anonymous)';
	const url = (cf.url || '').replace(/.*\/(lib|scripts|node_modules)\//, '$1/');
	const key = `${fnName}  ${url}:${cf.lineNumber + 1}`;
	byFn.set(key, (byFn.get(key) ?? 0) + us);
	totalUs += us;
}

const rows = [...byFn.entries()].sort((a, b) => b[1] - a[1]);
const totalMs = totalUs / 1000;
console.log(`\n# cpu-prof self-time — ${file}`);
console.log(`# ${subtreeFn ? `restricted to '${subtreeFn}' subtree — ` : ''}total sampled ${totalMs.toFixed(0)}ms across ${samples.length} samples\n`);
console.log('  self-ms   pct   function  location');
console.log('  -------  -----  --------------------');
for (const [key, us] of rows.slice(0, topN)) {
	const ms = us / 1000;
	console.log(`  ${ms.toFixed(1).padStart(7)}  ${((100 * us) / totalUs).toFixed(1).padStart(4)}%  ${key}`);
}

// --- semantic roll-up: classify each function into a fill bucket by name substring ---
const BUCKET = [
	// validity
	['intersects',           /\bintersects\b|convex.*overlap|segmentsInter|orient2d/i],
	['analyze/coveredIntvl', /coveredIntervals|\banalyze\b|vcRingNames|gapStartRay/i],
	['certify(isComplete)',  /isCompleteTiling|blockHasProperOverlap|properOverlapWithBlock|coreSelfOverlaps/i],
	['primitive',            /isPrimitive|supercellReject/i],
	// selection / expansion
	['buildBlock',           /buildBlock/i],
	['canonicalRep/reduce',  /canonicalRep|reducePolygon|dedupModLattice/i],
	['extendV/latticeEquiv', /extendV|latticeEquiv/i],
	['construct poly',       /fromAnchorAndDir|isotoxal|RegularPolygon|StarPolygon|\bclone\b|translateExact/i],
	// exact-arithmetic primitives (cross-cutting)
	['Cyclotomic.key/exactKey', /exactKey|\bkey\b.*Cyclotomic|Cyclotomic.*key|\.key |vertexKey/i],
	['Cyclotomic arith',     /Cyclotomic|\bmulZeta\b|\bconj\b|toVector|scaleRational|\badd\b|\bsub\b/i],
	['Surd arith',           /Surd|detSurd|tileAreaSurd/i],
	['BigInt/gcd',           /bgcd|blcm|BigInt|gcd/i],
	['state/dedup key',      /stateKey/i],
];
const buckets = new Map();
let classified = 0;
for (const [key, us] of byFn) {
	const fn = key.split('  ')[0];
	const loc = key;
	for (const [name, re] of BUCKET) {
		if (re.test(fn) || re.test(loc)) { buckets.set(name, (buckets.get(name) ?? 0) + us); classified += us; break; }
	}
}
console.log(`\n# semantic roll-up (best-effort name match; ${((100 * classified) / totalUs).toFixed(0)}% of self-time classified)`);
const brows = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
for (const [name, us] of brows) {
	console.log(`  ${(us / 1000).toFixed(1).padStart(8)}ms  ${((100 * us) / totalUs).toFixed(1).padStart(4)}%  ${name}`);
}
console.log(`  ${((totalUs - classified) / 1000).toFixed(1).padStart(8)}ms  ${((100 * (totalUs - classified)) / totalUs).toFixed(1).padStart(4)}%  (unclassified)`);
