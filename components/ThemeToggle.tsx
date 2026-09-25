"use client";

import { Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { isTypingTarget } from "@/lib/hooks/useKeyShortcuts";
import { Tooltip } from "@/components/ui/tooltip";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
	const root = document.documentElement;
	root.classList.add("disable-transitions");
	root.classList.toggle("dark", theme === "dark");
	localStorage.setItem("theme", theme);
	setTimeout(() => root.classList.remove("disable-transitions"), 100);
}

// The theme is the `.dark` class on <html> (set before paint by the script in app/layout.tsx), so that
// class is the store: every toggle on the page (the header icon, the phone menu's row) reads it and
// stays in step with the others without sharing React state.
function subscribeTheme(onChange: () => void) {
	const mo = new MutationObserver(onChange);
	mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
	return () => mo.disconnect();
}
const readTheme = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light");

/**
 * `icon` is the header button and owns the app-wide pieces (Shift+T, following the OS). `row` is the
 * phone menu's labelled row; it adds no listeners, so mounting both never flips the theme twice.
 */
export function ThemeToggle({ variant = "icon" }: { variant?: "icon" | "row" }) {
	const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "dark" as Theme);
	const owner = variant === "icon";

	useEffect(() => {
		if (!owner) return;
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = (e: MediaQueryListEvent) => {
			if (localStorage.getItem("theme")) return;
			applyTheme(e.matches ? "dark" : "light");
		};
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, [owner]);

	// Read the current theme from the DOM (source of truth) and not the `theme` state, so this stays
	// stable ([] deps) and the keydown listener below never fires on a stale closure.
	const toggle = useCallback(() => {
		applyTheme(readTheme() === "dark" ? "light" : "dark");
	}, []);

	// Shift+T toggles the theme from anywhere. Plain "t" is already taken on /play (tiling transition),
	// so we use capital T. That handler lowercases keys, so we register in the CAPTURE phase and
	// stopImmediatePropagation for Shift+T only — that way Shift+T flips the theme without also tripping
	// the /play transition toggle, while plain "t" there is left untouched.
	useEffect(() => {
		if (!owner) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "T" || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
			if (isTypingTarget(e)) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			toggle();
		};
		window.addEventListener("keydown", onKey, { capture: true });
		return () => window.removeEventListener("keydown", onKey, { capture: true });
	}, [toggle, owner]);

	if (!owner) {
		return (
			<button
				type="button"
				onClick={toggle}
				aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
				className="flex h-12 w-full items-center gap-3 rounded-control px-3 text-left text-[15px] text-fg hover:bg-surface-overlay"
			>
				{theme === "dark" ? <Moon size={18} strokeWidth={1.75} /> : <Sun size={18} strokeWidth={1.75} />}
				<span className="flex-1">Theme</span>
				<span className="text-[13px] text-fg-muted">{theme === "dark" ? "Dark" : "Light"}</span>
			</button>
		);
	}

	return (
		<Tooltip label="Toggle theme" shortcut="Shift + T" side="left" delay={0}>
			<button
				type="button"
				onClick={toggle}
				aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
				className="relative flex items-center justify-center w-8 h-8 rounded-control text-fg-muted hover:text-fg hover:bg-surface-overlay transition-colors focus:outline-none cursor-pointer"
			>
				<span className="relative w-4 h-4 block">
					<Sun
						strokeWidth={1.75}
						className="absolute inset-0 w-4 h-4 rotate-0 scale-100 transition-all duration-500 dark:-rotate-90 dark:scale-0"
					/>
					<Moon
						strokeWidth={1.75}
						className="absolute inset-0 w-4 h-4 rotate-90 scale-0 transition-all duration-500 dark:rotate-0 dark:scale-100"
					/>
				</span>
			</button>
		</Tooltip>
	);
}
