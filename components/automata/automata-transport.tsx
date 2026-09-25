"use client";

// The transport: a floating bar over the canvas, video-player style.
//
// It lives here rather than in the sidebar because it is the one control you reach for constantly and
// the only one that needs to be within a hand's travel of what it is driving. Everything that configures
// the run stays in the sidebar; this is play, step, reseed and the rate — the four things you touch while
// watching.
//
// On a phone the bar is a full-width tray of two rows over the dock sheet: the run controls on top
// (with Paint, the finger's Shift+click, and the gesture help), then the catalogue steps beside the
// speed slider. One row of it is 560px, which no phone has. The DOM order stays the desktop's; the
// rows are `order` alone, so the desktop bar is untouched.

import { Brush, ChevronLeft, ChevronRight, Dices, Pause, Play, RotateCcw, Shuffle, SkipForward } from "lucide-react";
import { InfoDot } from "@/components/ui/info-dot";
import { RangeInput } from "@/components/ui/range-input";
import { FloatingToolbar, ToolbarButton, ToolbarDivider } from "@/components/ui/floating-toolbar";
import { useAutomata } from "@/lib/stores/automata";
import { cn } from "@/lib/utils/cn";

/** Generations per second, on a log-ish ladder — one drag should reach both 1/s and 240/s. */
const SPEEDS = [1, 2, 4, 8, 12, 20, 30, 45, 60, 90, 120, 180, 240];

interface AutomataTransportProps {
	disabled?: boolean;
	/** Stepping through the catalogue, as on /play's toolbar. */
	onPrev?: () => void;
	onRandom?: () => void;
	onNext?: () => void;
	/** Phone paint mode: a tap flips the tile under it. Off where painting has no meaning (the 3D view). */
	paint?: boolean;
	onPaint?: (on: boolean) => void;
	paintAvailable?: boolean;
}

/** Phone rows: 1 is the run controls, 2 a line break, 3 the catalogue steps and the speed. */
const ROW1 = "max-md:order-1";
const ROW2 = "max-md:order-3";

export function AutomataTransport({
	disabled = false,
	onPrev,
	onRandom,
	onNext,
	paint = false,
	onPaint,
	paintAvailable = true,
}: AutomataTransportProps) {
	const running = useAutomata((s) => s.running);
	const speed = useAutomata((s) => s.speed);
	const set = useAutomata((s) => s.set);
	const toggleRunning = useAutomata((s) => s.toggleRunning);
	const stepOnce = useAutomata((s) => s.stepOnce);
	const reseed = useAutomata((s) => s.reseed);

	// Nearest ladder index, so an arbitrary stored speed (a URL, a previous session) still lands on the slider.
	const idx = SPEEDS.reduce(
		(best, v, i) => (Math.abs(v - speed) < Math.abs(SPEEDS[best] - speed) ? i : best),
		0,
	);

	return (
		<FloatingToolbar
			className={cn(
				"bottom-6 max-md:w-[calc(100%-32px)] max-md:flex-wrap",
				disabled && "opacity-60",
			)}
		>
			<ToolbarButton label="Previous tiling" shortcut="←" onClick={onPrev} className={ROW2}>
				<ChevronLeft size={16} />
			</ToolbarButton>
			<ToolbarButton label="Next tiling" shortcut="→" onClick={onNext} className={ROW2}>
				<ChevronRight size={16} />
			</ToolbarButton>
			<ToolbarButton label="Random tiling" shortcut="R" onClick={onRandom} className={ROW2}>
				<Shuffle size={15} />
			</ToolbarButton>
			<span className="contents max-md:hidden">
				<ToolbarDivider />
			</span>
			{/* The one filled button in the bar: running the board is what this page is for. */}
			<ToolbarButton
				label={running ? "Pause" : "Run"}
				shortcut="Space"
				primary
				onClick={toggleRunning}
				disabled={disabled}
				className={cn(ROW1, "max-md:flex-1")}
			>
				{running ? <Pause size={15} /> : <Play size={15} />}
				{running ? "Pause" : "Run"}
			</ToolbarButton>
			<ToolbarButton label="Step one generation" shortcut="." onClick={stepOnce} disabled={disabled} className={ROW1}>
				<SkipForward size={16} />
			</ToolbarButton>
			{/* On a phone the reseed wears dice: a counter-clockwise arrow there would read as the Reset view
			    button in the corner above it. */}
			<ToolbarButton label="New random soup" shortcut="N" onClick={() => reseed()} disabled={disabled} className={ROW1}>
				<RotateCcw size={16} className="max-md:hidden" />
				<Dices size={16} className="md:hidden" />
			</ToolbarButton>
			{/* Phone only: a finger has no Shift, so painting is a mode. While it is on, a tap flips a tile
			    and a drag still pans. */}
			<ToolbarButton
				label="Paint: tap a tile to flip it"
				aria-pressed={paint}
				onClick={() => onPaint?.(!paint)}
				disabled={disabled || !paintAvailable}
				className={cn("hidden max-md:flex max-md:aria-pressed:bg-fg max-md:aria-pressed:text-fg-inverse", ROW1)}
			>
				<Brush size={16} />
			</ToolbarButton>
			<span className="contents max-md:hidden">
				<ToolbarDivider />
			</span>
			<span aria-hidden className="hidden max-md:order-2 max-md:block max-md:basis-full" />
			<label className={cn("flex items-center gap-2 px-2", ROW2, "max-md:min-w-0 max-md:flex-1")}>
				<RangeInput
					value={idx}
					min={0}
					max={SPEEDS.length - 1}
					disabled={disabled}
					onChange={(v) => set("speed", SPEEDS[v])}
					className="w-28 max-md:w-auto max-md:min-w-0 max-md:flex-1"
					aria-label="Generations per second"
				/>
				{/* Tabular width so the bar does not twitch as the number changes under a drag. */}
				<span className="w-[3.75rem] text-[11px] font-mono text-fg-secondary tabular-nums max-md:shrink-0 max-md:text-xs">
					{speed} gen/s
				</span>
			</label>
			{/* The canvas gestures, which have no control to hang a title off. They sit here because the
			    board is what they drive, and this bar is the only chrome floating over it. */}
			<span className="contents max-md:hidden">
				<ToolbarDivider />
			</span>
			<span className={cn("flex h-8 items-center px-2 [&_button]:opacity-80", ROW1, "max-md:h-11 max-md:w-11 max-md:justify-center max-md:px-0")}>
				<InfoDot side="top" label="How to drive the board">
					<p className="max-md:hidden">Drag to pan, scroll to zoom, shift-click a tile to flip it.</p>
					<p className="md:hidden">
						Drag to pan, pinch to zoom, double-tap to recentre. Turn on the brush and tap a tile to flip it.
					</p>
					<p className="max-md:hidden">
						<span className="font-mono text-fg">Space</span> runs and pauses,{" "}
						<span className="font-mono text-fg">.</span> steps one generation,{" "}
						<span className="font-mono text-fg">N</span> reseeds the soup.
					</p>
					<p className="max-md:hidden">
						<span className="font-mono text-fg">R</span> picks a random tiling,{" "}
						<span className="font-mono text-fg">← →</span> step through the catalogue,{" "}
						<span className="font-mono text-fg">T U B</span> jump to a sidebar tab.
					</p>
				</InfoDot>
			</span>
		</FloatingToolbar>
	);
}
