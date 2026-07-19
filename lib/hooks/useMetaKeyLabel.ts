"use client";

import { useEffect, useState } from "react";

// The label for the platform's ⌘/Meta key. The Command-scrub gesture binds to `event.metaKey`, which is
// ⌘ on macOS, the Windows key on Windows, and Super elsewhere — so any hint must name the key the user
// actually holds. Detection needs `navigator` (client-only), so we start from a stable "⌘" fallback that
// matches the server render and correct it after mount, which keeps hydration warning-free.
export function useMetaKeyLabel(): string {
	const [label, setLabel] = useState("⌘");
	useEffect(() => {
		const src = `${navigator.platform} ${navigator.userAgent}`;
		if (/mac|iphone|ipad|ipod/i.test(src)) setLabel("⌘");
		else if (/win/i.test(src)) setLabel("Win");
		else setLabel("Super");
	}, []);
	return label;
}
