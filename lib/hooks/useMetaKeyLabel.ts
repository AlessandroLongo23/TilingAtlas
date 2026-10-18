"use client";

import { useSyncExternalStore } from "react";

// The label for the platform's ⌘/Meta key. The Command-scrub gesture binds to `event.metaKey`, which is
// ⌘ on macOS, the Windows key on Windows, and Super elsewhere — so any hint must name the key the user
// actually holds. Detection needs `navigator` (client-only), so the server snapshot is a stable "⌘"
// fallback and hydration corrects it to the client value without a warning.
const noSubscribe = () => () => {};
const clientLabel = () => {
	const src = `${navigator.platform} ${navigator.userAgent}`;
	if (/mac|iphone|ipad|ipod/i.test(src)) return "⌘";
	if (/win/i.test(src)) return "Win";
	return "Super";
};
const serverLabel = () => "⌘";

export function useMetaKeyLabel(): string {
	return useSyncExternalStore(noSubscribe, clientLabel, serverLabel);
}
