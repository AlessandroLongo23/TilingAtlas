/*
 * Efficiency-pruning pool filter — PRUNE_EFF_C2 work order (experiments/
 * efficiency-pruning-workorder-2026-07-04.md, 2026-07-04).
 *
 * Keeps a pool vector v iff  wt(v) ≤ c·|v|  ⟺  wt(v)² ≤ c²·|v|²,  with c² = P/Q a RATIONAL so the
 * test is EXACT against the algebraic |v|² (ℚ(√2,√3,√6) Surd arithmetic). wt(v) is the EXACT weight
 * (min number of unit 24th-roots summing to v — an integer); |v|² = Re(conj(v)·v) is an exact Surd.
 *
 * ⚑ COMPLETENESS DOCTRINE (CLAUDE.md — "completeness knobs are not speed dials"). This filter can
 * DROP a pool vector, hence a candidate lattice, hence potentially a tiling. So (a) the decisive
 * comparison is exact (Surd.sign is provably correct, CB-2), never float; (b) wt MUST be the true
 * min-over-all-24-roots weight — an inflated weight (e.g. the production shortVectorPool BFS depth
 * under monotone + restricted directions) would OVER-prune and silently drop valid tilings, so it
 * must not be used here; (c) a malformed c² fails LOUD (throws), never silently no-ops.
 *
 * Injected behind the PRUNE_EFF_C2 env flag — unset ⇒ this module is never consulted and the run is
 * byte-identical. Data-gathering only: results under a set flag carry NO completeness claim.
 */
import { Cyclotomic } from "@/classes/Cyclotomic";
import { Surd, reSurd } from "@/classes/algorithm/exact/Surd";

/** Parsed threshold c² = P/Q with P,Q > 0 (a rational, kept exact). */
export type EffC2 = { P: bigint; Q: bigint };

/**
 * Parse a PRUNE_EFF_C2 value into an exact rational c². Accepts `"P/Q"`, a bare integer `"P"`
 * (= P/1), and the spellings `"sqrt2"` / `"√2"` (= c² = 2, the density-trap worst case and the
 * clean proof target). Decimal literals are REJECTED — the threshold must be an exact rational so
 * the completeness verdict is exact. Returns `null` for unset/empty (the byte-identical no-op).
 * Throws on any malformed or non-positive input (fail loud — this is a completeness knob).
 */
export function parseEffC2(raw: string | undefined | null): EffC2 | null {
	if (raw === undefined || raw === null) return null;
	const s = raw.trim();
	if (s === "") return null;
	if (s === "sqrt2" || s === "√2") return { P: 2n, Q: 1n };
	const m = s.match(/^(\d+)(?:\/(\d+))?$/);
	if (!m) throw new Error(`PRUNE_EFF_C2: cannot parse "${raw}" — want "P/Q", "P", or "sqrt2" (exact rationals only, no decimals)`);
	const P = BigInt(m[1]);
	const Q = m[2] !== undefined ? BigInt(m[2]) : 1n;
	if (P <= 0n || Q <= 0n) throw new Error(`PRUNE_EFF_C2: c² = ${raw} must be strictly positive`);
	return { P, Q };
}

/**
 * EXACT efficiency test: `true` iff `wt² ≤ c²·|v|²`, i.e. `(P/Q)·|v|² − wt² ≥ 0`. `wt` is the exact
 * integer weight of `v`; `|v|²` is computed exactly via `reSurd(v.normSquared())`; the sign is
 * decided by `Surd.cmp` (provably correct). Boundary (`wt² = c²·|v|²`) KEEPS the vector.
 */
export function passesEffFilter(wt: number, v: Cyclotomic, c2: EffC2): boolean {
	const vSq = reSurd(v.normSquared());          // |v|² — exact, real, non-negative Surd
	const lhs = vSq.scaleRational(c2.P, c2.Q);    // (P/Q)·|v|²
	const rhs = Surd.rational(BigInt(wt) * BigInt(wt)); // wt²  (integer)
	return lhs.cmp(rhs) >= 0;                       // (P/Q)|v|² ≥ wt²  ⟺  keep
}

/** Human-readable label for a threshold, for the loud ⚑ banner. */
export function effC2Label(c2: EffC2): string {
	const c = Math.sqrt(Number(c2.P) / Number(c2.Q));
	return `c² = ${c2.P}/${c2.Q} (c ≈ ${c.toFixed(4)})`;
}
