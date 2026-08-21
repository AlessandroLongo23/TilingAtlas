// IS A SOLID A TILING OF THE SPHERE? — the split AL asked the spherical shelf to make (2026-08-21):
// "some of them are polyhedra but not tilings of the sphere … there could be some tilings of the sphere
// that are not polyhedra, so I think we should make a distinction between them".
//
// The two are genuinely different objects and one direction of the correspondence is the one that fails.
// A polyhedron becomes a spherical tiling by RADIAL PROJECTION from a centre, and that needs every
// vertex to be the same distance from one point — a CIRCUMSPHERE. Most Johnson solids do not have one:
// the elongated square bipyramid's apexes and its prism's corners sit at different radii from every
// point, so there is no centre to project from and no spherical tiling to draw. It is a perfectly good
// polyhedron and it is not a tiling of the sphere. Going the other way, a spherical tiling gives a
// polyhedron only if each face's vertices are coplanar and no two neighbours share a plane — the halved
// Platonic boards are exactly where that fails, since a face cut in two and put back gives two coplanar
// triangles where a polyhedron has one face.
//
// ⚑ NOT "same distance from the CENTROID". The square pyramid's circumcentre is the centre of its base,
// nowhere near its centroid, and a diminished solid keeps its parent's circumsphere while its vertex
// centroid moves off that centre — so the centroid test calls J1, J11, J62, J63, J76 and J80
// non-inscribable and every one of them plainly is. Fit the sphere, then look at the worst miss. This is
// the same test tools/ctrnact-oracle/gen_johnson_euclid.py runs, ported so the shelf can ask it of any
// record without a build step.

type V3 = readonly [number, number, number] | readonly number[];

/**
 * The worst distance from the best-fitting sphere through these points, or Infinity if there is none.
 *
 * |v − c|² = R² is linear in (c, R² − |c|²): 2v·c + k = |v|². Four unknowns, one equation per vertex,
 * least squares through the 4×4 normal equations. Gaussian elimination with partial pivoting — the
 * system is tiny and well conditioned for any real solid, and a singular one (every vertex coplanar)
 * falls out as a failed pivot.
 */
export function circumsphereMiss(vertices: readonly V3[]): number {
	const n = vertices.length;
	if (n < 4) return Infinity;
	// Normal equations for A x = b with A_i = [2x, 2y, 2z, 1], b_i = |v|².
	const M: number[][] = Array.from({ length: 4 }, () => [0, 0, 0, 0, 0]);
	for (const v of vertices) {
		const a = [2 * v[0], 2 * v[1], 2 * v[2], 1];
		const bi = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
		for (let i = 0; i < 4; i++) {
			for (let j = 0; j < 4; j++) M[i][j] += a[i] * a[j];
			M[i][4] += a[i] * bi;
		}
	}
	for (let col = 0; col < 4; col++) {
		let piv = col;
		for (let r = col + 1; r < 4; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
		if (Math.abs(M[piv][col]) < 1e-12) return Infinity;
		[M[col], M[piv]] = [M[piv], M[col]];
		for (let r = 0; r < 4; r++) {
			if (r === col) continue;
			const f = M[r][col] / M[col][col];
			for (let c = col; c < 5; c++) M[r][c] -= f * M[col][c];
		}
	}
	const x = [M[0][4] / M[0][0], M[1][4] / M[1][1], M[2][4] / M[2][2], M[3][4] / M[3][3]];
	const c = [x[0], x[1], x[2]];
	const r2 = x[3] + c[0] * c[0] + c[1] * c[1] + c[2] * c[2];
	if (!(r2 > 0)) return Infinity;
	const R = Math.sqrt(r2);
	let worst = 0;
	for (const v of vertices) {
		const d = Math.hypot(v[0] - c[0], v[1] - c[1], v[2] - c[2]);
		worst = Math.max(worst, Math.abs(d - R));
	}
	return worst;
}

/**
 * Does this solid project to a tiling of the sphere?
 *
 * The tolerance is loose on purpose (1e-4 of the radius). These vertices are floats that came out of a
 * root-find — develop_euclid solves for dihedral angles and flood-fills in SE(3) — so an exact solid
 * lands a few ulps off a perfect sphere, and the two populations are nowhere near each other anyway:
 * across the shipped shelf the inscribed ones miss by under 1e-9 and the rest by more than 1e-2.
 */
export function isInscribed(vertices: readonly V3[], tol = 1e-4): boolean {
	const R = Math.max(...vertices.map((v) => Math.hypot(v[0], v[1], v[2]))) || 1;
	return circumsphereMiss(vertices) < tol * R;
}

/**
 * The shipped solids with NO circumsphere — polyhedra that are not tilings of the sphere.
 *
 * A literal list, and `sph-inscribed.test.ts` recomputes it from `SPHERICAL_SOLIDS` and fails if the two
 * disagree, so it cannot drift and a new solid cannot arrive unclassified. Written out rather than
 * derived at module load because `subOf` reads it, and referenceAtlas.ts is on every page — importing
 * the whole vertex corpus there to answer a yes/no question about nineteen ids would pull the Platonic,
 * Archimedean, prism and Johnson tables into the Euclidean shelf's bundle.
 *
 * The measurement is not close: across the shelf, the inscribed miss their fitted sphere by at most
 * 6.6e-10 of the radius and every one of these misses by more than 1e-2. There is no borderline case.
 *
 * It is a flat list rather than a grouped one because it is not a taxonomy — it is whatever the shipped
 * geometry measures, regenerated from it by the test whenever the shelf grows. It grew from 19 to 37
 * when the k=3 Johnson solids landed (2026-08-21); the "ncx-" shelf is not here at all, since NONE of
 * those has a circumsphere and hasSphereView answers on the prefix.
 */
export const SPH_NOT_INSCRIBED: ReadonlySet<string> = new Set([
	"augmented-triangular-prism",
	"biaugmented-triangular-prism",
	"biaugmented-truncated-cube",
	"bilunabirotunda",
	"disphenocingulum",
	"elongated-pentagonal-bipyramid",
	"elongated-pentagonal-cupola",
	"elongated-pentagonal-gyrobicupola",
	"elongated-pentagonal-gyrobirotunda",
	"elongated-pentagonal-orthobicupola",
	"elongated-pentagonal-orthobirotunda",
	"elongated-pentagonal-pyramid",
	"elongated-square-bipyramid",
	"elongated-square-pyramid",
	"elongated-triangular-bipyramid",
	"elongated-triangular-cupola",
	"elongated-triangular-gyrobicupola",
	"elongated-triangular-orthobicupola",
	"elongated-triangular-pyramid",
	"gyrobifastigium",
	"gyroelongated-pentagonal-bicupola",
	"gyroelongated-square-bicupola",
	"gyroelongated-square-bipyramid",
	"gyroelongated-square-pyramid",
	"gyroelongated-triangular-bicupola",
	"parabiaugmented-dodecahedron",
	"parabiaugmented-hexagonal-prism",
	"pentagonal-bipyramid",
	"pentagonal-gyrobicupola",
	"pentagonal-orthobicupola",
	"snub-disphenoid",
	"snub-square-antiprism",
	"square-gyrobicupola",
	"square-orthobicupola",
	"triangular-bipyramid",
	"triaugmented-hexagonal-prism",
	"triaugmented-triangular-prism",
]);

/**
 * The /play tree's sub row for a reference-atlas spherical record.
 *
 * ONE row for all sixty-four. It briefly split on the circumsphere, which put the same fact on the tree
 * twice — the sphere view is already withheld from the solids that have no sphere (`hasSphereView`
 * below), and the shelf's own split is CONVEXITY now, with k naming uniform against Johnson underneath
 * (AL, 2026-08-21). The circumsphere is still measured, still gates the view, and still reads on the
 * card; it is not an axis.
 */
export function sphericalSolidSub(solid: string): string {
	return solid.startsWith("ncx-") ? "spn-solid" : "spx-solid";
}

/**
 * Can this solid be drawn as a TILING OF THE SPHERE at all?
 *
 * The round spherical view radially projects the solid onto its circumsphere, so it means something only
 * where there is one. Without it the projection is not a view of the solid, it is a different object —
 * J31 comes out as a green blob with a few slivers on it, which is what made AL ask whether it really
 * had regular faces (2026-08-21; it does — 10 triangles, 10 squares, 2 pentagons, all 40 edges equal to
 * nine decimal places). So the sphere is offered where it exists and withheld where it does not, and the
 * solids without one are drawn as the polyhedra they are.
 */
export function hasSphereView(solid: string | undefined | null): boolean {
	if (solid?.startsWith("ncx-")) return NCX_INSCRIBED.has(solid);
	return !!solid && !SPH_NOT_INSCRIBED.has(solid);
}

/**
 * The non-convex regular-faced solids that DO have a circumsphere.
 *
 * The "ncx-" shelf is listed the other way round from `SPH_NOT_INSCRIBED` above, because the two
 * populations sit on opposite sides of the same question: a convex regular-faced solid usually has a
 * circumsphere and the set above names the exceptions, while an "ncx-" one almost never does and this
 * set names those. Sixty-eight of the sixty-nine have none, which is the whole reason develop_spherical
 * could not see this shelf at all.
 *
 * ⚑ It was a bare `return false` on the prefix until the k=3 search landed, on the stated grounds that
 * "NOT ONE of them has a circumsphere". That was true of the 34 the k=2 sweep produced and false the
 * moment 35 more arrived: ncx-7-15-10-a has one, and the prefix rule denied it a view of a sphere it
 * actually has. A property measured across a partial corpus is not a property of the shelf.
 * sph-inscribed.test.ts recomputes both directions from the vertices, so neither can drift again.
 */
export const NCX_INSCRIBED: ReadonlySet<string> = new Set(["ncx-7-15-10-a"]);
