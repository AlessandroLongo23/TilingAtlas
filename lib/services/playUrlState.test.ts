import { BUBBLE_EDGE_STYLE_VALUES } from "@/lib/bubble/edges";
import { describe, expect, it } from "vitest";
import { useConfiguration } from "@/stores/configuration";
import { PLAY_PARAMS, parsePlayState, serializePlayState } from "./playUrlState";

const defaults = () => useConfiguration.getInitialState() as unknown as Record<string, unknown>;
const parse = (qs: string) => parsePlayState(new URLSearchParams(qs));

describe("playUrlState", () => {
	it("serializes the default view to an empty query string", () => {
		expect(serializePlayState(defaults(), null, null)).toBe("");
	});

	it("parses a bare URL back to the store defaults", () => {
		const { config, alphas, tiling } = parse("");
		expect(alphas).toBeNull();
		expect(tiling).toBeNull();
		const def = defaults();
		for (const spec of Object.values(PLAY_PARAMS)) {
			expect(config[spec.field]).toBe(def[spec.field]);
		}
	});

	// The round-trip that matters: flip every field off its default, serialize, parse, and confirm each
	// one survives. Catches a key added to one half of the pair but not the other.
	it("round-trips every whitelisted field", () => {
		const def = defaults();
		const view: Record<string, unknown> = { ...def };
		for (const spec of Object.values(PLAY_PARAMS)) {
			if (spec.kind === "bool") {
				view[spec.field] = !def[spec.field];
			} else if (spec.kind === "num") {
				// A legal, in-range value that is not the default.
				const mid = spec.int
					? Math.round((spec.min + spec.max) / 2)
					: (spec.min + spec.max) / 2;
				view[spec.field] = mid === def[spec.field] ? spec.max : mid;
			} else if (spec.kind === "palette") {
				view[spec.field] = [40, "dark"];
			} else if (spec.kind === "mat2") {
				view[spec.field] = [1, 0, 0.5, 1]; // a shear: admissible, det 1, not the identity
			} else if (spec.kind === "class") {
				view[spec.field] = [2, 3]; // an integral class, and not the (1, 0) default
			} else {
				view[spec.field] = spec.values.find((v) => v !== def[spec.field]);
			}
		}

		const qs = serializePlayState(view, null, null);
		const { config } = parse(qs);
		for (const spec of Object.values(PLAY_PARAMS)) {
			// Palettes and the deform are arrays, rebuilt by parse — value equality is the contract there.
			if (spec.kind === "palette" || spec.kind === "mat2" || spec.kind === "class") {
				expect(config[spec.field], `field ${String(spec.field)} (key round-trip)`).toEqual(view[spec.field]);
			} else {
				expect(config[spec.field], `field ${String(spec.field)} (key round-trip)`).toBe(view[spec.field]);
			}
		}
	});

	it("emits a key per changed field and nothing for unchanged ones", () => {
		const qs = serializePlayState({ ...defaults(), isIslamic: true, hueOffset: 210 }, null, "ctrnact-04_x");
		const sp = new URLSearchParams(qs);
		expect(sp.get("i")).toBe("1");
		expect(sp.get("hue")).toBe("210");
		expect(sp.get("tiling")).toBe("ctrnact-04_x");
		expect(sp.has("iang")).toBe(false);
		expect(sp.has("lw")).toBe(false);
	});

	// fillAmount defaults to the palette's own saturation, so "off" (0) has to be expressible — a
	// presence-as-true encoding would lose it, and every link shared while this was the Polygon-fill
	// checkbox carried exactly `fill=0` for off, so 0 has to keep meaning off.
	it("expresses a true-by-default boolean turned off", () => {
		expect(serializePlayState({ ...defaults(), fillAmount: 0 }, null, null)).toBe("fill=0");
		expect(parse("fill=0").config.fillAmount).toBe(0);
	});

	it("clamps out-of-range numbers to the slider range", () => {
		expect(parse("iang=999").config.islamicAngle).toBe(90);
		expect(parse("iang=-40").config.islamicAngle).toBe(0);
		expect(parse("varma=100").config.spiralArmA).toBe(6);
	});

	it("rounds integer-only fields", () => {
		expect(parse("irays=2.7").config.islamicIntersectionCount).toBe(3);
		expect(parse("varmb=-3.2").config.spiralArmB).toBe(-3);
	});

	// A stale or hand-edited link must not reach the store with a value the renderer cannot switch on.
	it("falls back to the default for unknown enum and unparseable values", () => {
		const def = defaults();
		expect(parse("istyle=lol").config.islamicStyle).toBe(def.islamicStyle);
		expect(parse("vmode=%20").config.inversiveMode).toBe(def.inversiveMode);
		expect(parse("hue=abc").config.hueOffset).toBe(def.hueOffset);
		expect(parse("i=yes").config.isIslamic).toBe(def.isIslamic);
	});

	it("round-trips a multi-parameter alpha tuple", () => {
		expect(serializePlayState(defaults(), [45, 30], null)).toBe("alpha=45%2C30");
		expect(parse("alpha=45,30").alphas).toEqual([45, 30]);
		expect(parse("alpha=72").alphas).toEqual([72]);
	});

	it("drops a malformed alpha tuple instead of passing NaN to the renderer", () => {
		expect(parse("alpha=45,oops").alphas).toBeNull();
		expect(parse("alpha=").alphas).toBeNull();
	});

	it("round-trips the deform matrix and omits it at identity", () => {
		expect(parse("def=1,0,0.6,1").config.deform).toEqual([1, 0, 0.6, 1]);
		const qs = serializePlayState({ ...defaults(), deformOn: true, deform: [1, 0, 0.6, 1] }, null, null);
		const sp = new URLSearchParams(qs);
		expect(sp.get("def")).toBe("1,0,0.6,1");
		expect(sp.get("defon")).toBe("1");
		expect(serializePlayState({ ...defaults(), deform: [1, 0, 0, 1] }, null, null)).toBe("");
	});

	it("rejects a deform a drag could not have produced", () => {
		expect(parse("def=1,0,2,0").config.deform).toEqual([1, 0, 0, 1]); // singular
		expect(parse("def=9,0,0,1").config.deform).toEqual([1, 0, 0, 1]); // outside the pad box
		expect(parse("def=1,0,0").config.deform).toEqual([1, 0, 0, 1]); // wrong arity
		expect(parse("def=1,0,x,1").config.deform).toEqual([1, 0, 0, 1]); // NaN
	});

	it("keeps URL keys unique", () => {
		const fields = Object.values(PLAY_PARAMS).map((s) => s.field);
		expect(new Set(fields).size).toBe(fields.length);
		// 62 until `sreal`/`sstu` went with the Realistic and Studio-look controls (2026-08-25); 61 since
		// `bubedge` + `bubkoch` arrived with the bubble shelf's edge-profile picker (2026-08-27).
		expect(Object.keys(PLAY_PARAMS)).toHaveLength(62);
	});
});

// The link's vocabulary and the picker's must not drift: PLAY_PARAMS spells its enum out so the table
// reads as the one place a URL's values are defined, and this is what keeps that spelling honest. A
// profile added to lib/bubble/edges.ts without a key here would silently drop out of every shared link.
describe("bubedge", () => {
	it("lists exactly the edge profiles the bubble shelf offers", () => {
		const spec = PLAY_PARAMS.bubedge;
		expect(spec.kind).toBe("enum");
		expect(spec.kind === "enum" ? [...spec.values].sort() : []).toEqual([...BUBBLE_EDGE_STYLE_VALUES].sort());
	});
});
