"use client";

// The canvas for one polychoron (lib/render/polychoraGL.ts) and the hands on it. Every gesture is a
// rotation of 4-space written into one matrix: a drag turns the planes that leave w alone, which is the
// ordinary orbit of the projected figure, and a shift-drag or the wheel turns the planes through w.
import { useEffect, useRef } from "react";
import { PolychoronRenderer, orthonormalize, rotatePlane, type PolychoronView } from "@/lib/render/polychoraGL";
import type { Geometry4 } from "@/lib/render/polychora";

export type PolychoronSettings = Omit<PolychoronView, "rot" | "zoom" | "resolution"> & { spin: boolean };

export function PolychoronCanvas({
	geometry,
	settings,
	className,
}: {
	geometry: Geometry4;
	settings: PolychoronSettings;
	className?: string;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const live = useRef({
		renderer: null as PolychoronRenderer | null,
		settings,
		rot: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
		zoom: 1,
		resolution: 1,
		slow: 0,
		dirty: true,
	});

	useEffect(() => {
		const canvas = canvasRef.current!;
		const s = live.current;
		s.renderer = new PolychoronRenderer(canvas);
		let dragging = false;
		let last = performance.now();
		let raf = requestAnimationFrame(function frame(now) {
			const last0 = last;
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			if (s.settings.spin && !dragging) {
				// Equal turns in two orthogonal planes: an isoclinic rotation, which moves every point.
				rotatePlane(s.rot, 0, 3, 0.25 * dt);
				rotatePlane(s.rot, 1, 2, 0.25 * dt);
				s.dirty = true;
			}
			if (s.dirty) {
				// Films that cover the canvas hundreds of times over are bound by fill rate, and the only
				// cure is fewer pixels: after half a second of slow frames, draw at 3/4 of the resolution.
				s.slow = now - last0 > 24 ? s.slow + 1 : 0;
				if (s.slow > 30 && s.resolution > 0.4) {
					s.resolution *= 0.75;
					s.slow = 0;
				}
				s.dirty = false;
				orthonormalize(s.rot);
				s.renderer!.draw({ ...s.settings, rot: s.rot, zoom: s.zoom, resolution: s.resolution });
			}
			raf = requestAnimationFrame(frame);
		});
		const down = (e: PointerEvent) => {
			dragging = true;
			canvas.setPointerCapture(e.pointerId);
		};
		const up = () => (dragging = false);
		const move = (e: PointerEvent) => {
			if (!dragging) return;
			const depth = e.shiftKey || e.buttons === 2 ? 3 : 2;
			rotatePlane(s.rot, 0, depth, -e.movementX * 0.008);
			rotatePlane(s.rot, 1, depth, e.movementY * 0.008);
			s.dirty = true;
		};
		const wheel = (e: WheelEvent) => {
			e.preventDefault();
			if (e.ctrlKey) s.zoom = Math.min(8, Math.max(0.3, s.zoom * Math.exp(-e.deltaY * 0.01)));
			else {
				rotatePlane(s.rot, 2, 3, e.deltaY * 0.003);
				rotatePlane(s.rot, 0, 3, e.deltaX * 0.003);
			}
			s.dirty = true;
		};
		const menu = (e: Event) => e.preventDefault();
		const resized = new ResizeObserver(() => (s.dirty = true));
		resized.observe(canvas);
		canvas.addEventListener("pointerdown", down);
		canvas.addEventListener("pointermove", move);
		canvas.addEventListener("pointerup", up);
		canvas.addEventListener("pointercancel", up);
		canvas.addEventListener("wheel", wheel, { passive: false });
		canvas.addEventListener("contextmenu", menu);
		return () => {
			cancelAnimationFrame(raf);
			resized.disconnect();
			canvas.removeEventListener("pointerdown", down);
			canvas.removeEventListener("pointermove", move);
			canvas.removeEventListener("pointerup", up);
			canvas.removeEventListener("pointercancel", up);
			canvas.removeEventListener("wheel", wheel);
			canvas.removeEventListener("contextmenu", menu);
			s.renderer!.dispose();
			s.renderer = null;
		};
	}, []);

	useEffect(() => {
		live.current.renderer?.setGeometry(geometry);
		live.current.resolution = 1;
		live.current.slow = 0;
		live.current.dirty = true;
	}, [geometry]);

	useEffect(() => {
		live.current.settings = settings;
		live.current.dirty = true;
	}, [settings]);

	return <canvas ref={canvasRef} className={className} style={{ touchAction: "none", cursor: "grab" }} />;
}
