"use client";

import { useEffect, useRef } from "react";
import styles from "./atlas-wall.module.css";

// Cover-fits the fixed 1920x1200 design canvas to the viewport (scale = max of the two ratios,
// centered, overflow cropped). Pre-hydration the CSS fallback shows the canvas centered at 1:1,
// which is a static crop — acceptable no-JS behavior; every link still works.
export function AtlasWallScaler({ children }: { children: React.ReactNode }) {
	const ref = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const apply = () => {
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			const s = Math.max(vw / 1920, vh / 1200);
			// Portrait crops to a narrow slice; anchor it on the masthead/Library/Theory column
			// instead of the wall's center (where the two reserved doors happen to live).
			const anchorX = vw / vh < 0.9 ? 0.24 : 0.5;
			el.style.left = "0";
			el.style.top = "0";
			el.style.transformOrigin = "0 0";
			el.style.transform = `translate(${vw / 2 - anchorX * 1920 * s}px, ${vh / 2 - 0.5 * 1200 * s}px) scale(${s})`;
		};
		apply();
		window.addEventListener("resize", apply);
		return () => window.removeEventListener("resize", apply);
	}, []);

	return (
		<div className={styles.viewport}>
			<div ref={ref} className={styles.canvas}>
				{children}
			</div>
		</div>
	);
}
