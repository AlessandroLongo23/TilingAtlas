"use client";

// The transport: a floating bar over the canvas, video-player style.
//
// It lives here rather than in the sidebar because it is the one control you reach for constantly and
// the only one that needs to be within a hand's travel of what it is driving. Everything that configures
// the run stays in the sidebar; this is play, step, reseed and the rate — the four things you touch while
// watching.

import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Shuffle, SkipForward } from "lucide-react";
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
}

export function AutomataTransport({ disabled = false, onPrev, onRandom, onNext }: AutomataTransportProps) {
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
		<FloatingToolbar className={cn("bottom-6", disabled && "opacity-60")}>
			<ToolbarButton label="Previous tiling" shortcut="←" onClick={onPrev}>
				<ChevronLeft size={16} />
			</ToolbarButton>
			<ToolbarButton label="Next tiling" shortcut="→" onClick={onNext}>
				<ChevronRight size={16} />
			</ToolbarButton>
			<ToolbarButton label="Random tiling" shortcut="R" onClick={onRandom}>
				<Shuffle size={15} />
			</ToolbarButton>
			<ToolbarDivider />
			{/* The one filled button in the bar: running the board is what this page is for. */}
			<ToolbarButton label={running ? "Pause" : "Run"} shortcut="Space" primary onClick={toggleRunning} disabled={disabled}>
				{running ? <Pause size={15} /> : <Play size={15} />}
				{running ? "Pause" : "Run"}
			</ToolbarButton>
			<ToolbarButton label="Step one generation" shortcut="." onClick={stepOnce} disabled={disabled}>
				<SkipForward size={16} />
			</ToolbarButton>
			<ToolbarButton label="New random soup" shortcut="N" onClick={() => reseed()} disabled={disabled}>
				<RotateCcw size={16} />
			</ToolbarButton>
			<ToolbarDivider />
			<label className="flex items-center gap-2 px-2">
				<RangeInput
					value={idx}
					min={0}
					max={SPEEDS.length - 1}
					disabled={disabled}
					onChange={(v) => set("speed", SPEEDS[v])}
					className="w-28"
					aria-label="Generations per second"
				/>
				{/* Tabular width so the bar does not twitch as the number changes under a drag. */}
				<span className="w-[3.75rem] text-[11px] font-mono text-fg-secondary tabular-nums">{speed} gen/s</span>
			</label>
			{/* The canvas gestures, which have no control to hang a title off. They sit here because the
			    board is what they drive, and this bar is the only chrome floating over it. */}
			<ToolbarDivider />
			<span className="flex h-8 items-center px-2 [&_button]:opacity-80">
				<InfoDot side="top" label="How to drive the board">
					<p>Drag to pan, scroll to zoom, shift-click a tile to flip it.</p>
					<p>
						<span className="font-mono text-fg">Space</span> runs and pauses,{" "}
						<span className="font-mono text-fg">.</span> steps one generation,{" "}
						<span className="font-mono text-fg">N</span> reseeds the soup.
					</p>
					<p>
						<span className="font-mono text-fg">R</span> picks a random tiling,{" "}
						<span className="font-mono text-fg">← →</span> step through the catalogue,{" "}
						<span className="font-mono text-fg">T U B</span> jump to a sidebar tab.
					</p>
				</InfoDot>
			</span>
		</FloatingToolbar>
	);
}
