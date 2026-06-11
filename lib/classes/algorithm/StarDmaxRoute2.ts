/**
 * TH-4 Route 2 — the INDEPENDENT d_max engine.
 * Spec: docs/superpowers/specs/2026-06-10-th4-th13-star-tables-design.md.
 *
 * Computes d_max = the max vertex degree (= corner count t) over corner multisets that
 *   (a) sum to exactly 24 π/12-units (2π);
 *   (b) have t ≥ 3 (P4: def:tiling-vertex — a t=2 dent-fill is a non-vertex);
 *   (c) contain ≤ 1 dent (P1: two reflex corners sum > 2π);
 *   (d) have #points ≤ ⌊t/2⌋ (P2 in pigeonhole form ⟺ a cyclic arrangement with no two
 *       points adjacent exists).
 * Myers prune (iii) (≥1 star point — uniformity-only, TH-5) is used NOWHERE: point-free
 * multisets (pure-regular, dent-no-point) are inside the search space.
 *
 * INDEPENDENCE (mechanically greppable): this module imports NOTHING from StarVC.ts. The
 * alphabet is derived from the P3 formulas — regular interior (n−2)·12/n; points
 * 0 < α < 12(n−2)/n; dents β = 24 − 24/n − α — over the inherited in-ring scope
 * n ∈ {3,4,6,8,12}. ⚑ P3 is SCOPE, not derivation: if the star scope ever widens (n=24,
 * off-ring α) every constant computed here must be recomputed.
 *
 * Token-class collapse (soundness): constraints (a)–(d) depend only on each corner's
 * (kind, u) pair, never on which variant supplies it — so the search runs over collapsed
 * (kind, u) classes, keeping one representative label per class for the witness. Route
 * agreement (StarTables) checks this against the uncollapsed live enumerator.
 */

export const R2_STAR_NS = [3, 4, 6, 8, 12] as const; // P3: inherited C7/ST-1 scope, NOT derived

export type R2Variant = { n: number; alphaU: number };
export type R2Stratum = 'fig4' | 'fig3eq1' | 'fig3le1';
/** dmax = 0 ⇔ the stratum admits no valid vertex for this alphabet (witness then []). */
export type R2Cell = { dmax: number; witness: string[] };

export function r2RegInteriorU(n: number): number {
	return ((n - 2) * 12) / n;
}

/** All in-ring variants from the P3 formulas (NOT from inRingStarVariants — independence). */
export function r2AllVariants(): R2Variant[] {
	const out: R2Variant[] = [];
	for (const n of R2_STAR_NS) for (let a = 1; a < r2RegInteriorU(n); a++) out.push({ n, alphaU: a });
	return out;
}

/** The dent-regular-fillable subset, from the formulas: γ = 24/n + α ∈ {regular interiors}. */
export function r2DentRegVariants(): R2Variant[] {
	const regs = new Set(R2_STAR_NS.map(r2RegInteriorU));
	return r2AllVariants().filter(({ n, alphaU }) => regs.has(24 / n + alphaU));
}

type ClassTok = { kind: 'reg' | 'pt' | 'dent'; u: number; rep: string };

/** Collapse an alphabet to (kind, u) classes, one representative label per class. */
function classes(variants: R2Variant[], withDents: boolean): ClassTok[] {
	const seen = new Map<string, ClassTok>();
	const add = (kind: ClassTok['kind'], u: number, rep: string) => {
		const k = `${kind}@${u}`;
		if (!seen.has(k)) seen.set(k, { kind, u, rep });
	};
	for (const n of R2_STAR_NS) add('reg', r2RegInteriorU(n), String(n));
	for (const { n, alphaU } of variants) add('pt', alphaU, `${n}*p@${alphaU}`);
	if (withDents) {
		for (const { n, alphaU } of variants) {
			const beta = 24 - 24 / n - alphaU;
			add('dent', beta, `${n}*d@${beta}`);
		}
	}
	return [...seen.values()].sort((a, b) => a.u - b.u || a.kind.localeCompare(b.kind));
}

/**
 * Exact d_max for one family/envelope alphabet and stratum. Exhaustive DFS over class
 * multisets (non-decreasing class index = combinations with repetition). The only prune is
 * the capacity bound (every further token costs ≥ 1 unit), which cannot remove a feasible
 * higher-t completion.
 */
export function r2Dmax(variants: R2Variant[], stratum: R2Stratum): R2Cell {
	const withDents = stratum !== 'fig4';
	const alphabet = classes(variants, withDents);
	let best: R2Cell = { dmax: 0, witness: [] };
	const stack: ClassTok[] = [];

	const dfs = (fromIdx: number, sum: number, pts: number, dents: number) => {
		if (sum === 24) {
			const t = stack.length;
			if (t < 3) return; //                                (b) t ≥ 3
			if (pts > Math.floor(t / 2)) return; //              (d) P2 pigeonhole
			if (stratum === 'fig3eq1' && dents !== 1) return; // stratum gate
			if (t > best.dmax) best = { dmax: t, witness: stack.map((c) => c.rep) };
			return;
		}
		if (stack.length + (24 - sum) <= best.dmax) return; //   capacity prune (units ≥ 1)
		for (let i = fromIdx; i < alphabet.length; i++) {
			const c = alphabet[i];
			if (sum + c.u > 24) continue;
			if (c.kind === 'dent' && dents >= 1) continue; //    (c) P1: ≤ 1 dent
			stack.push(c);
			dfs(i, sum + c.u, pts + (c.kind === 'pt' ? 1 : 0), dents + (c.kind === 'dent' ? 1 : 0));
			stack.pop();
		}
	};
	dfs(0, 0, 0, 0);
	return best;
}
