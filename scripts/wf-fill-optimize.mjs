export const meta = {
	name: 'fill-optimize',
	description: 'Analyze torusFill profile data, propose optimizations across lenses, adversarially completeness-check each, rank',
	whenToUse: 'After profiling torusFill: turn the measured breakdown into a ranked, completeness-safe optimization plan',
	phases: [
		{ title: 'Ground' },
		{ title: 'Propose' },
		{ title: 'Verify' },
		{ title: 'Synthesize' },
	],
};

// args = { profile: <string: the full PS_FILL_PROFILE + cpu-prof breakdown text>, files: <string[]> }
const profile = (args && args.profile) || 'NO PROFILE DATA PROVIDED';
const SRC = 'lib/classes/algorithm/PeriodSolver.ts';

const PRIME_DIRECTIVE = `
PROJECT PRIME DIRECTIVE (non-negotiable, from CLAUDE.md): the thesis contribution is PROVABLE
EXHAUSTIVENESS. Completeness beats speed. ANY optimization that could drop even one valid tiling is
DISQUALIFIED unless it is provably lossless. "Completeness knobs are not speed dials." A prune is
acceptable ONLY if you can state the invariant that guarantees no k-uniform tiling is lost. When in
doubt, reject. Byte-identical enumeration output is the gold standard.`;

const HOTSPOT_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['dominant', 'regime', 'notes'],
	properties: {
		dominant: { type: 'array', items: { type: 'string' }, description: 'buckets/functions ranked by measured share of fill time' },
		regime: { type: 'string', enum: ['combinatorial', 'per-node', 'mixed'], description: 'is the cost driven by too many DFS nodes (combinatorial) or expensive work per node (per-node)?' },
		notes: { type: 'string', description: 'the key evidence from the numbers (counts + times) supporting the regime call' },
	},
};

const PROPOSAL_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['title', 'target', 'mechanism', 'expectedSpeedup', 'completenessArgument', 'riskySteps'],
	properties: {
		title: { type: 'string' },
		target: { type: 'string', description: 'which measured hotspot this attacks' },
		mechanism: { type: 'string', description: 'concretely what changes in the code (function, data structure, algorithm)' },
		expectedSpeedup: { type: 'string', description: 'rough factor and on which fills, grounded in the measured counts/times' },
		completenessArgument: { type: 'string', description: 'the invariant that proves NO tiling is dropped — or "N/A, pure speed, output byte-identical"' },
		riskySteps: { type: 'string', description: 'the single most likely way this silently drops a tiling or breaks exactness' },
	},
};

const VERDICT_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['completenessSafe', 'correctnessSafe', 'verdict', 'reason'],
	properties: {
		completenessSafe: { type: 'boolean', description: 'true ONLY if provably lossless (no tiling can be dropped)' },
		correctnessSafe: { type: 'boolean', description: 'true if it preserves exact-arithmetic correctness (no float decision at a gate)' },
		verdict: { type: 'string', enum: ['accept', 'accept-with-guard', 'reject'] },
		reason: { type: 'string' },
	},
};

phase('Ground');
const hotspot = await agent(
	`You are analyzing a profile of a DFS "torus fill" that enumerates edge-to-edge tilings of a fixed
lattice cell. Read the fill loop and its helpers in ${SRC} (method torusFill and the helpers it calls:
analyze, isCompleteTiling, isPrimitive, properOverlapWithBlock, canonicalRep, buildBlock, stateKey,
extendV). Then read this measured profile and decide where the time really goes and WHY.

MEASURED PROFILE:
${profile}

Return the dominant buckets/functions (ranked by measured share), whether the regime is combinatorial
(too many DFS nodes) or per-node (each node too expensive), and the evidence.`,
	{ label: 'ground:hotspots', phase: 'Ground', schema: HOTSPOT_SCHEMA },
);

phase('Propose');
// Independent optimization lenses. Each is blind to the others; diversity beats one agent listing all.
const LENSES = [
	{ key: 'prune', angle: 'FEWER NODES: sharper but PROVABLY LOSSLESS pruning of the DFS (order of placement, dominance, symmetry of the search, dead-branch detection earlier). Every prune needs a completeness invariant.' },
	{ key: 'cheaper-node', angle: 'CHEAPER NODES: make each pop/place cost less — memoize/cache exact keys, avoid rebuilding blocks, incremental incidence maps, cheaper overlap tests, reuse work across children.' },
	{ key: 'exact-arith', angle: 'CHEAPER EXACT ARITHMETIC: the ℤ[ζ24] key strings / BigInt / Surd operations. Faster canonical keys (integer hashing vs string), lazy exactness, float broadphase before exact, packed representations.' },
	{ key: 'certify', angle: 'VALIDITY WORK: the closure certificate (isCompleteTiling rebuilds a big block + O(block^2) intersects) and isPrimitive. Can these be incrementalized, cached, or replaced by the fast point-group method already in KUniformityFast.ts?' },
	{ key: 'algorithmic', angle: 'DIFFERENT ALGORITHM: is corner-completion DFS the right shape at all? Constraint propagation, exact cover / dancing links, meet-in-the-middle on the cell, or solving the cell as a finite CSP — anything that changes the asymptotics rather than the constant.' },
];

const proposals = await parallel(LENSES.map((L) => () =>
	agent(
		`${PRIME_DIRECTIVE}

You are proposing ONE concrete optimization to this tiling-enumeration DFS, through a specific lens.
Read ${SRC} (torusFill + helpers) and KUniformityFast.ts / KUniformityChecker.ts for context.

MEASURED PROFILE (where time actually goes):
${profile}

GROUNDED REGIME CALL: ${JSON.stringify(hotspot)}

YOUR LENS — ${L.key}: ${L.angle}

Propose the single best optimization through THIS lens, grounded in the measured numbers (do not invent
a hotspot the data doesn't show). Give the mechanism concretely (name the function and the change), the
expected speedup tied to the measured counts, and — critically — the completeness argument: the invariant
that proves it drops no tiling. If you cannot make that argument, say so in riskySteps.`,
		{ label: `propose:${L.key}`, phase: 'Propose', schema: PROPOSAL_SCHEMA },
	).then((p) => (p ? { ...p, lens: L.key } : null)),
));

phase('Verify');
// Adversarially verify each proposal against completeness + exact-correctness. Two independent skeptics
// per proposal, each prompted to REFUTE; a proposal survives as completeness-safe only if neither finds
// a drop mode. This is the project's prime directive enforced as a gate.
const verified = await parallel(proposals.filter(Boolean).map((p) => () =>
	parallel([0, 1].map((i) => () =>
		agent(
			`${PRIME_DIRECTIVE}

Adversarially REVIEW this proposed optimization to a provably-exhaustive tiling enumerator. Your job is
to find how it could DROP a valid tiling or make an unsound (float-at-a-gate) decision. Default to
completenessSafe=false unless the completeness argument is airtight. Read ${SRC} to check the mechanism
against the real code.

PROPOSAL: ${JSON.stringify(p)}

Skeptic pass ${i} (${i === 0 ? 'attack COMPLETENESS: construct a tiling this could drop' : 'attack CORRECTNESS: find where exactness or an invariant breaks'}).`,
			{ label: `verify:${p.lens}:${i}`, phase: 'Verify', schema: VERDICT_SCHEMA },
		),
	)).then((vs) => {
		const ok = vs.filter(Boolean);
		const completenessSafe = ok.length > 0 && ok.every((v) => v.completenessSafe);
		const correctnessSafe = ok.length > 0 && ok.every((v) => v.correctnessSafe);
		const anyReject = ok.some((v) => v.verdict === 'reject');
		return { ...p, verdicts: ok, completenessSafe, correctnessSafe, survives: completenessSafe && correctnessSafe && !anyReject };
	}),
));

phase('Synthesize');
const synth = await agent(
	`${PRIME_DIRECTIVE}

You are the lead optimizer. Below are optimization proposals for the torusFill DFS, each already
adversarially checked for completeness + correctness. Produce the final prioritized plan for the human:

1. RANK the surviving (completeness-safe) proposals by expected payoff — tie payoff to the MEASURED
   numbers, not vibes. State the expected win and the exact code change for each.
2. Call out any proposal REJECTED for completeness risk and why (so the human knows the tempting-but-unsafe
   levers).
3. Explicitly say what should be LEFT AS-IS (already cheap / not on the critical path / risk > reward).
4. If the regime is combinatorial, say so plainly and prioritize node-count levers; if per-node, prioritize
   cheaper-primitive levers.

MEASURED PROFILE:
${profile}

REGIME: ${JSON.stringify(hotspot)}

CHECKED PROPOSALS:
${JSON.stringify(verified.filter(Boolean), null, 2)}`,
	{ label: 'synthesize', phase: 'Synthesize', effort: 'high' },
);

return { hotspot, proposals: proposals.filter(Boolean), verified: verified.filter(Boolean), plan: synth };
