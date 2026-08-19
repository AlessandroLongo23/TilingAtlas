// The flat view's two explanatory overlays, drawn on a 2D canvas stacked over the WebGL board.
//
// They answer the two questions the shader cannot: where does the fundamental cell repeat, and what is
// glued to what. Both are camera-only geometry, so they live on a plain 2D context sharing the WebGL
// canvas's transform — a second shader for a dozen dashed lines would be work for nothing.
//
// The world→screen map is transcribed from the vertex shaders in lib/automata/automataGL.ts, which are
// themselves transcribed from flatWorldToClip. All three must stay in step or the overlay will drift off
// the tiles it is annotating.

export interface OverlayCamera {
	x: number;
	y: number;
	zoom: number;
	rot: number;
}

export interface OverlayBasis {
	v1: [number, number];
	v2: [number, number];
}

/**
 * Seam colours. Red marks the identification that translates along v₁ — which glues the two edges RUNNING
 * along v₂, i.e. the left and right sides — and blue the one along v₂. Deliberately hue-coded: this is a
 * diagram, not a tiling, and the monochrome rule is about chrome.
 */
export const SEAM_I_COLOR = "#d4342c";
export const SEAM_J_COLOR = "#2c6fd4";

/** World point → canvas pixel, for a canvas whose origin is its centre. */
function project(
	wx: number,
	wy: number,
	cam: OverlayCamera,
	halfW: number,
	halfH: number,
): [number, number] {
	const c = Math.cos(cam.rot);
	const s = Math.sin(cam.rot);
	return [
		cam.x + cam.zoom * (c * wx + s * wy) + halfW,
		cam.y + cam.zoom * (s * wx - c * wy) + halfH,
	];
}

export interface LatticeSpec {
	/** Board period along v₁, in cells — null when that direction is open, so nothing repeats along it. */
	W: number | null;
	/** Board period along v₂. */
	H: number | null;
	/** Board origin in lattice coordinates: the corner the seams are drawn from. */
	i0: number;
	j0: number;
}

/**
 * Dashed copies of the board's fundamental domain — where the SURFACE repeats, not where the tiling does.
 *
 * The lattice on show is the one the chosen topology quotients by, so it changes with the surface: a torus
 * glues both directions, its group is ⟨W·v₁, H·v₂⟩, and the picture is a grid of W×H-cell parallelograms.
 * A cylinder or Möbius band glues one direction only — a rank-1 group, drawn as a single family of parallel
 * lines, because the open direction has no period to repeat. The plane's group is trivial and draws nothing.
 *
 * Lines run to the edge of the lattice range the viewport covers, computed the same way the instance grid
 * is, so the overlay and the tiles agree about which copies exist.
 */
export function drawLattice(
	ctx: CanvasRenderingContext2D,
	cam: OverlayCamera,
	basis: OverlayBasis,
	rect: { i0: number; j0: number; w: number; h: number },
	spec: LatticeSpec,
	color: string,
) {
	const hw = ctx.canvas.clientWidth / 2;
	const hh = ctx.canvas.clientHeight / 2;
	const { v1, v2 } = basis;

	ctx.save();
	ctx.strokeStyle = color;
	ctx.lineWidth = 1;
	ctx.setLineDash([4, 4]);
	ctx.globalAlpha = 0.75;

	const line = (ax: number, ay: number, bx: number, by: number) => {
		const [sx, sy] = project(ax, ay, cam, hw, hh);
		const [ex, ey] = project(bx, by, cam, hw, hh);
		ctx.beginPath();
		ctx.moveTo(sx, sy);
		ctx.lineTo(ex, ey);
		ctx.stroke();
	};

	const i1 = rect.i0 + rect.w;
	const j1 = rect.j0 + rect.h;
	// Constant-i lines run along v₂ and span the visible j range; constant-j lines the other way. The
	// period can be a half-integer on a glide-glued board (see BoardPlan.domainW), hence the float walk
	// from the board origin instead of an integer loop.
	if (spec.W && spec.W > 0) {
		for (let k = Math.ceil((rect.i0 - spec.i0) / spec.W); spec.i0 + k * spec.W <= i1; k++) {
			const i = spec.i0 + k * spec.W;
			line(
				i * v1[0] + rect.j0 * v2[0],
				i * v1[1] + rect.j0 * v2[1],
				i * v1[0] + j1 * v2[0],
				i * v1[1] + j1 * v2[1],
			);
		}
	}
	if (spec.H && spec.H > 0) {
		for (let k = Math.ceil((rect.j0 - spec.j0) / spec.H); spec.j0 + k * spec.H <= j1; k++) {
			const j = spec.j0 + k * spec.H;
			line(
				rect.i0 * v1[0] + j * v2[0],
				rect.i0 * v1[1] + j * v2[1],
				i1 * v1[0] + j * v2[0],
				i1 * v1[1] + j * v2[1],
			);
		}
	}
	ctx.restore();
}

/** One arrowhead at `t` along the segment, pointing the way the segment runs. */
function arrowHead(
	ctx: CanvasRenderingContext2D,
	ax: number,
	ay: number,
	bx: number,
	by: number,
	t: number,
	size: number,
) {
	const px = ax + (bx - ax) * t;
	const py = ay + (by - ay) * t;
	const ang = Math.atan2(by - ay, bx - ax);
	ctx.beginPath();
	ctx.moveTo(px, py);
	ctx.lineTo(px - size * Math.cos(ang - 0.4), py - size * Math.sin(ang - 0.4));
	ctx.lineTo(px - size * Math.cos(ang + 0.4), py - size * Math.sin(ang + 0.4));
	ctx.closePath();
	ctx.fill();
}

export interface SeamSpec {
	/** Board size in fundamental cells. */
	W: number;
	H: number;
	/** How each direction is identified. */
	i: "open" | "glue" | "flip";
	j: "open" | "glue" | "flip";
	/** Board origin in lattice coordinates. */
	i0: number;
	j0: number;
}

/**
 * The board's boundary with gluing arrows — the textbook picture of an edge identification.
 *
 * Each identified pair carries the same number of arrowheads in the same colour. Arrows pointing the SAME
 * way along both edges means glued by translation; pointing OPPOSITE ways means the flip, which is the
 * whole visual difference between a torus and a Klein bottle. An open direction is drawn as a plain line
 * with no arrows: that edge is a real boundary, not an identification.
 */
export function drawSeams(
	ctx: CanvasRenderingContext2D,
	cam: OverlayCamera,
	basis: OverlayBasis,
	spec: SeamSpec,
) {
	const hw = ctx.canvas.clientWidth / 2;
	const hh = ctx.canvas.clientHeight / 2;
	const { v1, v2 } = basis;
	const { W, H, i0, j0 } = spec;

	/** Corner of the board at lattice (i, j), in screen pixels. */
	const corner = (i: number, j: number) =>
		project((i0 + i) * v1[0] + (j0 + j) * v2[0], (i0 + i) * v1[1] + (j0 + j) * v2[1], cam, hw, hh);

	const bl = corner(0, 0);
	const br = corner(W, 0);
	const tl = corner(0, H);
	const tr = corner(W, H);

	ctx.save();
	ctx.lineWidth = 2.5;
	ctx.lineJoin = "round";

	const edge = (
		a: [number, number],
		b: [number, number],
		color: string,
		seam: "open" | "glue" | "flip",
		heads: number,
		reversed: boolean,
	) => {
		ctx.strokeStyle = color;
		ctx.fillStyle = color;
		ctx.setLineDash(seam === "open" ? [7, 5] : []);
		ctx.beginPath();
		ctx.moveTo(a[0], a[1]);
		ctx.lineTo(b[0], b[1]);
		ctx.stroke();
		if (seam === "open") return;
		// Arrow direction encodes the identification: reversed on the far edge of a flipped pair.
		const [from, to] = reversed ? [b, a] : [a, b];
		const size = 13;
		for (let k = 1; k <= heads; k++) {
			arrowHead(ctx, from[0], from[1], to[0], to[1], (k + 0.5) / (heads + 1), size);
		}
	};

	// The v₁ pair: the two edges running along v₂ (left and right). Identifying them is what the i-seam
	// does, so they take the i colour.
	edge(bl, tl, SEAM_I_COLOR, spec.i, 1, false);
	edge(br, tr, SEAM_I_COLOR, spec.i, 1, spec.i === "flip");
	// One arrowhead on the v₁ identification, two on the v₂ one: the pairing stays readable without colour,
	// which is the convention every topology textbook draws.
	// The v₂ pair: the two edges running along v₁ (bottom and top).
	edge(bl, br, SEAM_J_COLOR, spec.j, 2, false);
	edge(tl, tr, SEAM_J_COLOR, spec.j, 2, spec.j === "flip");

	ctx.restore();
}
