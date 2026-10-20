// Where /play's hyperbolic disk sits on its canvas. The disk canvases draw through it, and the click and
// the timeline driver read it back, so all of them agree on the disk's centre and radius.

import { captureOverride } from "@/lib/render/capture";

/** /play's gap between the disk's rim and the canvas edge. */
export const DISK_PAD_PX = 24;
/** Extra room under the disk on /play, so the rim clears the floating toolbar at the bottom. */
export const DISK_BAR_PX = 48;

/**
 * Where the disk sits in a w x h CSS box: radius and centre in CSS px, y down. `pad` clear of every edge
 * and `bar` more off the bottom, so the disk shrinks and rises by half of `bar`. An export has no toolbar
 * over it and stays centred.
 */
export function diskFrame(w: number, h: number, pad = DISK_PAD_PX, bar = DISK_BAR_PX) {
	const b = captureOverride() ? 0 : bar;
	return { r: Math.max(0.5 * Math.min(w - 2 * pad, h - 2 * pad - b), 1), cx: w / 2, cy: (h - b) / 2 };
}
