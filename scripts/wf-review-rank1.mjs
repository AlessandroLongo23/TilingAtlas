export const meta = {
	name: 'review-rank1',
	description: 'Adversarially review the Rank-1 periodic-overlap change for a soundness/completeness break',
	phases: [{ title: 'Attack' }, { title: 'Judge' }],
};

const SRC = 'lib/classes/algorithm/PeriodSolver.ts';
const CHANGE = `
RANK-1 CHANGE under review (in ${SRC}):
Replaced the certificate's overlap leg AND the per-fill setup overlap check —
  OLD: blockHasProperOverlap(block)  — O(|block|²) all-pairs: for every pair (i,j) in the block,
       !isEquivalent && intersects.
  NEW: blockOverlapPeriodic(reps, block, ctx, Rabs) = reps.some(rep ⇒ properOverlapWithBlock(rep, block, ctx)),
       with a guard: if (Rabs+2 < 2·ctx.maxCircum) fall back to blockHasProperOverlap.
Call sites: isCompleteTiling certify leg (Rabs = cellDiam+8) and torusFill setup (initialBlock, Rabs=5).
properOverlapWithBlock(P, block): skips q where q.exactKey()===P.exactKey(); culls q beyond
cullR = circumP + ctx.maxCircum + 1e-9; then !isEquivalent && intersects.

Claimed justification: the block is a union of Λ-translates of the fundamental reps, so any proper overlap
A∩B has a rep witness — translate A onto rep_a, then rep_a overlaps rep_b+(λ_B−λ_A), which lies within
cellDiam+2·maxCircum of the origin, hence inside the block when reach (Rabs+cellDiam+2) ≥ that. So
reps-vs-block finds the SAME overlaps as all-pairs. NEW-true ⟹ OLD-true unconditionally (never drops a
tiling); NEW≡OLD given the reach guard (never accepts an overlapping cell).

Proven so far: differential test old===periodic on 92 certified REGULAR k≤3 cells + 8 constructed overlaps;
k=1 enumeration digest 6f9ca9cf2d16c75f unchanged; 32/32 period-solver tests pass.
`;

const DIRECTIVE = `PROJECT PRIME DIRECTIVE: provable exhaustiveness. A change that could DROP a valid tiling
(NEW returns true where OLD returns false → wrongly reject) or wrongly ACCEPT an overlapping cell (NEW
false where OLD true → over-count, breaks the oracle bijection) is a DEFECT. Read the ACTUAL code in ${SRC}
(blockOverlapPeriodic, properOverlapWithBlock, blockHasProperOverlap, buildBlock, coreSelfOverlapsNearest,
isCompleteTiling, and the torusFill setup). Do not trust the prose — verify against the code.`;

const SCHEMA = {
	type: 'object', additionalProperties: false,
	required: ['break', 'scenario', 'severity', 'detail'],
	properties: {
		break: { type: 'boolean', description: 'true if you found a concrete way NEW differs from OLD (a real defect)' },
		scenario: { type: 'string', description: 'the concrete cell/lattice/palette that triggers it, or "none found"' },
		severity: { type: 'string', enum: ['drops-tiling', 'accepts-overlap', 'none'] },
		detail: { type: 'string', description: 'the mechanism, tied to specific lines/values in the code' },
	},
};

phase('Attack');
const LENSES = [
	{ key: 'stars', angle: 'STAR tiles specifically: the differential test only covered REGULAR catalogue cells. Can blockOverlapPeriodic differ from blockHasProperOverlap for a star cell? Consider properOverlapWithBlock\'s cullR (circumP+maxCircum) and the exact star overlap path (exactPolygonsOverlap), and whether a star\'s circumradius vs maxCircum breaks the reach guard at the setup site (Rabs=5).' },
	{ key: 'oblique', angle: 'OBLIQUE / anisotropic lattices (small sinθ, holohedry-2, e.g. t3046/t3055): does the periodicity witness argument hold when the block reach (Rabs+cellDiam+2, a EUCLIDEAN radius) may not contain rep_b+(λ_B−λ_A) for a translate that is short in Euclidean length but not covered by the buildBlock (m,n) index range? Cross-check against buildBlock\'s actual (Mm,Mn) index bounds and BLOCK_INDEX_CAP. This is the exact failure mode CLAUDE.md forbids (bound step count, not length).' },
	{ key: 'guard-and-culls', angle: 'The reach GUARD (Rabs+2 < 2·maxCircum) and properOverlapWithBlock\'s culls: is the guard threshold correct (does Rabs+2 ≥ 2·maxCircum actually guarantee the witness is in the block, given buildBlock\'s own centroid<limit filter)? Can properOverlapWithBlock\'s exactKey-skip or cullR skip a pair that blockHasProperOverlap would flag, at either the certify site (Rabs=cellDiam+8) or the setup site (Rabs=5, smaller block)? Also: coreSelfOverlapsNearest still runs before the setup check — does removing/altering the setup overlap semantics interact with it?' },
];
const attacks = await parallel(LENSES.map((L) => () =>
	agent(`${DIRECTIVE}\n\n${CHANGE}\n\nATTACK LENS — ${L.key}: ${L.angle}\n\nTry hard to construct a concrete break. If after reading the code you cannot, say break=false with the reason it's structurally impossible.`,
		{ label: `attack:${L.key}`, phase: 'Attack', schema: SCHEMA, effort: 'high' }).then((r) => (r ? { ...r, lens: L.key } : null)),
));

phase('Judge');
const verdict = await agent(
	`${DIRECTIVE}\n\n${CHANGE}\n\nThree adversarial reviewers attacked the Rank-1 change:\n${JSON.stringify(attacks.filter(Boolean), null, 2)}\n\nAdjudicate: is Rank-1 SAFE to keep as implemented, or is there a real break that needs a fix (e.g. star-gating the reduction, or an area-based reach guard)? Give a clear verdict and, if any attack has merit, the minimal safe fix. Weigh that the differential test + digest already prove equivalence on regular k≤3 catalogue cells — the open risk is only what those don't cover (stars, oblique cells at k≥3, exotic palettes).`,
	{ label: 'judge', phase: 'Judge', effort: 'high' },
);
return { attacks: attacks.filter(Boolean), verdict };
