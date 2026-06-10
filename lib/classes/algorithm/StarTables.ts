/**
 * TH-4/TH-13 table assembly.
 * Spec: docs/superpowers/specs/2026-06-10-th4-th13-star-tables-design.md.
 *
 * Route 1 = the live enumerator (StarVC.enumerateStarVCs — Myers prunes (i)/(ii) verbatim)
 * + EXHAUSTIVE point-free fold-backs, because the enumerator hard-codes prune (iii) at
 * StarVC.ts:134 (unconditionally — includeDents does not bypass it). Case split over all
 * (i)/(ii)-admissible vertices: point-carrying (enumerator) | pure-regular (computed below;
 * corners ≥ 4u ⇒ t ≤ 6) | dent-no-point (computed below; β ≥ 13 ⇒ ≤ 11u left ⇒ ≤ 2
 * regulars ⇒ t ≤ 3). Both fold-backs are COMPUTED per alphabet, never asserted.
 *
 * Route 2 = StarDmaxRoute2 (independent — P3 formula alphabet, zero StarVC imports).
 * The published number is Route 2's; per-cell route agreement and the
 * fig3le1 == max(fig4, fig3eq1) identity are hard gates (exit non-zero in the scripts).
 */
import {
	enumerateStarVCs,
	inRingStarVariants,
	dentRegularFillableVariants,
	regInteriorU,
	canonicalVCName,
	STAR_NS,
} from './StarVC';
import {
	r2AllVariants,
	r2DentRegVariants,
	r2Dmax,
	r2RegInteriorU,
	R2_STAR_NS,
	type R2Variant,
	type R2Stratum,
	type R2Cell,
} from './StarDmaxRoute2';

export const STRATA: R2Stratum[] = ['fig4', 'fig3eq1', 'fig3le1'];

const REG_US = [...STAR_NS].map(regInteriorU); // [4, 6, 8, 9, 10]

/** Exact max t over pure-regular multisets summing to 24 (t ≥ 3). Computed, not asserted (= 6, 3⁶). */
function pureRegularMax(): number {
	let best = 0;
	const dfs = (fromIdx: number, sum: number, count: number) => {
		if (sum === 24) {
			if (count >= 3 && count > best) best = count;
			return;
		}
		for (let i = fromIdx; i < REG_US.length; i++) {
			if (sum + REG_US[i] > 24) continue;
			dfs(i, sum + REG_US[i], count + 1);
		}
	};
	dfs(0, 0, 0);
	return best;
}

/**
 * Exact max t over {one family dent} + regulars summing to 24 (t ≥ 3); 0 if none exists.
 * Universe-level invariant asserted loud: the NOTES lemma (β ≥ 13 ⇒ ≤ 11u ⇒ ≤ 2 regulars
 * ⇒ t ≤ 3) must hold for every alphabet — a violation means the P3 premises broke.
 */
function dentNoPointMax(variants: R2Variant[]): number {
	let best = 0;
	for (const { n, alphaU } of variants) {
		const beta = 24 - 24 / n - alphaU;
		const dfs = (fromIdx: number, sum: number, count: number) => {
			if (sum === 24) {
				if (count >= 3 && count > best) best = count;
				return;
			}
			for (let i = fromIdx; i < REG_US.length; i++) {
				if (sum + REG_US[i] > 24) continue;
				dfs(i, sum + REG_US[i], count + 1);
			}
		};
		dfs(0, beta, 1);
	}
	if (best > 3) {
		throw new Error(`dentNoPointMax: lemma violated — got t=${best} > 3 (β ≥ 13 ⇒ ≤ 2 regulars)`);
	}
	return best;
}

/** Route 1 d_max: live enumerator (point-carrying VCs) + the computed point-free fold-backs. */
export function route1Dmax(variants: R2Variant[], stratum: R2Stratum): number {
	const withDents = stratum !== 'fig4';
	let best = 0;
	for (const vc of enumerateStarVCs({ variants, includeDents: withDents })) {
		const dents = vc.tokens.filter((t) => t.kind === 'dent').length;
		if (stratum === 'fig3eq1' && dents !== 1) continue;
		if (vc.tokens.length > best) best = vc.tokens.length;
	}
	if (stratum !== 'fig3eq1') best = Math.max(best, pureRegularMax()); // point-free, dent-free
	if (withDents) best = Math.max(best, dentNoPointMax(variants)); //    point-free, one dent
	return best;
}

export type DmaxCellPair = { route1: number; route2: R2Cell; agree: boolean };
export type DmaxRow = {
	label: string;
	variants: R2Variant[];
	cells: Record<R2Stratum, DmaxCellPair>;
	/** Route 2 identity: fig3le1 == max(fig4, fig3eq1) — Fig-3(≤1) adds no information. */
	identityOk: boolean;
};

export function computeDmaxRow(label: string, variants: R2Variant[]): DmaxRow {
	const cells = {} as Record<R2Stratum, DmaxCellPair>;
	for (const s of STRATA) {
		const route2 = r2Dmax(variants, s);
		const route1 = route1Dmax(variants, s);
		cells[s] = { route1, route2, agree: route1 === route2.dmax };
	}
	const identityOk =
		cells.fig3le1.route2.dmax === Math.max(cells.fig4.route2.dmax, cells.fig3eq1.route2.dmax);
	return { label, variants, cells, identityOk };
}

/** Row order: regular-only sanity, the 32 families, then the two (expensive) envelopes. */
export function dmaxRowSpecs(): { label: string; variants: R2Variant[] }[] {
	return [
		{ label: 'regular-only', variants: [] },
		...r2AllVariants().map((v) => ({ label: `F(${v.n},${v.alphaU})`, variants: [v] })),
		{ label: 'envelope-dentreg-19', variants: r2DentRegVariants() },
		{ label: 'envelope-all-32', variants: r2AllVariants() },
	];
}

export function computeDmaxTable(
	onRow?: (row: DmaxRow, i: number, total: number) => void,
): { rows: DmaxRow[]; allChecksPass: boolean } {
	const specs = dmaxRowSpecs();
	const rows: DmaxRow[] = [];
	let ok = true;
	for (let i = 0; i < specs.length; i++) {
		const row = computeDmaxRow(specs[i].label, specs[i].variants);
		ok = ok && row.identityOk && STRATA.every((s) => row.cells[s].agree);
		rows.push(row);
		onRow?.(row, i, specs.length);
	}
	return { rows, allChecksPass: ok };
}

/**
 * The review's degree-7 falsifier [8*p@1, 3, 3, 3, 3*p@3, 3, 3] appears in the enumeration.
 * Restricting the alphabet to the two involved variants keeps this instant — enumerateStarVCs
 * over a superset alphabet only ADDS VCs, so presence here ⇒ presence in the all-32 run.
 */
export function degree7FalsifierPresent(): boolean {
	const name = canonicalVCName(['8*p@1', '3', '3', '3', '3*p@3', '3', '3']);
	const vcs = enumerateStarVCs({ variants: [{ n: 8, alphaU: 1 }, { n: 3, alphaU: 3 }] });
	return vcs.some((v) => v.name === name);
}
