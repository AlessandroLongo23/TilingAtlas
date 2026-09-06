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

// The one import here, and it is data the generator measured: which of the nine hemipolyhedra carry a
// {n/d} face. That decides the shelf below, and hand-listing three ids in a routing function is exactly
// how a shelf and its generator drift apart.
import { HEMI_STAR_FACED } from "@/lib/render/hemiSolids";

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
 * The measurement is not close: the inscribed among these miss their fitted sphere by at most 6.8e-10
 * of the radius, and the closest of THESE misses by 8.2e-3 (the gyroelongated square cupola). Across the
 * whole shelf, "ncx-" included, the worst inscribed miss is 3.9e-7 and it belongs to ncx-7-15-10-a; the
 * k=4 records come out of a deeper dihedral root-find and that is where the erosion shows.
 * sph-inscribed.test.ts re-measures both populations, so neither figure can go stale unnoticed.
 *
 * It is a flat list rather than a grouped one because it is not a taxonomy — it is whatever the shipped
 * geometry measures, regenerated from it by the test whenever the shelf grows. It grew from 19 to 37 when the k=3 Johnson
 * solids landed, to 51 at k=4 and to 59 at k=5; the "ncx-" shelf is not here at all, because it is
 * listed the other way round, by NCX_INSCRIBED below.
 *
 * ⚑ This read "NONE of those has a circumsphere and hasSphereView answers on the prefix" until
 * ncx-7-15-10-a arrived with one. hasSphereView consults NCX_INSCRIBED; the prefix rule is gone.
 */
export const SPH_NOT_INSCRIBED: ReadonlySet<string> = new Set([
	// ⚑ THE ISOTOXAL SHELF, ALL 19, and not one of them is close: they miss a fitted sphere by
	// 0.10 to 0.45 of their radius. It is structural rather than numerical. An isotoxal star face has a
	// sharp POINT and a reflex DENT, and those are different vertices of the solid at different
	// distances from the centre — every record here has exactly two distinct vertex radii — so no one
	// sphere passes through them and there is no centre to project a spherical view from. AL's own
	// worked example is the clearest case: iso-80-150-72 puts its 20 star points at radius 1 and its 60
	// dents at 0.827794. The widest miss is the {12/5} family at 0.44 to 0.45, the narrowest the {12/2}
	// prism at 0.10 — the sharper the star's point, the further its dents fall inside.
	"iso-120-240-104",
	"iso-132-300-152-a",
	"iso-132-300-152-b",
	"iso-140-300-144-a",
	"iso-140-300-144-b",
	"iso-15-30-17",
	"iso-20-30-12",
	"iso-20-40-22",
	"iso-24-36-14",
	"iso-32-48-18",
	"iso-32-48-18-a",
	"iso-40-60-22",
	"iso-40-60-22-a",
	"iso-40-60-22-b",
	"iso-48-72-26-a",
	"iso-48-72-26-b",
	"iso-48-72-26-c",
	"iso-48-72-26-d",
	"iso-80-150-72",
	"augmented-dodecahedron",
	"augmented-hexagonal-prism",
	"augmented-pentagonal-prism",
	"augmented-triangular-prism",
	"augmented-tridiminished-icosahedron",
	"augmented-truncated-cube",
	"augmented-truncated-tetrahedron",
	"biaugmented-pentagonal-prism",
	"biaugmented-triangular-prism",
	"biaugmented-truncated-cube",
	"bilunabirotunda",
	"disphenocingulum",
	"elongated-pentagonal-bipyramid",
	"elongated-pentagonal-cupola",
	"elongated-pentagonal-gyrobicupola",
	"elongated-pentagonal-gyrobirotunda",
	"elongated-pentagonal-gyrocupolarotunda",
	"elongated-pentagonal-orthobicupola",
	"elongated-pentagonal-orthobirotunda",
	"elongated-pentagonal-orthocupolarotunda",
	"elongated-pentagonal-pyramid",
	"elongated-pentagonal-rotunda",
	"elongated-square-bipyramid",
	"elongated-square-pyramid",
	"elongated-triangular-bipyramid",
	"elongated-triangular-cupola",
	"elongated-triangular-gyrobicupola",
	"elongated-triangular-orthobicupola",
	"elongated-triangular-pyramid",
	"gyrobifastigium",
	"gyroelongated-pentagonal-bicupola",
	"gyroelongated-pentagonal-cupola",
	"gyroelongated-pentagonal-rotunda",
	"gyroelongated-square-bicupola",
	"gyroelongated-square-bipyramid",
	"gyroelongated-square-cupola",
	"gyroelongated-square-pyramid",
	"gyroelongated-triangular-bicupola",
	"gyroelongated-triangular-cupola",
	"hebesphenomegacorona",
	"metabiaugmented-hexagonal-prism",
	"parabiaugmented-dodecahedron",
	"parabiaugmented-hexagonal-prism",
	"parabiaugmented-truncated-dodecahedron",
	"pentagonal-bipyramid",
	"pentagonal-gyrobicupola",
	"pentagonal-gyrocupolarotunda",
	"pentagonal-orthobicupola",
	"pentagonal-orthocupolarotunda",
	"snub-disphenoid",
	"snub-square-antiprism",
	"sphenocorona",
	"sphenomegacorona",
	"square-gyrobicupola",
	"square-orthobicupola",
	"triangular-bipyramid",
	"triangular-hebesphenorotunda",
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
	// Genus is the axis past the sphere: "tor-" is genus 1 (its permalinks predate the rest) and
	// "gen<g>-" carries its own. One row per genus, because a genus-3 and a genus-9 solid are no
	// more the same shelf than a sphere and a torus are.
	// THE HEMIPOLYHEDRA SPLIT BY FACE TYPE, which is the split these two shelves already make between
	// them: the non-convex shelf is the one whose faces are ordinary regular polygons and whose SOLID
	// bends past pi, the star shelf is the one whose FACES are the {n/d}. So the six all-convex-faced
	// hemipolyhedra fill the non-convex shelf's k = 1 row and the three star-faced ones go to the star
	// shelf's (AL, 2026-08-30). They were briefly all nine on the non-convex row, which put three
	// records with {5/2} and {10/3} faces under a heading reading "Regular polygons".
	//
	// The k = 1 row was empty on the non-convex side because the CLASS was missing — k = 1 with regular
	// faces means vertex-transitive means uniform, so nothing but the uniform non-convex solids could
	// ever have filled it. On the star side k = 1 already holds 52 records, which is why that row is
	// NOT labelled "hemipolyhedra": three of its members are, and the other 52 are not.
	if (solid.startsWith("hemi-")) return HEMI_STAR_FACED.has(solid) ? "sst" : "spn-solid";
	if (solid.startsWith("tor-")) return "spt-solid";
	const g = /^gen(\d+)-/.exec(solid);
	if (g) return `spg${g[1]}-solid`;
	// ⚑ THE ISOTOXAL SHELF IS THE STAR SHELF'S OTHER SIBLING, not a convex row (AL, 2026-08-31: they
	// "are not johnson solids"). Without this they fell through to "spx-solid" — Platonic, Archimedean,
	// prisms, Johnson — which is the CONVEX heading, and a face with a 252-degree reflex dent is not
	// convex by any reading. The split that already exists here is by FACE TYPE: "spn-solid" is the
	// shelf whose faces are ordinary regular polygons and whose SOLID bends past pi, "sst" the one whose
	// FACES are the {n/d}. These are the third case — faces that are stars but do NOT cross themselves —
	// so they take their own row beside "sst" rather than crowding either.
	if (solid.startsWith("iso-")) return "sis-solid";
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
	// NOTHING PAST THE SPHERE has one, and this is a theorem and not a measurement: the round view
	// is a radial projection onto a circumsphere, and a surface of genus >= 1 does not project onto
	// a sphere at all. No genus record is ever offered it.
	if (solid?.startsWith("tor-") || /^gen\d+-/.test(solid ?? "")) return false;
	// A hemipolyhedron is the one case where the MEASUREMENT would say yes and be wrong. Its vertices
	// are its parent quasiregular solid's, so they do sit on a common sphere — but a hemi face's plane
	// contains the centre, so radial projection sends it to a great circle instead of a spherical
	// polygon, and V - E + F is never 2 anyway. The view is withheld by id, not by the fit.
	if (solid?.startsWith("hemi-")) return false;
	if (solid?.startsWith("ncx-")) return NCX_INSCRIBED.has(solid);
	return !!solid && !SPH_NOT_INSCRIBED.has(solid);
}

/**
 * The non-convex regular-faced solids that DO have a circumsphere.
 *
 * The "ncx-" shelf is listed the other way round from `SPH_NOT_INSCRIBED` above, because the two
 * populations sit on opposite sides of the same question: a convex regular-faced solid usually has a
 * circumsphere and the set above names the exceptions, while an "ncx-" one almost never does and this
 * set names those. All but one of the 278 have none, which is the whole reason develop_spherical
 * could not see this shelf at all.
 *
 * ⚑ It has been two entries and it has been one, and BOTH facts were about the corpus and not about the
 * shelf. It was a bare `return false` on the prefix until the k=3 search landed, on the stated grounds
 * that "NOT ONE of them has a circumsphere" — true of the 34 the k=2 sweep produced, false the moment 35
 * more arrived, and ncx-7-15-10-a was denied a view of a sphere it actually had. Then the star run of
 * 2026-08-24 brought ncx-120-240-112 and it read two. Then the degeneracy gate of the same day took
 * ncx-7-15-10-a off the shelf altogether: it claims seven vertices and has four distinct points, so
 * whatever sphere it fitted was a sphere through a folded surface. One entry today, for the third time
 * for a third reason. sph-inscribed.test.ts recomputes both directions from the vertices, which is why
 * none of those three states could be asserted anywhere but here.
 */
export const NCX_INSCRIBED: ReadonlySet<string> = new Set(["ncx-120-240-112"]);
