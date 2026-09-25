"use client";

import { useSyncExternalStore } from "react";

// The phone breakpoint, in one place: Tailwind's `max-md:` variant is `width < 48rem`, so a viewport is
// a phone exactly when that variant applies. Layout stays in CSS (so the server HTML is already right on
// a phone); this hook is only for behaviour CSS cannot express, such as which sheet a gesture drives.
export const PHONE_QUERY = "(max-width: 767.98px)";

// jsdom (the unit tests) has no matchMedia; a runtime without one is treated as a desktop.
const query = () => (typeof window.matchMedia === "function" ? window.matchMedia(PHONE_QUERY) : null);

function subscribe(onChange: () => void) {
	const mql = query();
	mql?.addEventListener("change", onChange);
	return () => mql?.removeEventListener("change", onChange);
}

/** The same answer outside React (event handlers, module code). False on the server. */
export const isPhoneNow = () => typeof window !== "undefined" && (query()?.matches ?? false);
// The server has no viewport. `false` keeps the first client render identical to the server markup;
// the store then re-renders with the real answer after hydration.
const getServerSnapshot = () => false;

/** True on a viewport narrower than 768px. Always false on the server and during hydration. */
export function useIsPhone(): boolean {
	return useSyncExternalStore(subscribe, isPhoneNow, getServerSnapshot);
}
