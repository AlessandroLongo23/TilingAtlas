// The motion roles for code that animates from JavaScript: Framer Motion, the Web Animations API, a transition
// written into a style. CSS reads the same roles as tokens (tokens/semantic.css: --duration-glide, motion-glide);
// these values mirror them, and motion.test.ts fails if the two drift apart. Reduced motion is the caller's
// to honour here (useReducedMotion, or matchMedia): the token layer's override does not reach JavaScript.

type Curve = readonly [number, number, number, number];

export const CURVE = {
	standard: [0.4, 0, 0.2, 1],
	out: [0, 0, 0.2, 1],
	outStrong: [0.23, 1, 0.32, 1],
	drawer: [0.32, 0.72, 0, 1],
} as const satisfies Record<string, Curve>;

export const MOTION = {
	feedback: { ms: 120, ease: CURVE.out },
	floating: { ms: 200, ease: CURVE.outStrong },
	floatingExit: { ms: 150, ease: CURVE.out },
	glide: { ms: 240, ease: CURVE.outStrong },
	glideExit: { ms: 150, ease: CURVE.outStrong },
	travel: { ms: 360, ease: CURVE.drawer },
	travelExit: { ms: 200, ease: CURVE.drawer },
	arrive: { ms: 360, ease: CURVE.outStrong },
	settle: { ms: 600, ease: CURVE.outStrong },
} as const satisfies Record<string, { ms: number; ease: Curve }>;

export type MotionRole = keyof typeof MOTION;

/** Items that arrive together come this far apart; a drawn path draws one piece per step. */
export const STAGGER_MS = 40;
export const STEP_MS = 70;

/** Springs, for what follows the pointer or a layout change. Physics, so no duration token to mirror. */
export const SPRING = {
	/** A card lifting out of its grid and back (Framer layout animations). */
	layout: { type: "spring", stiffness: 260, damping: 30 },
	/** A selection pill sliding to the new item, with a trace of overshoot. */
	pill: { type: "spring", duration: 0.4, bounce: 0.12 },
	/** The same slide without the overshoot, for a highlight that moves with the keyboard. */
	snap: { type: "spring", duration: 0.25, bounce: 0 },
} as const;

/** A curve as CSS: cubic-bezier(…). */
export const cssEase = (c: Curve) => `cubic-bezier(${c.join(", ")})`;
/** A role as the duration and curve of a CSS transition: "240ms cubic-bezier(…)". */
export const cssMotion = (role: MotionRole) => `${MOTION[role].ms}ms ${cssEase(MOTION[role].ease)}`;
/** A role as a Framer Motion transition: seconds and a bezier array. */
export const fmMotion = (role: MotionRole) => ({ duration: MOTION[role].ms / 1000, ease: MOTION[role].ease });
