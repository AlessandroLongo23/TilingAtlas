// Per-pixel WebGL2 renderer for a hyperbolic tiling. Each disk pixel maps to a point of the camera
// face's frame (inverse view) and WALKS the quotient to its tile (lib/render/hyperbolicWalk.ts): it
// crosses one side at a time until it is inside a face. No certificate, no baked field, no instance
// budget, so every record fills the disk to the rim, and the distance to an edge is computed, not
// sampled, so a stroke is as sharp at the rim as at the centre. The Islamic construction is the one
// thing sampled: a small layer per polygon size, read in the tile's own frame (hyperbolicIslamic.ts).

import { EDGE_SCALE, type Su11 } from "@/lib/render/hyperbolic";
import { STRAP_RANGE } from "@/lib/render/hyperbolicIslamic";
import { TILE_PALETTE_GLSL, TILE_SAT_PCT } from "@/lib/render/tilePalette";
import { ISLAMIC_MARGIN, type WalkTiling } from "@/lib/render/hyperbolicWalk";

// Perspective-stroke law (AL-tuned final): exact conformal exponent (1.0 = constant hyperbolic
// width) with a 3× overall boost in the shader's halfW — metric-true thinning, thicker base.
const STROKE_GAMMA = "1.0";

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uCenter;      // disk centre, device px (y up, WebGL convention)
uniform float uR;          // disk radius, device px
uniform vec4 uView;        // view SU(1,1): a = uView.xy, b = uView.zw
uniform highp sampler2DArray uIslamic; // one Hankin layer per polygon size (hyperbolicIslamic.ts)
uniform float uIslamicOn;  // 1 = colour/stroke by the Islamic construction instead of the tiles
uniform float uIslamicStyle; // 0 plain, 1 checkerboard, 2 outline, 3 interlace, 4 emboss
uniform float uBand;       // strap styles: half the band width, hyperbolic
uniform float uBorder;     // strap styles: border ring width, hyperbolic
uniform float uFlipWeave;  // strap styles: 1 trades over and under at every crossing
uniform vec3 uColA;        // checkerboard: the star bodies and diamonds (uColB is the other field)
uniform vec3 uColB;        // Islamic background colour (B side fields)
uniform vec3 uColC;        // Islamic edge-diamond colour (C)
uniform vec3 uBg;          // disk background (theme)
uniform vec3 uStroke;      // stroke colour
uniform float uHueOffset;  // global hue rotation (deg)
uniform float uStrokePx;   // stroke width, device px
uniform float uShowFill;   // 1 fill by tile, 0 flat background
uniform float uTileSat;    // tile saturation 0..1 — the sidebar's Fill slider (0 = uShowFill 0)
uniform float uTaper;      // 1 taper the stroke toward the rim
uniform float uEdgeMode;   // 1 = edge pattern or colouring: per-pixel depth, drawn and scaffold strokes
uniform float uScaffold;   // edge mode: 1 = also stroke the faint undrawn base-tiling grid
uniform vec3 uStrokeSca;   // edge mode: scaffold stroke colour
uniform float uColorsMode; // 1 = fill each face by its colour index from uPalette
uniform vec3 uPalette[4];  // colors mode: RGB per color index (0=A, 1=B, …)
uniform highp sampler2D uWalk; // walk table (hyperbolicWalk.ts layout), one row per quotient face
uniform int uFace;         // the camera's anchor face: uView maps its frame to the screen
out vec4 frag;

vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) { float d = dot(b, b); return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / d; }
vec2 cconj(vec2 a) { return vec2(a.x, -a.y); }
// SU(1,1) action z -> (a z + b)/(conj(b) z + conj(a))
vec2 su11(vec2 a, vec2 b, vec2 z) { return cdiv(cmul(a, z) + b, cmul(cconj(b), z) + cconj(a)); }

${TILE_PALETTE_GLSL}

// x mod n as a slot index. GLSL's mod is x - n * floor(x / n), and a GPU whose division is a multiply
// by a reciprocal can put x / n a hair under a whole number, which makes mod return n itself: one slot
// past the row. Seen on Firefox on Windows as faces flooding their neighbours, on apeirogon rows of 3 sides.
int imod(float x, float n) { int r = int(x - n * floor(x / n)), N = int(n); return r >= N ? r - N : r < 0 ? r + N : r; }
// sinh of the signed distance from w past the geodesic of outward hyperboloid normal n (≤ 0 inside)
float past(vec3 n, vec2 w) { float r2 = dot(w, w); return (2.0 * dot(n.xy, w) - n.z * (1.0 + r2)) / (1.0 - r2); }
// the same for side k of an apeirogon, in the half-plane where its vertices are i + k·st
float pastHoro(vec2 z, float k, float st) {
	float R = sqrt(st * st * 0.25 + 1.0);
	vec2 q = z - vec2((k + 0.5) * st, 0.0);
	return -(dot(q, q) - R * R) / (2.0 * R * z.y);
}

void main() {
	vec2 z = (gl_FragCoord.xy - uCenter) / uR;
	float r2 = dot(z, z);
	if (r2 >= 1.0) { frag = vec4(0.0); return; } // outside the disk: transparent

	// the pixel in the anchor face's frame
	vec2 va = uView.xy, vb = uView.zw;
	vec2 w = su11(cconj(va), -vb, z); // inverse view: a -> conj(a), b -> -b

	// What the walk hands to the colouring below. tileKey is the side count on a plain tiling and the
	// colour index on a colouring; hypD and hypS are hyperbolic distances to the nearest drawn and
	// undrawn edge; (ma, mb) is the isometry from the frame the walk ended in back to the anchor's.
	float tileKey = 0.0, hypD = 1e3, hypS = 1e3;
	vec2 cFund = vec2(0.0); // the point the face is shaded by, in the frame the walk ended in
	vec2 ma = vec2(1.0, 0.0), mb = vec2(0.0, 0.0);
	// Walk: test w against the face it is assumed to lie in and cross the side it lies beyond. A
	// regular face reads that side off the argument of w, an apeirogon off Re z over its step, and
	// an irregular face tries each side. Each step is one tile nearer, so the count is the number of
	// tiles between the camera and the pixel; only pixels within a few px of the rim use the cap.
	int f = uFace;
	int j = 0;
	float kf = 0.0;
	vec4 hd = vec4(0.0);
	bool inside = false;
	for (int it = 0; it < 96; it++) {
		hd = texelFetch(uWalk, ivec2(0, f), 0);
		int S = int(hd.y);
		float s = -1.0;
		vec2 pa = vec2(1.0, 0.0), pb = vec2(0.0);
		if (hd.x == 1.0) {
			float d = (1.0 - w.x) * (1.0 - w.x) + w.y * w.y;
			vec2 z = vec2(-2.0 * w.y, 1.0 - dot(w, w)) / d;
			kf = floor(z.x / hd.z);
			j = imod(kf, hd.y);
			s = pastHoro(z, kf, hd.z);
			float t = (kf - float(j)) * hd.z; // bring side kf into the one period the row holds
			pa = vec2(1.0, -0.5 * t);
			pb = vec2(0.0, 0.5 * t);
		} else if (hd.x == 0.0) {
			j = imod(floor(atan(w.y, w.x) / 6.283185307179586 * hd.y + 0.5), hd.y);
			s = past(texelFetch(uWalk, ivec2(4 + 3 * j, f), 0).xyz, w);
		} else {
			for (int i = 0; i < 16; i++) {
				if (i >= S) break;
				float v = past(texelFetch(uWalk, ivec2(4 + 3 * i, f), 0).xyz, w);
				if (i == 0 || v > s) { s = v; j = i; }
			}
		}
		if (s <= 0.0) { inside = true; break; }
		vec4 M = texelFetch(uWalk, ivec2(2 + 3 * j, f), 0);
		vec2 ta = cmul(M.xy, pa) + cmul(M.zw, cconj(pb));
		vec2 tb = cmul(M.xy, pb) + cmul(M.zw, cconj(pa));
		w = su11(ta, tb, w);
		vec2 na = cmul(ma, cconj(ta)) - cmul(mb, cconj(tb));
		vec2 nb = cmul(mb, ta) - cmul(ma, tb);
		ma = na; mb = nb;
		f = int(texelFetch(uWalk, ivec2(3 + 3 * j, f), 0).x);
	}
	vec4 info = texelFetch(uWalk, ivec2(1, f), 0); // colour index, Islamic layer, that layer's box
	tileKey = uEdgeMode > 0.5 || uColorsMode > 0.5 ? info.x : hd.w;
	bool reaimed = !inside; // past the step cap, within a few px of the rim: the last face's colour, no stroke
	bool depthPerPixel = hd.x == 1.0; // an apeirogon has no centre to shade by
	if (inside) {
		// The side faced and its two neighbours: near a corner the nearest DRAWN edge can be the
		// next side round, and on a triangle these three are all there is.
		int S = int(hd.y);
		float d0 = (1.0 - w.x) * (1.0 - w.x) + w.y * w.y;
		vec2 z = vec2(-2.0 * w.y, 1.0 - dot(w, w)) / d0;
		for (int e = -1; e <= 1; e++) {
			if (S < 3 && hd.x != 1.0 && e != 0) continue;
			int jj = hd.x == 1.0 ? imod(kf + float(e), hd.y) : (j + e + S) % S;
			float sv = hd.x == 1.0
				? pastHoro(z, kf + float(e), hd.z)
				: past(texelFetch(uWalk, ivec2(4 + 3 * jj, f), 0).xyz, w);
			float dist = asinh(max(-sv, 0.0));
			if (texelFetch(uWalk, ivec2(3 + 3 * jj, f), 0).y > 0.5) hypD = min(hypD, dist);
			else hypS = min(hypS, dist);
		}
	}

	// Edge patterns and colourings: depth is per pixel (screen radius), and there are two stroke layers,
	// the faint undrawn scaffold first and the drawn edges on top.
	if (uEdgeMode > 0.5) {
		float orbit = tileKey;
		// Colors mode dims LESS toward the rim than edge mode: the palette fills are pale (cream) and a
		// heavy dim reads as muddy, so keep them legible while still giving the disk some depth.
		float dim = uColorsMode > 0.5 ? 1.0 - 0.28 * r2 : 1.0 - 0.5 * r2;
		// EDGE patterns take ONE hue for the whole disk, so the fill is a smooth radial gradient and nothing
		// but the strokes draws the tiling. It used to hue by merged-tile orbit, which on a record with every
		// edge drawn gives one colour per tile and paints the base polygons into the fill — the board is then
		// legible whether or not the grid is on, and the disk reads as a mosaic instead of a gradient. The
		// Schwarz boards looked right only by accident: their records leave every edge undrawn, so all faces
		// merge into a single orbit and the old formula happened to return one colour.
		// COLOURINGS keep the palette: there the colours ARE the catalogued object, not a backdrop.
		vec3 tileCol = uColorsMode > 0.5
			? uPalette[int(clamp(orbit, 0.0, 3.0))]
			: tileFillAt(2.0 * 47.0 + uHueOffset, uTileSat);
		vec3 fill = uShowFill > 0.5 ? tileCol * dim : uBg;
		// The depth shade lights the INK as well as the paper — see the note on ink in the tile branch.
		float ink = uShowFill > 0.5 ? dim : 1.0;
		float conf = (1.0 - r2) * uR * 0.5;
		float edgePxD = hypD * conf;
		float edgePxS = hypS * conf;
		float taperF = uTaper > 0.5 ? pow(1.0 - r2, ${STROKE_GAMMA}) : 1.0;
		float halfD = uStrokePx * 0.5 * (uTaper > 0.5 ? 3.0 * taperF : 1.0);        // drawn: bold
		float halfS = uStrokePx * 0.5 * (uTaper > 0.5 ? 1.2 * taperF : 0.4);        // scaffold: thin
		float amtD = uStrokePx > 0.01 ? 1.0 - smoothstep(halfD - 1.0, halfD + 1.0, edgePxD) : 0.0;
		float amtS = (uScaffold > 0.5 && uStrokePx > 0.01) ? 1.0 - smoothstep(halfS - 1.0, halfS + 1.0, edgePxS) : 0.0;
		vec3 col = mix(fill, uStrokeSca * ink, amtS);
		col = mix(col, uStroke * ink, amtD);
		frag = vec4(col, 1.0);
		return;
	}

	// Islamic construction: the tile's layer. It holds one fundamental region of the tile: for a regular
	// polygon the wedge from a side's midpoint to the next vertex, so the pixel is turned by its side's
	// angle and mirrored into it; for an apeirogon the strip from a vertex to the next midpoint, up the
	// cusp. "mirrored" says the pixel was reflected on the way in.
	float cls = 0.0;
	if (uIslamicOn > 0.5 && inside && info.y >= 0.0) {
		float resI = float(textureSize(uIslamic, 0).x);
		int layer = int(info.y);
		bool horo = hd.x == 1.0;
		vec2 uv;
		bool mirrored;
		vec2 rot = vec2(1.0, 0.0);
		float d0 = (1.0 - w.x) * (1.0 - w.x) + w.y * w.y;
		vec2 z = vec2(-2.0 * w.y, 1.0 - dot(w, w)) / d0;
		if (horo) {
			float t = z.x / hd.z - kf; // 0 at vertex kf, 1 at the next
			mirrored = t > 0.5;
			uv = vec2(2.0 * (mirrored ? 1.0 - t : t), 1.0 - 1.0 / z.y);
			// the table may run the ring either way along the horocycle, the layer runs it one way
			if (hd.z < 0.0) mirrored = !mirrored;
		} else {
			float turn = float(j) * 6.283185307179586 / hd.y;
			rot = vec2(cos(turn), sin(turn));
			vec2 wr = vec2(w.x * rot.x + w.y * rot.y, w.y * rot.x - w.x * rot.y);
			mirrored = wr.y < 0.0;
			uv = vec2(wr.x, abs(wr.y)) / info.zw;
		}
		vec2 stI = clamp((uv + ${ISLAMIC_MARGIN}) / ${1 + ISLAMIC_MARGIN}, 0.0, 1.0) * resI - 0.5;
		vec2 iI = floor(stI);
		vec2 frI = stI - iI;
		ivec2 q00 = ivec2(clamp(iI, vec2(0.0), vec2(resI - 1.0)));
		ivec2 q11 = ivec2(clamp(iI + 1.0, vec2(0.0), vec2(resI - 1.0)));
		vec4 g00 = texelFetch(uIslamic, ivec3(q00, layer), 0);
		vec4 g10 = texelFetch(uIslamic, ivec3(q11.x, q00.y, layer), 0);
		vec4 g01 = texelFetch(uIslamic, ivec3(q00.x, q11.y, layer), 0);
		vec4 g11 = texelFetch(uIslamic, ivec3(q11, layer), 0);

		if (uIslamicStyle > 1.5) {
			// STRAP styles (2 outline, 3 interlace, 4 emboss). The layer holds the distance to the nearest
			// + strand and to the nearest − strand, 15 bits each, and a flag where the two cross. A band is
			// the set within uBand of a strand and its border the ring uBorder further out. At a crossing
			// the + strand is painted last, so its border cuts the − strand, which is the whole of the
			// weave; a mirrored pixel reads the mirror image's strands, where + and − trade places, and so
			// does a flip of the weave. Anywhere else the two are one strand turning a corner, and the
			// outline style crosses its straps flat: one band, around the nearer.
			vec4 f = vec4(g00.r, g10.r, g01.r, g11.r) * 255.0;
			vec4 hi = step(127.5, f) * 128.0; // the crossing flag, off the top of R
			vec2 s00 = vec2((f.x - hi.x) * 256.0 + g00.g * 255.0, g00.b * 65280.0 + g00.a * 255.0);
			vec2 s10 = vec2((f.y - hi.y) * 256.0 + g10.g * 255.0, g10.b * 65280.0 + g10.a * 255.0);
			vec2 s01 = vec2((f.z - hi.z) * 256.0 + g01.g * 255.0, g01.b * 65280.0 + g01.a * 255.0);
			vec2 s11 = vec2((f.w - hi.w) * 256.0 + g11.g * 255.0, g11.b * 65280.0 + g11.a * 255.0);
			vec2 dd = mix(mix(s00, s10, frI.x), mix(s01, s11, frI.x), frI.y) * (${STRAP_RANGE}.0 / 32767.0);
			// the two distances' slopes across the layer, for the emboss light
			vec2 gu = mix(s10 - s00, s11 - s01, frI.y);
			vec2 gv = mix(s01 - s00, s11 - s10, frI.x);
			if (mirrored != (uFlipWeave > 0.5)) { dd = dd.yx; gu = gu.yx; gv = gv.yx; }
			float crossing = frI.x < 0.5 ? (frI.y < 0.5 ? hi.x : hi.z) : (frI.y < 0.5 ? hi.y : hi.w);
			if (crossing < 64.0 || uIslamicStyle < 2.5) {
				if (dd.y < dd.x) { dd = dd.yx; gu = gu.yx; gv = gv.yx; }
				dd.y = 1e3;
			}
			float conf = (1.0 - r2) * uR * 0.5; // device px per hyperbolic unit here
			vec3 body = uIslamicStyle > 3.5 ? vec3(0.740, 0.671, 0.533) : vec3(0.960, 0.922, 0.845);
			vec3 col = uBg;
			for (int k = 1; k >= 0; k--) { // under first, over on top
				float d = k == 1 ? dd.y : dd.x;
				float px = d * conf;
				vec3 edge = vec3(0.140, 0.125, 0.109);
				if (uIslamicStyle > 3.5) {
					// Emboss: a raised ribbon lit from the upper left. The distance's gradient points away
					// from the strand; its sign against the light picks highlight or shadow. It is taken
					// from the layer and carried to the screen, not from dFdx: neighbouring pixels can lie
					// in different tiles, where a screen derivative is noise. Every map on the way is
					// conformal, so a gradient turns by the argument of the map's derivative.
					vec2 gl = k == 1 ? vec2(gu.y, gv.y) : vec2(gu.x, gv.x);
					vec2 g;
					if (horo) {
						vec2 gz = vec2(gl.x * (z.x / hd.z - kf > 0.5 ? -2.0 : 2.0) / hd.z, gl.y / (z.y * z.y));
						vec2 one = vec2(1.0, 0.0) - w;
						g = cmul(cconj(cdiv(vec2(0.0, 2.0), cmul(one, one))), gz); // z = i(1+w)/(1-w)
					} else {
						g = vec2(gl.x / info.z, (mirrored ? -gl.y : gl.y) / info.w);
						g = vec2(g.x * rot.x - g.y * rot.y, g.x * rot.y + g.y * rot.x);
					}
					vec2 d1 = cmul(cconj(mb), w) + cconj(ma);         // w -> anchor frame
					vec2 d2 = cmul(cconj(vb), su11(ma, mb, w)) + cconj(va); // anchor frame -> screen
					vec2 lit = cmul(cmul(g, cconj(cmul(d1, d1))), cconj(cmul(d2, d2)));
					// A soft step, not the flat construction's hard one: there a strap is a straight
					// segment with one normal, here it is a geodesic whose normal turns along it, and an
					// edge that runs along the light would flicker between the two tones.
					float facing = dot(lit, vec2(-0.6, 0.8)) / max(length(lit), 1e-20);
					edge = mix(vec3(0.260, 0.212, 0.143), vec3(1.0, 0.975, 0.9), smoothstep(-0.25, 0.25, facing));
				}
				col = mix(col, edge, 1.0 - smoothstep(-0.75, 0.75, px - (uBand + uBorder) * conf));
				col = mix(col, body, 1.0 - smoothstep(-0.75, 0.75, px - uBand * conf));
			}
			frag = vec4(col, 1.0);
			return;
		}

		// PLAIN and CHECKERBOARD. Face class from the nearest texel (a class must not interpolate across a
		// line), construction-line distance manually bilinear, and the point the face is shaded by. They
		// drive fill, dim and stroke below in place of the tile's.
		vec4 sn = frI.x < 0.5 ? (frI.y < 0.5 ? g00 : g01) : (frI.y < 0.5 ? g10 : g11);
		hypD = mix(mix(g00.g, g10.g, frI.x), mix(g01.g, g11.g, frI.x), frI.y) * 255.0 / ${EDGE_SCALE}.0;
		cls = floor(sn.r * 255.0 + 0.5);
		if (horo) {
			// An apeirogon's star body runs up its cusp and shades per pixel. Its side fields and
			// diamonds shade as the neighbouring tiles shade theirs: by the vertex, by the midpoint.
			depthPerPixel = cls < 1.5;
			float st = hd.z;
			float kv = z.x / st - kf > 0.5 ? kf + 1.0 : kf;
			vec2 az = cls > 2.5 ? vec2((kf + 0.5) * st, sqrt(st * st * 0.25 + 1.0)) : vec2(kv * st, 1.0);
			cFund = cdiv(az - vec2(0.0, 1.0), az + vec2(0.0, 1.0));
		} else {
			vec2 an = (vec2(sn.b, sn.a) * 255.0 - 128.0) / 127.0 * info.z;
			if (mirrored) an.y = -an.y;
			cFund = vec2(an.x * rot.x - an.y * rot.y, an.x * rot.y + an.y * rot.x);
		}
	}

	// PER-TILE depth: carry the face's shading point back to the anchor frame, project to screen, and
	// shade the whole face by ITS radius: one flat shade per tile (matched to the 2D developed-draw,
	// euclidean and spherical fill convention). The point is the face's own centre, so pixels that
	// walked there by different routes agree exactly.
	float dep;
	if (reaimed) {
		dep = 1.0; // sub-pixel rim residue: the correct limit shade
	} else if (depthPerPixel) {
		dep = sqrt(r2); // an apeirogon has no centre to shade by: it runs from here to the rim
	} else {
		vec2 cWorld = su11(ma, mb, cFund);
		vec2 cScreen = su11(va, vb, cWorld);
		dep = min(length(cScreen), 1.0);
	}
	float dim = 1.0 - 0.5 * dep * dep;
	// class A (star body) keeps its tile's hue (the hue ring rotates it); B/C take the two shared
	// background colours, fixed like the euclid plain fill.
	vec3 tileCol = uColorsMode > 0.5 ? uPalette[int(clamp(tileKey, 0.0, 3.0))] : tileFillAt(tileKey * 47.0 + uHueOffset, uTileSat);
	if (uIslamicStyle > 0.5 && cls > 0.5) tileCol = cls > 1.5 && cls < 2.5 ? uColB : uColA; // two fields
	else if (cls > 1.5) tileCol = cls > 2.5 ? uColC : uColB;
	vec3 fill = uShowFill > 0.5 ? tileCol * dim : uBg;
	// THE SHADE LIGHTS THE INK TOO, and leaving it off the stroke inverted the figure halfway out.
	// dim runs 1.0 at the centre to 0.5 at the rim, so a fill that starts at luma 0.86 ends near 0.55
	// while a constant stroke sat at 0.76 the whole way: the lines read DARKER than their tile in the
	// middle of the disk, vanished into it at r = 0.61, and read LIGHTER than it outside that. Scaling
	// the stroke by the same factor holds the ink-to-fill ratio constant at every radius, so the lines
	// keep one polarity and the disk keeps its depth. Guarded on uShowFill: with the fill off the
	// background is flat uBg, and dimming the stroke against it would invent a gradient of its own.
	float ink = uShowFill > 0.5 ? dim : 1.0;

	// stroke: the stored edge distance is HYPERBOLIC (isometry-invariant), so "inside the stroke" =
	// hypEdge ≤ h with h a constant hyperbolic half-width — an equidistant band around each geodesic.
	// Both sides convert to screen px via the local conformal factor: px = hyp · (1−r²) · uR/2.
	// h is calibrated so the band reads uStrokePx device px at the disk centre (h = uStrokePx/uR),
	// so perspective mode thins by the conformal factor raised to STROKE_GAMMA: 1.0 = the exact
	// metric width, lower = biased heavier toward the rim (AL tuned; still monotone and
	// geometry-shaped). Flat mode keeps a constant screen width instead.
	float hypEdge = hypD;
	float edgePx = hypEdge * (1.0 - r2) * uR * 0.5;
	float halfW = uStrokePx * 0.5 * (uTaper > 0.5 ? 3.0 *pow(1.0 - r2, ${STROKE_GAMMA}) : 1.0);
	// slider at 0 = NO stroke: the AA band alone would still ink a ~50% hairline at halfW = 0
	float strokeAmt = uStrokePx > 0.01 ? 1.0 - smoothstep(halfW - 1.0, halfW + 1.0, edgePx) : 0.0;
	frag = vec4(mix(fill, uStroke * ink, strokeAmt), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
	const s = gl.createShader(type);
	if (!s) return null;
	gl.shaderSource(s, src);
	gl.compileShader(s);
	if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
		console.error("hyperbolic per-pixel shader compile failed:", gl.getShaderInfoLog(s));
		gl.deleteShader(s);
		return null;
	}
	return s;
}

export type IslamicStyle = "plain" | "checkerboard" | "outline" | "interlace" | "emboss";
const STYLE_CODE: Record<IslamicStyle, number> = { plain: 0, checkerboard: 1, outline: 2, interlace: 3, emboss: 4 };

export interface PerPixelDrawParams {
	view: Su11;
	/** The anchor face of the walk table (setWalk): `view` maps its frame to the screen. */
	face: number;
	R: number; // disk radius, device px
	cx: number; // disk centre x, device px
	cy: number; // disk centre y, device px (top-down; converted to WebGL y-up internally)
	canvasH: number; // backing height, device px (for the y flip)
	dark: boolean;
	showFill: boolean;
	/** Tile saturation 0–100, the sidebar's Fill slider. Omitted ⇒ the palette default. Pair it with
	 *  `showFill`: 0 is not a saturation here, it is `showFill: false`. */
	fillSatPct?: number;
	hueOffset: number;
	strokePx: number;
	taper: boolean;
	/** Colour/stroke by the Islamic layers (needs a prior setIslamicLayers). */
	islamic?: boolean;
	/** Which Islamic style the uploaded layers are for. Plain and checkerboard read "fill" layers, the
	 *  three strap styles "strap" layers (hyperbolicIslamic.ts). */
	islamicStyle?: IslamicStyle;
	/** Plain: the B side fields and C edge diamonds. Checkerboard: A is the star bodies' field and B the
	 *  other. Linear [r,g,b] 0..1. */
	islamicColA?: [number, number, number];
	islamicColB?: [number, number, number];
	islamicColC?: [number, number, number];
	/** Strap styles: half the band width and the border ring's width, in hyperbolic units; whether the
	 *  weave is flipped. */
	strapBand?: number;
	strapBorder?: number;
	flipWeave?: boolean;
	/** Edge pattern or colouring: per-pixel depth, bold drawn edges. */
	edgeMode?: boolean;
	/** Edge mode: also stroke the faint undrawn base-tiling grid. */
	scaffold?: boolean;
	/** Fill each face by its colour index from `palette`. A colouring sets edgeMode too; a tiling
	 *  filled by polygon size under the Islamic construction sets this alone. */
	colorsMode?: boolean;
	/** Colors mode: RGB (0..1) per color index. Up to 4 entries; short arrays are padded with the last. */
	palette?: [number, number, number][];
}

export class HyperbolicPerPixelRenderer {
	private gl: WebGL2RenderingContext;
	private prog: WebGLProgram;
	private quad: WebGLBuffer;
	private texWalk: WebGLTexture;
	private texIslamic: WebGLTexture;
	private u: Record<string, WebGLUniformLocation | null> = {};
	private aPos: number;
	private hasWalk = false;
	private hasIslamic = false;
	private disposed = false;

	constructor(gl: WebGL2RenderingContext) {
		this.gl = gl;
		const vs = compile(gl, gl.VERTEX_SHADER, VERT);
		const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
		if (!vs || !fs) throw new Error("hyperbolic per-pixel renderer: shader compile failed");
		const prog = gl.createProgram();
		gl.attachShader(prog, vs);
		gl.attachShader(prog, fs);
		gl.linkProgram(prog);
		gl.deleteShader(vs);
		gl.deleteShader(fs);
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
			const log = gl.getProgramInfoLog(prog);
			gl.deleteProgram(prog);
			throw new Error("hyperbolic per-pixel renderer: link failed: " + log);
		}
		this.prog = prog;
		for (const n of [
			"uCenter", "uR", "uView", "uBg", "uStroke", "uHueOffset", "uTileSat", "uStrokePx", "uShowFill", "uTaper",
			"uIslamic", "uIslamicOn", "uIslamicStyle", "uBand", "uBorder", "uFlipWeave", "uColA", "uColB", "uColC",
			"uEdgeMode", "uScaffold", "uStrokeSca", "uColorsMode", "uPalette", "uWalk", "uFace",
		]) {
			this.u[n] = gl.getUniformLocation(prog, n);
		}
		this.aPos = gl.getAttribLocation(prog, "aPos");
		this.quad = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one big triangle
		this.texWalk = gl.createTexture();
		this.texIslamic = gl.createTexture();
		// Keep the Islamic sampler complete before any layer is uploaded. It is only read behind
		// uIslamicOn, but an incomplete texture is undefined behaviour on some drivers.
		this.uploadLayers(new Uint8Array(4), 1, 1);
	}

	private uploadLayers(data: Uint8Array, res: number, layers: number): void {
		const gl = this.gl;
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texIslamic);
		gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, res, res, layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
		// NEAREST: the shader samples via texelFetch (nearest class + manual bilinear distance).
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	}

	/** Upload a tiling's walk table. Islamic layers are uploaded apart and must be this tiling's by the
	 *  time a draw asks for them (IslamicFeed.sync runs before each such draw). */
	setWalk(t: WalkTiling): void {
		const gl = this.gl;
		gl.bindTexture(gl.TEXTURE_2D, this.texWalk);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, t.width, t.height, 0, gl.RGBA, gl.FLOAT, new Float32Array(t.data));
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		this.hasWalk = true;
	}

	/** Upload the Islamic layers of the CURRENT tiling (islamicLayers over its `sizes`), `res`² each. */
	setIslamicLayers(data: Uint8Array, res: number): void {
		const layers = data.length / (res * res * 4);
		this.hasIslamic = layers >= 1;
		if (this.hasIslamic) this.uploadLayers(data, res, layers);
	}

	draw(p: PerPixelDrawParams): void {
		const gl = this.gl;
		if (!this.hasWalk) return;
		gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
		gl.useProgram(this.prog);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		gl.uniform2f(this.u.uCenter, p.cx, p.canvasH - p.cy); // WebGL y is bottom-up
		gl.uniform1f(this.u.uR, p.R);
		gl.uniform4f(this.u.uView, p.view.a.x, p.view.a.y, p.view.b.x, p.view.b.y);
		gl.uniform1i(this.u.uFace, p.face);
		const bg = p.dark ? [0x14 / 255, 0x11 / 255, 0x0d / 255] : [0xfa / 255, 0xf8 / 255, 0xf5 / 255];
		const stroke = p.dark ? [0, 0, 0] : [0x11 / 255, 0x11 / 255, 0x11 / 255];
		gl.uniform3f(this.u.uBg, bg[0], bg[1], bg[2]);
		gl.uniform3f(this.u.uStroke, stroke[0], stroke[1], stroke[2]);
		gl.uniform1f(this.u.uHueOffset, p.hueOffset);
		gl.uniform1f(this.u.uStrokePx, p.strokePx); // 0 = no stroke (callers floor nonzero widths)
		gl.uniform1f(this.u.uShowFill, p.showFill ? 1 : 0);
		gl.uniform1f(this.u.uTileSat, (p.fillSatPct ?? TILE_SAT_PCT) / 100);
		gl.uniform1f(this.u.uTaper, p.taper ? 1 : 0);
		const islamicOn = !!p.islamic && this.hasIslamic;
		gl.uniform1f(this.u.uIslamicOn, islamicOn ? 1 : 0);
		gl.uniform1f(this.u.uIslamicStyle, islamicOn ? STYLE_CODE[p.islamicStyle ?? "plain"] : 0);
		if (islamicOn) {
			const ca = p.islamicColA ?? [0.85, 0.85, 0.85];
			const cb = p.islamicColB ?? [0.85, 0.85, 0.85];
			const cc = p.islamicColC ?? [0.7, 0.7, 0.7];
			gl.uniform3f(this.u.uColA, ca[0], ca[1], ca[2]);
			gl.uniform3f(this.u.uColB, cb[0], cb[1], cb[2]);
			gl.uniform3f(this.u.uColC, cc[0], cc[1], cc[2]);
			gl.uniform1f(this.u.uBand, p.strapBand ?? 0);
			gl.uniform1f(this.u.uBorder, p.strapBorder ?? 0);
			gl.uniform1f(this.u.uFlipWeave, p.flipWeave ? 1 : 0);
		}
		gl.uniform1f(this.u.uEdgeMode, p.edgeMode ? 1 : 0);
		gl.uniform1f(this.u.uScaffold, p.scaffold ? 1 : 0);
		gl.uniform1f(this.u.uColorsMode, p.colorsMode ? 1 : 0);
		if (p.colorsMode && p.palette && p.palette.length) {
			const pal = new Float32Array(4 * 3);
			for (let i = 0; i < 4; i++) {
				const c = p.palette[Math.min(i, p.palette.length - 1)];
				pal[i * 3] = c[0];
				pal[i * 3 + 1] = c[1];
				pal[i * 3 + 2] = c[2];
			}
			gl.uniform3fv(this.u.uPalette, pal);
		}
		// scaffold stroke: a muted line, lighter than the bold drawn stroke, per theme
		const sca = p.dark ? [0x4a / 255, 0x44 / 255, 0x36 / 255] : [0xc9 / 255, 0xc2 / 255, 0xb4 / 255];
		gl.uniform3f(this.u.uStrokeSca, sca[0], sca[1], sca[2]);

		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texIslamic);
		gl.uniform1i(this.u.uIslamic, 1);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.texWalk);
		gl.uniform1i(this.u.uWalk, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
		gl.enableVertexAttribArray(this.aPos);
		gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		const gl = this.gl;
		gl.deleteProgram(this.prog);
		gl.deleteBuffer(this.quad);
		gl.deleteTexture(this.texWalk);
		gl.deleteTexture(this.texIslamic);
	}
}
