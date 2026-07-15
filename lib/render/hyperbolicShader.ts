// GLSL for the Poincaré-disk hyperbolic renderer, shared by the interactive overlay
// (components/hyperbolic-canvas.tsx) and the static thumbnail (components/hyperbolic-thumbnail.tsx).
//
// The fragment shader renders a regular {p,q} tiling by folding each pixel into the fundamental Schwarz
// triangle of the (2,p,q) group: dihedral-reduce the angle into the reference half-wedge [0, π/p], then
// invert across the tile-edge geodesic (a circle orthogonal to the unit circle, centre (edgeA,0), radius
// edgeRho) whenever the point lies outside it, iterating until it lands inside the central tile. The
// mirror parameters come from lib/render/hyperbolic.ts (mirrorParams). Pan is a hyperbolic translation:
// per pixel we apply the inverse disk automorphism M⁻¹(z)=e^{-iθ}… with translation uB (from panToB) and
// rotation uTheta. Zoom is intentionally absent — the disk radius is fixed at 0.5·min(w,h).
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

uniform vec2 uRes;       // CSS pixel size (w, h)
uniform float uDpr;      // device pixel ratio
uniform vec2 uMa;        // SU(1,1) view isometry: a (complex)
uniform vec2 uMb;        // SU(1,1) view isometry: b (complex); acts z ↦ (a z + b)/(b̄ z + ā)
uniform float uP;        // p (polygon side count)
uniform float uEdgeA;    // edge-geodesic circle centre on +x
uniform float uEdgeRho;  // edge-geodesic circle radius
uniform int uShadeMode;  // 0 = coloured tiles + edges, 1 = two-tone parity
uniform float uParityOffset; // 0/1: absolute-parity correction, cancels the re-base's tile re-labelling
uniform float uHue;      // tile hue, degrees
uniform float uStrokePx; // stroke width control (0 = no strokes)
uniform int uStrokeMode; // 0 = geometry (fraction of the tile edge), 1 = constant screen width
uniform vec3 uSurface;   // background + out-of-disk
uniform vec3 uLine;      // edge stroke / dark tone
uniform vec3 uParityA;   // parity mode: even tiles
uniform vec3 uParityB;   // parity mode: odd tiles

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
	if (t < -0.12 || t > 1.12) return 1e9;
	return edgeDistGeo(z, p1, p2);
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
	float R = 0.5 * min(uRes.x, uRes.y);
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
	// Geometry mode: a fixed fraction of the tile edge (fundamental units) — thick near the centre where
	// tiles are large, thin toward the rim as they shrink. Constant mode: scale by pwf so the stroke keeps
	// a fixed SCREEN width. The AA transition band is always one pixel (pwf).
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
			float wa = 2.0 * PI / uP; float ca = cos(wa), sa = sin(wa);
			vec2 zr = vec2(ca * z.x - sa * z.y, sa * z.x + ca * z.y);
			bool q1 = sideGeo(z, uSnubBis, uSnubS) * sideGeo(uCornerV, uSnubBis, uSnubS) > 0.0
			       && sideGeo(z, uSnubS, uSnubBs) * sideGeo(uCornerV, uSnubS, uSnubBs) > 0.0;
			bool q2 = sideGeo(zr, uSnubBis, uSnubS) * sideGeo(uCornerV, uSnubBis, uSnubS) > 0.0
			       && sideGeo(zr, uSnubS, uSnubBs) * sideGeo(uCornerV, uSnubS, uSnubBs) > 0.0;
			inQ = q1 || q2;
		}
		int reg = inP ? 0 : (inQ ? 1 : 2);
		hueDeg = reg == 0 ? uTileHue.x : reg == 1 ? uTileHue.y : uTileHue.z;
		vec2 centreFrame = reg == 0 ? O : reg == 1 ? uCornerV : z;
		vec2 cw = cdiv(cmul(A, centreFrame) + B, cmul(C, centreFrame) + D);
		tr = clamp(length(viewForward(cw)), 0.0, 1.0);
		// Strokes: every edge meets the snub vertex s (fold symmetry maps each edge to one at s) plus the two
		// snub-triangle third edges. Segment-clipped so the geodesics don't spray past the vertices.
		float ie = 1e9;
		ie = min(ie, segDistGeo(z, uSnubAis, uSnubS)); // p-gon edge
		ie = min(ie, segDistGeo(z, uSnubS, uSnubAs));  // p-gon edge
		ie = min(ie, segDistGeo(z, uSnubS, uSnubBs));  // q-gon edge
		ie = min(ie, segDistGeo(z, uSnubS, uSnubBis)); // q-gon edge
		ie = min(ie, segDistGeo(z, uSnubAs, uSnubBis));// snub-triangle third edge (a·s — b⁻¹·s)
		ie = min(ie, segDistGeo(z, uSnubAis, uSnubBs));// snub-triangle third edge (a⁻¹·s — b·s)
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

	vec3 baseFill;
	if (uShadeMode == 1 && uNTiles == 1) {
		// Two-tone parity (only offered when q is even ⇒ the tiling is 2-colourable). uParityOffset tracks
		// the re-base's crossings so each tile keeps its black/white value however the view has panned.
		baseFill = mod(float(step) + uParityOffset, 2.0) < 0.5 ? uParityA : uParityB;
	} else {
		// Quadratic falloff: tiles near the centre stay bright, only the outer ones darken toward the rim.
		float dim = 1.0 - 0.5 * tr * tr;
		baseFill = hsb2rgb(hueDeg / 360.0, 0.40, 1.0) * dim;
	}
	// Points that never reached the central tile (the boundary limit set) blend to the surface.
	if (!converged) baseFill = mix(baseFill, uSurface, 0.6);
	// Sub-pixel tiles near the boundary: fade fill toward the surface and dissolve strokes, so the dense
	// limit set reads as a clean rim instead of aliasing into a solid ring.
	float rim = smoothstep(0.5, 2.0, pwf);
	baseFill = mix(baseFill, uSurface, 0.5 * rim);
	lineCov *= (1.0 - rim);

	vec3 col = mix(baseFill, uLine, lineCov);
	frag = vec4(col, 1.0);
}
`;

export interface HyperbolicUniforms {
	uRes: WebGLUniformLocation | null;
	uDpr: WebGLUniformLocation | null;
	uMa: WebGLUniformLocation | null;
	uMb: WebGLUniformLocation | null;
	uP: WebGLUniformLocation | null;
	uEdgeA: WebGLUniformLocation | null;
	uEdgeRho: WebGLUniformLocation | null;
	uShadeMode: WebGLUniformLocation | null;
	uParityOffset: WebGLUniformLocation | null;
	uHue: WebGLUniformLocation | null;
	uStrokePx: WebGLUniformLocation | null;
	uStrokeMode: WebGLUniformLocation | null;
	uSurface: WebGLUniformLocation | null;
	uLine: WebGLUniformLocation | null;
	uParityA: WebGLUniformLocation | null;
	uParityB: WebGLUniformLocation | null;
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
}

const UNIFORM_NAMES: (keyof HyperbolicUniforms)[] = [
	"uRes", "uDpr", "uMa", "uMb", "uP", "uEdgeA", "uEdgeRho",
	"uShadeMode", "uParityOffset", "uHue", "uStrokePx", "uStrokeMode", "uSurface", "uLine", "uParityA", "uParityB",
	"uNTiles", "uWythoff", "uFootA", "uFootB", "uFootC", "uCornerV", "uRin", "uOcc", "uTileHue",
	"uSnub", "uSnubS", "uSnubAs", "uSnubAis", "uSnubBs", "uSnubBis",
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
