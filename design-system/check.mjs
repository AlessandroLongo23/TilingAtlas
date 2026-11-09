#!/usr/bin/env node
// ds:check — does the code build from the design system (design-system/README.md)?
//
// Two families of rules, over the atlas (app/, components/, lib/), the Searcher (tools/searcher/app/src) and
// the library itself (design-system/components, and the CSS under design-system/styles and app/):
//   tokens    a value outside the token set: a text size off the type scale, a radius or shadow that is not a
//             role, a colour the theme does not define (Tailwind generates nothing for it), a raw colour, a
//             duration or curve that is not a motion role, a layer by number, a spacing step off the scale,
//             an icon size off the four, a breakpoint of its own; and in CSS, a literal where a token exists.
//   adoption  a hand-written copy of a look the library owns (a pressed fill, a chevron that turns, a
//             card's border). The library's own files are exempt from these: they are where the looks live.
//
//   pnpm ds:check                 totals; exits 1 if any file has more hits of a rule than the baseline
//   pnpm ds:check --files         every hit, file:line
//   pnpm ds:check <paths…>        only these files (a merge, a new page)
//   pnpm ds:check --update        write the current counts as the baseline (only after reducing them)
//
// A hit with a reason to stay (a canvas glyph, a slide that scales with the viewport) carries
// `ds-check: keep (the reason)` on its line or the line above. A keep without a reason is not honoured.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const BASELINE = "design-system/check-baseline.json";
const args = process.argv.slice(2);
const listHits = args.includes("--files");
const update = args.includes("--update");
const only = args.filter((a) => !a.startsWith("--"));
const files = (
	only.length
		? only
		: execSync("git ls-files -co --exclude-standard -- '*.tsx' '*.ts' '*.css'", { encoding: "utf8" }).split("\n")
)
	.filter((f) =>
		/^(app|components|lib|design-system\/(components|styles|motion\.ts)|tools\/searcher\/app\/src)\b/.test(f),
	)
	.filter((f) => /\.(tsx?|css)$/.test(f) && !/\.test\.tsx?$/.test(f) && existsSync(f));
const isCss = (f) => f.endsWith(".css");
const isLibrary = (f) => f.startsWith("design-system/");

// ─── The token set, read from the Tailwind theme so the check and the theme cannot disagree ───
const theme = readFileSync("design-system/tokens/tailwind.css", "utf8");
const names = (ns) =>
	new Set(
		[...theme.matchAll(new RegExp(`--${ns}-([a-z0-9-]+)\\s*:`, "g"))].map((m) => m[1]).filter((n) => !n.includes("--")),
	);
const COLORS = names("color");
const TEXT = names("text");
const RADII = names("radius");
const SHADOWS = names("shadow");
const SPACE_KEYS = names("spacing");
const Z_KEYS = names("z-index");
// Paddings, margins and gaps: these steps of the 4px unit (semantic.css), or a named distance.
const SPACE_STEPS = new Set("0 px 0.5 1 1.5 2 2.5 3 3.5 4 5 6 8 10 12 16 20 24 28 32 40 48 64 80 96".split(" "));
const STOCK =
	/^(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(-\d{2,3})?$/;
const COLOR_ROOTS = new Set([...COLORS].map((c) => c.split("-")[0]));
// Every custom property the token layer defines, for the rule that catches a var() of one that does not exist.
const DEFINED = new Set(
	["core", "semantic", "themed", "tailwind"]
		.flatMap((n) => [...readFileSync(`design-system/tokens/${n}.css`, "utf8").matchAll(/(--[\w-]+)\s*:/g)])
		.map((m) => m[1]),
);
const TOKEN_VAR =
	/var\((--(?:color|palette|shadow|drop-shadow|blur|duration|ease|curve|motion|z|radius|type|font|leading|space|size|control|icon)-[\w-]+)/g;
const undefinedTokens = (s) =>
	[...s.matchAll(TOKEN_VAR)].filter((m) => !DEFINED.has(m[1])).map((m) => ({ at: m.index, what: m[1] }));

// ─── Source helpers ───
function openingTag(s, i) {
	let depth = 0;
	let quote = null;
	for (let k = i + 1; k < s.length; k++) {
		const c = s[k];
		if (quote) {
			if (c === quote && s[k - 1] !== "\\") quote = null;
		} else if (c === '"' || c === "'" || c === "`") quote = c;
		else if (c === "{") depth++;
		else if (c === "}") depth--;
		else if (c === ">" && depth === 0) return s.slice(i, k + 1);
	}
	return s.slice(i);
}
const tags = (s, name) =>
	[...s.matchAll(new RegExp(`<${name}\\b`, "g"))].map((m) => ({ at: m.index, tag: openingTag(s, m.index) }));
const classStrings = (s) =>
	[...s.matchAll(/className=(?:"([^"]*)"|\{[^}]*?"([^"]*)")/g)].map((m) => ({ at: m.index, cls: m[1] ?? m[2] }));
// Every string literal that reads as a class list: utilities have hyphens, colons or brackets; prose does not.
function classLists(s) {
	const out = [];
	for (const m of s.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
		const body = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " ");
		const toks = body.split(/\s+/).filter(Boolean);
		if (!toks.length || /[A-Z]{2}|[.,;!?]\s/.test(body)) continue;
		if (toks.filter((t) => /[-:[]/.test(t)).length * 2 < toks.length) continue;
		out.push({ at: m.index, toks });
	}
	return out;
}
const bare = (t) => t.replace(/^!/, "").replace(/^(?:(?:[\w-]+|\[[^\]\s]+\]|@[\w-]+(?:\/[\w-]+)?):)*/, "");

// ─── Rules ───
function tokenHits(s, test, raw = false) {
	const hits = [];
	for (const { at, toks } of classLists(s))
		for (const t of toks) if (test(raw ? t : bare(t))) hits.push({ at, what: t });
	return hits;
}
function cssHits(s, re) {
	const hits = [];
	// Blank the comments out (keeping their newlines), so a duration named in prose is not a hit.
	const code = s.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
	let at = 0;
	for (const line of code.split("\n")) {
		const m = re.exec(line);
		if (m && !(m[1] && re.source.startsWith("z-index") && Number(m[1]) <= 20))
			hits.push({ at, what: line.trim().slice(0, 60) });
		at += line.length + 1;
	}
	return hits;
}
const COLOR_PREFIX =
	/^(bg|text|border(?:-[xytrblse])?|ring(?:-offset)?|outline|fill|stroke|from|via|to|decoration|divide|caret|placeholder|accent)-(.+?)(?:\/\d+)?$/;
const TOKEN_RULES = [
	{
		name: "text size off the type scale",
		use: `text-${[...TEXT].join(", text-")}`,
		test: (u) => /^text-(xs|sm|base|lg|[2-9]?xl)$/.test(u) || /^text-\[\d+(\.\d+)?(px|rem)\]$/.test(u),
	},
	{
		name: "line height off the set",
		use: "leading-none, -tight, -relaxed (or the role's own)",
		test: (u) => /^leading-(snug|normal|loose|\[[^\]]*\])$/.test(u),
	},
	{
		name: "tracking or weight off the set",
		use: "tracking-tight, -wide, -caps; font-normal, -medium, -semibold",
		test: (u) =>
			/^tracking-(tighter|wider|widest|\[[^\]]*\])$/.test(u) ||
			/^font-(thin|extralight|light|bold|extrabold|black)$/.test(u),
	},
	{
		name: "radius that is not a role",
		use: `rounded-${[...RADII].join(", rounded-")}`,
		test: (u) => {
			const m = /^rounded(?:-(?:t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee))?(?:-(.+))?$/.exec(u);
			return !!m && !(m[1] && (RADII.has(m[1]) || m[1] === "none" || m[1] === "full"));
		},
	},
	{
		name: "shadow that is not a role",
		use: `shadow-${[...SHADOWS].join(", shadow-")}`,
		test: (u) => /^shadow(-(xs|sm|md|lg|xl|2xl|inner|\[[^\]]*\]))?$/.test(u),
	},
	{
		name: "colour the theme does not define",
		use: "the colour roles in tokens/tailwind.css",
		test: (u) => {
			const m = COLOR_PREFIX.exec(u);
			if (!m) return false;
			const v = m[2];
			if (COLORS.has(v)) return false;
			return STOCK.test(v) || COLOR_ROOTS.has(v.split("-")[0]);
		},
	},
	{
		name: "raw colour in a class",
		use: "a colour role",
		test: (u) => /-\[(#|rgba?\(|hsla?\(|oklch\((?!from[ _]var))/.test(u),
	},
	{
		name: "motion that is not a role",
		use: "motion-feedback, -floating, -glide, -travel, -arrive, -settle",
		test: (u) => /^(duration|delay)-(\d+|\[[^\]]*\])$/.test(u) || /^ease-(?!linear$)/.test(u),
	},
	{
		name: "layer by number",
		use: `z-0 to z-20 inside a component; z-${[...Z_KEYS].join(", z-")}`,
		test: (u) => /^-?z-\[[^\]]*\]$/.test(u) || (/^z-(\d+)$/.test(u) && Number(u.slice(2)) > 20),
	},
	{
		name: "spacing off the scale",
		use: `p-/m-/gap- steps ${[...SPACE_STEPS].join(" ")}; -indent, -corner`,
		test: (u) => {
			const m = /^-?(?:p[xytblrse]?|m[xytblrse]?|gap(?:-[xy])?|space-[xy]|scroll-[mp][xytblrse]?)-(.+)$/.exec(u);
			if (!m) return false;
			const v = m[1];
			if (/^\[/.test(v)) return /^\[-?[\d.]+(px|rem)\]$/.test(v);
			return /^[\d.]+$/.test(v) && !SPACE_STEPS.has(v);
		},
	},
	{
		name: "blur or drop shadow off the set",
		use: "backdrop-blur-scrim, -float; drop-shadow-handle",
		test: (u) =>
			/^(backdrop-)?blur(-(xs|sm|md|lg|xl|2xl|3xl|\[[^\]]*\]))?$/.test(u) ||
			/^drop-shadow(-(xs|sm|md|lg|xl|2xl|\[[^\]]*\]))?$/.test(u),
	},
	{
		name: "breakpoint of its own",
		use: "xs:, sm:, md:, lg:, xl:, 2xl: (and max-)",
		raw: true,
		test: (t) => /(^|:)(min|max)-\[[^\]]+\]:/.test(t),
	},
	{ name: "token that does not exist", use: "a name defined in design-system/tokens", find: undefinedTokens },
	{
		name: "motion written out in code",
		use: "MOTION, fmMotion, cssMotion, SPRING from design-system/motion.ts",
		find: (s) =>
			[
				...s.matchAll(
					/\d+m?s\s+(ease|linear\b)|cubic-bezier\(\s*[\d.]|ease:\s*\[|easing:\s*["'`]|type:\s*["']spring["']/g,
				),
			].map((m) => ({
				at: m.index,
				what: m[0],
			})),
	},
	{
		name: "icon size off the four",
		use: "size-icon-xs, -sm, -md, -lg (className)",
		find: (s) => {
			const icons = new Set();
			for (const m of s.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/g))
				for (const n of m[1].split(","))
					icons.add(
						n
							.trim()
							.split(/\s+as\s+/)
							.pop(),
					);
			return [...icons].filter(Boolean).flatMap((n) => tags(s, n).filter((t) => /\ssize=\{\d/.test(t.tag)));
		},
	},
];
// In the library's CSS and the apps' own: a literal where the token layer has a role for it. Comments do not count.
const CSS_RULES = [
	{
		name: "duration or curve written out",
		use: "var(--duration-<role>), var(--ease-<role>)",
		re: /\b\d+(\.\d+)?m?s\b|cubic-bezier\(/,
	},
	{ name: "colour written out", use: "a colour role", re: /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(|oklch\(\s*[\d.]/ },
	{ name: "breakpoint written out", use: "@media (width < theme(--breakpoint-md))", re: /@media[^{]*\d+(\.\d+)?px/ },
	{ name: "layer written out", use: "var(--z-<layer>)", re: /z-index:\s*(\d{2,})/ },
	{ name: "token in CSS that does not exist", use: "a name defined in design-system/tokens", find: undefinedTokens },
];
const ADOPTION_RULES = [
	{
		name: "pressed toggle by hand",
		use: "Button pressed, OptionWall",
		find: (s) => tags(s, "button").filter((t) => /aria-pressed=/.test(t.tag) && !/\bta-tab\b/.test(t.tag)),
	},
	{
		name: "turning chevron by hand",
		use: "FoldChevron, Disclosure",
		find: (s) => [...tags(s, "ChevronRight"), ...tags(s, "ChevronDown")].filter((t) => /rotate-/.test(t.tag)),
	},
	{
		name: "floating panel by hand",
		use: ".ta-float",
		find: (s) => classStrings(s).filter((c) => /bg-surface-raised\/9\d/.test(c.cls) && /(shadow|ring-1)/.test(c.cls)),
	},
	{
		name: "popup surface by hand",
		use: "POPUP from popup.ts",
		find: (s) => classStrings(s).filter((c) => /origin-\[var\(--transform-origin\)\]/.test(c.cls)),
	},
	{
		name: "section label by hand",
		use: ".ta-label",
		find: (s) => classStrings(s).filter((c) => /\buppercase\b/.test(c.cls) && /\btracking-/.test(c.cls)),
	},
	{
		name: "raw <input> (text-like)",
		use: "Input, SearchInput",
		find: (s) => tags(s, "input").filter((t) => !/type="(hidden|file|color|checkbox|radio|range)"/.test(t.tag)),
	},
	{ name: "native <select>", use: "Dropdown", find: (s) => tags(s, "select") },
	{
		name: "raw <button> with its own hover fill",
		use: "Button, or a HoverPill on the list",
		find: (s) =>
			tags(s, "button").filter(
				(t) => /hover:bg-/.test(t.tag) && !/\bta-tab\b/.test(t.tag) && !/data-pill-skip/.test(t.tag),
			),
	},
	{
		name: ".ta-seg without SegIndicator",
		use: "OptionWall, or SegIndicator as the first child",
		find: (s) =>
			/\bta-seg\b/.test(s) && !/SegIndicator|OptionWall|<Tabs\b/.test(s) ? [{ at: s.search(/\bta-seg\b/) }] : [],
	},
	{
		name: "card or frame surface by hand",
		use: ".ta-card, .ta-well",
		find: (s) =>
			classStrings(s).filter(
				(c) =>
					/\brounded-(control|surface|overlay|sheet)\b/.test(c.cls) &&
					/\bborder\b/.test(c.cls) &&
					/\bborder-line/.test(c.cls) &&
					!/border-dashed/.test(c.cls),
			),
	},
	{
		name: "tinted notice or tag by hand",
		use: "Notice, Badge",
		find: (s) => classStrings(s).filter((c) => /\bbg-(danger|warning|info|success)-subtle\b/.test(c.cls)),
	},
	{
		name: "inline link styled by hand",
		use: ".ta-link, .ta-link-quiet",
		find: (s) =>
			classStrings(s).filter((c) => /hover:underline|\bunderline-offset-/.test(c.cls) && !/\bta-link/.test(c.cls)),
	},
	{
		name: "spinner by hand",
		use: "Spinner",
		find: (s) => classStrings(s).filter((c) => /\banimate-spin\b/.test(c.cls)),
	},
	{
		name: "browser title= tooltip on a button",
		use: "Tooltip",
		find: (s) => [...tags(s, "button"), ...tags(s, "Button")].filter((t) => /\stitle=/.test(t.tag)),
	},
	{ name: "raw <kbd>", use: "Kbd", find: (s) => tags(s, "kbd") },
	{
		name: "native range or checkbox input",
		use: "RangeInput, Slider, Checkbox",
		find: (s) => tags(s, "input").filter((t) => /type="(range|checkbox)"/.test(t.tag)),
	},
	{
		name: "fixed overlay by hand",
		use: "Modal, bottom-sheet.tsx",
		find: (s) => classStrings(s).filter((c) => /\bfixed inset-0\b/.test(c.cls)),
	},
];

// ─── Run ───
const lineOf = (s, at) => s.slice(0, at).split("\n").length;
const KEEP = /ds-check: keep \(\s*[^)\s][^)]*\)/;
const kept = (lines, line) => KEEP.test(lines[line - 1] ?? "") || KEEP.test(lines[line - 2] ?? "");
const RULES = [
	...TOKEN_RULES.map((r) => ({ ...r, family: "tokens" })),
	...CSS_RULES.map((r) => ({ ...r, family: "css" })),
	...ADOPTION_RULES.map((r) => ({ ...r, family: "adoption" })),
];
const hits = new Map(RULES.map((r) => [r.name, []]));
const counts = {};
for (const f of files) {
	const s = readFileSync(f, "utf8");
	const lines = s.split("\n");
	for (const r of RULES) {
		if (isCss(f) !== (r.family === "css")) continue;
		if (r.family === "adoption" && (isLibrary(f) || f.startsWith("lib/"))) continue;
		if (f === "design-system/motion.ts" && r.name === "motion written out in code") continue;
		const found = r.find ? r.find(s) : r.family === "css" ? cssHits(s, r.re) : tokenHits(s, r.test, r.raw);
		for (const h of found) {
			const line = lineOf(s, h.at);
			if (kept(lines, line)) continue;
			hits.get(r.name).push(`${f}:${line}${h.what ? `  ${h.what}` : ""}`);
			counts[f] ??= {};
			counts[f][r.name] = (counts[f][r.name] ?? 0) + 1;
		}
	}
}

console.log(
	`${files.length} files${only.length ? " (given)" : ": app/, components/, lib/, design-system/, tools/searcher/app/src"}`,
);
let total = 0;
for (const family of ["tokens", "css", "adoption"]) {
	console.log(`  ${family}`);
	for (const r of RULES.filter((x) => x.family === family)) {
		const h = hits.get(r.name);
		total += h.length;
		const nf = new Set(h.map((x) => x.split(":")[0])).size;
		console.log(
			`    ${r.name.padEnd(38)} ${String(h.length).padStart(4)} in ${String(nf).padStart(3)} files   → ${r.use}`,
		);
		if (listHits) for (const x of h) console.log(`        ${x}`);
	}
}
console.log(`    ${"total".padEnd(38)} ${String(total).padStart(4)}`);

if (update) {
	writeFileSync(BASELINE, JSON.stringify(counts, null, "\t") + "\n");
	console.log(`baseline written: ${BASELINE}`);
} else if (!only.length && existsSync(BASELINE)) {
	// The ratchet: a count may fall, never rise. Counted per file and rule, not per line, so moving code is free.
	const base = JSON.parse(readFileSync(BASELINE, "utf8"));
	const rises = [];
	for (const [f, byRule] of Object.entries(counts))
		for (const [rule, n] of Object.entries(byRule))
			if (n > (base[f]?.[rule] ?? 0)) rises.push(`${f}: ${rule} ${base[f]?.[rule] ?? 0} → ${n}`);
	if (rises.length) {
		console.log(`\nAbove the baseline (${BASELINE}):`);
		for (const r of rises) console.log(`  ${r}`);
		process.exit(1);
	}
} else if (only.length && total > 0) process.exit(1);
