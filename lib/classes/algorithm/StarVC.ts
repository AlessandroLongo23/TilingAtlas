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
import { exactPolygonsOverlap } from './exact/exactOverlap';

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

/** True iff the VC carries at least one star corner (point or dent). A star TILING needs ≥1 star
 *  somewhere; at k=1 that forces every VC to be star-bearing (Myers prune iii), but at k≥2 a whole
 *  vertex orbit can be purely regular (the oracle's Fig 36/40/42/43 pins), so the "≥1 star" test
 *  moves from the VC to the seed-set. */
export function isStarBearing(vc: StarVC): boolean {
	return vc.tokens.some((t) => t.kind !== 'reg');
}

/**
 * Parse a Myers orbit string (dot-joined corner tokens, the oracle's `records[].orbits` form) into a
 * `StarVC`. Tokens: `n` regular, `n*p@u` point (interior α = u), `n*d@u` dent (interior reflex β = u,
 * so α = 24 − 24/n − u). The reverse of `tokenStr` + `.`-join; used to canonicalise oracle orbits for
 * matching and to extract the targeted star variants from the fig definitions.
 */
export function starVCFromOrbitString(s: string): StarVC {
	const tokens: CornerTok[] = s.split('.').map((tok): CornerTok => {
		const mp = tok.match(/^(\d+)\*p@(\d+)$/);
		if (mp) {
			const n = Number(mp[1]);
			const u = Number(mp[2]);
			return { kind: 'pt', n, alphaU: u, u };
		}
		const md = tok.match(/^(\d+)\*d@(\d+)$/);
		if (md) {
			const n = Number(md[1]);
			const u = Number(md[2]); // dent interior (reflex) angle
			return { kind: 'dent', n, alphaU: FULL_TURN_U - FULL_TURN_U / n - u, u };
		}
		const n = Number(tok);
		if (!Number.isInteger(n)) throw new Error(`starVCFromOrbitString: unparseable token "${tok}" in "${s}"`);
		return { kind: 'reg', n, u: regInteriorU(n) };
	});
	return { tokens, name: canonicalVCName(tokens.map(tokenStr)) };
}

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
	opts: { includeDents?: boolean; variants?: { n: number; alphaU: number }[]; includeStarFree?: boolean } = {},
): StarVC[] {
	const variants = opts.variants ?? inRingStarVariants();
	// includeStarFree drops prune (iii) so purely-regular VCs are emitted too. Needed at k≥2, where one
	// vertex orbit can be star-free (Myers Fig 36/40/42/43): the "≥1 star" condition then applies to the
	// SEED-SET, not each VC. Adds candidates only (each still certified downstream) — a superset, safe.
	const requirePoint = !opts.includeStarFree;
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
			if (requirePoint && !stack.some(isPoint)) return; //       (iii) ≥ 1 point (dropped when includeStarFree)
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
/**
 * Seat a corner sequence as a fan at `anchor`, first outgoing edge at direction `dir0`, sweeping CCW:
 * each corner covers [dir, dir + u]. Regular → `RegularPolygon`, point → `ExactStarPolygon.isotoxal`
 * (point at anchor), dent → `ExactStarPolygon.isotoxalDentAt` (dent at anchor). The placement primitive
 * shared by `buildStarVCSeed` (single VC at O) and `placeStarVCPair` (a VC seated at an arbitrary
 * vertex×direction). Requires the N=24 ring.
 */
export function seatFan(tokens: CornerTok[], anchor: Cyclotomic, dir0: number): Polygon[] {
	const polygons: Polygon[] = [];
	let dir = ((dir0 % FULL_TURN_U) + FULL_TURN_U) % FULL_TURN_U;
	for (const t of tokens) {
		if (t.kind === 'reg') polygons.push(RegularPolygon.fromAnchorAndDirExact(t.n, anchor, dir));
		else if (t.kind === 'pt') polygons.push(ExactStarPolygon.isotoxal(t.n, t.alphaU, anchor, dir));
		else polygons.push(ExactStarPolygon.isotoxalDentAt(t.n, t.alphaU, anchor, dir));
		dir = (((dir + t.u) % FULL_TURN_U) + FULL_TURN_U) % FULL_TURN_U;
	}
	return polygons;
}

export function buildStarVCSeed(vc: StarVC, ring: Cyclotomic['ring']): SeedConfigurationLike {
	if (ring.N !== 24) throw new Error(`buildStarVCSeed: requires the N=24 ring (got ${ring.N})`);
	const O = Cyclotomic.ZERO(ring);
	const polygons = seatFan(vc.tokens, O, 0);
	return { polygons, vertexConfigurations: [{ computeSharedVertexExact: () => O, polygons }] };
}

/** One admissible 2-fan gluing: the union of tiles (deduped by exact key) plus the two shared
 *  vertices the fans are seated on (VC A at `anchorA`, VC B at `anchorB`). */
export type StarVCPairPlacement = { union: Polygon[]; anchorA: Cyclotomic; anchorB: Cyclotomic };

/**
 * The merge-search adjacency primitive: seat fan A at the origin, then try to seat fan B at each of
 * O's unit-distance neighbours × the few directions that let B reproduce the O–P bridging tile. A
 * placement is admissible iff the two fans SHARE ≥1 tile after exact-key dedup (so the patch is
 * glued/connected) AND no two distinct tiles properly overlap (exact `exactPolygonsOverlap`, §9.4
 * non-convex, antiparallel-collinear shared edges legal). Returns up to `maxSeeds` such gluings. The
 * anchor/direction prunes (see inline) are sound for edge-to-edge tilings — they can only drop a
 * would-be gluing, never add a wrong one, and the driver's GATE-0 catches any dropped target-fig pair.
 * This is the star analog of the regular `VertexConfiguration.checkMergeCompatibility`, and the shared
 * kernel of `generateStarVCCompatibility` (existence ⇒ an edge) and star seed construction (the union
 * ⇒ a 2-VC seed). Requires the N=24 ring.
 */
export function placeStarVCPair(
	vcA: StarVC,
	vcB: StarVC,
	ring: Cyclotomic['ring'],
	maxSeeds: number,
): StarVCPairPlacement[] {
	if (ring.N !== 24) throw new Error(`placeStarVCPair: requires the N=24 ring (got ${ring.N})`);
	const O = Cyclotomic.ZERO(ring);
	const oKey = O.key();
	// direction index of each unit vector ζ^d, so a unit-neighbour P = ζ^e can report its e.
	const zetaDir = new Map<string, number>();
	for (let d = 0; d < FULL_TURN_U; d++) zetaDir.set(Cyclotomic.zeta(ring, d).key(), d);
	// fan B's radiating-edge offsets from its anchor: cumulative interior angles {0, u0, u0+u1, …}.
	const bBoundaries: number[] = [];
	{
		let acc = 0;
		for (const t of vcB.tokens) {
			bBoundaries.push(acc % FULL_TURN_U);
			acc += t.u;
		}
	}
	const A = seatFan(vcA.tokens, O, 0);
	// Fan A is fixed across the whole sweep — build its exact-key set once (was rebuilt per dir0).
	const aKeys = new Set<string>();
	for (const p of A) aKeys.add(p.exactKey());
	// Candidate anchors for fan B = O's UNIT-DISTANCE neighbours (the tile-edge endpoints at O), not
	// every A-vertex. In an edge-to-edge tiling two vertices that share a tile are joined by a unit
	// tile-edge, so the bridging tile has O→P as an edge ⇒ P is an immediate neighbour of O. This cuts
	// the sweep from ~all A-vertices (incl. far outer-ring ones) to ~one per fan corner. Restricting to
	// unit neighbours can only DROP a would-be edge, never add a wrong one; the driver's GATE-0 fails
	// loudly if it ever drops a target fig's pair (none observed for the in-ring point-only figs).
	const anchors = new Map<string, Cyclotomic>();
	for (const t of A) {
		const vs = t.exactVertices!;
		const m = vs.length;
		for (let i = 0; i < m; i++) {
			if (vs[i].key() !== oKey) continue;
			for (const nb of [vs[(i + 1) % m], vs[(i - 1 + m) % m]]) if (nb.key() !== oKey) anchors.set(nb.key(), nb);
		}
	}
	const out: StarVCPairPlacement[] = [];
	sweep: for (const P of anchors.values()) {
		// A shared tile bridges O and P via the unit edge O–P, so fan B must have a radiating edge from
		// P toward O (direction dPO). That pins dir0 to {dPO − boundary} over B's edge offsets — a few
		// candidates, not all 24. Sound necessary prune; the exact-key shared-tile check below still
		// verifies the tile actually coincides.
		const e = zetaDir.get(P.key());
		if (e === undefined) continue; // P not a unit vector (shouldn't happen for tile-edge neighbours)
		const dPO = (e + FULL_TURN_U / 2) % FULL_TURN_U;
		const dirs = new Set<number>();
		for (const b of bBoundaries) dirs.add(((dPO - b) % FULL_TURN_U + FULL_TURN_U) % FULL_TURN_U);
		for (const dir0 of dirs) {
			const B = seatFan(vcB.tokens, P, dir0);
			// glued ⟺ B reproduces ≥1 whole A-tile (exact-key match); the rest of B are new tiles.
			const extra: Polygon[] = [];
			let shared = 0;
			for (const p of B) {
				if (aKeys.has(p.exactKey())) shared++;
				else extra.push(p);
			}
			if (shared === 0) continue; // fans not glued (disconnected patch)
			const union = [...A, ...extra];
			let overlap = false;
			for (let i = 0; i < union.length && !overlap; i++)
				for (let j = i + 1; j < union.length; j++)
					if (exactPolygonsOverlap(union[i].exactVertices!, union[j].exactVertices!)) {
						overlap = true;
						break;
					}
			if (overlap) continue;
			out.push({ union, anchorA: O, anchorB: P });
			if (out.length >= maxSeeds) break sweep;
		}
	}
	return out;
}
