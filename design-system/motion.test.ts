import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CURVE, MOTION, STAGGER_MS, STEP_MS } from "./motion";

// motion.ts mirrors the CSS motion tokens for JavaScript. Resolve each role through semantic.css to core.css
// and compare, so a change on one side without the other fails here.
const core = readFileSync("design-system/tokens/core.css", "utf8");
const semantic = readFileSync("design-system/tokens/semantic.css", "utf8").split("@media")[0];
const value = (css: string, name: string) => {
	const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
	if (!m) throw new Error(`${name} is not defined`);
	return m[1].trim();
};
const resolve = (name: string) => {
	const v = value(semantic, name);
	const ref = /^var\((--[\w-]+)\)$/.exec(v);
	return ref ? value(core, ref[1]) : v;
};
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const bezier = (s: string) => /cubic-bezier\(([^)]+)\)/.exec(s)![1].split(",").map(Number);

describe("motion.ts mirrors the motion tokens", () => {
	for (const [role, { ms, ease }] of Object.entries(MOTION)) {
		it(role, () => {
			const name = kebab(role);
			expect(resolve(`--duration-${name}`)).toBe(`${ms}ms`);
			// An exit role without a curve of its own shares its entrance's.
			const easeName = semantic.includes(`--ease-${name}:`) ? `--ease-${name}` : `--ease-${name.replace(/-exit$/, "")}`;
			expect(bezier(resolve(easeName))).toEqual([...ease]);
		});
	}
	it("curves", () => {
		for (const [name, c] of Object.entries(CURVE))
			expect(bezier(value(core, `--curve-${kebab(name)}`))).toEqual([...c]);
	});
	it("stagger and step", () => {
		expect(resolve("--motion-stagger")).toBe(`${STAGGER_MS}ms`);
		expect(resolve("--motion-step")).toBe(`${STEP_MS}ms`);
	});
});
