// The offscreen surfaces every Poincaré-disk thumbnail bakes into, owned once instead of three times.
//
// WHY IT MATTERS more than tidiness. Three thumbnail components — developed, edge systems, colorings —
// each declared their own `glCanvas` / `glRenderer` pair, and each one's header comment claimed "one
// shared offscreen WebGL2 canvas renders every thumbnail in turn". That was true inside a file and false
// across them: a page showing all three shelves held THREE WebGL2 contexts, each with its own compiled
// per-pixel program, to draw pictures that are never drawn at the same moment. Browsers cap live contexts
// (commonly ~16) and drop the oldest when the cap is passed, so duplicated hosts are the kind of thing
// that works until a page grows one shelf too many.
//
// The thumbnails genuinely do render one at a time — lib/render/thumbnailQueue.ts frame-paces them — so
// one host is not merely enough, it is what the comments already claimed.

import { HyperbolicPerPixelRenderer } from "@/lib/render/hyperbolicPerPixelGL";
import type { ShaderTiling } from "@/lib/render/hyperbolicReduce";

let glCanvas: HTMLCanvasElement | null = null;
// undefined = untried, null = unavailable (no WebGL2, or the program failed to build)
let glRenderer: HyperbolicPerPixelRenderer | null | undefined;
let canvas2d: HTMLCanvasElement | null = null;

/** The shared per-pixel renderer, sized for this bake, or null where WebGL2 is unavailable. */
export function ensureDiskRenderer(
	size: number,
): { renderer: HyperbolicPerPixelRenderer; canvas: HTMLCanvasElement } | null {
	if (!glCanvas) glCanvas = document.createElement("canvas");
	if (glCanvas.width !== size) {
		glCanvas.width = size;
		glCanvas.height = size;
	}
	if (glRenderer === undefined) {
		const gl = glCanvas.getContext("webgl2", {
			alpha: true,
			premultipliedAlpha: true,
			preserveDrawingBuffer: true,
		});
		if (!gl) {
			glRenderer = null;
		} else {
			try {
				glRenderer = new HyperbolicPerPixelRenderer(gl);
			} catch {
				glRenderer = null;
			}
		}
	}
	return glRenderer ? { renderer: glRenderer, canvas: glCanvas } : null;
}

/** The shared 2D surface for the developed fallback, sized for this bake. */
export function ensureDiskCanvas2d(size: number): CanvasRenderingContext2D | null {
	if (!canvas2d) canvas2d = document.createElement("canvas");
	if (canvas2d.width !== size) {
		canvas2d.width = size;
		canvas2d.height = size;
	}
	const ctx = canvas2d.getContext("2d");
	if (!ctx) return null;
	ctx.clearRect(0, 0, size, size);
	return ctx;
}

/** The bitmap the 2D fallback just drew. Separate from the context so a caller cannot bake into one
 *  surface and read another. */
export const diskCanvas2dDataUrl = (): string | null => canvas2d?.toDataURL("image/png") ?? null;

// One reduction field per (mode, tiling). The MODE belongs in the key: the same darts prepared with
// `colors: true` and without give different fields, and the three shelves no longer have a cache each to
// keep them apart. Null is cached too — a failed Dirichlet certificate costs a median 210 ms, and
// re-deciding that per card is exactly what the cache exists to stop.
const fields = new Map<string, ShaderTiling | null>();

export function cachedShaderTiling(
	mode: string,
	id: string,
	build: () => ShaderTiling | null,
): ShaderTiling | null {
	const key = `${mode}:${id}`;
	const hit = fields.get(key);
	if (hit !== undefined) return hit;
	const built = build();
	fields.set(key, built);
	return built;
}
