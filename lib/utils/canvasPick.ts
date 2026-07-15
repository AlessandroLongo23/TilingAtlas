// Click-to-centre pick math for the tiling canvas. Pure functions (no p5, no store, no Vector class) so
// the geometry is unit-testable. The canvas draw transform, in CENTRED screen coords, is
//   s = offset + M·w   with   M·w = zoom·(cos·wx + sin·wy, sin·wx − cos·wy),
// i.e. world -> y-flip -> scale(zoom) -> rotate(θ) -> +offset. This is the SAME map inlined in
// makeVisibilityCull/makeWaveScale in canvas.tsx. M is a reflection scaled by zoom, so it is its own
// inverse up to the zoom factor — screenToWorld and worldToScreen below are the same formula.

export interface Pt {
	x: number;
	y: number;
}

/** Centred-screen px -> world. `offset` is the (already wrap-reduced) draw offset. Inverse of worldToScreen. */
export function screenToWorld(sx: number, sy: number, offset: Pt, zoom: number, rot: number): Pt {
	const cos = Math.cos(rot), sin = Math.sin(rot);
	const ux = (sx - offset.x) / zoom;
	const uy = (sy - offset.y) / zoom;
	return { x: cos * ux + sin * uy, y: sin * ux - cos * uy };
}

/** World -> centred-screen px. Matches the canvas.tsx draw transform exactly. */
export function worldToScreen(wx: number, wy: number, offset: Pt, zoom: number, rot: number): Pt {
	const cos = Math.cos(rot), sin = Math.sin(rot);
	return {
		x: offset.x + zoom * (cos * wx + sin * wy),
		y: offset.y + zoom * (sin * wx - cos * wy),
	};
}

// Even-odd ray cast. Unlike Polygon.containsPoint (a convex-hull test — NOTES §9.4), this reports the
// TRUE interior, so a click in a star tile's reflex dent is attributed to the neighbour that owns it, not
// to both tiles. Points exactly on an edge are decided consistently by the half-open (yi > py) test.
export function rayCastContains(verts: readonly Pt[], px: number, py: number): boolean {
	let inside = false;
	const n = verts.length;
	for (let i = 0, j = n - 1; i < n; j = i++) {
		const xi = verts[i].x, yi = verts[i].y;
		const xj = verts[j].x, yj = verts[j].y;
		if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
			inside = !inside;
		}
	}
	return inside;
}

// --- Inversive view -------------------------------------------------------------------------------
// The inversive canvas (components/inversive-canvas.tsx) is a WebGL lens: each screen pixel s is mapped
// back through a lens g⁻¹ to a view point v, then through the SAME affine inverse as the flat view to a
// world point. To pick, we replicate that two-step inverse for the single click pixel. Everything here
// mirrors the fragment shader byte-for-byte — if the shader's lens maths changes, change it here too.

function cmul(ax: number, ay: number, bx: number, by: number): Pt {
	return { x: ax * bx - ay * by, y: ax * by + ay * bx };
}

function cdiv(ax: number, ay: number, bx: number, by: number): Pt {
	const d = bx * bx + by * by + 1e-9;
	return { x: (ax * bx + ay * by) / d, y: (ay * bx - ax * by) / d };
}

// mode 0 = circle inversion, 1 = Möbius (loxodromic). R is the lens radius in CSS px; kinv the Möbius
// inverse multiplier (complex). Matches the FRAG uniforms uMode/uR/uKinv.
export interface LensParams {
	mode: 0 | 1;
	R: number;
	kinv: Pt;
}

// Undo the lens: centred screen px s -> view-space point v. The exact inverse the shader applies to each
// fragment before the affine undo.
export function lensInverse(s: Pt, lens: LensParams): Pt {
	if (lens.mode === 0) {
		const r2 = Math.max(s.x * s.x + s.y * s.y, 1);
		const k = (lens.R * lens.R) / r2;
		return { x: k * s.x, y: k * s.y };
	}
	// Möbius: a = (R,0); m = kinv ⊗ ((s−a)/(s+a)); v = a ⊗ ((1+m)/(1−m)).
	const a = lens.R;
	const num = cdiv(s.x - a, s.y, s.x + a, s.y);
	const m = cmul(lens.kinv.x, lens.kinv.y, num.x, num.y);
	const frac = cdiv(1 + m.x, m.y, 1 - m.x, -m.y);
	return cmul(a, 0, frac.x, frac.y);
}

// Full inverse for the inversive view: centred screen px -> world. Lens inverse, then the shared affine
// inverse (screenToWorld operates on the lens output, not the raw pixel).
export function inversiveScreenToWorld(
	sx: number, sy: number, lens: LensParams, offset: Pt, zoom: number, rot: number,
): Pt {
	const v = lensInverse({ x: sx, y: sy }, lens);
	return screenToWorld(v.x, v.y, offset, zoom, rot);
}

// Reduce a world point into the fundamental parallelogram at the origin (lattice coords in [0,1)²), the
// same reduction the shader does before its 3×3-copy test. Brings an arbitrarily-panned click into the
// region the built base grid (tiling.nodes, centred on the origin) actually covers, so the hit-test finds
// a tile regardless of how far the view has been panned. Distances are translation-invariant, so a radius
// computed in the unreduced frame is still valid here.
export function reduceToOriginCell(world: Pt, v1: Pt, v2: Pt): Pt {
	const det = v1.x * v2.y - v2.x * v1.y;
	if (Math.abs(det) < 1e-9) return { x: world.x, y: world.y };
	const a = (world.x * v2.y - world.y * v2.x) / det;
	const b = (world.y * v1.x - world.x * v1.y) / det;
	const fa = Math.floor(a), fb = Math.floor(b);
	return { x: world.x - fa * v1.x - fb * v2.x, y: world.y - fa * v1.y - fb * v2.y };
}

// Centring in the inversive view uses the SAME affine solve as the flat view — offset = −zoom·Rₜ·p — to
// place the picked tile at the affine origin (v = 0). v = 0 is the centre of the lens inversion, so the
// lens carries the tile out to infinity (it spreads around the periphery of the conformal image). The
// lens is deliberately absent from the centring; it enters only the pick (inversiveScreenToWorld). So no
// dedicated centre-offset helper is needed here — the caller reuses worldToScreen about a zero offset.

export interface PickNode {
	centroid: Pt;
	vertices: readonly Pt[];
}

// Choose what a click at world point `c` should centre on. Vertex-first: if a tiling vertex lies within
// `radiusWorld` of the click, snap to the nearest such vertex (a vertex-configuration centre — landing it
// on screen centre makes a subsequent rotation pivot about that VC). Otherwise snap to the centroid of the
// tile that CONTAINS the click. Returns null only if the click hits neither (outside the built grid).
//
// The scan is bounded by `reach`: any vertex within radiusWorld of `c`, and any tile containing `c`, has
// its centroid within maxRadius + radiusWorld of `c` (a tile's whole body lies inside the disk of radius
// maxRadius about its centroid — true for convex AND star tiles, since the body is inside the convex hull
// of its vertices and every vertex is within maxRadius). So one centroid-distance cull covers both cases.
export function pickSnapTarget(
	c: Pt,
	nodes: readonly PickNode[],
	maxRadius: number,
	radiusWorld: number,
): Pt | null {
	const reach = (maxRadius > 0 ? maxRadius : 2) + radiusWorld;
	const reach2 = reach * reach;
	let bestVert: Pt | null = null;
	let bestVertD2 = radiusWorld * radiusWorld;
	let containing: Pt | null = null;
	for (const node of nodes) {
		const cd = node.centroid;
		const dcx = cd.x - c.x, dcy = cd.y - c.y;
		if (dcx * dcx + dcy * dcy > reach2) continue;
		for (const v of node.vertices) {
			const dx = v.x - c.x, dy = v.y - c.y;
			const d2 = dx * dx + dy * dy;
			if (d2 < bestVertD2) {
				bestVertD2 = d2;
				bestVert = v;
			}
		}
		if (!containing && rayCastContains(node.vertices, c.x, c.y)) containing = cd;
	}
	if (bestVert) return { x: bestVert.x, y: bestVert.y };
	if (containing) return { x: containing.x, y: containing.y };
	return null;
}
