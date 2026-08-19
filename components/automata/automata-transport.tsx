"use client";

// The transport: a floating bar over the canvas, video-player style.
//
// It lives here rather than in the sidebar because it is the one control you reach for constantly and
// the only one that needs to be within a hand's travel of what it is driving. Everything that configures
// the run stays in the sidebar; this is play, step, reseed and the rate — the four things you touch while
// watching.

import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { InfoDot } from "@/components/ui/info-dot";
import { useAutomata } from "@/lib/stores/automata";
import { cn } from "@/lib/utils/cn";

const BTN = cn(
	"grid place-items-center rounded-control text-fg-secondary transition-colors",
	"hover:bg-surface-sunken dark:hover:bg-surface-overlay hover:text-fg cursor-pointer",
	"disabled:opacity-40 disabled:pointer-events-none",
	"focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-fg",
);

/** Generations per second, on a log-ish ladder — one drag should reach both 1/s and 240/s. */
const SPEEDS = [1, 2, 4, 8, 12, 20, 30, 45, 60, 90, 120, 180, 240];

export function AutomataTransport({ disabled = false }: { disabled?: boolean }) {
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
		<div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
			<div
				className={cn(
					// Opaque, not translucent: the canvas underneath is high-contrast black-and-white noise, and
					// a frosted bar over it reads as mud. The shadow is what lifts it off the board.
					"pointer-events-auto flex items-center gap-1 rounded-lg border border-line-strong bg-surface-chrome px-2 py-1.5 shadow-lg",
					disabled && "opacity-50",
				)}
			>
				<button
					type="button"
					// The one solid fill in the bar, matching Button's `primary`: hierarchy by ink, no brand hue.
					className={cn(BTN, "h-9 w-9 bg-fg text-fg-inverse hover:bg-fg/85 hover:text-fg-inverse")}
					onClick={toggleRunning}
					disabled={disabled}
					title={running ? "Pause (space)" : "Run (space)"}
					aria-label={running ? "Pause" : "Run"}
				>
					{running ? <Pause size={16} /> : <Play size={16} />}
				</button>
				<button
					type="button"
					className={cn(BTN, "h-9 w-9")}
					onClick={stepOnce}
					disabled={disabled}
					title="Step one generation (.)"
					aria-label="Step one generation"
				>
					<SkipForward size={16} />
				</button>
				<button
					type="button"
					className={cn(BTN, "h-9 w-9")}
					onClick={() => reseed()}
					disabled={disabled}
					title="New random soup (N)"
					aria-label="New random soup"
				>
					<RotateCcw size={16} />
				</button>

				<div className="mx-1 h-6 w-px bg-line" />

				<label className="flex items-center gap-2 pl-1 pr-2">
					<span className="sr-only">Generations per second</span>
					<input
						type="range"
						min={0}
						max={SPEEDS.length - 1}
						step={1}
						value={idx}
						disabled={disabled}
						onChange={(e) => set("speed", SPEEDS[Number(e.target.value)])}
						className="w-28 cursor-pointer accent-fg"
					/>
					{/* Tabular width so the bar does not twitch as the number changes under a drag. */}
					<span className="w-[4.5rem] text-right text-[11px] font-mono text-fg-muted tabular-nums">
						{speed} gen/s
					</span>
				</label>

				{/* The canvas gestures, which have no control to hang a title off. They sit here because the
				    board is what they drive, and this bar is the only chrome floating over it. */}
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
			</div>
		</div>
	);
}
