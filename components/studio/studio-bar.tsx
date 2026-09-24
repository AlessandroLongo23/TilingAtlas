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
import { InfoDot } from "@/components/ui/info-dot";
import { ToolbarButton } from "@/components/ui/floating-toolbar";
import { Tooltip } from "@/components/ui/tooltip";
import { isTypingTarget } from "@/lib/hooks/useKeyShortcuts";
import type { PeriodMode, StudioTool } from "@/lib/studio/types";
import { useConfiguration } from "@/stores/configuration";
import { canRedo, canReset, canUndo, useStudio } from "@/stores/studio";

// The editor's controls. They are not a bar of their own: /play's canvas toolbar takes them in while
// `studioActive` is up (AL, 2026-09-24), so editing ADDS to the toolbar and link, export and fullscreen
// stay where they are. Three pieces, in the order the toolbar lays them out: history, tools, and what an
// edit repeats under.
//
// THE KEYMAP LIVES HERE (useStudioKeys). The keys ARE the tools: a tool added to the table below brings
// its key with it and there is no second list to keep in step.

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

/**
 * The editor's keys: E opens it where `canEdit` holds, and while it is up Esc leaves, 1-6 pick a tool
 * and Cmd/Ctrl+Z / Shift+Cmd/Ctrl+Z step the history.
 *
 * `canEdit` is the same gate the toolbar's Edit button takes (flat surface, straight edges), passed in
 * because it is a question about the SELECTED RECORD, which this module has no business knowing.
 */
export function useStudioKeys(canEdit: boolean) {
	const active = useConfiguration((s) => s.studioActive);
	// 1-6 are the NAV's route shortcuts (components/nav.tsx pushes a route on each), so this listener runs
	// in the CAPTURE phase and stops the event dead: while the editor is up those keys are the editor's.
	// _play-client already does the same interception for P on the freedraw boards, and ThemeToggle for
	// Shift+T. They are bound only while `studioActive`, so nav keeps its keys the rest of the time; the
	// one key bound with the editor down is E, which opens it.
	useEffect(() => {
		if (!active && !canEdit) return;
		const onKey = (e: KeyboardEvent) => {
			if (isTypingTarget(e)) return;
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
}

/** Undo, redo, reset. Each is live exactly when the history has something for it to do. */
export function StudioHistory() {
	const undoable = useStudio(canUndo);
	const redoable = useStudio(canRedo);
	const resettable = useStudio(canReset);
	return (
		<>
			<ToolbarButton label="Undo" shortcut="Cmd/Ctrl + Z" disabled={!undoable} onClick={() => useStudio.getState().undo()}>
				<Undo2 size={16} />
			</ToolbarButton>
			<ToolbarButton label="Redo" shortcut="Shift + Cmd/Ctrl + Z" disabled={!redoable} onClick={() => useStudio.getState().redo()}>
				<Redo2 size={16} />
			</ToolbarButton>
			<ToolbarButton label="Back to the catalogued tiling" disabled={!resettable} onClick={() => useStudio.getState().reset()}>
				<RotateCcw size={16} />
			</ToolbarButton>
		</>
	);
}

/** The six tools, one pressed. */
export function StudioTools() {
	// One subscription: a pointer move inside the editor changes `cutPath` and the rejection dozens of
	// times a second, and none of that reaches the toolbar.
	const tool = useStudio((s) => s.tool);
	return (
		<>
			{TOOLS.map((t) => (
				<ToolbarButton key={t.value} label={t.label} shortcut={t.key} aria-pressed={tool === t.value} onClick={() => pickTool(t.value)}>
					<t.icon className="h-4 w-4" />
				</ToolbarButton>
			))}
		</>
	);
}

const PERIOD_HELP = (
	<>
		<p>
			<span className="font-medium text-fg">Lattice</span>{" "}repeats every edit under the translations alone. Always
			available.
		</p>
		<p>
			<span className="font-medium text-fg">Wallpaper group</span>{" "}carries it through the point group as well, so the
			result keeps the tiling&rsquo;s symmetry.
		</p>
		<p>
			<span className="font-medium text-fg">Period cell</span>{" "}shows what an edit repeats over: the basis cell under
			Lattice, the group&rsquo;s axes, centres and fundamental domain under Wallpaper group.
		</p>
	</>
);

/**
 * What an edit repeats under, and the overlay that shows it. `wallpaperDisabledReason` is set where the
 * tiling has no computed wallpaper group (star tilings, curved tiles): that option then disables itself
 * and its tooltip says why.
 */
export function StudioPeriod({ wallpaperDisabledReason }: { wallpaperDisabledReason?: string }) {
	const periodMode = useStudio((s) => s.periodMode);
	// The same field components/studio/studio-canvas.tsx draws off, so the button cannot disagree with
	// the canvas about whether the cell is outlined.
	const showLattice = useStudio((s) => s.showLattice);
	const mode = (m: PeriodMode, label: string, disabledReason?: string) => {
		const button = (
			<button
				type="button"
				aria-pressed={periodMode === m}
				aria-disabled={disabledReason ? true : undefined}
				onClick={() => !disabledReason && useStudio.getState().set({ periodMode: m })}
				className={
					"ta-tab h-7 whitespace-nowrap px-2.5 text-[13px] font-medium transition-colors " +
					(periodMode === m ? "text-fg" : disabledReason ? "cursor-not-allowed text-fg-disabled" : "text-fg-muted hover:text-fg")
				}
			>
				{label}
			</button>
		);
		// A disabled option keeps its hover, so the reason it is unavailable is one hover away.
		return disabledReason ? (
			<Tooltip label={disabledReason} side="top" delay={0}>
				{button}
			</Tooltip>
		) : (
			button
		);
	};
	return (
		<>
			<div className="ta-seg flex">
				{mode("lattice", "Lattice")}
				{mode("wallpaper", "Wallpaper group", wallpaperDisabledReason)}
			</div>
			<ToolbarButton
				label="Show the period cell"
				aria-pressed={showLattice}
				onClick={() => useStudio.getState().set({ showLattice: !showLattice })}
				className="w-auto gap-1.5 px-2.5"
			>
				<SquareDashed size={15} />
				Period cell
			</ToolbarButton>
			<span className="px-1">
				<InfoDot side="top" label="What an edit repeats under">
					{PERIOD_HELP}
				</InfoDot>
			</span>
		</>
	);
}

