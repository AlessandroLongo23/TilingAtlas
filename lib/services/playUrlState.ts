import { useConfiguration, type ConfigurationState } from "@/stores/configuration";

// ── /play ⇆ URL state ─────────────────────────────────────────────────────────────────────────────
// The whole /play view round-trips through the query string: a reload restores it, and the share button
// hands a friend a link that reproduces it. parsePlayState and serializePlayState are inverse — add a
// field to PLAY_PARAMS and both follow.
//
// Scope (spec: docs/superpowers/specs/2026-07-22-play-url-state-design.md) is exactly what the Options
// tab can set — 39 fields. If a control exists the field travels, otherwise it does not. Deliberately
// OUT: the camera (zoom/pan/rotation live in `controls`, mutated in place per frame to stay off React,
// so there is nothing to mirror); `hyperbolic`/`spherical`/the geometry toggle (all derived from the
// selection, so `tiling` implies them); `immersive` (a viewing mode, not the artifact); the dev flags
// `euclideanShader`/`debugView`; and the transient signals (takeScreenshot, hyperbolicClick, spiralVel…).
//
// Keys are a shared public contract — short, prefixed by group (bare = global, i* = Islamic,
// s* = spherical, v* = inversive), and stable. Renaming one breaks every link already in the wild.

type Spec =
	| { field: keyof ConfigurationState; kind: "bool" }
	| { field: keyof ConfigurationState; kind: "num"; min: number; max: number; int?: true }
	| { field: keyof ConfigurationState; kind: "enum"; values: readonly string[] };

export const PLAY_PARAMS: Record<string, Spec> = {
	// global
	fill: { field: "showPolygonFill", kind: "bool" },
	lw: { field: "lineWidth", kind: "num", min: 0, max: 5 },
	hue: { field: "hueOffset", kind: "num", min: 0, max: 359 },
	rot: { field: "rotation", kind: "num", min: 0, max: 360 },
	pts: { field: "showPolygonPoints", kind: "bool" },
	orb: { field: "showVertexOrbits", kind: "bool" },
	trans: { field: "tilingTransition", kind: "bool" },
	sym: { field: "showSymmetryElements", kind: "bool" },
	dom: { field: "showFundamentalDomain", kind: "bool" },
	hline: { field: "hyperbolicLineMode", kind: "enum", values: ["geometry", "constant"] },
	// freedraw view (fd*) — `lw` above is shared, so the stroke needs no key of its own
	fdfill: { field: "freedrawFill", kind: "enum", values: ["none", "rank", "shape", "pose", "orbit"] },
	fdgrid: { field: "freedrawScaffold", kind: "bool" },
	fdlat: { field: "freedrawLattice", kind: "bool" },
	fdorb: { field: "freedrawVertices", kind: "bool" },
	// Islamic construction
	i: { field: "isIslamic", kind: "bool" },
	istyle: {
		field: "islamicStyle",
		kind: "enum",
		values: ["plain", "interlace", "outline", "emboss", "checkerboard"],
	},
	iang: { field: "islamicAngle", kind: "num", min: 0, max: 90 },
	iband: { field: "islamicBandWidth", kind: "num", min: 0.05, max: 0.6 },
	ibord: { field: "islamicOutlineWidth", kind: "num", min: 0, max: 0.5 },
	iflip: { field: "islamicChirality", kind: "bool" },
	ika: { field: "islamicCheckerHueA", kind: "num", min: 0, max: 359 },
	ikb: { field: "islamicCheckerHueB", kind: "num", min: 0, max: 359 },
	ifb: { field: "islamicFillHueB", kind: "num", min: 0, max: 359 },
	ifc: { field: "islamicFillHueC", kind: "num", min: 0, max: 359 },
	ioff: { field: "islamicEdgeOffset", kind: "num", min: 0, max: 100 },
	irays: { field: "islamicIntersectionCount", kind: "num", min: 1, max: 3, int: true },
	ianim: { field: "islamicAnimate", kind: "bool" },
	// spherical view
	swire: { field: "sphericalWireframe", kind: "bool" },
	sreal: { field: "sphericalRealistic", kind: "bool" },
	ssec: { field: "sphericalWireSection", kind: "enum", values: ["tube", "rect"] },
	sthk: { field: "sphericalWireThickness", kind: "num", min: 0.005, max: 0.15 },
	shgt: { field: "sphericalWireHeight", kind: "num", min: 0.005, max: 0.15 },
	sbev: { field: "sphericalWireBevel", kind: "num", min: 0, max: 1 },
	spoly: { field: "sphericalPolyhedron", kind: "bool" },
	sortho: { field: "sphericalOrthographic", kind: "bool" },
	sweave: { field: "sphericalWeaveFlat", kind: "bool" },
	// inversive view
	v: { field: "inversive", kind: "bool" },
	vmode: { field: "inversiveMode", kind: "enum", values: ["inversion", "mobius", "spiral"] },
	vrad: { field: "inversiveRadiusFrac", kind: "num", min: 0.1, max: 1 },
	vtwist: { field: "mobiusTwist", kind: "num", min: 0, max: 180 },
	vdouble: { field: "spiralDouble", kind: "bool" },
	varma: { field: "spiralArmA", kind: "num", min: -6, max: 6, int: true },
	varmb: { field: "spiralArmB", kind: "num", min: -6, max: 6, int: true },
};

// The store's own initial values ARE the defaults — read them from zustand rather than restating them
// here, so the table can never drift from configuration.ts.
const defaults = () => useConfiguration.getInitialState() as unknown as Record<string, unknown>;

export interface PlayUrlState {
	/** Every whitelisted field: the URL's value where valid, the store default everywhere else. */
	config: Partial<ConfigurationState>;
	/** The free-angle family tuple (degrees), or null when the link carries none. */
	alphas: number[] | null;
	/** The selected tiling's canonicalKey, or null. */
	tiling: string | null;
}

// Parse a link into a full view. A hand-edited or stale URL can carry anything, so an unparseable or
// out-of-list value falls back to the store default — it is never injected into state. The result covers
// the WHOLE whitelist, not just the keys present: a bare /play therefore means the default view, so a
// recipient with a warm store from an earlier visit sees the same thing as one opening it cold.
export function parsePlayState(sp: URLSearchParams): PlayUrlState {
	const def = defaults();
	const config: Record<string, unknown> = {};

	for (const [key, spec] of Object.entries(PLAY_PARAMS)) {
		const fallback = def[spec.field];
		const raw = sp.get(key);
		if (raw == null) {
			config[spec.field] = fallback;
			continue;
		}
		if (spec.kind === "bool") {
			config[spec.field] = raw === "1" ? true : raw === "0" ? false : fallback;
		} else if (spec.kind === "num") {
			const n = Number(raw);
			if (!Number.isFinite(n)) {
				config[spec.field] = fallback;
			} else {
				const clamped = Math.min(spec.max, Math.max(spec.min, n));
				config[spec.field] = spec.int ? Math.round(clamped) : clamped;
			}
		} else {
			config[spec.field] = spec.values.includes(raw) ? raw : fallback;
		}
	}

	const rawAlpha = sp.get("alpha");
	const alphas = rawAlpha
		? (() => {
				const parts = rawAlpha.split(",").map(Number);
				return parts.length && parts.every((n) => Number.isFinite(n)) ? parts : null;
			})()
		: null;

	return { config: config as Partial<ConfigurationState>, alphas, tiling: sp.get("tiling") };
}

// Serialize a view back to a query string. Only non-defaults are emitted, so the default view produces
// "" (a bare /play). Booleans emit their literal value rather than presence-as-true — showPolygonFill
// defaults to true and needs a way to say "off".
export function serializePlayState(
	config: Partial<ConfigurationState>,
	alphas: number[] | null,
	tiling: string | null,
): string {
	const def = defaults();
	const p = new URLSearchParams();

	if (tiling) p.set("tiling", tiling);

	const cfg = config as unknown as Record<string, unknown>;
	for (const [key, spec] of Object.entries(PLAY_PARAMS)) {
		const value = cfg[spec.field];
		if (value === undefined || value === def[spec.field]) continue;
		p.set(key, spec.kind === "bool" ? (value ? "1" : "0") : String(value));
	}

	if (alphas?.length) p.set("alpha", alphas.map((n) => String(n)).join(","));

	return p.toString();
}
