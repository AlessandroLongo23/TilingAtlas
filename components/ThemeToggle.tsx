"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

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

	const toggle = () => {
		const next: Theme = theme === "dark" ? "light" : "dark";
		applyTheme(next);
		setTheme(next);
	};

	return (
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
	);
}
