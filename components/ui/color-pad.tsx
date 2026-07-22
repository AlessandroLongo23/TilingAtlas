"use client";

import { useCallback, useEffect, useRef, useState, type TouchEvent as RTouchEvent, type MouseEvent as RMouseEvent } from "react";
import { map } from "@/lib/utils/math";

export interface ColorParams {
	a: number;
	b: number;
}

interface ColorPadProps {
	value: ColorParams;
	onChange: (value: ColorParams) => void;
}

const MIN_A = 1;
const MAX_A = 360;
const MIN_B = -180;
const MAX_B = 180;
const PAD = 120;

export function ColorPad({ value, onChange }: ColorPadProps) {
	const padRef = useRef<HTMLDivElement | null>(null);
	const draggingRef = useRef(false);
	const [position, setPosition] = useState(() => ({
		x: map(value.a, MIN_A, MAX_A, 0, PAD),
		y: map(value.b, MAX_B, MIN_B, 0, PAD),
	}));

	useEffect(() => {
		setPosition({
			x: map(value.a, MIN_A, MAX_A, 0, PAD),
			y: map(value.b, MAX_B, MIN_B, 0, PAD),
		});
	}, [value.a, value.b]);

	const updateFromClient = useCallback(
		(clientX: number, clientY: number) => {
			const pad = padRef.current;
			if (!pad) return;
			const rect = pad.getBoundingClientRect();
			const x = Math.max(0, Math.min(PAD, clientX - rect.left));
			const y = Math.max(0, Math.min(PAD, clientY - rect.top));
			setPosition({ x, y });
			onChange({
				a: Math.round(map(x, 0, PAD, MIN_A, MAX_A)),
				b: Math.round(map(y, 0, PAD, MAX_B, MIN_B)),
			});
		},
		[onChange],
	);

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			if (!draggingRef.current) return;
			updateFromClient(e.clientX, e.clientY);
		};
		const onTouchMove = (e: TouchEvent) => {
			if (!draggingRef.current || !e.touches[0]) return;
			updateFromClient(e.touches[0].clientX, e.touches[0].clientY);
		};
		const onUp = () => {
			draggingRef.current = false;
		};
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
		window.addEventListener("touchmove", onTouchMove);
		window.addEventListener("touchend", onUp);
		return () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
			window.removeEventListener("touchmove", onTouchMove);
			window.removeEventListener("touchend", onUp);
		};
	}, [updateFromClient]);

	const onMouseDown = (e: RMouseEvent<HTMLDivElement>) => {
		draggingRef.current = true;
		updateFromClient(e.clientX, e.clientY);
	};
	const onTouchStart = (e: RTouchEvent<HTMLDivElement>) => {
		draggingRef.current = true;
		const t = e.touches[0];
		if (t) updateFromClient(t.clientX, t.clientY);
	};

	return (
		<div className="bg-surface-raised/80 rounded-lg shadow-lg overflow-hidden min-w-[120px] select-none touch-none">
			<div className="flex items-center justify-between px-3 py-2 bg-surface-overlay/90 border-b border-line-subtle">
				<span className="text-fg text-sm font-medium">Color Palette</span>
			</div>
			<div className="p-3">
				<div
					ref={padRef}
					role="slider"
					tabIndex={0}
					aria-label="Color picker"
					aria-valuenow={value.a}
					style={{ width: PAD, height: PAD }}
					onMouseDown={onMouseDown}
					onTouchStart={onTouchStart}
					className="relative mx-auto bg-surface-overlay/30 border border-line-strong rounded cursor-pointer overflow-hidden"
				>
					<div
						className="absolute inset-0 z-10 pointer-events-none"
						style={{
							backgroundImage:
								"linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)",
							backgroundSize: "20px 20px",
						}}
					/>
					<div
						className="absolute w-3.5 h-3.5 bg-white border-2 border-line-subtle z-20 pointer-events-none"
						style={{
							left: position.x,
							top: position.y,
							transform: "translate(-50%, -50%)",
							boxShadow: "0 0 0 2px rgba(255,255,255,0.5)",
						}}
					/>
				</div>
			</div>
		</div>
	);
}
