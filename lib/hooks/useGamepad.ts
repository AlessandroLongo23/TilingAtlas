"use client";

import { useEffect, useRef } from "react";
import { useConfiguration } from "@/stores/configuration";
import { useGamepadState, type PadFamily } from "@/lib/stores/gamepad";
import { drivePlayPan, endPinchPlayView, pinchPlayView } from "@/lib/render/playView";
import { requestViewReset } from "@/lib/render/touchGestures";
import { scrollParent } from "@/lib/hooks/useGridArrowNav";
import { padPosition, padVelocity } from "@/lib/render/velocityPad";
import { openTouchpad } from "@/lib/input/padTouch";

// A game controller, on every page of the app (Gamepad API, standard mapping). There are two places the
// reader can be: on the view, where the D-pad and the face buttons press the keys the keyboard already
// has, so every guard in a page's key handlers applies to them unchanged; and in the side panel, which
// Triangle enters and Circle leaves, where the D-pad walks the controls. L1 / R1 step through the
// sections and the right stick scrolls, wherever the reader is. On /play the sticks and triggers also
// drive the shared view through the functions the touch gestures use. Share / View turns on a pointer
// for everything else: the left stick (or a DualShock's touchpad) moves it and Cross clicks and drags
// with it. The loop runs only while a pad is connected.

// Standard-mapping button indices.
const B = { cross: 0, circle: 1, square: 2, triangle: 3, l1: 4, r1: 5, l2: 6, r2: 7, share: 8, l3: 10, r3: 11, up: 12, down: 13, left: 14, right: 15, touchpad: 17 };
/** Button → the key it presses. Keep in step with SHORTCUT_BUTTON in lib/stores/gamepad.ts. */
const BUTTON_KEYS: [number, string][] = [
	[B.square, "r"],
	[B.r3, "f"],
	[B.left, "ArrowLeft"],
	[B.right, "ArrowRight"],
	[B.up, "ArrowUp"],
	[B.down, "ArrowDown"],
];

const AXIS_DEAD = 0.15;
const REST = { x: 0, y: 0 };
const SPIN_DEG_S = 120; // view rotation at full right-stick deflection
const ZOOM_E_S = 1.5; // zoom at a full trigger, in e-folds per second
const CURSOR_PX_S = 1100; // pointer speed at full left-stick deflection
const TOUCH_GAIN = 0.9; // pointer px per touchpad unit (the pad is 1920 units across)
const SCROLL_PX_S = 1600; // page scroll at full right-stick deflection
const ANGLE_DEG_S = 30; // Islamic angle at a full trigger, in the disk (which has no zoom)
const EASE_S = 0.15; // spin and zoom ramp, so neither starts or stops on a step
const REPEAT_DELAY_MS = 350;
const REPEAT_MS = 80;
const SWEEP_STEPS = 40; // a held D-pad crosses a slider's range in about this many repeats

const pressKey = (key: string) => document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

const familyOf = (id: string): PadFamily => (/054c|dualsense|dualshock|playstation/i.test(id) ? "ps" : "xbox");

// --- D-pad focus, scoped to the page's side panel ---

const scope = () => [...document.querySelectorAll<HTMLElement>("aside")].find((el) => el.getClientRects().length > 0);
let lastFocus: HTMLElement | null = null; // where the reader was in the panel, to return to
const inScope = (el: Element | null): el is HTMLElement => !!el && el !== document.body && !!scope()?.contains(el);

function focusables(): HTMLElement[] {
	const root = scope();
	if (!root) return [];
	const all = root.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]');
	// Not Radix's tablist or tab panel: they take focus only to pass it on or to be scrolled by keys.
	return [...all].filter((el) => el.tabIndex >= 0 && !/^tab(list|panel)$/.test(el.getAttribute("role") ?? "") && el.getClientRects().length > 0 && (el.checkVisibility?.({ visibilityProperty: true }) ?? true));
}

const focus = (el: HTMLElement | undefined) => {
	if (!el) return;
	el.focus({ preventScroll: true });
	el.scrollIntoView({ block: "nearest" });
	lastFocus = el;
};

/** The nearest control from `from` in a direction. One whose extent overlaps `from`'s across the
 *  direction counts as in line, so a full-width slider is the next row down from either column. */
function neighbour(from: HTMLElement, dx: number, dy: number): HTMLElement | undefined {
	const a = from.getBoundingClientRect();
	const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
	let best: HTMLElement | undefined;
	let bestScore = Infinity;
	for (const el of focusables()) {
		if (el === from) continue;
		const b = el.getBoundingClientRect();
		const along = (b.left + b.width / 2 - ax) * dx + (b.top + b.height / 2 - ay) * dy;
		const across = dy ? Math.max(0, b.left - a.right, a.left - b.right) : Math.max(0, b.top - a.bottom, a.top - b.bottom);
		if (along < 4) continue;
		const score = along + 3 * across;
		if (score < bestScore) {
			bestScore = score;
			best = el;
		}
	}
	return best;
}

const isRange = (el: Element | null): el is HTMLInputElement => el instanceof HTMLInputElement && (el.type === "range" || el.type === "number");
const rangeOf = (el: HTMLInputElement) => {
	const min = Number(el.min || 0), max = Number(el.max || 100);
	return { min, max, step: Number(el.step) || (max - min) / 100 };
};

/** Write a slider's value the way a hand would, snapped to its step and kept in its range. */
function setRange(el: HTMLInputElement, value: number): void {
	const { min, max, step } = rangeOf(el);
	const next = Math.min(max, Math.max(min, min + Math.round((value - min) / step) * step));
	// The prototype's setter, not the element's: React shadows the latter to track the value, and a
	// write it has seen fires no onChange.
	Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, String(+next.toFixed(6)));
	el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Left / right on a control that holds a value. False when the control has none, so the D-pad moves on. */
function adjust(el: HTMLElement, sign: number, repeat: boolean): boolean {
	if (isRange(el)) {
		const { min, max, step } = rangeOf(el);
		const stride = repeat ? Math.max(1, Math.round((max - min) / step / SWEEP_STEPS)) * step : step;
		setRange(el, Number(el.value) + sign * stride);
		return true;
	}
	const expanded = el.getAttribute("aria-expanded");
	if (expanded !== null) {
		if ((expanded === "true") === sign > 0) return false;
		el.click();
		return true;
	}
	if (el.getAttribute("role") === "slider" || el instanceof SVGElement) {
		// A drawn control (hue ring, Hankin handle) steps on its own arrow keys. The event must not reach
		// the window, where /play reads an arrow as previous / next tiling.
		const stop = (e: Event) => e.stopPropagation();
		document.addEventListener("keydown", stop, { once: true });
		el.dispatchEvent(new KeyboardEvent("keydown", { key: sign > 0 ? "ArrowRight" : "ArrowLeft", bubbles: true }));
		document.removeEventListener("keydown", stop);
		return true;
	}
	return false;
}

function dpad(cur: HTMLElement, button: number, repeat: boolean): void {
	const dx = button === B.right ? 1 : button === B.left ? -1 : 0;
	const dy = button === B.down ? 1 : button === B.up ? -1 : 0;
	if (dx && adjust(cur, dx, repeat)) return;
	focus(neighbour(cur, dx, dy));
}

/** Triangle: into the panel, back where the reader left it; from inside, on to its next tab. */
function triangle(): void {
	const all = focusables();
	if (!inScope(document.activeElement)) return focus(lastFocus && all.includes(lastFocus) ? lastFocus : all[0]);
	const tabs = [...(scope()?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])];
	if (tabs.length < 2) return;
	// Radix selects a tab when it takes the focus, and not on a click.
	tabs[(tabs.findIndex((t) => t.getAttribute("aria-selected") === "true") + 1) % tabs.length].focus();
	setTimeout(() => focus(focusables().find((el) => el.getAttribute("role") !== "tab")), 50);
}

/** The pane the right stick scrolls: the one under the pointer, else the focused control's in the
 *  panel, else the one mid-screen. */
function scrollPane(cursor: { x: number; y: number } | null): Element | null {
	const cur = document.activeElement;
	const from = cursor ? document.elementFromPoint(cursor.x, cursor.y) : inScope(cur) ? cur : document.elementFromPoint(innerWidth / 2, innerHeight / 2);
	let pane = from && scrollParent(from);
	while (pane && pane.scrollHeight <= pane.clientHeight) pane = scrollParent(pane);
	return pane ?? document.scrollingElement;
}

// --- The pointer ---

/** Move the pointer, turning pointer mode on if it was off (a finger on the touchpad does that). */
function moveCursor(dx: number, dy: number): void {
	const c = useGamepadState.getState().cursor ?? { x: innerWidth / 2, y: innerHeight / 2 };
	useGamepadState.setState({ cursor: { x: Math.min(innerWidth - 1, Math.max(0, c.x + dx)), y: Math.min(innerHeight - 1, Math.max(0, c.y + dy)) } });
}

const onTouch = (dx: number, dy: number) => moveCursor(dx * TOUCH_GAIN, dy * TOUCH_GAIN);
/** Ask for the touchpad. Must run inside a real click: the browser's device chooser needs one. */
export const enableTouchpad = () => openTouchpad(onTouch, true).then((touchpad) => useGamepadState.setState({ touchpad }));

// A press is the events a mouse would send, aimed at whatever is under the pointer. A real mouse keeps
// sending its moves to the pressed element until release; so does this, which is what lets a press
// drag a hue ring, a pad or the canvas. A native slider ignores events it does not trust, so its value
// is written directly from where the pointer is along it.
let pressed: { el: Element; x: number; y: number } | null = null;

function send(el: Element, type: string, x: number, y: number, buttons: number): void {
	const init = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0, buttons };
	// Pointer id 1 is the mouse's, so an element that captures the pointer on press does not throw.
	el.dispatchEvent(type.startsWith("pointer") ? new PointerEvent(type, { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true }) : new MouseEvent(type, init));
}

function pointerTo(x: number, y: number, down: boolean): void {
	const slide = (el: Element) => {
		if (!isRange(el) || el.type !== "range") return;
		const r = el.getBoundingClientRect();
		const { min, max } = rangeOf(el);
		setRange(el, min + ((x - r.left) / r.width) * (max - min));
	};
	if (down && !pressed) {
		const el = document.elementFromPoint(x, y);
		if (!el) return;
		pressed = { el, x, y };
		send(el, "pointerdown", x, y, 1);
		send(el, "mousedown", x, y, 1);
		slide(el);
	} else if (down && pressed && (pressed.x !== x || pressed.y !== y)) {
		pressed.x = x;
		pressed.y = y;
		send(pressed.el, "pointermove", x, y, 1);
		send(pressed.el, "mousemove", x, y, 1);
		slide(pressed.el);
	} else if (!down && pressed) {
		const { el } = pressed;
		pressed = null;
		send(el, "pointerup", x, y, 0);
		send(el, "mouseup", x, y, 0);
		const under = document.elementFromPoint(x, y);
		if (under && (el === under || el.contains(under) || under.contains(el))) send(el, "click", x, y, 0);
	}
}

/** `onPage` steps to the previous (-1) or next (+1) section; the caller owns the router and the list. */
export function useGamepad(onPage: (delta: number) => void): void {
	const page = useRef(onPage);
	useEffect(() => {
		page.current = onPage;
	});
	useEffect(() => {
		let raf = 0;
		let retry: ReturnType<typeof setTimeout> | undefined;
		let last = 0;
		let held: boolean[] = [];
		const repeatAt: Record<number, number> = {};
		const pan = { x: 0, y: 0 };
		let spin = 0, zoom = 0;
		let twisting = false;
		let pressButton = -1; // the button holding the pointer's press down, or -1

		const tick = (now: number) => {
			const pad = navigator.getGamepads().find((p) => p?.connected && p.mapping === "standard");
			if (!pad) {
				// Gone, or only hidden: a browser can stop listing a pad while another app has the focus and
				// list it again later with no `gamepadconnected`. So let go of whatever it was holding, and
				// look again every second instead of waiting for an event that may never come.
				raf = 0;
				held = [];
				pressButton = -1;
				if (pressed) pointerTo(pressed.x, pressed.y, false);
				const s = useGamepadState.getState();
				if (s.stick.x || s.stick.y || s.twist) useGamepadState.setState({ stick: REST, twist: 0 });
				retry = setTimeout(start, 1000);
				return;
			}
			raf = requestAnimationFrame(tick);
			const dt = Math.min((now - last) / 1000, 0.05);
			last = now;
			const down = pad.buttons.map((b) => b.pressed);
			const hit = (i: number) => down[i] && !held[i];
			const axis = (i: number) => (Math.abs(pad.axes[i]) > AXIS_DEAD ? pad.axes[i] : 0);

			// Pointer mode: Share / View turns it on and off, and so does a first click of the touchpad. The
			// left stick then moves the pointer and the view stands still, so the store is told the stick
			// is at rest.
			const lever = padVelocity(padPosition(pad.axes[0], pad.axes[1], 1), 1);
			const toggled = hit(B.share) || (hit(B.touchpad) && !useGamepadState.getState().cursor);
			if (toggled) {
				if (useGamepadState.getState().cursor) useGamepadState.setState({ cursor: null });
				else moveCursor(0, 0);
			}
			if (useGamepadState.getState().cursor && (lever.x || lever.y)) moveCursor(lever.x * CURSOR_PX_S * dt, -lever.y * CURSOR_PX_S * dt);
			const state = useGamepadState.getState();
			const cursor = state.cursor;
			const stick = cursor ? REST : lever;
			if (down.some(Boolean) || stick.x || stick.y || axis(2)) {
				const family = familyOf(pad.id);
				if (state.family !== family) useGamepadState.setState({ family });
			}
			if (stick.x !== state.stick.x || stick.y !== state.stick.y) useGamepadState.setState({ stick });
			const rx = axis(2);
			if (rx !== state.twist) useGamepadState.setState({ twist: rx });

			const cfg = useConfiguration.getState();
			// The sphere's trackball owns its own camera and reads the sticks from the store itself
			// (lib/render/orbitMomentum.ts); the shared view below is the plane's and the disk's.
			if (!cfg.spherical && location.pathname.startsWith("/play")) {
				const box = document.querySelector('[role="application"]');
				drivePlayPan(pan, stick, dt, box ? 0.5 * Math.min(box.clientWidth, box.clientHeight) : 0);

				const a = 1 - Math.exp(-dt / EASE_S);
				const trig = pad.buttons[B.r2].value - pad.buttons[B.l2].value;
				spin += (rx * Math.abs(rx) * SPIN_DEG_S - spin) * a;
				const angleMode = cfg.hyperbolic && cfg.isIslamic;
				zoom += ((angleMode ? 0 : trig * ZOOM_E_S) - zoom) * a;
				if (angleMode && trig) {
					const next = Math.round(Math.min(90, Math.max(0, cfg.islamicAngle + trig * ANGLE_DEG_S * dt)) * 100) / 100;
					if (next !== cfg.islamicAngle) cfg.set({ islamicAngle: next });
				}
				const turning = Math.abs(spin) > 0.5;
				if (turning || Math.abs(zoom) > 1e-3) {
					const o = { x: 0, y: 0 };
					pinchPlayView({ from: o, to: o, scale: Math.exp(zoom * dt), rotate: turning ? (spin * dt * Math.PI) / 180 : 0 });
				}
				if (twisting && !turning) endPinchPlayView();
				twisting = turning;
			}

			const ry = axis(3);
			if (ry) scrollPane(cursor)?.scrollBy(0, ry * Math.abs(ry) * SCROLL_PX_S * dt);

			if (hit(B.l1)) page.current(-1);
			if (hit(B.r1)) page.current(1);
			if (hit(B.l3)) requestViewReset();
			if (hit(B.triangle)) triangle();
			const cur = document.activeElement;
			const panel = inScope(cur) ? cur : null;
			if (cursor && !toggled) {
				if (pressButton < 0) pressButton = hit(B.cross) ? B.cross : hit(B.touchpad) ? B.touchpad : -1;
				else if (!down[pressButton]) pressButton = -1;
			} else pressButton = -1;
			const at = cursor ?? pressed;
			if (at) pointerTo(at.x, at.y, pressButton >= 0);
			if (hit(B.cross) && !cursor) panel?.click();
			if (hit(B.circle)) {
				if (cursor) useGamepadState.setState({ cursor: null });
				else if (panel) panel.blur();
				else pressKey("Escape");
			}
			// In the panel the D-pad walks the controls; on the view it is the arrow keys.
			for (const [button, key] of BUTTON_KEYS) {
				const first = hit(button);
				if (!first && !(down[button] && now >= repeatAt[button])) continue;
				repeatAt[button] = now + (first ? REPEAT_DELAY_MS : REPEAT_MS);
				if (button < B.up) {
					if (first) pressKey(key);
				} else if (panel) dpad(panel, button, !first);
				else pressKey(key);
			}
			held = down;
		};

		const start = () => {
			if (raf) return;
			clearTimeout(retry);
			last = performance.now();
			raf = requestAnimationFrame(tick);
		};
		// A real key press hands the keycaps back to the keyboard. Ours are synthetic and do not.
		const onKey = (e: KeyboardEvent) => {
			if (e.isTrusted && useGamepadState.getState().family) useGamepadState.setState({ family: null });
		};
		const off = useGamepadState.subscribe((s) => document.documentElement.toggleAttribute("data-pad", !!s.family));
		window.addEventListener("gamepadconnected", start);
		window.addEventListener("keydown", onKey);
		start();
		// A touchpad the reader granted on an earlier visit comes back with no prompt.
		openTouchpad(onTouch).then((touchpad) => useGamepadState.setState({ touchpad }));
		return () => {
			cancelAnimationFrame(raf);
			clearTimeout(retry);
			window.removeEventListener("gamepadconnected", start);
			window.removeEventListener("keydown", onKey);
			off();
			useGamepadState.setState({ family: null, stick: REST, twist: 0, cursor: null });
			document.documentElement.removeAttribute("data-pad");
		};
	}, []);
}
