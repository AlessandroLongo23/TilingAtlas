// GLSL for the Poincaré-disk hyperbolic renderer, shared by the interactive overlay
// (components/hyperbolic-canvas.tsx) and the static thumbnail (components/hyperbolic-thumbnail.tsx).
//
// The fragment shader renders a regular {p,q} tiling by folding each pixel into the fundamental Schwarz
// triangle of the (2,p,q) group: dihedral-reduce the angle into the reference half-wedge [0, π/p], then
// invert across the tile-edge geodesic (a circle orthogonal to the unit circle, centre (edgeA,0), radius
// edgeRho) whenever the point lies outside it, iterating until it lands inside the central tile. The
// mirror parameters come from lib/render/hyperbolic.ts (mirrorParams). Pan is a hyperbolic translation:
// per pixel we apply the inverse disk automorphism M⁻¹(z)=e^{-iθ}… with translation uB (from panToB) and
// rotation uTheta. Zoom is intentionally absent — the disk radius is 0.5·min(w,h), less a uPadPx inset
// (0 unless set, e.g. the thumbnail) that keeps the disk clear of the viewport edges.
//
// Antialiasing: the fold is discontinuous, so the pixel footprint is measured on the CONTINUOUS pre-fold
// disk coord z0 (fwidth) and carried into the fundamental frame by the accumulated inversion Jacobian
// `jac`. Sub-pixel tiles near the boundary blend to the average colour so the limit set doesn't alias.

export const HYPERBOLIC_VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const HYPERBOLIC_FRAG = `#version 300 es
precision highp float;

#define PI 3.14159265358979323846
#define MAX_ITER 48
#define MAX_POINTS 32
// Feature-dot styling. Each dot carries a black border POINT_BORDER_CSS CSS px wide. The dots fade out
// (fill + border together) before the disk boundary so the dense limit set near the rim stays clean:
// full opacity in to POINT_FADE_START, then a steep-but-smooth falloff to zero by POINT_FADE_END, both in
// disk-radius units (|zScreen| ∈ [0,1)).
#define POINT_BORDER_CSS 1.0
#define POINT_FADE_START 0.78
#define POINT_FADE_END 0.94

uniform vec2 uRes;       // CSS pixel size (w, h)
uniform float uDpr;      // device pixel ratio
uniform float uPadPx;    // disk inset (CSS px): shrinks the radius so the disk clears the viewport edges
uniform vec2 uMa;        // SU(1,1) view isometry: a (complex)
uniform vec2 uMb;        // SU(1,1) view isometry: b (complex); acts z ↦ (a z + b)/(b̄ z + ā)
uniform float uP;        // p (polygon side count)
uniform float uEdgeA;    // edge-geodesic circle centre on +x
uniform float uEdgeRho;  // edge-geodesic circle radius
uniform int uShadeMode;  // 0 = coloured tiles + edges, 1 = two-tone parity
uniform float uParityOffset; // 0/1: absolute-parity correction, cancels the re-base's tile re-labelling
uniform float uHue;      // tile hue, degrees
uniform float uHueOffset; // global hue rotation, degrees (the sidebar hue ring); hsb2rgb wraps via mod
uniform float uStrokePx; // stroke width control (0 = no strokes)
uniform int uStrokeMode; // 0 = geometry (fraction of the tile edge), 1 = constant screen width
uniform vec3 uSurface;   // background + out-of-disk
uniform vec3 uLine;      // edge stroke / dark tone
uniform vec3 uParityA;   // parity mode: even tiles
uniform vec3 uParityB;   // parity mode: odd tiles
uniform vec3 uIslamicB;  // Islamic A/B/C fill: B side field colour
uniform vec3 uIslamicC;  // Islamic A/B/C fill: C edge-diamond colour
uniform int uShowFill;   // 1 = coloured/parity fill, 0 = no fill (tiles paint uSurface, edges kept)

// Uniform (Wythoffian) tilings. uNTiles == 1 ⇒ legacy regular {p,q} path (everything below is skipped, so
// the four regular entries render byte-identically). uNTiles > 1 ⇒ fold one reflection further to the
// Schwarz triangle and classify the pixel into a tile type by the Wythoff-vertex → perpendicular-foot edges.
uniform int uNTiles;     // occupied tile types: 1 (regular), 2, or 3
uniform vec2 uWythoff;   // Wythoff generating vertex, fundamental frame
uniform vec2 uFootA;     // perpendicular foot of W on mirror A (real axis) — O|E tile-edge endpoint
uniform vec2 uFootB;     // foot on mirror B (π/p diameter) — O|V tile-edge endpoint
uniform vec2 uFootC;     // foot on mirror C (edge circle) — V|E tile-edge endpoint
uniform vec2 uCornerV;   // Schwarz corner V (O is the origin, E is (uRin,0))
uniform float uRin;      // Schwarz corner E x-coordinate (tile inradius)
uniform vec3 uOcc;       // occupancy (1/0) of the faces at corners O, V, E
uniform vec3 uTileHue;   // hue (deg) of the faces at O, V, E (snub: [p-gon, q-gon, triangle])

// Snub tilings (chiral, rotation subgroup only). uSnub == 1 ⇒ classify the fold-kite coord directly (NO
// y-reflection, which would flip handedness) into p-gon / q-gon / triangle by the snub vertex and its
// polygon-neighbours. uNTiles is 2 (q = 3: q-gon is another triangle) or 3 (q ≥ 4: distinct q-gon).
uniform int uSnub;
uniform vec2 uSnubS;     // snub generating vertex
uniform vec2 uSnubAs;    // s rotated +2π/p about O
uniform vec2 uSnubAis;   // s rotated −2π/p about O
uniform vec2 uSnubBs;    // s rotated +2π/q about V
uniform vec2 uSnubBis;   // s rotated −2π/q about V
uniform vec2 uSnubN;     // 5th neighbour (π-rotation of s about E) — the triangle–triangle edge
uniform vec2 uSnubB2s;   // q-gon vertex opposite s (= b²·s) — for the far square edges when q ≥ 4

// Feature-point overlay ("show polygon points"): markers of the central cell in the fundamental fold frame,
// classified by kind. Guarded by uShowPoints so the default (off) costs nothing.
uniform int uShowPoints;      // 0 = off, 1 = draw markers
uniform int uNumPoints;       // valid entries in uPoints/uPointKind
uniform vec2 uPoints[MAX_POINTS];  // marker positions, fundamental frame
uniform int uPointKind[MAX_POINTS];// 0 = centroid, 1 = edge midpoint, 2 = vertex
uniform float uPointRadius;   // marker radius, device px

// Islamic strapwork overlay (all hyperbolic tilings). The polygons-in-contact star motif is the same
// regular-tile rosette everywhere (uniform and snub faces are regular polygons), so in the fundamental
// frame it is a short list of geodesic strap segments uStrapA[i]→uStrapB[i] (see islamicStrapSegments in
// lib/render/hyperbolic.ts). uStrapReflect folds the pixel to the upper-half Schwarz triangle for
// regular/uniform tilings; snub is chiral and tests the kite coord directly. Off (uIslamic 0) ⇒ no cost.
#define MAX_STRAP 64
#define MAX_TILES 6
uniform int uIslamic;      // 0 = off, 1 = draw strapwork
uniform int uStrapReflect; // 1 = test (z.x, |z.y|) (regular/uniform); 0 = test z (snub, chiral)
uniform int uStrapCount;   // valid entries in uStrapA/uStrapB
uniform vec2 uStrapA[MAX_STRAP]; // strap segment starts (fundamental frame)
uniform vec2 uStrapB[MAX_STRAP]; // strap segment ends
uniform int uStrapTile[MAX_STRAP]; // A/B/C fill: which tile (index into uTileCentre/uTileHueA) each strap bounds
uniform int uTileCount;            // number of tile types touching the fundamental domain (1 regular, ≤3 uniform, ≤5 snub)
uniform vec2 uTileCentre[MAX_TILES]; // each tile's centre (fundamental frame) — the crossing-parity source point
uniform float uTileHueA[MAX_TILES];  // each tile's hue (deg) for its A star body

// Islamic decoration style. 0 = plain (A/B/C fill + thin star lines), 1 = interlace (woven over/under
// bands), 2 = checkerboard (2-tone faces by global crossing parity). Off (uIslamic 0) ignores all of these.
uniform int uIslamicStyle;
uniform vec3 uCheckerA;    // checkerboard field colour A (even parity)
uniform vec3 uCheckerB;    // checkerboard field colour B (odd parity)
uniform float uBandHalf;   // interlace ribbon HALF-width, fundamental units (tapers toward the rim like geometry strokes)
// interlace weave: 1 = this strap dives UNDER at its edge-midpoint (origin, uStrapA) end, 0 = over/none.
// Each clean strap has exactly one crossing (its origin); the tip (uStrapB) end is a 2-valent bend.
uniform int uStrapUnder[MAX_STRAP];
// interlace: 0 = regular {p,q} (crossings completed by neighbour stubs ⇒ clean over-band break); 1 =
// uniform/snub (no stubs ⇒ also break the under strand at a disc around its own crossing origin).
uniform int uWeaveFallback;

out vec4 frag;

vec3 hsb2rgb(float h, float s, float v) {
	vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
	return v * mix(vec3(1.0), k, s);
}

vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) {
	float d = dot(b, b) + 1e-12;
	return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / d;
}

// Signed side of z relative to the geodesic through disk points p1,p2 (0 on the geodesic). The geodesic is
// the circle orthogonal to the unit circle; its centre c solves p·c = (1+|p|²)/2. Returns |z|²−2 z·c + 1.
// Near-singular determinant ⇒ the geodesic is a diameter; fall back to the straight-chord cross product.
float sideGeo(vec2 z, vec2 p1, vec2 p2) {
	float k1 = 0.5 * (1.0 + dot(p1, p1));
	float k2 = 0.5 * (1.0 + dot(p2, p2));
	float det = p1.x * p2.y - p1.y * p2.x;
	if (abs(det) < 1e-7) {
		vec2 d = p2 - p1;
		return d.x * (z.y - p1.y) - d.y * (z.x - p1.x);
	}
	vec2 c = vec2(k1 * p2.y - k2 * p1.y, k2 * p1.x - k1 * p2.x) / det;
	return dot(z, z) - 2.0 * dot(z, c) + 1.0;
}

// Euclidean distance from z to that geodesic (its circle, or the chord for a diameter) — for stroke AA.
float edgeDistGeo(vec2 z, vec2 p1, vec2 p2) {
	float k1 = 0.5 * (1.0 + dot(p1, p1));
	float k2 = 0.5 * (1.0 + dot(p2, p2));
	float det = p1.x * p2.y - p1.y * p2.x;
	if (abs(det) < 1e-7) {
		vec2 d = p2 - p1;
		return abs(d.x * (z.y - p1.y) - d.y * (z.x - p1.x)) / (length(d) + 1e-9);
	}
	vec2 c = vec2(k1 * p2.y - k2 * p1.y, k2 * p1.x - k1 * p2.x) / det;
	float r = sqrt(max(dot(c, c) - 1.0, 0.0));
	return abs(length(z - c) - r);
}

// Distance to the geodesic SEGMENT p1–p2 (not the infinite geodesic): a Euclidean slab test on the chord
// clips the extension, so an edge's stroke does not spray a line across the rest of the tiling.
float segDistGeo(vec2 z, vec2 p1, vec2 p2) {
	vec2 d = p2 - p1;
	float t = dot(z - p1, d) / max(dot(d, d), 1e-9);
	if (t < 0.0 || t > 1.0) return 1e9; // clip exactly at the endpoints — the per-vertex disks round the joins,
	return edgeDistGeo(z, p1, p2);       // so no overshoot spur is needed to bridge to the vertex.
}

// Does the geodesic O→z cross the strap arc a–b? O is the origin here (the folded tile centre), so the
// path O→z is a straight radius (diameters ARE geodesics). The origin is always on the +side of every
// geodesic (sideGeo(O)=|0|²−0+1=1), so z is beyond the strap iff sideGeo(z)<0; and the arc spans the ray
// iff its endpoints straddle the line O–z (cross(z,a)·cross(z,b)<0). Both tests are exact and share the
// strap's geodesic with the stroke (segDistGeo), so the A/B/C fill boundary sits exactly on the drawn arc.
bool pathCrossesStrap(vec2 z, vec2 a, vec2 b) {
	float d1 = z.x * a.y - z.y * a.x;
	float d2 = z.x * b.y - z.y * b.x;
	if (d1 * d2 >= 0.0) return false;   // a,b on the same side of ray O→z ⇒ the arc doesn't span it
	return sideGeo(z, a, b) < 0.0;      // z on the far side of the strap's geodesic (O is always the +side)
}

// Same crossing test from an ARBITRARY source P — uniform/snub stars sit at Schwarz corners, not the origin,
// so the path P→z is a general geodesic arc. Two geodesic SEGMENTS cross iff P,z straddle the strap's
// geodesic AND a,b straddle the path's geodesic (both via sideGeo). Reduces to pathCrossesStrap when P = O.
bool pathCrossesStrapFrom(vec2 P, vec2 z, vec2 a, vec2 b) {
	if (sideGeo(P, a, b) * sideGeo(z, a, b) >= 0.0) return false;
	return sideGeo(a, P, z) * sideGeo(b, P, z) < 0.0;
}

// Count strap crossings on the geodesic from centre P to z, counting ONLY straps that bound tile "want"
// (A/B/C parity for that tile). 0  means z is in that tile's star body. Mixing tile types would corrupt the
// count — a path from the p-gon centre must ignore the q-gon's straps — which is why straps carry a tag.
int crossFromTile(vec2 P, vec2 z, int want) {
	int cr = 0;
	for (int i = 0; i < MAX_STRAP; i++) {
		if (i >= uStrapCount) break;
		if (uStrapTile[i] != want) continue;
		if (pathCrossesStrapFrom(P, z, uStrapA[i], uStrapB[i])) cr++;
	}
	return cr;
}

// Total strap crossings on the geodesic O→z over ALL straps (tag ignored) — the checkerboard 2-colouring.
// Every strap is a boundary of the star arrangement, so the parity of this count is a proper 2-colouring
// of the faces (even-degree everywhere ⇒ bipartite). Constant per fold-tile, so the whole disk 2-colours.
int crossAll(vec2 P, vec2 z) {
	int cr = 0;
	for (int i = 0; i < MAX_STRAP; i++) {
		if (i >= uStrapCount) break;
		if (pathCrossesStrapFrom(P, z, uStrapA[i], uStrapB[i])) cr++;
	}
	return cr;
}

// z inside the convex geodesic quad p0-p1-p2-p3 — the ref-point side of all four edges.
bool inQuad(vec2 z, vec2 ref, vec2 p0, vec2 p1, vec2 p2, vec2 p3) {
	return sideGeo(z, p0, p1) * sideGeo(ref, p0, p1) > 0.0
	    && sideGeo(z, p1, p2) * sideGeo(ref, p1, p2) > 0.0
	    && sideGeo(z, p2, p3) * sideGeo(ref, p2, p3) > 0.0
	    && sideGeo(z, p3, p0) * sideGeo(ref, p3, p0) > 0.0;
}

// Inverse of the SU(1,1) view [[a,b],[b̄,ā]] (det 1) is [[ā,−b],[−b̄,a]], so V⁻¹(z)=(ā z − b)/(−b̄ z + a).
vec2 viewInverse(vec2 z) {
	vec2 abar = vec2(uMa.x, -uMa.y);
	vec2 num = cmul(abar, z) - uMb;
	vec2 den = cmul(vec2(-uMb.x, uMb.y), z) + uMa; // (−b̄)·z + a
	return cdiv(num, den);
}

// Forward view V(z) = (a z + b)/(b̄ z + ā): world → screen disk.
vec2 viewForward(vec2 z) {
	vec2 num = cmul(uMa, z) + uMb;
	vec2 den = cmul(vec2(uMb.x, -uMb.y), z) + vec2(uMa.x, -uMa.y);
	return cdiv(num, den);
}

void main() {
	// Centred CSS pixel, y up (disk convention).
	vec2 fragCss = gl_FragCoord.xy / uDpr;
	vec2 s = vec2(fragCss.x - uRes.x * 0.5, uRes.y * 0.5 - fragCss.y);
	float R = max(0.5 * min(uRes.x, uRes.y) - uPadPx, 1.0);
	vec2 zScreen = s / R;
	if (dot(zScreen, zScreen) >= 1.0) { frag = vec4(uSurface, 1.0); return; }

	// Inverse view isometry (pan + rotation) — the CONTINUOUS pre-fold disk coord. Its screen-space
	// footprint has valid derivatives (the fold below is discontinuous, so we measure the footprint here
	// and carry it through the fold via the accumulated inversion scale rather than fwidth-ing a folded
	// value — that produced dashed, driver-dependent strokes).
	vec2 z0 = viewInverse(zScreen);
	float pw0 = max(length(dFdx(z0)), length(dFdy(z0)));

	float wedge = 2.0 * PI / uP;
	float cc = uEdgeA;               // edge-circle centre on +x (real)
	vec2 c = vec2(cc, 0.0);
	float rho2 = uEdgeRho * uEdgeRho;
	vec2 z = z0;
	float jac = 1.0;                 // accumulated inversion scale: fundamental units per disk unit
	int step = 0;
	bool converged = false;
	// Accumulated inverse fold as a Möbius matrix M = [[A,B],[C,D]] (the world→ frame that carries the
	// central tile back to this pixel's tile). tileCentreWorld = M(0) = B/D. Built from the holomorphic
	// crossing G_cross(z) = (cc·z − 1)/(z − cc) [matrix K = [[cc,−1],[1,−cc]], inverse ∝ [[−cc,1],[−1,cc]]]
	// and the wedge rotations, so no conjugation bookkeeping is needed.
	vec2 A = vec2(1.0, 0.0), B = vec2(0.0), C = vec2(0.0), D = vec2(1.0, 0.0);
	for (int i = 0; i < MAX_ITER; i++) {
		// Reduce into the reference edge wedge [−π/p, π/p] about the +x apothem axis (pure rotation).
		float ang = atan(z.y, z.x);
		float m = floor(ang / wedge + 0.5);
		float rotAng = -wedge * m;
		float cr = cos(rotAng), sr = sin(rotAng);
		z = vec2(cr * z.x - sr * z.y, sr * z.x + cr * z.y);
		// Right-compose R(−rotAng) into M (inverse of the applied rotation): scales column 0 by e^{-i·rotAng}.
		vec2 e = vec2(cos(-rotAng), sin(-rotAng));
		A = cmul(A, e); C = cmul(C, e);
		// Tile interior is the ORIGIN side of the edge geodesic (dd > rho²). Far side ⇒ crossed an edge.
		vec2 d = z - c;
		float dd = dot(d, d);
		if (dd < rho2) {
			jac *= rho2 / dd;
			// z ← G_cross(z) = (cc·z − 1)/(z − cc); right-compose K⁻¹ ∝ [[−cc,1],[−1,cc]] into M.
			z = cdiv(vec2(cc * z.x - 1.0, cc * z.y), vec2(z.x - cc, z.y));
			vec2 nA = -cc * A - B, nB = A + cc * B, nC = -cc * C - D, nD = C + cc * D;
			A = nA; B = nB; C = nC; D = nD;
			float nrm = 1.0 / max(length(D), 1.0);   // keep magnitudes bounded; B/D is unchanged
			A *= nrm; B *= nrm; C *= nrm; D *= nrm;
			step++;
		} else {
			converged = true;
			break;
		}
	}

	// Footprint carried into the fundamental frame: fundamental (edgeDist) units per screen pixel.
	float pwf = jac * pw0;
	float edgeDist = length(z - c) - uEdgeRho;   // >0 in the tile interior, 0 on the edge geodesic
	// Geometry mode: a fixed width in FUNDAMENTAL units (uStrokePx·uEdgeRho) — thick near the centre where
	// tiles are large, thinning toward the rim as they shrink. Its on-screen width is halfW/pwf, depending
	// only on pwf (the re-base-invariant screen→fundamental scale), so it stays SMOOTH under panning. Do NOT
	// key the taper off jac: it is not invariant under the per-frame re-base that keeps panning stable, so
	// the stroke width would jump on every re-base. Constant mode: scale by pwf so the stroke keeps a fixed
	// SCREEN width. The AA transition band is always one pixel (pwf).
	float halfW = uStrokeMode == 1 ? uStrokePx * pwf : uStrokePx * uEdgeRho;
	float lineCov = uStrokePx > 0.0 ? (1.0 - smoothstep(halfW - pwf, halfW + pwf, edgeDist)) : 0.0;

	// One flat colour per tile from the tile's CONTINUOUS distance from the screen centre: take the tile
	// centre (world), map it through the view to the screen disk, and dim by its radius. Constant within a
	// tile (flat) but smooth from tile to tile and as the view pans — no ring-banding.
	vec2 tileCentre = viewForward(cdiv(B, D));
	float tr = clamp(length(tileCentre), 0.0, 1.0);

	// Uniform tilings: fold the reference kite one reflection further (z.y → |z.y|) into the Schwarz triangle,
	// classify by the Wythoff-vertex → foot tile-edges, recolour per tile type, dim per uniform-tile centre,
	// and stroke only the CHOSEN region's own bounding edges (so extended geodesics don't spray extra lines).
	float hueDeg = uHue;
	if (uSnub == 1) {
		// Snub: work in the kite coord z (no reflection — chiral). The p-gon at O is bounded within the wedge
		// by the two edges meeting at s (to a·s and a⁻¹·s); test the origin side of both. The q-gon (q ≥ 4)
		// sits at the two wedge corners V and V' = a⁻¹V; test V's directly and V' by rotating z by +2π/p.
		vec2 O = vec2(0.0);
		bool inP = sideGeo(z, uSnubAis, uSnubS) * sideGeo(O, uSnubAis, uSnubS) > 0.0
		        && sideGeo(z, uSnubS, uSnubAs) * sideGeo(O, uSnubS, uSnubAs) > 0.0;
		bool inQ = false;
		if (uNTiles == 3) {
			// q-gon (q ≥ 4) is a convex polygon s → bs → b²s → b⁻¹s: inside = V-side of all four edges. Testing
			// only the two edges at s would spill past the far side into the neighbouring triangles.
			float wa = 2.0 * PI / uP; float ca = cos(wa), sa = sin(wa);
			vec2 zr = vec2(ca * z.x - sa * z.y, sa * z.x + ca * z.y); // rotate +2π/p to test the V' q-gon as V's
			inQ = inQuad(z, uCornerV, uSnubS, uSnubBs, uSnubB2s, uSnubBis)
			   || inQuad(zr, uCornerV, uSnubS, uSnubBs, uSnubB2s, uSnubBis);
		}
		int reg = inP ? 0 : (inQ ? 1 : 2);
		hueDeg = reg == 0 ? uTileHue.x : reg == 1 ? uTileHue.y : uTileHue.z;
		// Dim: the p-gon lives inside ONE {p,q} cell, so a flat per-tile shade is seam-safe; the square and
		// triangles straddle fold cells, where a per-cell tile-centre jumps at the seam (the lighter wedge AL
		// saw) — dim those by the continuous screen radius instead.
		if (reg == 0) { vec2 cw = cdiv(cmul(A, O) + B, cmul(C, O) + D); tr = clamp(length(viewForward(cw)), 0.0, 1.0); }
		else tr = clamp(length(zScreen), 0.0, 1.0);
		// Strokes: the 5 edges at s (fold symmetry maps every edge to one at s) — two p-gon (as, ais), two
		// q-gon (bs, bis), and the triangle–triangle edge (n) — plus the three snub-triangle third edges
		// closing {s,as,bis}, {s,ais,n}, {s,n,bs}. Segment-clipped so geodesics don't spray past the vertices.
		float ie = 1e9;
		ie = min(ie, segDistGeo(z, uSnubS, uSnubAs));
		ie = min(ie, segDistGeo(z, uSnubS, uSnubAis));
		ie = min(ie, segDistGeo(z, uSnubS, uSnubBs));
		ie = min(ie, segDistGeo(z, uSnubS, uSnubBis));
		ie = min(ie, segDistGeo(z, uSnubS, uSnubN));
		ie = min(ie, segDistGeo(z, uSnubAs, uSnubBis));  // triangle {s, as, bis}
		ie = min(ie, segDistGeo(z, uSnubAis, uSnubN));   // triangle {s, ais, n}
		ie = min(ie, segDistGeo(z, uSnubN, uSnubBs));    // triangle {s, n, bs}
		// Round the joins: a small disk at each vertex caps the segment-clipped ends, so edges meet cleanly
		// instead of leaving a perpendicular-cutoff notch at every vertex.
		ie = min(ie, distance(z, uSnubS));
		ie = min(ie, distance(z, uSnubAs));
		ie = min(ie, distance(z, uSnubAis));
		ie = min(ie, distance(z, uSnubBs));
		ie = min(ie, distance(z, uSnubBis));
		ie = min(ie, distance(z, uSnubN));
		lineCov = uStrokePx > 0.0 ? (1.0 - smoothstep(halfW - pwf, halfW + pwf, ie)) : 0.0;
	} else if (uNTiles > 1) {
		float ysign = z.y < 0.0 ? -1.0 : 1.0;
		vec2 zf = vec2(z.x, abs(z.y));
		vec2 W = uWythoff, O = vec2(0.0), Vc = uCornerV, Ec = vec2(uRin, 0.0);
		bool pA = distance(W, uFootA) > 1e-4;
		bool pB = distance(W, uFootB) > 1e-4;
		bool pC = distance(W, uFootC) > 1e-4;
		bool occO = uOcc.x > 0.5, occV = uOcc.y > 0.5, occE = uOcc.z > 0.5;
		float sA = sideGeo(zf, W, uFootA);
		float sB = sideGeo(zf, W, uFootB);
		float sC = sideGeo(zf, W, uFootC);
		// A face at corner X owns the pixels on X's side of every present tile-edge separating X from another
		// occupied corner. O borders V via edge B and E via edge A; V borders E via edge C.
		bool inO = true;
		if (occV && pB) inO = inO && (sB * sideGeo(O, W, uFootB) > 0.0);
		if (occE && pA) inO = inO && (sA * sideGeo(O, W, uFootA) > 0.0);
		bool inV = true;
		if (occO && pB) inV = inV && (sB * sideGeo(Vc, W, uFootB) > 0.0);
		if (occE && pC) inV = inV && (sC * sideGeo(Vc, W, uFootC) > 0.0);
		bool inE = true;
		if (occO && pA) inE = inE && (sA * sideGeo(Ec, W, uFootA) > 0.0);
		if (occV && pC) inE = inE && (sC * sideGeo(Ec, W, uFootC) > 0.0);
		// Which corner won (0=O,1=V,2=E,-1=fallback), the region's frame-centre, and its own bounding edges.
		int reg = -1;
		vec2 centreFrame = vec2(0.0);
		float ie = 1e9;
		if (occO && inO) {
			reg = 0; centreFrame = O;
			if (occV && pB) ie = min(ie, edgeDistGeo(zf, W, uFootB));
			if (occE && pA) ie = min(ie, edgeDistGeo(zf, W, uFootA));
		} else if (occV && inV) {
			reg = 1; centreFrame = vec2(Vc.x, ysign * Vc.y);
			if (occO && pB) ie = min(ie, edgeDistGeo(zf, W, uFootB));
			if (occE && pC) ie = min(ie, edgeDistGeo(zf, W, uFootC));
		} else if (occE && inE) {
			reg = 2; centreFrame = Ec;
			if (occO && pA) ie = min(ie, edgeDistGeo(zf, W, uFootA));
			if (occV && pC) ie = min(ie, edgeDistGeo(zf, W, uFootC));
		} else {
			// Fallback (thin ties near a vertex): nearest occupied corner in the fundamental frame.
			float best = 1e9;
			if (occO && distance(zf, O)  < best) { best = distance(zf, O);  reg = 0; centreFrame = O; }
			if (occV && distance(zf, Vc) < best) { best = distance(zf, Vc); reg = 1; centreFrame = vec2(Vc.x, ysign * Vc.y); }
			if (occE && distance(zf, Ec) < best) { best = distance(zf, Ec); reg = 2; centreFrame = Ec; }
		}
		// Same-type edges lie ALONG the unringed mirror (W sits on it): two like faces meet there. Stroke it
		// only inside a face NOT centred on that mirror — the region check clips it, so forms with no same-type
		// adjacency (e.g. rectified) never see it. Each mirror is the geodesic through its two corners.
		if (!pA && reg == 1) ie = min(ie, edgeDistGeo(zf, O, Ec));  // mirror A (through O,E) within a V-face
		if (!pB && reg == 2) ie = min(ie, edgeDistGeo(zf, O, Vc));  // mirror B (through O,V) within an E-face
		if (!pC && reg == 0) ie = min(ie, edgeDistGeo(zf, Vc, Ec)); // mirror C (through V,E) within an O-face
		hueDeg = reg == 0 ? uTileHue.x : reg == 1 ? uTileHue.y : uTileHue.z;
		// Per-uniform-tile flat dim: map the region's own centre (frame → world → screen) so a tile straddling
		// several regular-{p,q} cells keeps ONE brightness instead of a seam-patchwork.
		vec2 cw = cdiv(cmul(A, centreFrame) + B, cmul(C, centreFrame) + D);
		tr = clamp(length(viewForward(cw)), 0.0, 1.0);
		lineCov = uStrokePx > 0.0 ? (1.0 - smoothstep(halfW - pwf, halfW + pwf, ie)) : 0.0;
	}

	// Islamic strap-test coord: regular {p,q} tests the raw fold coord (uStrapReflect 0); uniform tilings
	// fold once more to the upper-half Schwarz triangle (uStrapReflect 1) so a single upper-half copy of each
	// off-axis tile (e.g. the q-gon at V) covers its mirror twin below the axis — used by BOTH the A/B/C fill
	// and the stroke so their star boundaries coincide. Snub is chiral (uStrapReflect 0, tests z directly).
	vec2 zk = uStrapReflect == 1 ? vec2(z.x, abs(z.y)) : z;

	// Radial dim, hoisted so the interlace ribbon section can reuse it. Non-Islamic: FLAT per {p,q} tile
	// (keyed off the tile centre's screen radius tr) so each tile is one shade. Islamic: keyed off the pixel's
	// own screen radius so the strapwork's cells don't read the original tiling back as a lightness grid
	// (AL: visible at the dual, angle 90°) — continuous across cells, still darkening toward the rim.
	float dim = uIslamic == 1 ? (1.0 - 0.5 * dot(zScreen, zScreen)) : (1.0 - 0.5 * tr * tr);
	vec3 baseFill;
	if (uShadeMode == 1 && uNTiles == 1) {
		// Two-tone parity (only offered when q is even ⇒ the tiling is 2-colourable). uParityOffset tracks
		// the re-base's crossings so each tile keeps its black/white value however the view has panned.
		baseFill = mod(float(step) + uParityOffset, 2.0) < 0.5 ? uParityA : uParityB;
	} else {
		// Quadratic falloff, brightest at the centre. Non-Islamic: FLAT per {p,q} tile (keyed off the tile
		// centre's screen radius, tr) so each tile is one shade. Islamic: the star/octagon cells of the
		// strapwork do NOT align with the fold's tiles — a per-tile shade seams a cell that straddles several
		// tiles and the ORIGINAL tiling reads back through as a lightness grid (AL: visible at the dual, angle
		// 90°). Key the Islamic fade off the pixel's own screen radius instead: continuous across cells, so no
		// original-tile grid survives while the pattern still darkens toward the rim. (dim hoisted above.)
		// Islamic A/B/C fill — regular, uniform, AND snub, unified. Each tile type touching the fundamental
		// domain has its own star at its centre uTileCentre[j]; a pixel is in tile j's star iff the crossing
		// parity from that centre (counting ONLY tile j's straps) is 0, and it then takes that tile's hue.
		// This is exactly the LOCAL polygons-in-contact rule: every tile behaves identically, independent of
		// its neighbours — the tag is what keeps them independent. Background: for a single tile type (regular)
		// the parity gives B (odd) vs C (even edge diamonds); across several tile types the global 2-colouring
		// is ambiguous, so the background is one tone (B) — which colorFacesAbc also collapses to (degenerate).
		if (uIslamic == 1 && uIslamicStyle == 2) {
			// Checkerboard: 2-colour the faces by the parity of the global crossing count O→pixel. Ignores the
			// star bodies (no A hue) — the woven-face zellij look. The thin star lines still draw on top below.
			baseFill = ((crossAll(vec2(0.0), zk) & 1) == 0 ? uCheckerA : uCheckerB) * dim;
		} else if (uIslamic == 1 && uIslamicStyle == 1) {
			// Interlace: the ribbons are drawn in the stroke section over a flat single-colour ground (the B field).
			baseFill = uIslamicB * dim;
		} else if (uIslamic == 1) {
			// Plain: A/B/C star fill. Each tile type has its star at uTileCentre[j]; a pixel is in tile j's star
			// iff the crossing parity from that centre (only tile j's straps) is 0, and it takes that tile's hue.
			int starTile = -1;
			int c0 = 0;
			for (int j = 0; j < MAX_TILES; j++) {
				if (j >= uTileCount) break;
				int c = crossFromTile(uTileCentre[j], zk, j);
				if (j == 0) c0 = c;
				if (c == 0) { starTile = j; break; }
			}
			if (starTile >= 0) baseFill = hsb2rgb((uTileHueA[starTile] + uHueOffset) / 360.0, 0.40, 1.0) * dim; // A
			else if (uTileCount == 1) baseFill = (c0 % 2 == 1) ? uIslamicB * dim : uIslamicC * dim;              // regular B/C
			else baseFill = uIslamicB * dim;                                                                     // uniform/snub background
		} else {
			baseFill = hsb2rgb((hueDeg + uHueOffset) / 360.0, 0.40, 1.0) * dim;
		}
	}
	// No fill: tiles paint the background (edges kept) — the Euclidean noFill() semantics. The caller sends a
	// light uLine in dark theme so the strokes stay visible on the dark surface.
	if (uShowFill == 0) baseFill = uSurface;
	// Points that never reached the central tile (the boundary limit set) blend to the surface.
	if (!converged) baseFill = mix(baseFill, uSurface, 0.6);
	// Sub-pixel tiles near the boundary: fade fill toward the surface and dissolve strokes, so the dense
	// limit set reads as a clean rim instead of aliasing into a solid ring.
	float rim = smoothstep(0.5, 2.0, pwf);
	baseFill = mix(baseFill, uSurface, 0.5 * rim);
	lineCov *= (1.0 - rim);

	vec3 col = mix(baseFill, uLine, lineCov);

	// Islamic strapwork (all hyperbolic tilings). Regular/uniform fold the pixel to the upper-half Schwarz
	// triangle (uStrapReflect); snub tests the chiral kite coord directly.
	if (uIslamic == 1 && uIslamicStyle == 1) {
		// INTERLACE: promote the strap field to woven bands. Each strap is OVER (layer 0) near its tip
		// (uStrapB, a 2-valent bend) and takes uStrapUnder at its crossing origin (uStrapA). Track the nearest
		// OVER strap and nearest UNDER strap separately. The over ribbon draws on top in full; the under ribbon
		// draws ONLY outside the over band, so its two side borders stop exactly on the over band's edge — that
		// interrupted border, not a colour change, is what reads as the weave (both ribbons share the tile hue).
		float dOver = 1e9, dUnder = 1e9, underOrg = 1e9;
		int tileOver = 0, tileUnder = 0;
		for (int i = 0; i < MAX_STRAP; i++) {
			if (i >= uStrapCount) break;
			// Capped distance (segment + both endpoint discs), like the stroke: the endpoint disc is what lets a
			// neighbour stub OCCLUDE across its crossing origin M — a central-tile pixel projects beyond the stub,
			// so segDistGeo alone (clipped at the ends) would miss the very cap that completes the woven break.
			float dA = distance(zk, uStrapA[i]), dB = distance(zk, uStrapB[i]);
			float d = min(segDistGeo(zk, uStrapA[i], uStrapB[i]), min(dA, dB));
			if (d > uBandHalf + pwf) continue;
			int layer = (dA < dB) ? uStrapUnder[i] : 0;
			if (layer == 0) { if (d < dOver) { dOver = d; tileOver = uStrapTile[i]; } }
			else if (d < dUnder) { dUnder = d; tileUnder = uStrapTile[i]; underOrg = dA; } // dA = distance to its crossing origin M
		}
		float coreHalf = max(uBandHalf - halfW, 0.0);   // ribbon core, inside its uLine border
		float aa = 1.0 - rim;
		col = baseFill;
		// UNDER ribbon first, occluded by the nearest OVER band (occ = 1 outside it, 0 within). The over strand
		// at each crossing includes the neighbour stub straddling the shared edge, so the under strand's two side
		// borders stop exactly on the over band's edge — a true woven break, no colour change needed.
		if (dUnder < uBandHalf + pwf) {
			vec3 ribU = hsb2rgb((uTileHueA[tileUnder] + uHueOffset) / 360.0, 0.40, 1.0) * dim;
			// Regular {p,q} completes every crossing with a neighbour stub, so the over band alone breaks the under
			// strand cleanly. Uniform/snub (uWeaveFallback == 1) have no stubs — the over partner is a mirror-fold
			// neighbour absent from the set — so ALSO break the under strand within a disc of its own crossing
			// origin M (underOrg). That gives a woven notch at each crossing without the partner drawn: not as
			// crisp as the stub-completed regular weave, but it reads as over/under rather than flat.
			float occ = smoothstep(uBandHalf - pwf, uBandHalf + pwf, dOver);
			if (uWeaveFallback == 1) occ *= smoothstep(uBandHalf - pwf, uBandHalf + pwf, underOrg);
			float band = (1.0 - smoothstep(uBandHalf - pwf, uBandHalf + pwf, dUnder)) * occ * aa;
			float core = (1.0 - smoothstep(coreHalf   - pwf, coreHalf   + pwf, dUnder)) * occ * aa;
			col = mix(col, uLine, band);
			col = mix(col, ribU, core);
		}
		// OVER ribbon on top, full width (its borders run unbroken through every crossing).
		if (dOver < uBandHalf + pwf) {
			vec3 ribO = hsb2rgb((uTileHueA[tileOver] + uHueOffset) / 360.0, 0.40, 1.0) * dim;
			float band = (1.0 - smoothstep(uBandHalf - pwf, uBandHalf + pwf, dOver)) * aa;
			float core = (1.0 - smoothstep(coreHalf   - pwf, coreHalf   + pwf, dOver)) * aa;
			col = mix(col, uLine, band);
			col = mix(col, ribO, core);
		}
	} else if (uIslamic == 1) {
		// Plain + checkerboard: thin star line-stroke over the fill, taking the nearest strap. RE-MIXES from
		// baseFill (dropping the tile-edge lineCov), so the star straps carry the linework — matching the
		// spherical canvas. Turn off the fill (uShowFill) for a pure star pattern.
		float ds = 1e9;
		for (int i = 0; i < MAX_STRAP; i++) {
			if (i >= uStrapCount) break;
			ds = min(ds, segDistGeo(zk, uStrapA[i], uStrapB[i]));
			ds = min(ds, min(distance(zk, uStrapA[i]), distance(zk, uStrapB[i])));
		}
		float strapCov = (1.0 - smoothstep(halfW - pwf, halfW + pwf, ds)) * (1.0 - rim);
		col = mix(baseFill, uLine, strapCov);
	}

	// Feature-point overlay: mark this pixel's nearest centroid (red), edge midpoint (green), and vertex
	// (blue) in the folded fundamental frame. Radius is in device px (·pwf → fundamental units) so the dots
	// stay a fixed screen size. Each dot is a black-bordered disk that fades out before the disk edge (see
	// POINT_FADE_*), so the dense boundary limit set stays clean instead of a speckled rim.
	if (uShowPoints == 1) {
		float dR = 1e9, dG = 1e9, dB = 1e9;
		for (int i = 0; i < MAX_POINTS; i++) {
			if (i >= uNumPoints) break;
			float d = distance(z, uPoints[i]);
			int k = uPointKind[i];
			if (k == 0) dR = min(dR, d);
			else if (k == 1) dG = min(dG, d);
			else dB = min(dB, d);
		}
		float rad = uPointRadius * pwf;                 // outer radius (incl. border), fundamental units
		float aa = pwf;
		float bw = POINT_BORDER_CSS * uDpr * pwf;        // black border, fixed screen width
		float radIn = max(rad - bw, 0.0);                // coloured-centre radius
		// Opacity falloff: fade fill + border together with the disk radius, and keep the sub-pixel rim
		// fade so dots never smear into the boundary limit set.
		float sr = length(zScreen);
		float fade = (1.0 - rim) * (1.0 - smoothstep(POINT_FADE_START, POINT_FADE_END, sr));
		// Per kind: black silhouette (the border) first, then the coloured centre on top. Vertex (blue) is
		// painted last so it wins where kinds overlap.
		float ringR = (1.0 - smoothstep(rad   - aa, rad   + aa, dR)) * fade;
		float fillR = (1.0 - smoothstep(radIn - aa, radIn + aa, dR)) * fade;
		col = mix(col, vec3(0.0), ringR);
		col = mix(col, vec3(1.0, 0.0, 0.0), fillR); // centroid
		float ringG = (1.0 - smoothstep(rad   - aa, rad   + aa, dG)) * fade;
		float fillG = (1.0 - smoothstep(radIn - aa, radIn + aa, dG)) * fade;
		col = mix(col, vec3(0.0), ringG);
		col = mix(col, vec3(0.0, 1.0, 0.0), fillG); // edge midpoint
		float ringB = (1.0 - smoothstep(rad   - aa, rad   + aa, dB)) * fade;
		float fillB = (1.0 - smoothstep(radIn - aa, radIn + aa, dB)) * fade;
		col = mix(col, vec3(0.0), ringB);
		col = mix(col, vec3(0.0, 0.0, 1.0), fillB); // vertex (on top)
	}

	frag = vec4(col, 1.0);
}
`;

export interface HyperbolicUniforms {
	uRes: WebGLUniformLocation | null;
	uDpr: WebGLUniformLocation | null;
	uPadPx: WebGLUniformLocation | null;
	uMa: WebGLUniformLocation | null;
	uMb: WebGLUniformLocation | null;
	uP: WebGLUniformLocation | null;
	uEdgeA: WebGLUniformLocation | null;
	uEdgeRho: WebGLUniformLocation | null;
	uShadeMode: WebGLUniformLocation | null;
	uParityOffset: WebGLUniformLocation | null;
	uHue: WebGLUniformLocation | null;
	uHueOffset: WebGLUniformLocation | null;
	uStrokePx: WebGLUniformLocation | null;
	uStrokeMode: WebGLUniformLocation | null;
	uSurface: WebGLUniformLocation | null;
	uLine: WebGLUniformLocation | null;
	uParityA: WebGLUniformLocation | null;
	uParityB: WebGLUniformLocation | null;
	uIslamicB: WebGLUniformLocation | null;
	uIslamicC: WebGLUniformLocation | null;
	uShowFill: WebGLUniformLocation | null;
	uNTiles: WebGLUniformLocation | null;
	uWythoff: WebGLUniformLocation | null;
	uFootA: WebGLUniformLocation | null;
	uFootB: WebGLUniformLocation | null;
	uFootC: WebGLUniformLocation | null;
	uCornerV: WebGLUniformLocation | null;
	uRin: WebGLUniformLocation | null;
	uOcc: WebGLUniformLocation | null;
	uTileHue: WebGLUniformLocation | null;
	uSnub: WebGLUniformLocation | null;
	uSnubS: WebGLUniformLocation | null;
	uSnubAs: WebGLUniformLocation | null;
	uSnubAis: WebGLUniformLocation | null;
	uSnubBs: WebGLUniformLocation | null;
	uSnubBis: WebGLUniformLocation | null;
	uSnubN: WebGLUniformLocation | null;
	uSnubB2s: WebGLUniformLocation | null;
	uShowPoints: WebGLUniformLocation | null;
	uNumPoints: WebGLUniformLocation | null;
	uPoints: WebGLUniformLocation | null;
	uPointKind: WebGLUniformLocation | null;
	uPointRadius: WebGLUniformLocation | null;
	uIslamic: WebGLUniformLocation | null;
	uStrapReflect: WebGLUniformLocation | null;
	uStrapCount: WebGLUniformLocation | null;
	uStrapA: WebGLUniformLocation | null;
	uStrapB: WebGLUniformLocation | null;
	uStrapTile: WebGLUniformLocation | null;
	uTileCount: WebGLUniformLocation | null;
	uTileCentre: WebGLUniformLocation | null;
	uTileHueA: WebGLUniformLocation | null;
	uIslamicStyle: WebGLUniformLocation | null;
	uCheckerA: WebGLUniformLocation | null;
	uCheckerB: WebGLUniformLocation | null;
	uBandHalf: WebGLUniformLocation | null;
	uStrapUnder: WebGLUniformLocation | null;
	uWeaveFallback: WebGLUniformLocation | null;
}

const UNIFORM_NAMES: (keyof HyperbolicUniforms)[] = [
	"uRes", "uDpr", "uPadPx", "uMa", "uMb", "uP", "uEdgeA", "uEdgeRho",
	"uShadeMode", "uParityOffset", "uHue", "uHueOffset", "uStrokePx", "uStrokeMode", "uSurface", "uLine", "uParityA", "uParityB", "uIslamicB", "uIslamicC", "uShowFill",
	"uNTiles", "uWythoff", "uFootA", "uFootB", "uFootC", "uCornerV", "uRin", "uOcc", "uTileHue",
	"uSnub", "uSnubS", "uSnubAs", "uSnubAis", "uSnubBs", "uSnubBis", "uSnubN", "uSnubB2s",
	"uShowPoints", "uNumPoints", "uPoints", "uPointKind", "uPointRadius",
	"uIslamic", "uStrapReflect", "uStrapCount", "uStrapA", "uStrapB",
	"uStrapTile", "uTileCount", "uTileCentre", "uTileHueA",
	"uIslamicStyle", "uCheckerA", "uCheckerB", "uBandHalf", "uStrapUnder", "uWeaveFallback",
];

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
	const sh = gl.createShader(type);
	if (!sh) return null;
	gl.shaderSource(sh, src);
	gl.compileShader(sh);
	if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
		console.error("hyperbolic shader compile failed:", gl.getShaderInfoLog(sh));
		gl.deleteShader(sh);
		return null;
	}
	return sh;
}

export interface HyperbolicProgram {
	program: WebGLProgram;
	vs: WebGLShader;
	fs: WebGLShader;
	uniforms: HyperbolicUniforms;
	/** Full-screen quad buffer, already bound to the `aPos` attribute. */
	quad: WebGLBuffer;
}

/** Compile+link the hyperbolic program and set up the full-screen quad. Returns null on failure. */
export function createHyperbolicProgram(gl: WebGL2RenderingContext): HyperbolicProgram | null {
	const vs = compile(gl, gl.VERTEX_SHADER, HYPERBOLIC_VERT);
	const fs = compile(gl, gl.FRAGMENT_SHADER, HYPERBOLIC_FRAG);
	if (!vs || !fs) return null;
	const program = gl.createProgram();
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		console.error("hyperbolic program link failed:", gl.getProgramInfoLog(program));
		return null;
	}
	gl.useProgram(program);

	const uniforms = {} as HyperbolicUniforms;
	for (const name of UNIFORM_NAMES) uniforms[name] = gl.getUniformLocation(program, name);

	const quad = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, quad);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
	const aPos = gl.getAttribLocation(program, "aPos");
	gl.enableVertexAttribArray(aPos);
	gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

	return { program, vs, fs, uniforms, quad };
}
