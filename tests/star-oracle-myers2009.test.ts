/**
 * ST-3 (docs/review-2026-06-09/05-star-and-new-directions.md) — loader/validator for the Myers 2009
 * k=2 star oracle `experiments/star-oracle/myers-2009-k2.json` (38 tilings + 5 one-parameter families,
 * transcribed from the PDF figure captions).
 *
 * The oracle is the future k=2 star acceptance harness's ground truth — a transcription error becomes
 * a false hard-fail or a silent pass — so this test re-derives everything checkable from the tokens in
 * exact (rational + symbolic-linear) arithmetic: angle sums, dent/point ↔ declared-α consistency, the
 * in-ring classification, the 34-record in-ring subset, and the three ST-3 regression pins
 * (Figs 36/40/42: in-ring k=2 tilings with a purely-regular orbit — the falsifiers for the unscoped
 * Myers prune (iii), which `enumerateStarVCs` correctly applies at k=1 ONLY).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	canonicalVCName,
	enumerateStarVCs,
	dentRegularFillableVariants,
	regInteriorU,
} from "@/classes/algorithm/StarVC";

type OracleRecord = {
	fig: string;
	kind: "tiling" | "family";
	myersCaption: string;
	orbits: string[];
	alphaU: Record<string, number | string>;
	freeAlpha: boolean;
	inRing: boolean;
	pin?: boolean;
	notes: string;
};
type Oracle = {
	_meta: { pins: string[]; counts: Record<string, unknown> };
	records: OracleRecord[];
};

const oracle: Oracle = JSON.parse(
	readFileSync(join(__dirname, "..", "experiments", "star-oracle", "myers-2009-k2.json"), "utf8"),
);
const records = oracle.records;

// --- exact value arithmetic: q + c·a with q ∈ ℚ (num/den), c ∈ {−1, 0, +1} ------------------------
type Val = { num: number; den: number; a: number };
const val = (num: number, den = 1, a = 0): Val => {
	const g = gcd(Math.abs(num), Math.abs(den));
	return { num: num / (g || 1), den: den / (g || 1), a };
};
const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
const add = (x: Val, y: Val): Val => val(x.num * y.den + y.num * x.den, x.den * y.den, x.a + y.a);
const sub = (x: Val, y: Val): Val => add(x, { ...y, num: -y.num, a: -y.a });
const eq = (x: Val, y: Val): boolean => x.num * y.den === y.num * x.den && x.a === y.a;

/** Parse a u-value: "14" | "4/3" | "a" | "a+2" | "16-a". */
function parseU(s: string): Val {
	let m = /^(\d+)$/.exec(s);
	if (m) return val(parseInt(m[1], 10));
	m = /^(\d+)\/(\d+)$/.exec(s);
	if (m) return val(parseInt(m[1], 10), parseInt(m[2], 10));
	if (s === "a") return val(0, 1, 1);
	m = /^a\+(\d+)$/.exec(s);
	if (m) return val(parseInt(m[1], 10), 1, 1);
	m = /^(\d+)-a$/.exec(s);
	if (m) return val(parseInt(m[1], 10), 1, -1);
	throw new Error(`unparseable u-value: ${s}`);
}

type Tok =
	| { kind: "reg"; n: number; u: Val }
	| { kind: "pt" | "dent"; n: number; u: Val; alpha: Val }; // alpha = point parameter of the star species

/** Parse a StarVC-syntax token: `n` | `n*p@u` | `n*d@u` (dent u = INTERIOR reflex angle ⇒ α = 24−24/n−u). */
function parseTok(s: string): Tok {
	let m = /^(\d+)$/.exec(s);
	if (m) {
		const n = parseInt(m[1], 10);
		return { kind: "reg", n, u: val((n - 2) * 12, n) };
	}
	m = /^(\d+)\*(p|d)@(.+)$/.exec(s);
	if (!m) throw new Error(`unparseable token: ${s}`);
	const n = parseInt(m[1], 10);
	const u = parseU(m[3]);
	const alpha = m[2] === "p" ? u : sub(sub(val(24), val(24, n)), u);
	return { kind: m[2] === "p" ? "pt" : "dent", n, u, alpha };
}

const orbitToks = (orbit: string): Tok[] => orbit.split(".").map(parseTok);
const isPureRegular = (orbit: string): boolean => orbitToks(orbit).every((t) => t.kind === "reg");

/** N=24-ring membership recomputed from the tokens (must reproduce the declared `inRing`). */
function tokInRing(t: Tok): boolean {
	if (t.kind === "reg") return [3, 4, 6, 8, 12, 24].includes(t.n);
	if (24 % t.n !== 0) return false;
	const a = t.alpha;
	if (a.a !== 0 || a.den !== 1) return false; // symbolic (family) or fractional (off-ring α)
	return a.num > 0 && a.num < regInteriorU(t.n); // admissible point angle (dent stays reflex)
}

describe("Myers-2009 k=2 star oracle — schema + census (ST-3 step 1)", () => {
	it("has exactly 43 records: figures 1..43, unique, in order", () => {
		expect(records.length).toBe(43);
		expect(records.map((r) => r.fig)).toEqual(Array.from({ length: 43 }, (_, i) => String(i + 1)));
	});

	it("census: 38 tilings + 5 families (Figs 25-28, 32), as Myers states on p.1", () => {
		expect(records.filter((r) => r.kind === "tiling").length).toBe(38);
		const fams = records.filter((r) => r.kind === "family").map((r) => r.fig);
		expect(fams).toEqual(["25", "26", "27", "28", "32"]);
		for (const r of records) expect(r.freeAlpha).toBe(r.kind === "family");
	});

	it("every record has exactly 2 orbits (2-uniform), a caption, and a declared star inventory", () => {
		for (const r of records) {
			expect(r.orbits.length).toBe(2);
			expect(r.myersCaption.length).toBeGreaterThan(0);
			expect(Object.keys(r.alphaU).length).toBeGreaterThan(0); // every catalogue entry carries ≥1 star
		}
	});
});

describe("Myers-2009 k=2 star oracle — exact transcription validation", () => {
	it("every orbit's corner angles sum to exactly 2π (24 u), symbolic families included (Σa-coeff = 0)", () => {
		for (const r of records) {
			for (const orbit of r.orbits) {
				const sum = orbitToks(orbit).reduce((s, t) => add(s, t.u), val(0));
				expect(eq(sum, val(24)), `fig ${r.fig} orbit ${orbit} sums to ${sum.num}/${sum.den} + ${sum.a}a`).toBe(true);
			}
		}
	});

	it("every star token's point parameter α matches a declared alphaU species of the same n (dents via α = 24−24/n−u)", () => {
		for (const r of records) {
			const species = Object.entries(r.alphaU).map(([k, v]) => ({
				n: parseInt(k, 10),
				alpha: parseU(String(v)),
			}));
			for (const orbit of r.orbits) {
				for (const t of orbitToks(orbit)) {
					if (t.kind === "reg") continue;
					const hit = species.some((sp) => sp.n === t.n && eq(sp.alpha, t.alpha));
					expect(hit, `fig ${r.fig}: token in ${orbit} has no declared species (n=${t.n})`).toBe(true);
				}
			}
			// no orphan species: every declared star occurs in some orbit
			for (const sp of species) {
				const used = r.orbits.some((orbit) =>
					orbitToks(orbit).some((t) => t.kind !== "reg" && t.n === sp.n && eq(sp.alpha, t.alpha)),
				);
				expect(used, `fig ${r.fig}: declared species n=${sp.n} unused`).toBe(true);
			}
		}
	});

	it("declared inRing reproduces from the tokens; the in-ring tiling subset is exactly 34", () => {
		for (const r of records) {
			const computed = r.orbits.every((orbit) => orbitToks(orbit).every(tokInRing));
			expect(computed, `fig ${r.fig}: declared inRing=${r.inRing} but tokens say ${computed}`).toBe(r.inRing);
		}
		const inRingTilings = records.filter((r) => r.kind === "tiling" && r.inRing);
		expect(inRingTilings.length).toBe(34); // the k=2 acceptance hard set (ST-3 step 2)
		const out = records.filter((r) => r.kind === "tiling" && !r.inRing).map((r) => r.fig);
		expect(out).toEqual(["18", "19", "22", "23"]); // 9-, 18-fold stars / π/9-multiples — ring-excluded (ST-5)
	});

	it("in-ring orbits use the solver's token grammar verbatim and canonicalise via StarVC.canonicalVCName", () => {
		for (const r of records.filter((x) => x.inRing)) {
			for (const orbit of r.orbits) {
				for (const tok of orbit.split(".")) expect(tok).toMatch(/^\d+$|^\d+\*(p|d)@\d+$/);
				const name = canonicalVCName(orbit.split("."));
				expect(name.length).toBeGreaterThan(0);
				expect(name).toBe(canonicalVCName(orbit.split(".").reverse())); // reflection-merged
			}
		}
	});
});

describe("Myers-2009 k=2 star oracle — ST-3 step 3 regression pins (Figs 36/40/42)", () => {
	const pins = oracle._meta.pins.map((f) => records.find((r) => r.fig === f)!);

	it("the pins are Figs 36/40/42: in-ring tilings, flagged, with exactly ONE purely-regular orbit", () => {
		expect(oracle._meta.pins).toEqual(["36", "40", "42"]);
		for (const r of pins) {
			expect(r.pin).toBe(true);
			expect(r.kind).toBe("tiling");
			expect(r.inRing).toBe(true);
			expect(r.orbits.filter(isPureRegular).length).toBe(1);
		}
		// the regular orbits any future k≥2 star layer must be able to represent:
		const regs = pins.map((r) => canonicalVCName(r.orbits.find(isPureRegular)!.split(".")));
		expect(regs).toEqual(["3,3,3,3,3,3", "4,8,8", "4,4,4,4"]);
	});

	it("the pins FALSIFY the unscoped Myers prune (iii): their regular orbit is not enumerable by the k=1 StarVC enumerator", () => {
		// enumerateStarVCs requires ≥1 star point per VC — sound at k=1 (the single VC must carry the
		// star), FALSE at k=2 where a whole vertex orbit can be star-free (these three tilings + Figs
		// 38/39/41/43 + family 25). Pinning that here keeps any future k≥2 layer from inheriting it (TH-5).
		const k1Names = new Set(
			enumerateStarVCs({ variants: dentRegularFillableVariants(), includeDents: true }).map((v) => v.name),
		);
		for (const r of pins) {
			const reg = canonicalVCName(r.orbits.find(isPureRegular)!.split("."));
			expect(k1Names.has(reg)).toBe(false);
		}
	});

	it("pure-regular-orbit inventory: Figs 36, 38-43 + family 25 (Fig 43 was missing from the work-order's list)", () => {
		const withRegOrbit = records.filter((r) => r.orbits.some(isPureRegular)).map((r) => r.fig);
		expect(withRegOrbit).toEqual(["25", "36", "38", "39", "40", "41", "42", "43"]);
	});
});
