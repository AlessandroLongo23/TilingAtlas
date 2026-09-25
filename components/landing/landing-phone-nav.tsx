"use client";

import { Nav } from "@/components/nav";
import { useIsPhone } from "@/lib/hooks/useIsPhone";

// The landing page has no Nav on desktop: the page itself is the index. A phone sees only the first
// collections without scrolling and has no other way to Freedraw, Colors or Automata, so it gets the
// same top bar and menu as every other page, pinned while the page scrolls.
//
// The bar box is server-rendered at its phone height (display:none from 768px up), and the Nav mounts
// into it only once the viewport is known to be a phone. Mounting it on desktop would bring its number
// key shortcuts to a page that never had them.
export function LandingPhoneNav() {
	const isPhone = useIsPhone();
	return (
		<div className="sticky top-0 z-40 hidden h-[var(--topbar-h)] bg-surface-chrome max-md:block">
			{isPhone ? <Nav /> : null}
		</div>
	);
}
