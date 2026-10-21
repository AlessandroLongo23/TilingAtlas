import { create } from "zustand";
import type { Curve, Keyframe } from "@/lib/render/viewPath";
import type { Pose, WorldPt } from "@/lib/render/cameraPose";

// The /play animation timeline (components/animation-timeline.tsx): keyframed views of the flat camera,
// played back on the canvas and rendered to a GIF. Keyframes belong to the tiling they were taken on;
// `scope` names it, and switching to another tiling starts an empty timeline.

export interface TimelineKey extends Keyframe {
	id: number;
	/** A small JPEG of the view, for the track. Null until the capture lands. */
	thumb: string | null;
}

/** What happens between the last keyframe and the end of the timeline. */
export type Ending = "hold" | "return" | "drift";

interface AnimationState {
	open: boolean;
	scope: string | null;
	keys: TimelineKey[];
	duration: number;
	ending: Ending;
	/** Space keyframes in time by how far each move takes the picture, between 0 and the end. */
	byDistance: boolean;
	/** Snap keyframes dragged on the canvas to the tiling's points of interest and directions. */
	snap: boolean;
	toggle: () => void;
	setScope: (scope: string) => void;
	/** Adds a keyframe at `t`, or replaces the one already there. Returns its id. */
	putKey: (t: number, view: Pose) => number;
	setThumb: (id: number, thumb: string) => void;
	moveKey: (id: number, t: number) => void;
	removeKey: (id: number) => void;
	/** Bends the segment that starts at this keyframe (null straightens it back onto the spiral). */
	setBend: (id: number, bend: WorldPt | null) => void;
	/** Replaces a keyframe's view from the canvas overlay; its thumbnail is retaken by the caller. */
	setKeyView: (id: number, view: Pose) => void;
	/** Sets the speed curve of one segment, by the keyframe it starts at, or of all of them. */
	setCurve: (id: number | "all", curve: Curve) => void;
	/** New times for the keyframes, in their order. */
	setTimes: (times: number[]) => void;
	set: (patch: Partial<Pick<AnimationState, "duration" | "ending" | "byDistance" | "snap">>) => void;
}

/** Two keyframes closer than this are the same keyframe: one GIF frame at 25 fps. */
export const KEY_EPS = 0.04;
const DEFAULT_DURATION = 4;

let nextId = 1;
const byTime = (a: TimelineKey, b: TimelineKey) => a.t - b.t;

export const useAnimation = create<AnimationState>()((set, get) => ({
	open: false,
	scope: null,
	keys: [],
	duration: DEFAULT_DURATION,
	ending: "return",
	byDistance: false,
	snap: true,
	toggle: () => set((s) => ({ open: !s.open })),
	setScope: (scope) => {
		if (get().scope !== scope) set({ scope, keys: [], duration: DEFAULT_DURATION });
	},
	putKey: (t, view) => {
		const hit = get().keys.find((k) => Math.abs(k.t - t) < KEY_EPS);
		const id = hit?.id ?? nextId++;
		set((s) => ({
			keys: [
				...s.keys.filter((k) => k.id !== id),
				{ id, t: hit?.t ?? t, view, thumb: null, bend: hit?.bend ?? null, curve: hit?.curve ?? null },
			].sort(byTime),
			duration: Math.max(s.duration, t),
		}));
		return id;
	},
	setThumb: (id, thumb) => set((s) => ({ keys: s.keys.map((k) => (k.id === id ? { ...k, thumb } : k)) })),
	moveKey: (id, t) =>
		set((s) => ({
			keys: s.keys.map((k) => (k.id === id ? { ...k, t } : k)).sort(byTime),
			duration: Math.max(s.duration, t),
		})),
	removeKey: (id) => set((s) => ({ keys: s.keys.filter((k) => k.id !== id) })),
	setBend: (id, bend) => set((s) => ({ keys: s.keys.map((k) => (k.id === id ? { ...k, bend } : k)) })),
	setKeyView: (id, view) => set((s) => ({ keys: s.keys.map((k) => (k.id === id ? { ...k, view } : k)) })),
	setCurve: (id, curve) =>
		set((s) => ({ keys: s.keys.map((k) => (id === "all" || k.id === id ? { ...k, curve } : k)) })),
	setTimes: (times) => set((s) => ({ keys: s.keys.map((k, i) => ({ ...k, t: times[i] ?? k.t })) })),
	set: (patch) => set(patch),
}));

// Dev-only hook, as in configuration.ts: lets a Playwright run inspect and drive the timeline.
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
	((window as unknown as { __stores?: Record<string, unknown> }).__stores ??= {}).animation = useAnimation;
}
