"use client";

import { Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Tooltip } from "@/components/ui/tooltip";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
	const root = document.documentElement;
	root.classList.add("disable-transitions");
	root.classList.toggle("dark", theme === "dark");
	localStorage.setItem("theme", theme);
	setTimeout(() => root.classList.remove("disable-transitions"), 100);
}

export function ThemeToggle() {
	const [theme, setTheme] = useState<Theme>("dark");

	useEffect(() => {
		setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");

		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = (e: MediaQueryListEvent) => {
			if (localStorage.getItem("theme")) return;
			const next: Theme = e.matches ? "dark" : "light";
			applyTheme(next);
			setTheme(next);
		};
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, []);

	// Read the current theme from the DOM (source of truth) rather than the `theme` state, so this stays
	// stable ([] deps) and the keydown listener below never fires on a stale closure.
	const toggle = useCallback(() => {
		const next: Theme = document.documentElement.classList.contains("dark") ? "light" : "dark";
		applyTheme(next);
		setTheme(next);
	}, []);

	// Shift+T toggles the theme from anywhere. Plain "t" is already taken on /play (tiling transition),
	// so we use capital T. That handler lowercases keys, so we register in the CAPTURE phase and
	// stopImmediatePropagation for Shift+T only — that way Shift+T flips the theme without also tripping
	// the /play transition toggle, while plain "t" there is left untouched.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "T" || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
			const el = e.target as HTMLElement | null;
			if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			toggle();
		};
		window.addEventListener("keydown", onKey, { capture: true });
		return () => window.removeEventListener("keydown", onKey, { capture: true });
	}, [toggle]);

	return (
		<Tooltip label="Toggle theme" shortcut="Shift + T" side="left" delay={0}>
			<button
				type="button"
				onClick={toggle}
				aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
				className="relative flex items-center justify-center w-8 h-8 rounded-control border border-line text-fg-muted hover:text-fg hover:bg-surface-overlay transition-colors focus:outline-none cursor-pointer"
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
