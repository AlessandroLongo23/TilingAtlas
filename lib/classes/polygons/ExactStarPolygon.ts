import { Polygon, PolygonType } from '@/classes';
import { Cyclotomic } from '../Cyclotomic';

/**
 * Exact non-convex isotoxal star tile in ℤ[ζ₂₄] — the C7 spike's **4*_{π/4}** (4 points @45°, 4 dents
 * @225°). This is NOT `StarRegularPolygon` (float `Math.sin`, Schläfli {n/d}; α=45° is not a {4/d} angle).
 *
 * Built by a unit-edge boundary walk (mirroring `RegularPolygon.fromAnchorAndDirExact`) with alternating
 * exterior turns of −3 (entering a reflex dent) and +9 (rounding a convex point), in units of 2π/24.
 * Every vertex stays in ℤ[ζ₂₄]; `cornerAngleUnits` reads [3,15,3,15,3,15,3,15] (point 45°, dent 225°),
 * and the 8 turns sum to +24 = one CCW revolution. `isStar = true` disambiguates it from a regular
 * square (both have edge-count `n = 4`), which `n` alone cannot — see `Polygon.cornerToken` / the
 * star-aware exact area path.
 */
export class ExactStarPolygon extends Polygon {
	constructor(points: number) {
		super(points); // n = number of points (4 for the 4-star)
		this.isStar = true;
		this.name = `${points}*`;
	}

	/**
	 * The 4*_{π/4} seated at exact `anchor` with first edge direction `dirIndex` (ζ-exponent, 2π/24
	 * units). Vertex 0 is a convex point; corners alternate point/dent. Requires the N=24 ring.
	 */
	static fourStarPi4 = (anchorExact: Cyclotomic, dirIndex: number): ExactStarPolygon => {
		const ring = anchorExact.ring;
		const N = ring.N;
		if (N !== 24) throw new Error(`ExactStarPolygon.fourStarPi4: requires the N=24 ring (got ${N})`);
		// Exterior turn applied AFTER each edge: −3 into a dent (reflex), +9 around a point (convex).
		// Starting at a point's outgoing edge, the first turn (−3) heads into the next dent.
		const turns = [-3, 9, -3, 9, -3, 9, -3, 9];
		const verts: Cyclotomic[] = [];
		const edgeDirs: number[] = [];
		let p = anchorExact;
		let dir = ((dirIndex % N) + N) % N;
		for (let i = 0; i < 8; i++) {
			verts.push(p);
			edgeDirs.push(dir);
			p = p.add(Cyclotomic.zeta(ring, dir));
			dir = (((dir + turns[i]) % N) + N) % N;
		}
		const star = new ExactStarPolygon(4);
		star.setExactVertices(verts, edgeDirs);
		return star;
	};

	getName = (): string => this.name;

	makeEmptyLike = (): ExactStarPolygon => new ExactStarPolygon(this.n);

	clone = (): ExactStarPolygon => {
		// Exact clone: copy the exact source of truth so no float round-trip occurs.
		const s = new ExactStarPolygon(this.n);
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
