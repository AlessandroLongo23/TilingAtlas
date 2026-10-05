import { create } from "zustand";

// What a connected controller has told the page: which family it is (so the keycaps can show its own
// glyphs), and where its left stick sits (so the on-screen joystick can mirror it). `family` is null
// until the pad is actually used and goes back to null on the next real key press, so the badges
// always name the device in the reader's hands. The polling lives in lib/hooks/useGamepad.ts.

export type PadFamily = "ps" | "xbox";
type PadButton = "cross" | "circle" | "square" | "triangle" | "l1" | "r1" | "l3" | "r3" | "left" | "right";

interface GamepadState {
	family: PadFamily | null;
	/** Left stick as a VelocityPad value: y up, unit magnitude at the rim. */
	stick: { x: number; y: number };
	/** Right stick, horizontal: -1 to 1 past its dead zone. Turns the view about its own axis. */
	twist: number;
	/** The pointer, in viewport px, while pointer mode is on; null otherwise. */
	cursor: { x: number; y: number } | null;
	/** A DualShock / DualSense touchpad is being read (lib/input/padTouch.ts). */
	touchpad: boolean;
}

export const useGamepadState = create<GamepadState>()(() => ({ family: null, stick: { x: 0, y: 0 }, twist: 0, cursor: null, touchpad: false }));

const GLYPHS: Record<PadFamily, Record<PadButton, string>> = {
	ps: { cross: "✕", circle: "○", square: "□", triangle: "△", l1: "L1", r1: "R1", l3: "L3", r3: "R3", left: "◀", right: "▶" },
	xbox: { cross: "A", circle: "B", square: "X", triangle: "Y", l1: "LB", r1: "RB", l3: "LS", r3: "RS", left: "◀", right: "▶" },
};

/** The button that does what each keyboard shortcut does, keyed by the string its keycap shows. Keep
 *  in step with BUTTON_KEYS in lib/hooks/useGamepad.ts. The arrows are the D-pad, which presses them. */
const SHORTCUT_BUTTON: Record<string, PadButton> = {
	R: "square",
	"←": "left",
	"→": "right",
	F: "r3",
	"F or Esc": "r3",
	Esc: "circle",
	C: "triangle",
	V: "triangle",
};

/**
 * What a keycap should read: the shortcut itself on a keyboard; with a controller in use, the glyph of
 * the button mapped to it, or null where no button is (the keycap then hides, as it does on a phone).
 */
export function usePadShortcut(shortcut: string | undefined): string | null | undefined {
	const family = useGamepadState((s) => s.family);
	if (!family || shortcut === undefined) return shortcut;
	const button = SHORTCUT_BUTTON[shortcut];
	return button ? GLYPHS[family][button] : null;
}

/** The glyph of one button on the controller in use, or null on a keyboard. */
export function usePadGlyph(button: PadButton): string | null {
	const family = useGamepadState((s) => s.family);
	return family ? GLYPHS[family][button] : null;
}
