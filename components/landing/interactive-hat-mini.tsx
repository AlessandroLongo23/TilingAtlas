"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils/cn";
import { useCardActivation } from "@/lib/hooks/useCardActivation";
import { useInViewMount } from "@/lib/hooks/useInViewMount";
import { useAperiodicView, type AperiodicFrame, type HomeBox } from "@/lib/hooks/useAperiodicView";
import { hatPatch } from "@/lib/render/hatPatch";
import { SubRosaGL } from "@/lib/render/subrosaGL";
import { drawPolygons, polygonFillHue, type RawPolygon } from "@/lib/utils/renderTiling";

// The Aperiodic cell's media on the landing wall: a live patch of the hat tiling — Smith, Myers,
// Kaplan and Goodman-Strauss's 2023 aperiodic monotile — instead of the single faint outline the
// card carried while /aperiodic was still unbuilt.
//
// Same engine as the /aperiodic explorer's hat view (app/(app)/aperiodic/_patch-view.tsx): the patch
// is built once by metatile substitution, triangulated into one vertex buffer, and pan/zoom/rotate
// are shader uniforms. The interaction is the shared one (useAperiodicView), so a drag and a wheel
// notch mean here what they mean there and on /play.
//
// Two things differ from the explorer, both because this is a card on a page the reader scrolls:
// inert until clicked (useCardActivation), so the wheel keeps scrolling the page until asked
// otherwise; and mounted only while near the viewport (useInViewMount), because the wall now carries
// four live WebGL canvases and browsers cap live contexts per document.

/**
 * The substitution level, fixed — the card has no slider, so this is the whole choice.
 *
 * Level 5 is 7,921 hats spanning 240 world units, about ten of this card's home windows across, so
 * panning at any zoom the wheel reaches stays inside the patch instead of running out at its ragged
 * boundary. It costs 3.9 ms to build (measured) plus the ear-clip, once, when the card scrolls in.
 * Level 4 (1,156 hats, 90 units) would leave only three windows of travel; level 6 is 54,289 hats
 * and 32 ms of build for room nobody on a 300 px card will use.
 */
const HAT_MINI_LEVEL = 5;

/**
 * Side of the square world window framed at rest, in the patch's own units. The view contain-fits it,
 * so this is what the cell's SHORT side shows and the long side gets more; the wall's row track fixes
 * that short side, which is why one number holds across the breakpoints.
 *
 * A hat measures 1.861 across (sqrt of its mean area), so 17 is ~9 hats down the media box and ~15
 * across it, at ~25 px a tile. Wide enough that the 13-gon reads as a shape: at 24 (21 across) the
 * outline had turned into texture, which is the one thing a monotile card must not do.
 */
const HOME_WINDOW = 17;

// The shader's HSL saturation/lightness, and the outline. Same numbers as the explorer's patch view:
// HSL(h, 100%, 80%) is exactly the atlas' HSB(h, 40, 100) tile fill, so this card and every hat
// thumbnail are the same picture.
const PATCH_SAT = 1.0;
const PATCH_LIGHT = 80;
const STROKE_RGBA: [number, number, number, number] = [0, 0, 0, 1];
const STROKE_CSS = "#000";
const STROKE_PX = 1.5;
/** Most of a tile edge an outline may take, so the pattern does not wash out to grey when zoomed out. */
const STROKE_MAX_FRACTION = 0.15;
/** Below this many px per world unit the outline is dropped: neighbouring edges are then closer
 *  together than the line is wide, so every width paints the same grey and the pattern disappears.
 *  The card's wheel reaches home/8 ≈ 1.7, so this branch is live here. Same rule as the explorer's
 *  strokePxAt (app/(app)/aperiodic/_view-chrome.tsx), kept in step by hand — that module is a route's
 *  own chrome and importing it here would pull its sidebar UI into the landing bundle. */
const STROKE_MIN_ZOOM = 2.2;

const hueOf = (p: RawPolygon) => p.hue ?? polygonFillHue(p.vertices);

// Built at most once per page. The card can scroll in and out of view several times, and the patch is
// deterministic, so rebuilding it on re-entry would only spend the substitution again.
let cachedPatch: RawPolygon[] | null = null;
const miniPatch = (): RawPolygon[] => (cachedPatch ??= hatPatch(HAT_MINI_LEVEL));

/** The world point the home window centres on: the patch's bounding-box centre, well inside it. */
function patchCentre(polys: RawPolygon[]): { x: number; y: number } {
	let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
	for (const p of polys)
		for (const v of p.vertices) {
			if (v.x < minx) minx = v.x;
			if (v.x > maxx) maxx = v.x;
			if (v.y < miny) miny = v.y;
			if (v.y > maxy) maxy = v.y;
		}
	return { x: (minx + maxx) / 2, y: (miny + maxy) / 2 };
}

/**
 * The in-view gate. It unmounts the WHOLE surface, not just the canvas inside it: useAperiodicView
 * reads its canvas ref when its effects first run, so a canvas that appears later would leave the
 * wheel listener and the ResizeObserver attached to nothing — live pixels, dead input. Mounting the
 * surface as a unit means the canvas is always there before the hook's effects are.
 */
export function InteractiveHatMini() {
	const { ref, inView } = useInViewMount();
	return (
		<div ref={ref} className="absolute inset-0">
			{inView ? <HatSurface /> : null}
		</div>
	);
}

function HatSurface() {
	const { active, hostProps } = useCardActivation();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const glRef = useRef<SubRosaGL | null>(null);
	const modeRef = useRef<"init" | "gl" | "2d">("init");
	const uploadedRef = useRef<RawPolygon[] | null>(null);

	// Built on first entry into the viewport, then reused — the patch is module-cached, so the identity
	// is stable across scrolls and the upload effect can compare against what it last uploaded.
	const polys = useMemo(() => miniPatch(), []);

	// A window into the patch, NOT the patch's own bounding box. The explorer fits the whole thing
	// because showing a finite patch's ragged edge is honest for something you came to explore; a card
	// is a sample of the tiling, and its edge should be the card's, not the patch's.
	const home = useCallback((): HomeBox | null => {
		const c = patchCentre(polys);
		return { cx: c.x, cy: c.y, width: HOME_WINDOW, height: HOME_WINDOW };
	}, [polys]);

	const draw = useCallback(
		(f: AperiodicFrame) => {
			const cv = canvasRef.current;
			if (!cv) return;
			const strokePx = f.zoom <= STROKE_MIN_ZOOM ? 0 : Math.min(STROKE_PX, f.zoom * STROKE_MAX_FRACTION);

			if (modeRef.current === "gl" && glRef.current) {
				glRef.current.draw(
					{
						widthCss: f.w,
						heightCss: f.h,
						zoom: f.zoom,
						offsetX: f.offsetX,
						offsetY: f.offsetY,
						rot: f.rot,
						centreX: f.centreX,
						centreY: f.centreY,
						light: PATCH_LIGHT,
						sat: PATCH_SAT,
						strokePx,
						strokeRGBA: STROKE_RGBA,
					},
					f.dpr,
				);
				return;
			}

			// 2-D fallback (no WebGL2 context): the same polygons, the same hues.
			const ctx = cv.getContext("2d");
			if (!ctx) return;
			ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
			ctx.clearRect(0, 0, f.w, f.h);
			ctx.save();
			ctx.translate(f.w / 2 + f.offsetX, f.h / 2 + f.offsetY);
			ctx.rotate(f.rot);
			ctx.scale(f.zoom, -f.zoom);
			ctx.translate(-f.centreX, -f.centreY);
			ctx.lineJoin = "round";
			drawPolygons(ctx, polys, f.zoom, 0, strokePx, STROKE_CSS);
			ctx.restore();
		},
		[polys],
	);

	const view = useAperiodicView({ canvasRef, home, draw, active, fill: 1 });
	const { refit } = view;

	// Create the renderer once per mount: a canvas holds one context type for its life, so this decides
	// the path. Declared BEFORE the upload effect so the renderer exists when the first upload runs
	// (effects fire in declaration order, including Strict Mode's re-run) — the ordering the explorer's
	// patch view relies on too.
	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv) return;
		const gl = cv.getContext("webgl2", { antialias: true, premultipliedAlpha: false, alpha: true });
		if (gl) {
			try {
				glRef.current = new SubRosaGL(gl);
				modeRef.current = "gl";
			} catch {
				modeRef.current = "2d";
			}
		} else {
			modeRef.current = "2d";
		}
		uploadedRef.current = null;
		return () => {
			glRef.current?.dispose();
			glRef.current = null;
			uploadedRef.current = null;
			// No WEBGL_lose_context here, deliberately. Strict Mode re-runs this effect on the SAME canvas
			// node, and a canvas hands out one context for its life: losing it in the cleanup leaves the
			// second pass holding a dead context whose shaders will not compile, and — because that node
			// can no longer produce a 2-D context either — with nothing to fall back to. The card goes
			// blank. Dropping the context on a real unmount buys little anyway: the wall's only WebGL
			// surfaces are this cell and Play, Hyperbolic and Spherical (the mosaic and ring thumbnails
			// are 2-D), so four at most, far inside any browser's cap, and the node leaves with the
			// component. dispose() has already freed the program and the buffers.
		};
	}, []);

	// Triangulate, upload and frame. One pass: the level never changes.
	useEffect(() => {
		if (modeRef.current === "gl" && glRef.current && uploadedRef.current !== polys) {
			glRef.current.uploadPolygons(polys, hueOf);
			uploadedRef.current = polys;
		}
		refit();
	}, [polys, refit]);

	return (
		<div
			role="application"
			aria-label="Interactive hat tiling — drag to pan, scroll to zoom"
			{...hostProps}
			// The canvas below carries the pointer handlers, so a click there would focus this host on its
			// way up anyway; doing it explicitly keeps activation independent of pointer capture.
			onPointerDown={(e) => e.currentTarget.focus()}
			className="absolute inset-0 select-none overflow-hidden outline-none"
		>
			<canvas
				ref={canvasRef}
				className={cn("w-full h-full block", active ? "cursor-grab active:cursor-grabbing" : "cursor-pointer")}
				{...view.handlers}
			/>
		</div>
	);
}
