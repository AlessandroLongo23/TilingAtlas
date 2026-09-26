"use client";

import { useEffect, useState } from "react";

/** A frame gap longer than this means the page could not have answered a touch in time. */
const LONG_FRAME_MS = 120;
/** How long the frames have to run smoothly before the page counts as ready. */
const QUIET_MS = 500;
/** Stop waiting after this, whatever the frames say: a slow device must not stay faded for good. */
const GIVE_UP_MS = 20_000;

/**
 * False from the moment `key` changes until the main thread has run QUIET_MS of frames with no long gap.
 *
 * Entering a geometry draws its picture at once, then lands that geometry's catalogue shelves on the
 * same thread, and while they land a drag waits (on a phone, up to a second at a time). The frames are
 * what the visitor feels, so they are what is measured: no list of loaders to keep in step, and a fast
 * device settles within QUIET_MS.
 */
export function useMainThreadSettled(key: unknown): boolean {
	const [settledFor, setSettledFor] = useState<{ key: unknown } | null>(null);

	useEffect(() => {
		let raf = 0;
		const start = performance.now();
		let last = start;
		let quietSince = start;
		const tick = (now: number) => {
			if (now - last > LONG_FRAME_MS) quietSince = now;
			last = now;
			if (now - quietSince >= QUIET_MS || now - start >= GIVE_UP_MS) {
				setSettledFor({ key });
				return;
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [key]);

	return settledFor?.key === key;
}
