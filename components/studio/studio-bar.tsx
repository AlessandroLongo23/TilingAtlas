"use client";

import { useEffect } from "react";
import type { ComponentType } from "react";
import {
	Combine,
	MousePointer2,
	Move,
	Paintbrush,
	Redo2,
	RotateCcw,
	Scissors,
	Spline,
	SquareDashed,
	Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { ToggleButton } from "@/components/ui/toggle-button";
import { Tooltip } from "@/components/ui/tooltip";
import { isTypingTarget } from "@/lib/hooks/useKeyShortcuts";
import type { PeriodMode, StudioTool } from "@/lib/studio/types";
import { useConfiguration } from "@/stores/configuration";
import { canRedo, canReset, canUndo, useStudio } from "@/stores/studio";

// The editor's tool strip, along the bottom of the /play canvas while `studioActive` is up.
//
// Position and chrome are the canvas overlay's, not the sidebar's (components/fullscreen-toggle.tsx and
// the /play top-right column carry the same classes), so turning the editor on reads as the same app
// gaining a mode. It renders nothing when the editor is down, which is what lets the parent mount it
// unconditionally and keep the mount from churning on every toggle.
//
// THE KEYMAP LIVES HERE. The keys ARE the tools: a tool added to the table below brings its key with it
// and there is no second list to keep in step.

const TOOLS: {
	value: StudioTool;
	icon: ComponentType<{ className?: string }>;
	label: string;
	key: string;
}[] = [
	{ value: "select", icon: MousePointer2, label: "Select / inspect", key: "1" },
	{ value: "merge", icon: Combine, label: "Merge tiles (drag across them)", key: "2" },
	{ value: "cut", icon: Scissors, label: "Cut (click construction points)", key: "3" },
	{ value: "move", icon: Move, label: "Move points", key: "4" },
	{ value: "edge", icon: Spline, label: "Edge decoration", key: "5" },
	{ value: "paint", icon: Paintbrush, label: "Recolor", key: "6" },
];

/** Key to tool, derived from the table above so the two can never disagree. */
const TOOL_BY_KEY = new Map(TOOLS.map((t) => [t.key, t.value]));

/**
 * Switch tool, from a click or from a number key.
 *
 * Clears two things with it. The cut path is an UNCOMMITTED edit, and lib/stores/studio.ts says plainly
 * it must not survive a tool change; the rejection describes the gesture the last tool refused, so under
 * the next tool it is a message about something the user can no longer do.
 */
const pickTool = (value: StudioTool) =>
	useStudio.getState().set({ tool: value, cutPath: [], rejection: null });

const setEditor = (on: boolean) => useConfiguration.getState().set({ studioActive: on });

const WALLPAPER_HELP =
	"Carries every edit through the point group as well, so the result keeps the tiling's symmetry.";

interface StudioBarProps {
	/**
	 * Why `wallpaper` is unavailable here, or undefined when it is available. That mode needs
	 * `SymmetryData`, which is null for star tilings and for curved tiles; with none, the option disables
	 * itself and says why instead of repeating an edit through a point group nobody computed.
	 */
	wallpaperDisabledReason?: string;
	/**
	 * May this tiling be edited at all: the same gate the sidebar's entry button takes (flat surface,
	 * straight edges). Passed in because the gate is a question about the SELECTED RECORD, which this
	 * component has no business knowing; it is here only so `E` can open the editor from the keyboard.
	 *
	 * Omit it and `E` is not bound, leaving the parent free to own that key instead. The sidebar button
	 * cannot own it: the Options tab is unmounted whenever the Catalogue tab is the one showing
	 * (components/sidebar/tilings-tab.tsx), and a key that works only on one tab is worse than none.
	 */
	canEdit?: boolean;
}

export function StudioBar({ wallpaperDisabledReason, canEdit }: StudioBarProps) {
	const active = useConfiguration((s) => s.studioActive);
	// One boolean per subscription. A pointer move inside the editor changes `cutPath` and the rejection
	// dozens of times a second, and none of that reaches this component.
	const tool = useStudio((s) => s.tool);
	const periodMode = useStudio((s) => s.periodMode);
	// The same field components/studio/studio-canvas.tsx draws off, so the button cannot disagree with
	// the canvas about whether the cell is outlined.
	const showLattice = useStudio((s) => s.showLattice);
	const undoable = useStudio(canUndo);
	const redoable = useStudio(canRedo);
	const resettable = useStudio(canReset);

	// 1-6 are the NAV's route shortcuts (components/nav.tsx pushes a route on each), so this listener runs
	// in the CAPTURE phase and stops the event dead: while the editor is up those keys are the editor's.
	// _play-client already does the same interception for P on the freedraw boards, and ThemeToggle for
	// Shift+T. They are bound only while `studioActive`, so nav keeps its keys the rest of the time; the
	// one key bound with the editor down is E, which opens it.
	useEffect(() => {
		if (!active && !canEdit) return;
		const onKey = (e: KeyboardEvent) => {
			if (isTypingTarget(e)) return;
			// Editor down: E is the one key it claims, and only where the sidebar offers the button.
			if (!active) {
				if ((e.key !== "e" && e.key !== "E") || e.metaKey || e.ctrlKey || e.altKey) return;
				e.preventDefault();
				e.stopImmediatePropagation();
				setEditor(true);
				return;
			}
			const studio = useStudio.getState();
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
				e.preventDefault();
				e.stopImmediatePropagation();
				if (e.shiftKey) studio.redo();
				else studio.undo();
				return;
			}
			// Every other binding here is unmodified, so Cmd/Ctrl/Alt combos stay the browser's.
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (e.key === "Escape") {
				// Esc leaves the EDITOR, and only the editor. In immersive mode it also exits fullscreen
				// (useImmersiveShortcuts), and one press cannot do both: you leave the mode you are in, so a
				// second press exits fullscreen.
				e.preventDefault();
				e.stopImmediatePropagation();
				setEditor(false);
				return;
			}
			const next = TOOL_BY_KEY.get(e.key);
			if (!next) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			pickTool(next);
		};
		window.addEventListener("keydown", onKey, { capture: true });
		return () => window.removeEventListener("keydown", onKey, { capture: true });
	}, [active, canEdit]);

	if (!active) return null;

	return (
		<div
			// Along the BOTTOM, centred (AL, 2026-09-21). The left edge put it against the sidebar, where
			// it read as more sidebar; the bottom is where a tool bar is looked for and it leaves the
			// tiling unobstructed. The palette strip sits just above it when the paint tool is up.
			className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 rounded-lg p-2 bg-surface-overlay/80 backdrop-blur-sm border border-line"
			role="toolbar"
			aria-label="Editor tools"
			aria-orientation="horizontal"
		>
			{TOOLS.map((t) => (
				<Tooltip key={t.value} label={t.label} shortcut={t.key} side="top" delay={0}>
					<ToggleButton
						size="sm"
						pressed={tool === t.value}
						onPressedChange={() => pickTool(t.value)}
						icon={t.icon}
						aria-label={t.label}
						classes="h-8 w-8 px-0"
					/>
				</Tooltip>
			))}

			<div className="mx-0.5 self-stretch border-l border-line" />

			{/* History and the lattice overlay. Undo/Redo/Reset read their enabled state off the history
			    selectors, so a button is live exactly when it has something to do. */}
			<Tooltip label="Undo" shortcut="Cmd/Ctrl + Z" side="top" delay={0}>
				<Button
					variant="ghost"
					size="icon"
					icon={Undo2}
					aria-label="Undo"
					disabled={!undoable}
					onClick={() => useStudio.getState().undo()}
				/>
			</Tooltip>
			<Tooltip label="Redo" shortcut="Shift + Cmd/Ctrl + Z" side="top" delay={0}>
				<Button
					variant="ghost"
					size="icon"
					icon={Redo2}
					aria-label="Redo"
					disabled={!redoable}
					onClick={() => useStudio.getState().redo()}
				/>
			</Tooltip>
			<Tooltip label="Back to the catalogued tiling" side="top" delay={0}>
				<Button
					variant="ghost"
					size="icon"
					icon={RotateCcw}
					aria-label="Reset the edit"
					disabled={!resettable}
					onClick={() => useStudio.getState().reset()}
				/>
			</Tooltip>
			{/* One switch for both period overlays. Which one appears follows the mode below: the basis
			    cell under Lattice, the group's axes, centres and fundamental domain under Wallpaper. */}
			<Tooltip
				label={periodMode === "wallpaper" ? "Show the group's structure" : "Show the period cell"}
				side="top"
				delay={0}
			>
				<ToggleButton
					size="sm"
					pressed={showLattice}
					onPressedChange={(next) => useStudio.getState().set({ showLattice: next })}
					icon={SquareDashed}
					aria-label="Period overlay"
					classes="h-8 w-8 px-0"
				/>
			</Tooltip>

			<div className="mx-0.5 self-stretch border-l border-line" />

			{/* What an edit repeats under. Side by side now that the strip runs horizontally. */}
			<span className="px-1 text-[10px] uppercase tracking-wide text-fg-muted whitespace-nowrap">
				Repeats under
			</span>
			<ButtonGroup
				wrap={false}
				gap="gap-1"
				selected={periodMode}
				onChange={(v: PeriodMode) => useStudio.getState().set({ periodMode: v })}
				options={[
					{
						value: "lattice" as PeriodMode,
						label: "Lattice",
						classes: "whitespace-nowrap",
						tooltip: "Folds every edit onto the translation lattice alone. Always available.",
						tooltipSide: "top",
					},
					{
						// The reason this mode is unavailable lives in the tooltip and nowhere else. Printed on
						// the bar it was three lines of prose that doubled the strip's height; ButtonGroup keeps a
						// tooltip-bearing disabled option hoverable so the reason is one hover away.
						value: "wallpaper" as PeriodMode,
						label: "Wallpaper group",
						classes: "whitespace-nowrap",
						disabled: !!wallpaperDisabledReason,
						tooltip: wallpaperDisabledReason ?? WALLPAPER_HELP,
						tooltipSide: "top",
					},
				]}
			/>
		</div>
	);
}
