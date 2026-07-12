/**
 * EXACT, proof-grade deduplication for composite-tile tilings — the replacement for the float
 * `canonicalTilingKey` heuristic (NOTES §52–§54 ⚑ gap).
 *
 * The composite Čtrnáct pipeline over-counts one infinite tiling under many representations along three
 * axes (NOTES §54): supercells (a primitive cell and its n× enlargement), same-cell relabelings (the same
 * fundamental domain rooted/labeled differently — combinatorially distinct, geometrically identical), and
 * cross-k (the same tiling emitted by the k=1, k=2 and k=3 solves). The float heuristic collapsed these
 * with rounded coordinates — good enough to LOOK right, not good enough to PROVE a count.
 *
 * The authority is `congruencePartition` (exact `primitiveReducedCell` + `cellsCongruent`), the SAME stack
 * the regular 11/20/61 claims use: it collapses supercells (primitive reduction), relabelings and congruent
 * copies (grid-isometry congruence on the actual tile faces), and — by keying every k together — cross-k.
 * No float enters any decision.
 *
 * Two performance points make it tractable at k=3 (1783 cells):
 *   - `nKeyOfCell` is NOT usable as a key OR a bucket here: it canonicalizes the vertex POINT SET, which
 *     determines a regular tiling but not a composite one, so it dumps dozens of non-congruent composite
 *     tilings into one bucket — the opposite of what a bucket should do. We bucket by the tighter
 *     `(nameMultiset, |detΛ|)` invariant instead (exact, congruence-necessary), as the regular dedup does.
 *   - `primitiveReducedCell` (the 5×5-replicate reduction) is the dominant cost and is only needed to
 *     collapse a supercell. A supercell of multiplicity m has EVERY tile count ×m, so gcd(tile counts)==1
 *     ⟹ the cell is provably primitive and skips reduction; only gcd>1 cells are reduced. This drops the
 *     reduction count from every cell to the minority that could be supercells.
 *
 * Input: composite develop cells carrying the EXACT ℤ[ζ₂₄] coordinates that `export_composable_cells.py`
 * now retains (integer coefficient vectors, den=1).
 */
import { Cyclotomic, CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
// Import Polygon from the barrel (not the direct path): loading the barrel initializes Polygon before its
// subclasses (RegularPolygon etc.), avoiding the Polygon↔barrel circular-init TDZ that a direct import trips.
import { Polygon } from "@/classes";
import { cellsCongruent, primitiveReducedCell, reducedClassKey } from "@/classes/algorithm/TilingCongruence";
import type { PeriodCell } from "@/classes/algorithm/PeriodSolver";

const N = 24; // the develop lifts ζ₁₂ → ζ₂₄ (STEP=2), so composite cells live in the N=24 ring

/** One composite develop cell with its retained exact ℤ[ζ₂₄] coordinates. */
export interface ExactComposableCell {
	/** Each cell polygon: full-boundary vertex count `n`, tile species `name`, and `exact` = the ordered
	 *  boundary vertices as length-φ(24)=8 integer coefficient vectors over {1,ζ,…,ζ⁷}. */
	cellPolygons: { n: number; name: string; exact: number[][]; star?: boolean }[];
	/** The translation basis Λ=(T1,T2), each a length-8 integer coefficient vector. */
	exactBasis: number[][];
}

export interface ExactDedupResult {
	/** Per-input canonical key: same key ⟺ congruent tiling (exact, ℤ[ζ₂₄]). A drop-in for the string
	 *  `canonicalTilingKey` returned — group inputs by this to get the distinct tilings. */
	keys: string[];
	/** Number of distinct tilings (distinct keys). */
	distinct: number;
	/** How many inputs needed a primitive-cell reduction (gcd of tile counts > 1) — the rest were proven
	 *  primitive by the gcd test and skipped it. Diagnostic for the cost. */
	reduced: number;
}

/**
 * A concrete Polygon holding exact ℤ[ζ₂₄] vertices for an arbitrary (non-regular) composite tile. The
 * base Polygon leaves `clone`/`getName`/`makeEmptyLike` abstract; the congruence stack needs a `clone`
 * that copies the EXACT source of truth verbatim (GenericPolygon.clone rebuilds from float and would drop
 * it), so we mirror ExactStarPolygon's exact-preserving pattern. No float round-trip in any of these.
 */
class ExactComposablePolygon extends Polygon {
	constructor(n: number, name: string) {
		super(n);
		this.name = name;
	}
	getName = (): string => this.name;
	makeEmptyLike = (): ExactComposablePolygon => new ExactComposablePolygon(this.n, this.name);
	clone = (): ExactComposablePolygon => {
		const c = new ExactComposablePolygon(this.n, this.name);
		if (this.isStar) c.isStar = true;
		if (this.exactVertices && this.edgeDirs) c.setExactVertices(this.exactVertices.slice(), this.edgeDirs.slice());
		return c;
	};
}

function toCyc(ring: CyclotomicRing, tuple: number[]): Cyclotomic {
	return Cyclotomic.decode(ring, { n: tuple.map(String), d: "1" });
}

function gcd(a: number, b: number): number {
	while (b) [a, b] = [b, a % b];
	return a;
}

/** gcd of the per-tile-species counts. A supercell of multiplicity m has every count ×m ⟹ gcd ≥ m > 1;
 *  so gcd === 1 proves the cell is primitive (no reduction needed). */
function tileCountGcd(cell: PeriodCell): number {
	const counts = new Map<string, number>();
	for (const p of cell.cellPolygons) counts.set(p.getName(), (counts.get(p.getName()) ?? 0) + 1);
	let g = 0;
	for (const c of counts.values()) g = gcd(g, c);
	return g;
}

/**
 * Cheap O(p) primitivity gate: a sub-period would map some tile to ANOTHER tile by pure translation, so
 * the two would be exact translates — same shape AND orientation. Key each tile by (name, its vertices
 * relative to its own centroid); if ALL keys are distinct, no two tiles are translates ⟹ no sub-period ⟹
 * the cell is primitive. Catches the common genuine multi-tile primitive (e.g. two differently-oriented
 * cx6) without touching the O(p²) `hasSubPeriod`/`reducedClassKey`. One-directional: distinct ⟹ primitive;
 * a repeat only means "maybe a supercell — check further".
 */
function allShapesDistinct(cell: PeriodCell): boolean {
	const keys = new Set<string>();
	for (const p of cell.cellPolygons) {
		const c = p.exactCentroid!;
		const shape = p.exactVertices!
			.map((v) => v.sub(c).key())
			.sort()
			.join(",");
		const k = `${p.getName()}|${shape}`;
		if (keys.has(k)) return false;
		keys.add(k);
	}
	return true;
}

/**
 * Does the cell have a proper internal translation sub-period (⟺ it is a supercell)? Exact, and far
 * cheaper than `primitiveReducedCell`. A period t maps every tile to a tile mod Λ, and maps tile 0 to some
 * same-name tile j, so the only candidates are t = centroidⱼ − centroid₀. For each, translate every tile by
 * t and compare the multiset of lattice-reduced class keys to the original; equal ⟹ t is a period. Used to
 * skip the expensive reduction for genuine multi-tile PRIMITIVES (e.g. two distinct cx6 in one cell:
 * gcd=2 but no sub-period). If it ever misses a real period the cell just isn't reduced ⟹ over-count (safe
 * direction), and the count is cross-checked against the authoritative `congruencePartition`.
 */
function hasSubPeriod(cell: PeriodCell): boolean {
	const [u, v] = cell.basisExact;
	const polys = cell.cellPolygons;
	const memo = new Map<string, string>();
	const sig = polys
		.map((p) => reducedClassKey(p, u, v, memo))
		.sort()
		.join("|");
	const name0 = polys[0].getName();
	const c0 = polys[0].exactCentroid!;
	for (let j = 1; j < polys.length; j++) {
		if (polys[j].getName() !== name0) continue;
		const t = polys[j].exactCentroid!.sub(c0);
		const tsig = polys
			.map((p) => {
				const q = p.clone();
				q.translateExact(t);
				return reducedClassKey(q, u, v, memo);
			})
			.sort()
			.join("|");
		if (tsig === sig) return true;
	}
	return false;
}

/** Exact, orientation-independent key for |det Λ| (the fundamental-cell area). `w = conj(u)·v − u·conj(v)`
 *  is 2i·(signed area); congruent cells share |area|, so we key on min(w, −w). No float. */
function detAbsKey(u: Cyclotomic, v: Cyclotomic): string {
	const w = u.conj().mul(v).sub(u.mul(v.conj()));
	const a = w.key();
	const b = w.neg().key();
	return a < b ? a : b;
}

function nameMultisetKey(cell: PeriodCell): string {
	return cell.cellPolygons
		.map((p) => p.getName())
		.sort()
		.join(",");
}

/** Integer ζ₂₄-exponent of each unit boundary edge vᵢ→vᵢ₊₁. Composite edges are exact unit ζ directions;
 *  a miss means the develop produced a non-unit or off-grid edge — fail loud, never guess. */
function computeEdgeDirs(zetas: Cyclotomic[], verts: Cyclotomic[]): number[] {
	return verts.map((v, i) => {
		const edge = verts[(i + 1) % verts.length].sub(v);
		const m = zetas.findIndex((z) => z.equals(edge));
		if (m < 0)
			throw new Error(
				`[exactComposableDedup] edge ${i} is not a unit ζ₂₄ direction (key ${edge.key()}) — off-grid develop`,
			);
		return m;
	});
}

function buildPeriodCell(ring: CyclotomicRing, zetas: Cyclotomic[], ec: ExactComposableCell): PeriodCell {
	const cellPolygons = ec.cellPolygons.map((cp) => {
		const verts = cp.exact.map((t) => toCyc(ring, t));
		const poly = new ExactComposablePolygon(cp.n, cp.name); // getName() = name — separates tile species in the congruence buckets
		if (cp.star) poly.isStar = true;
		poly.setExactVertices(verts, computeEdgeDirs(zetas, verts));
		return poly;
	});
	const [t1, t2] = ec.exactBasis.map((t) => toCyc(ring, t));
	return { cellPolygons, basisExact: [t1, t2] };
}

/**
 * Exact canonical key per composite tiling. Same key ⟺ congruent tiling (exact, ℤ[ζ₂₄]), so grouping by
 * `keys` gives the proof-grade distinct count. Reduces only gcd>1 cells to primitive, buckets by the exact
 * necessary invariants (nameMultiset, |detΛ|), and splits each bucket with the authoritative pairwise
 * `cellsCongruent`.
 */
export function exactComposableKeys(cells: ExactComposableCell[]): ExactDedupResult {
	const ring = CyclotomicRing.create(24);
	setActiveRing(ring);
	const zetas = Array.from({ length: N }, (_, m) => Cyclotomic.zeta(ring, m));
	const built = cells.map((ec) => buildPeriodCell(ring, zetas, ec));

	// Reduce only cells that could be supercells (gcd of tile counts > 1); gcd==1 proves primitivity. After
	// this every cell is primitive, so (nameMultiset, |detΛ|) is a valid congruence bucket.
	let reduced = 0;
	const prim = built.map((pc, i) => {
		// Layered primitivity gates, cheapest first: gcd==1 ⟹ primitive; all tile shapes distinct ⟹
		// primitive (O(p)); only then the O(p²) exact sub-period test. Reduce only if all three say "maybe".
		if (tileCountGcd(pc) > 1 && !allShapesDistinct(pc) && hasSubPeriod(pc)) {
			reduced++;
			return { cell: primitiveReducedCell(pc), i };
		}
		return { cell: pc, i };
	});

	// Bucket by the exact necessary congruence invariants, then split each bucket with pairwise cellsCongruent.
	const buckets = new Map<string, { cell: PeriodCell; i: number }[]>();
	for (const item of prim) {
		const bk = `${nameMultisetKey(item.cell)}@${detAbsKey(item.cell.basisExact[0], item.cell.basisExact[1])}`;
		(buckets.get(bk) ?? buckets.set(bk, []).get(bk)!).push(item);
	}

	// Each true class gets a deterministic key `${bucket}#${sub}`, sub ordered by the class's smallest
	// original record index (stable given the input order).
	const keys = new Array<string>(built.length);
	let distinct = 0;
	const memo = new Map<string, string>();
	for (const [bk, items] of buckets) {
		const classes: { cell: PeriodCell; i: number }[][] = [];
		for (const item of items) {
			const cls = classes.find((m) => cellsCongruent(item.cell, m[0].cell, memo));
			if (cls) cls.push(item);
			else classes.push([item]);
		}
		distinct += classes.length;
		const withMin = classes
			.map((members) => ({ idxs: members.map((m) => m.i), min: Math.min(...members.map((m) => m.i)) }))
			.sort((a, b) => a.min - b.min);
		withMin.forEach(({ idxs }, sub) => {
			for (const i of idxs) keys[i] = `${bk}#${sub}`;
		});
	}

	return { keys, distinct, reduced };
}
