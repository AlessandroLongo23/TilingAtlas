import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { cn } from "./cn";

// Every name the Tailwind theme defines must be one cn() recognises, or tailwind-merge guesses its group and
// can delete a class it does not conflict with (the black-on-blue primary button). Each row: the theme
// variable prefix, the utility prefix, and a known utility of the same group the name must merge with.
const theme = readFileSync("design-system/tokens/tailwind.css", "utf8");
const names = (prefix: string) =>
	[...theme.matchAll(new RegExp(`^\\s*--${prefix}-([a-z][a-z0-9-]*):`, "gm"))]
		.map((m) => m[1])
		.filter((n) => !n.includes("--"));

describe("cn knows the design system's scales", () => {
	test.each(names("text"))("text-%s is a type role, not a colour", (n) => {
		expect(cn("text-fg-muted", `text-${n}`)).toBe(`text-fg-muted text-${n}`);
		expect(cn(`text-${n}`, "text-fg-muted")).toBe(`text-${n} text-fg-muted`);
	});
	test.each([
		["radius", "rounded", "rounded-none"],
		["shadow", "shadow", "shadow-none"],
		["drop-shadow", "drop-shadow", "drop-shadow-none"],
		["blur", "blur", "blur-none"],
		["spacing", "p", "p-2"],
		["tracking", "tracking", "tracking-tight"],
		["z-index", "z", "z-10"],
	])("--%s-* merges as %s-*", (prefix, utility, other) => {
		for (const n of names(prefix)) expect(cn(`${utility}-${n}`, other)).toBe(other);
	});
	test("a later type role keeps an earlier leading", () => {
		expect(cn("leading-tight", "text-body")).toBe("leading-tight text-body");
	});
});
