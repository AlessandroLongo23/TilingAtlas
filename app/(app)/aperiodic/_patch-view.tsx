"use client";

// The finite-patch views: Penrose (P3, by deflating Robinson triangles) and the hat (Smith, Myers,
// Kaplan & Goodman-Strauss's aperiodic monotile, by metatile substitution). Both are already built
// elsewhere in the atlas — lib/render/penrosePatch.ts and lib/render/hatPatch.ts — for the static
// cards; this makes them explorable.
//
// Both draw through SubRosaGL, the same batched WebGL2 renderer as Sub Rosa and the multigrid: the
// whole patch is triangulated once into one vertex buffer, and pan/zoom/rotate are uniforms. The hat
// is a non-convex 13-gon, which the renderer's original quad split (two triangles across a diagonal)
// cannot represent at all, so uploadPolygons ear-clips instead — see lib/render/triangulate.ts.
//
// The colours are the atlas', not the rhombic views': the shader is handed saturation 1.0 and
// lightness 80, which is exactly HSB(h, 40, 100), the tile fill the /defense cards and every
// thumbnail use. So moving to the GPU changed what these can do, not what they look like.
//
// A 2-D fallback stays for canvases with no WebGL2 context, drawing the same polygons through
// drawPolygons.
//
// Home framing is ONE rule at every level: fit the whole patch. A finite patch has a ragged boundary
// and this shows it, which is honest for an explorer even though it would be a defect on a slide.
//
// It replaces a two-branch rule that special-cased the default level onto the measured gap-free
// window (PENROSE_WINDOW, HAT_WINDOW, sized for the static /defense cards). That made the default the
// one level of the slider that did NOT show the whole patch: dragging Penrose 4 → 5 → 6 jumped from
// whole patch, to a window, back to whole patch. The clean windows are still right for the cards,
// where a patch is a standalone thumbnail; they are the wrong thing for a slider you drag.
//
// Scale across constructions is matched by the DEFAULT LEVELS instead — see the `def` fields below.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HAT_LEVEL, hatPatch } from "@/lib/render/hatPatch";
import { penrosePatch } from "@/lib/render/penrosePatch";
import {
	applyViewTransform,
	useAperiodicView,
	type AperiodicFrame,
	type HomeBox,
} from "@/lib/hooks/useAperiodicView";
import { SubRosaGL } from "@/lib/render/subrosaGL";
import { drawPolygons, polygonFillHue, type RawPolygon } from "@/lib/utils/renderTiling";
import { Slider } from "@/components/ui/slider";
import { AperiodicSidebar, Section } from "./_controls";
import { Details, strokePxAt, STROKE_CSS, STROKE_RGBA, STROKE_WIDTH, ViewFooter } from "./_view-chrome";

interface PatchDef {
	title: string;
	/**
	 * Slider label, bounds and default for the construction's one parameter.
	 *
	 * `def` is the VIEW's default, which need not be the patch module's own (PENROSE_DEPTH, HAT_LEVEL —
	 * those are the /defense cards' framing and are not touched). Since home always fits the whole
	 * patch, the default level is what sets how big a tile looks when you land on a view, so the two
	 * are picked to have comparable tile counts: Penrose depth 6 is 1,140 rhombi against the hat level
	 * 4's 1,156 hats, which lands them at 39.9 and 48.4 tiles across. Depth 5 (430 rhombi, 24.6 across)
	 * would open Penrose at twice the hat's tile size.
	 */
	level: { label: string; min: number; max: number; def: number };
	build: (level: number) => RawPolygon[];
	/** The Details list. Facts about THIS patch at THIS level — no prose; the sidebar is not a page. */
	facts: (level: number, count: number) => [string, string][];
}

// Level caps. On the GPU the per-frame cost is gone — the patch is uploaded once and a drag is a
// uniform update — so what remains is the CPU build plus triangulation, which happens on the main
// thread when the slider moves, and the size of the vertex buffer.
//
// Measured: Penrose depth 11 is 143,010 rhombi, 286k triangles, 137 ms to build and 22 ms to
// triangulate; hat level 6 is 54,289 hats, 597k triangles, 21 ms + 52 ms. Both sit around a tenth of
// a second, which reads as a pause on the slider rather than a hang. The next rung up is where that
// stops being true: Penrose depth 12 roughly triples the build, and hat level 7 is 372,100 hats and
// 4.09M triangles — a 184 MB buffer and ~200 ms of build before the triangulator even starts.
//
// For reference, these are 18× and 7× the levels the 2-D path could hold.
const PENROSE_MAX_DEPTH = 11;
const HAT_MAX_LEVEL = 6;

// The shader's HSL saturation/lightness for the patch fills. HSB(h, 40, 100) — the atlas' tile fill,
// used by drawPolygons and so by every thumbnail and card — is exactly HSL(h, 100%, 80%):
// l = v(1 − s/2) = 0.8, and s_hsl = (v − l)/min(l, 1−l) = 1. Keeping the GPU path on these numbers is
// what makes the move invisible.
const PATCH_SAT = 1.0;
const PATCH_LIGHT = 80;

/**
 * sqrt(mean tile area) — the characteristic size the default levels are matched on.
 *
 * Area, NOT median edge. Edge length is the atlas' usual scale for periodic tilings and it is wrong
 * here: a hat has shorter edges than a Penrose rhombus (0.866 vs 1.0) while being 2.07× the tile,
 * because it is a 13-gon built from many short edges. Ordering the two by edge length gets the answer
 * backwards.
 */
export function characteristicTileSize(polys: RawPolygon[]): number {
	if (polys.length === 0) return 0;
	let total = 0;
	for (const p of polys) {
		const v = p.vertices;
		let s = 0;
		for (let i = 0, j = v.length - 1; i < v.length; j = i++) s += (v[j].x - v[i].x) * (v[j].y + v[i].y);
		total += Math.abs(s) / 2;
	}
	return Math.sqrt(total / polys.length);
}

const PATCHES: Record<"penrose" | "hat", PatchDef> = {
	penrose: {
		title: "Penrose",
		level: { label: "Deflation depth", min: 1, max: PENROSE_MAX_DEPTH, def: 6 },
		build: penrosePatch,
		facts: (level, count) => [
			["Construction", "deflation (P3)"],
			["Prototiles", "2 rhombi (36°, 72°)"],
			["Inflation", "φ = 1.618034"],
			["Depth", String(level)],
			["Rhombi", count.toLocaleString()],
		],
	},
	hat: {
		title: "The hat",
		level: { label: "Substitution level", min: 1, max: HAT_MAX_LEVEL, def: HAT_LEVEL },
		build: hatPatch,
		facts: (level, count) => [
			["Construction", "metatile substitution"],
			["Prototiles", "1 (and its mirror)"],
			["Discovered", "Smith, Myers, Kaplan, Goodman-Strauss 2023"],
			["Level", String(level)],
			["Hats", count.toLocaleString()],
			["Reflected", "≈ 1 in 7"],
		],
	},
};

/** The view defaults, exported so a test can pin that they stay paired on tile count. */
export const PATCH_DEFAULT_LEVELS = {
	penrose: PATCHES.penrose.level.def,
	hat: PATCHES.hat.level.def,
} as const;

/**
 * The hue drawPolygons would pick, so the GPU and 2-D paths agree tile for tile: an explicit `hue`
 * when the builder set one (the hat marks its mirrored copies), otherwise the by-shape ramp. Neither
 * patch produces star tiles, so that branch of drawPolygons has no counterpart here.
 */
const hueOf = (p: RawPolygon) => p.hue ?? polygonFillHue(p.vertices);

/** Patches are deterministic and rebuilt on every level change, so keep each one that was asked for. */
const cache = new Map<string, RawPolygon[]>();
function patchAt(id: keyof typeof PATCHES, level: number): RawPolygon[] {
	const key = `${id}:${level}`;
	let polys = cache.get(key);
	if (!polys) {
		polys = PATCHES[id].build(level);
		cache.set(key, polys);
	}
	return polys;
}

export function PatchView({ id, header }: { id: keyof typeof PATCHES; header: React.ReactNode }) {
	const def = PATCHES[id];
	const [level, setLevel] = useState(def.level.def);
	const [strokeWidth, setStrokeWidth] = useState<number>(STROKE_WIDTH.def);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const glRef = useRef<SubRosaGL | null>(null);
	const modeRef = useRef<"init" | "gl" | "2d">("init");
	const uploadedRef = useRef<RawPolygon[] | null>(null);

	const effLevel = Math.min(Math.max(level, def.level.min), def.level.max);
	const polys = useMemo(() => patchAt(id, effLevel), [id, effLevel]);

	// One rule at every level: fit the whole patch. Every position on the slider then behaves the same
	// way, and moving it means "more tiling", never "and now the framing changes too".
	const home = useCallback((): HomeBox | null => {
		let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
		for (const p of polys)
			for (const v of p.vertices) {
				if (v.x < minx) minx = v.x;
				if (v.x > maxx) maxx = v.x;
				if (v.y < miny) miny = v.y;
				if (v.y > maxy) maxy = v.y;
			}
		if (!Number.isFinite(minx)) return null;
		return {
			cx: (minx + maxx) / 2,
			cy: (miny + maxy) / 2,
			width: maxx - minx,
			height: maxy - miny,
		};
	}, [polys]);

	const draw = useCallback(
		(f: AperiodicFrame) => {
			const cv = canvasRef.current;
			if (!cv) return;
			const strokePx = strokePxAt(strokeWidth, f.zoom);

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
			applyViewTransform(ctx, f);
			ctx.lineJoin = "round";
			drawPolygons(ctx, polys, f.zoom, 0, strokePx, STROKE_CSS);
			ctx.restore();
		},
		[polys, strokeWidth],
	);

	const view = useAperiodicView({ canvasRef, home, draw });
	const { refit, requestDraw } = view;

	// Create the renderer once: a canvas holds one context type for its life, so this decides the path.
	// Declared BEFORE the upload effect so the renderer exists when the first upload runs (effects fire
	// in declaration order, including Strict Mode's re-run) — the same ordering Sub Rosa relies on.
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
		};
	}, []);

	// Triangulate and upload on every level change, then reframe.
	useEffect(() => {
		if (modeRef.current === "gl" && glRef.current && uploadedRef.current !== polys) {
			glRef.current.uploadPolygons(polys, hueOf);
			uploadedRef.current = polys;
		}
		refit();
	}, [polys, refit]);
	useEffect(() => {
		requestDraw();
	}, [strokeWidth, requestDraw]);

	return (
		<div className="flex-1 min-h-0 flex">
			<AperiodicSidebar header={header}>
				<Section label="Construction">
					<Slider
						id="patch-level"
						label={def.level.label}
						value={effLevel}
						onChange={setLevel}
						min={def.level.min}
						max={def.level.max}
						step={1}
					/>
					<div className="flex justify-between text-[11px] text-fg-muted">
						<span>{polys.length.toLocaleString()} tiles</span>
						{effLevel === def.level.max && <span>budget limit</span>}
					</div>
				</Section>

				<ViewFooter view={view} strokeWidth={strokeWidth} onStrokeWidth={setStrokeWidth} />

				<Section label="Details">
					<Details rows={def.facts(effLevel, polys.length)} />
				</Section>
			</AperiodicSidebar>

			<div className="flex-1 min-h-0 relative">
				<canvas
					ref={canvasRef}
					className="w-full h-full block cursor-grab active:cursor-grabbing touch-none"
					{...view.handlers}
				/>
			</div>
		</div>
	);
}
