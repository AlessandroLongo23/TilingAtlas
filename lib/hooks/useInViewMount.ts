"use client";

import { useEffect, useRef, useState } from "react";

// Mount a heavy child only while its slot is near the viewport. Browsers cap live WebGL contexts
// (~8-16 per document) and the landing wall carries three live canvases on top of the thumbnail
// renderers, so a card that has scrolled away releases its context instead of holding one for a
// surface nobody is looking at.
//
// The returned ref goes on a wrapper that is ALWAYS rendered (it is what gets observed); the flag
// gates the child inside it.
export function useInViewMount(rootMargin = "200px"): {
	ref: React.RefObject<HTMLDivElement | null>;
	inView: boolean;
} {
	const ref = useRef<HTMLDivElement | null>(null);
	const [inView, setInView] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const io = new IntersectionObserver((entries) => setInView(entries[0]?.isIntersecting ?? false), {
			rootMargin,
		});
		io.observe(el);
		return () => io.disconnect();
	}, [rootMargin]);

	return { ref, inView };
}
