"use client";

import { useEffect, useRef, type RefObject } from "react";
import { ROTATE_DAMP, shortestDeltaDeg } from "@/lib/render/viewControls";

/**
 * Ease a live view angle toward a target (degrees) the way the flat canvas's draw loop does: shortest
 * arc, ROTATE_DAMP per frame, snapped once within a hair. That ease is what makes a 5° wheel detent
 * glide instead of jump, and sharing the constant keeps the 2D views (freedraw, colors) feeling like
 * the flat p5/WebGL one.
 *
 * The live angle is a REF, and the frame loop lives here: it runs only while the angle is travelling
 * and redraws through `drawRef` (the canvas components already keep their latest draw in one), so a
 * turn costs no React renders at all and a settled view costs nothing.
 *
 * @param targetDeg the angle to travel to — the store's rotation field on /play
 * @param drawRef   the canvas's latest draw function; called once per eased frame
 * @returns the live angle in DEGREES, continuous (never wrapped, so no frame ever sees a 360° jump)
 */
export function useEasedRotation(
	targetDeg: number,
	drawRef: RefObject<() => void>,
): RefObject<number> {
	// Seeded AT the target, not at 0: a canvas mounted with a rotation already set (a shared link, a
	// switch back from another tiling) shows that angle immediately instead of spinning up to it.
	const rotRef = useRef(targetDeg);

	useEffect(() => {
		if (Math.abs(shortestDeltaDeg(targetDeg - rotRef.current)) < 0.05) {
			rotRef.current = targetDeg;
			return;
		}
		let raf = 0;
		const tick = () => {
			const d = shortestDeltaDeg(targetDeg - rotRef.current);
			if (Math.abs(d) < 0.05) {
				rotRef.current = targetDeg; // landed — draw the final frame, then let the loop end
			} else {
				rotRef.current += d * ROTATE_DAMP;
				raf = requestAnimationFrame(tick);
			}
			drawRef.current();
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [targetDeg, drawRef]);

	return rotRef;
}
