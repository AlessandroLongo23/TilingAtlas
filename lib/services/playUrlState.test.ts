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
			} else {
				view[spec.field] = spec.values.find((v) => v !== def[spec.field]);
			}
		}

		const qs = serializePlayState(view, null, null);
		const { config } = parse(qs);
		for (const spec of Object.values(PLAY_PARAMS)) {
			expect(config[spec.field], `field ${String(spec.field)} (key round-trip)`).toBe(view[spec.field]);
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

	// showPolygonFill defaults to true, so "off" has to be expressible — presence-as-true would lose it.
	it("expresses a true-by-default boolean turned off", () => {
		expect(serializePlayState({ ...defaults(), showPolygonFill: false }, null, null)).toBe("fill=0");
		expect(parse("fill=0").config.showPolygonFill).toBe(false);
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

	it("drops a malformed alpha tuple rather than passing NaN to the renderer", () => {
		expect(parse("alpha=45,oops").alphas).toBeNull();
		expect(parse("alpha=").alphas).toBeNull();
	});

	it("keeps URL keys unique", () => {
		const fields = Object.values(PLAY_PARAMS).map((s) => s.field);
		expect(new Set(fields).size).toBe(fields.length);
		expect(Object.keys(PLAY_PARAMS)).toHaveLength(39);
	});
});
