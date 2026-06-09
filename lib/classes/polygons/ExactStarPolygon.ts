import { Polygon, PolygonType } from '@/classes';
import { Cyclotomic } from '../Cyclotomic';

/**
 * Exact non-convex isotoxal star tile in ℤ[ζ₂₄] — Myers's `n*_α` (n convex **points** at interior
 * angle α, n reflex **dents** at interior angle β = `24 − 24/n − α` in π/12 units). This is NOT
 * `StarRegularPolygon` (float `Math.sin`, Schläfli {n/d}; e.g. α=45° is not a {4/d} angle).
 *
 * Built by a unit-edge boundary walk (mirroring `RegularPolygon.fromAnchorAndDirExact`) with exterior
 * turns cycling `[12−β, 12−α]` (units of 2π/24): the turn at a dent is `12−β` (reflex ⇒ ≤0), at a point
 * `12−α` (sharp ⇒ >0). The `2n` turns sum to `n·(24−α−β) = 24` = one CCW revolution, so every vertex
 * stays in ℤ[ζ₂₄]. For 4*_{π/4}: α=3, β=15 ⇒ turns `[-3,9,…]`, `cornerAngleUnits = [3,15,…]`.
 *
 * `isStar = true` disambiguates it from a regular n-gon (both carry edge-count `n`), which `n` alone
 * cannot — see `Polygon.cornerToken` / the star-aware exact area path. `alphaU` carries the pinned
 * point angle (π/12 units) for the C3 fill loop's `ctx.starTiles`.
 *
 * **Admissibility** (registered in-ring variants): `n | 24`, `n ≥ 3`, and `0 < α < 12·(n−2)/n` — the
 * upper bound (regular interior angle) is exactly `β > 12`, i.e. the dent is genuinely reflex.
 */
export class ExactStarPolygon extends Polygon {
	/** Point (convex-corner) interior angle in π/12 units — pinned per-VC by the surrounding regulars. */
	alphaU: number;

	constructor(points: number, alphaU: number) {
		super(points); // n = number of POINTS (4 for the 4-star ⇒ an 8-gon boundary)
		this.isStar = true;
		this.alphaU = alphaU;
		this.name = `${points}*@${alphaU}`;
	}

	/** Dent (reflex-corner) interior angle in π/12 units, from the closure identity Σturns = 24. */
	get betaU(): number {
		return 24 - 24 / this.n - this.alphaU;
	}

	/**
	 * General isotoxal `n*_α` seated at exact `anchor` with first edge direction `dirIndex` (ζ-exponent,
	 * 2π/24 units). Vertex 0 is a convex **point**; corners then alternate dent/point. Requires N=24.
	 *
	 * @param nPoints  number of star points (`n | 24`, `n ≥ 3`)
	 * @param alphaU   point interior angle in π/12 units (`0 < α < 12·(n−2)/n`)
	 */
	static isotoxal = (
		nPoints: number,
		alphaU: number,
		anchorExact: Cyclotomic,
		dirIndex: number,
	): ExactStarPolygon => {
		const ring = anchorExact.ring;
		const N = ring.N;
		if (N !== 24) throw new Error(`ExactStarPolygon.isotoxal: requires the N=24 ring (got ${N})`);
		if (24 % nPoints !== 0) throw new Error(`ExactStarPolygon.isotoxal: n must divide 24 (got n=${nPoints})`);
		if (nPoints < 3) throw new Error(`ExactStarPolygon.isotoxal: need n ≥ 3 points (got ${nPoints})`);
		const regularInteriorU = (12 * (nPoints - 2)) / nPoints; // regular n-gon interior angle, π/12 units
		if (!(alphaU > 0 && alphaU < regularInteriorU)) {
			throw new Error(
				`ExactStarPolygon.isotoxal: α=${alphaU} out of range 0 < α < ${regularInteriorU} for n=${nPoints} ` +
					`(β = ${24 - 24 / nPoints - alphaU} would not be a reflex dent)`,
			);
		}
		const betaU = 24 - 24 / nPoints - alphaU;
		// Exterior turn applied AFTER each edge = exterior angle at the NEXT vertex. Starting at a point's
		// outgoing edge, the first turn heads into a dent (12−β ≤ 0), then rounds a point (12−α > 0), …
		const dentTurn = 12 - betaU;
		const pointTurn = 12 - alphaU;
		const verts: Cyclotomic[] = [];
		const edgeDirs: number[] = [];
		let p = anchorExact;
		let dir = ((dirIndex % N) + N) % N;
		for (let i = 0; i < 2 * nPoints; i++) {
			verts.push(p);
			edgeDirs.push(dir);
			p = p.add(Cyclotomic.zeta(ring, dir));
			const turn = i % 2 === 0 ? dentTurn : pointTurn; // edge 0 → dent at v1, edge 1 → point at v2, …
			dir = (((dir + turn) % N) + N) % N;
		}
		const star = new ExactStarPolygon(nPoints, alphaU);
		star.setExactVertices(verts, edgeDirs);
		return star;
	};

	/**
	 * Isotoxal `n*_α` seated by its DENT (the reflex corner, interior β) — the Fig-3 dent-at-vertex case.
	 * Places vertex 1 (a dent) at `dentVertex` with outgoing edge `dentOutDir`, so the dent covers the arc
	 * [dentOutDir, dentOutDir + β] (mirrors the point-seating convention). Derivation: in the standard
	 * walk vertex 1 = vertex0 + ζ^D and edge 1 = D + (12−β); pinning edge 1 = dentOutDir gives the edge-0
	 * direction D = dentOutDir − 12 + β and vertex 0 = dentVertex − ζ^D.
	 */
	static isotoxalDentAt = (
		nPoints: number,
		alphaU: number,
		dentVertex: Cyclotomic,
		dentOutDir: number,
	): ExactStarPolygon => {
		const ring = dentVertex.ring;
		const N = ring.N;
		if (N !== 24) throw new Error(`ExactStarPolygon.isotoxalDentAt: requires the N=24 ring (got ${N})`);
		const betaU = 24 - 24 / nPoints - alphaU;
		const D = (((dentOutDir - 12 + betaU) % N) + N) % N; // edge-0 (point's outgoing) direction
		const v0 = dentVertex.sub(Cyclotomic.zeta(ring, D)); // vertex 0 (a point)
		return ExactStarPolygon.isotoxal(nPoints, alphaU, v0, D);
	};

	/**
	 * The 4*_{π/4} (α=3 in π/12 units) — thin wrapper over {@link isotoxal} kept for the C7 spike call
	 * sites and tests.
	 */
	static fourStarPi4 = (anchorExact: Cyclotomic, dirIndex: number): ExactStarPolygon =>
		ExactStarPolygon.isotoxal(4, 3, anchorExact, dirIndex);

	getName = (): string => this.name;

	makeEmptyLike = (): ExactStarPolygon => new ExactStarPolygon(this.n, this.alphaU);

	clone = (): ExactStarPolygon => {
		// Exact clone: copy the exact source of truth so no float round-trip occurs.
		const s = new ExactStarPolygon(this.n, this.alphaU);
		if (this.exactVertices && this.edgeDirs) {
			s.setExactVertices(this.exactVertices.slice(), this.edgeDirs.slice());
		}
		return s;
	};

	encode = (): Object => {
		const base: Record<string, unknown> = {
			type: PolygonType.STAR_REGULAR,
			n: this.n,
			isStar: true,
			vertices: this.vertices.map((v) => v.encode()),
		};
		if (this.exactVertices && this.edgeDirs) {
			base.anchor = this.exactVertices[0].encode();
			base.dir = this.edgeDirs[0];
		}
		return base;
	};
}
