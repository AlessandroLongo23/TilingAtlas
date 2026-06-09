/**
 * Exact in-ring star vertex-configuration (VC) enumeration for the C7 Increment-2 run — Myers (2004)
 * isotoxal star tilings `n*_α` with α pinned to π/12 multiples by the surrounding regulars.
 *
 * This is a STANDALONE exact enumerator, deliberately NOT an extension of the legacy float `VCGenerator`
 * / `PolygonSignature` / `SeedBuilder` front-end:
 *   - that front-end is float and feeds the REGULAR pipeline; plumbing stars through it risks the
 *     regular byte-identical invariant and re-introduces float on the decisive star path;
 *   - the C7 spike already established the exact hand-built-seed pattern (4(j)/4(p) harnesses).
 * The enumerator emits angular VC descriptors; `buildStarVCSeed` materialises the exact seed fan
 * (`RegularPolygon.fromAnchorAndDirExact` + `ExactStarPolygon.isotoxal`), which `PeriodSolver.solve`
 * then fills + certifies. The combinatorial VC constraints here are necessary conditions; the geometric
 * realisability (fill + gap-free certificate + k-gate) is decided by the solver.
 *
 * Units: π/12 (= 2π/24). A full turn = 24. A straight angle = 12. See `docs/DEVELOPMENT_NOTES.md` §24.
 */
import { Cyclotomic } from '../Cyclotomic';
import { RegularPolygon } from '../polygons/RegularPolygon';
import { ExactStarPolygon } from '../polygons/ExactStarPolygon';
import type { Polygon } from '../polygons/Polygon';
import type { SeedConfigurationLike } from './SeedExpander';

export const STAR_NS = [3, 4, 6, 8, 12] as const;
const FULL_TURN_U = 24;
const STRAIGHT_U = 12;

/** Interior angle of a regular n-gon in π/12 units = (n−2)·12/n (integer for n | 24). */
export function regInteriorU(n: number): number {
	return ((n - 2) * 12) / n;
}

/** The ~32 admissible in-ring star variants: n ∈ {3,4,6,8,12}, 0 < α < regInteriorU(n) (⟺ dent reflex). */
export function inRingStarVariants(): { n: number; alphaU: number }[] {
	const out: { n: number; alphaU: number }[] = [];
	for (const n of STAR_NS) {
		const max = regInteriorU(n);
		for (let a = 1; a < max; a++) out.push({ n, alphaU: a });
	}
	return out;
}

/** Regular-tile interior angles in π/12 units (n = 3,4,6,8,12 → 4,6,8,9,10). */
export const REGULAR_INTERIOR_U: ReadonlySet<number> = new Set(STAR_NS.map(regInteriorU));

/**
 * SOUND necessary filter for Fig-4 (point-at-vertex) star tilings: a star's DENT lands at a t=2
 * dent-fill point where dent(β) + γ = 2π, so the dent-fill angle γ = 2π − β = 24/n + α must be filled
 * by a single available corner. Requiring that corner to be a REGULAR one (γ ∈ {4,6,8,9,10}) cuts the
 * 32 admissible variants to 19 — and is a SOUND SUPERSET of the TA oracle (it equals the oracle for
 * n=3,4,6 and contains it for n=8,12). The solver rejects the extras (they yield 0 cells).
 *
 * ⚑ Assumption flagged loud (project doctrine): dents filled by a *single regular* corner. A Fig-4
 * tiling whose dent is filled by a STAR POINT (γ a point angle) would be DROPPED by this filter — not
 * observed in the in-ring oracle, but a real completeness caveat for the general/Fig-3 case.
 */
export function dentRegularFillableVariants(): { n: number; alphaU: number }[] {
	return inRingStarVariants().filter(({ n, alphaU }) => REGULAR_INTERIOR_U.has(24 / n + alphaU));
}

export type CornerTok =
	| { kind: 'reg'; n: number; u: number } //                  regular n-gon corner, interior u
	| { kind: 'pt'; n: number; alphaU: number; u: number } //   star POINT, interior α (= u)
	| { kind: 'dent'; n: number; alphaU: number; u: number }; // star DENT, interior β (= u, reflex)

export type StarVC = { tokens: CornerTok[]; name: string };

/** Token string matching `Polygon.cornerToken` exactly, so a VC name here equals the solver's VC name. */
export function tokenStr(t: CornerTok): string {
	if (t.kind === 'reg') return String(t.n);
	return `${t.n}*${t.kind === 'dent' ? 'd' : 'p'}@${t.u}`;
}

/** Rotation+reflection-canonical VC name — byte-identical to `PeriodSolver.canonicalVCName`. */
export function canonicalVCName(toks: string[]): string {
	const rotMin = (a: string[]): string => {
		let best: string | null = null;
		for (let i = 0; i < a.length; i++) {
			const r = a.slice(i).concat(a.slice(0, i)).join(',');
			if (best === null || r < best) best = r;
		}
		return best ?? '';
	};
	const f = rotMin(toks);
	const r = rotMin(toks.slice().reverse());
	return f < r ? f : r;
}

const isPoint = (t: CornerTok): boolean => t.kind === 'pt';
const isDent = (t: CornerTok): boolean => t.kind === 'dent';

/**
 * Enumerate the in-ring star VCs (cyclic corner sequences summing to 2π) under Myers's combinatorial
 * prunes. Corners: regular n-gons + star POINTS (always) + star DENTS (only when `includeDents`, the
 * Fig-3 dent-at-vertex class — best-effort). Necessary conditions only; the solver decides realisability.
 *
 * Prunes (Myers 2004; contract §5):
 *   (i)   no vertex has two dents          → ≤ 1 dent token;
 *   (ii)  two star points never adjacent   → no two consecutive point tokens (cyclically);
 *   (iii) every star-tiling vertex ≥ 1 point (k=1: the single VC must carry a star ⇒ ≥ 1 point).
 * Plus t ≥ 3 (a real ≥3-tile vertex; a 2-tile point is a dent-fill non-vertex).
 *
 * Rotational duplicates are avoided by forcing the first token to be the cyclic-minimum (each token
 * ≥ tokens[0] by `tokenStr` order); reflections are merged by the canonical name.
 */
export function enumerateStarVCs(
	opts: { includeDents?: boolean; variants?: { n: number; alphaU: number }[] } = {},
): StarVC[] {
	const variants = opts.variants ?? inRingStarVariants();
	const alphabet: CornerTok[] = [];
	for (const n of STAR_NS) alphabet.push({ kind: 'reg', n, u: regInteriorU(n) });
	for (const { n, alphaU } of variants) alphabet.push({ kind: 'pt', n, alphaU, u: alphaU });
	if (opts.includeDents) {
		for (const { n, alphaU } of variants) {
			const betaU = FULL_TURN_U - FULL_TURN_U / n - alphaU; // reflex dent, > 12
			alphabet.push({ kind: 'dent', n, alphaU, u: betaU });
		}
	}
	// Stable order so "≥ first token" reproduces the canonical-min-rotation trick.
	alphabet.sort((a, b) => (tokenStr(a) < tokenStr(b) ? -1 : tokenStr(a) > tokenStr(b) ? 1 : 0));

	const seen = new Set<string>();
	const out: StarVC[] = [];
	const stack: CornerTok[] = [];
	let sum = 0;
	let dentCount = 0;

	const dfs = () => {
		if (sum === FULL_TURN_U) {
			if (stack.length < 3) return; //                           t ≥ 3
			const first = stack[0];
			const last = stack[stack.length - 1];
			if (isPoint(first) && isPoint(last)) return; //            (ii) cyclic point-adjacency
			if (isDent(first) && isDent(last)) return; //              (i) cyclic dent-adjacency (≤1 dent ⇒ rare, but safe)
			if (!stack.some(isPoint)) return; //                       (iii) ≥ 1 point
			const name = canonicalVCName(stack.map(tokenStr));
			if (seen.has(name)) return;
			seen.add(name);
			out.push({ tokens: stack.slice(), name });
			return;
		}
		const prev = stack[stack.length - 1];
		const firstStr = stack.length > 0 ? tokenStr(stack[0]) : null;
		for (const t of alphabet) {
			if (sum + t.u > FULL_TURN_U) continue; //                  over 2π
			if (firstStr !== null && tokenStr(t) < firstStr) continue; // first token = cyclic min
			if (prev && isPoint(prev) && isPoint(t)) continue; //      (ii) no two adjacent points
			if (isDent(t) && dentCount >= 1) continue; //             (i) ≤ 1 dent
			stack.push(t);
			sum += t.u;
			if (isDent(t)) dentCount++;
			dfs();
			if (isDent(t)) dentCount--;
			sum -= t.u;
			stack.pop();
		}
	};
	dfs();
	out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	return out;
}

/**
 * Materialise the exact seed fan for a VC: each corner seated at the shared vertex O with its outgoing
 * edge at the running direction, covering [dir, dir+u]. A regular corner → `RegularPolygon`; a point →
 * `ExactStarPolygon.isotoxal` (point at O); a dent → `ExactStarPolygon.isotoxalDentAt` (dent at O).
 * Mirrors the 4(j)/4(p) spike harnesses. Requires the N=24 ring.
 */
export function buildStarVCSeed(vc: StarVC, ring: Cyclotomic['ring']): SeedConfigurationLike {
	if (ring.N !== 24) throw new Error(`buildStarVCSeed: requires the N=24 ring (got ${ring.N})`);
	const O = Cyclotomic.ZERO(ring);
	const polygons: Polygon[] = [];
	let dir = 0;
	for (const t of vc.tokens) {
		if (t.kind === 'reg') polygons.push(RegularPolygon.fromAnchorAndDirExact(t.n, O, dir));
		else if (t.kind === 'pt') polygons.push(ExactStarPolygon.isotoxal(t.n, t.alphaU, O, dir));
		else polygons.push(ExactStarPolygon.isotoxalDentAt(t.n, t.alphaU, O, dir));
		dir = ((dir + t.u) % FULL_TURN_U + FULL_TURN_U) % FULL_TURN_U;
	}
	return { polygons, vertexConfigurations: [{ computeSharedVertexExact: () => O, polygons }] };
}
