// Accessibility check: loads the site's pages in Chromium, in the light and the dark theme, runs axe-core on
// each and reports every WCAG 2.2 A/AA violation, colour contrast first, grouped so one bad token shows up as
// one line with the pages it reaches. Text drawn on a canvas is invisible to it; only DOM text is measured.
//
// Usage:
//   node scripts/a11y-check.mjs                                   # localhost:3000, every route, both themes
//   node scripts/a11y-check.mjs --base https://thetilingatlas.com --viewports desktop,phone \
//     --out experiments/results/a11y-prod.md
//   node scripts/a11y-check.mjs --app ~/Applications/The\ Tiling\ Searcher.app/Contents/MacOS/The\ Tiling\ Searcher
// --app checks the Searcher (an Electron build): a second copy with its own data folder, beside the one in use,
// reading the installed app's runs, through its screens (SEARCHER_SCREENS). Run it outside the sandbox; the
// script unsets ELECTRON_RUN_AS_NODE for the app.
// Needs axe-core 4.14 or later: 4.11 cannot parse the oklab() Chromium computes for a color-mix() background
// and skips the contrast rule for the whole page. A rule that errors lists the page as not fully checked.
// Flags: --base, --routes "/a,/b?x=1" (with --app, screen names), --themes light,dark, --viewports desktop,phone,
//        --rules color-contrast (axe rule ids; default every WCAG 2.2 A/AA rule), --wait ms after load,
//        --jobs (pages at once), --out (markdown report, written as the run goes).
// Exits 1 when any violation is found or a page could not be fully checked.
import { chromium } from "playwright";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

const ROUTES = [
	"/",
	"/catalogue",
	"/catalogue?set=krotenheerdt",
	"/catalogue?geo=hyperbolic",
	"/catalogue?geo=spherical",
	"/catalogue?dec=edges",
	"/catalogue?dec=colorings",
	"/catalogue/view",
	"/catalogue/about",
	"/catalogue/about/prototiles",
	"/catalogue/about/squared-rectangles",
	"/catalogue/about/squared-rectangles/pipeline",
	"/catalogue/about/vertex-configurations",
	"/catalogue/about/vertex-lookup",
	"/parquet",
	"/parquet/about",
	"/freedraw",
	"/freedraw/about",
	"/colors",
	"/colors/about",
	"/aperiodic",
	"/aperiodic/about",
	"/isohedral",
	"/isohedral/about",
	"/pentagons",
	"/pentagons/about",
	"/automata",
	"/automata/about",
	"/heesch",
	"/heesch/about",
	"/frames",
	"/frames/about",
	"/history",
	"/polychora",
	"/updates",
	"/searcher/download/mac",
	"/defense",
];
const VIEWPORTS = { desktop: { width: 1280, height: 900 }, phone: { width: 390, height: 844 } };
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];

// The Searcher's screens. Each starts from a fresh window (remembered UI state cleared) and clicks navigation or
// selection only, never an action (run, delete, compress). A run is picked by its tile on the disk map: the
// largest with the unfinished dot, and the largest with no status dot (finished). A tile is a shaded div, not a
// control: the run list is the keyboard's way in.
const TILE = '.ta-well div[style*="radial-gradient"]';
const runs = (p) => p.getByRole("button", { name: /^Runs/ }).click();
const pickRun = async (p, finished) => {
	await runs(p);
	await p.locator(TILE).first().waitFor({ timeout: 60000 }); // the map appears once the runs are sized
	const picked = await p.evaluate(
		([sel, finished]) => {
			const tile = [...document.querySelectorAll(sel)]
				.filter((t) => (finished ? !t.querySelector(".rounded-full") : t.querySelector(".bg-signal-attention")))
				.sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight)[0];
			tile?.click();
			return tile ? "picked" : "none";
		},
		[TILE, finished],
	);
	if (picked === "none") throw new Error(`no ${finished ? "finished" : "unfinished"} run on the disk map`);
};
const SEARCHER_SCREENS = {
	Board: async () => {},
	"Board: text": (p) => p.getByText("Text", { exact: true }).click(),
	"Board: prove existence": (p) => p.getByText("Prove existence").click(),
	"Board: a study": (p) => p.getByText("A study").click(),
	"Board: examples menu": (p) => p.getByRole("button", { name: "Examples" }).click(),
	"Board: quick setup": (p) => p.getByRole("button", { name: "Quick setup" }).click(),
	"Board: draw a face": (p) => p.getByRole("button", { name: "Draw a face" }).click(),
	Settings: (p) => p.getByRole("button", { name: "Settings" }).click(),
	Runs: runs,
	"Runs: an unfinished run": (p) => pickRun(p, false),
	"Runs: a finished run": (p) => pickRun(p, true),
};
const SEARCHER_SETTINGS = join(homedir(), "Library/Application Support/The Tiling Searcher/settings.json");

const { values } = parseArgs({
	options: {
		base: { type: "string", default: "http://localhost:3000" },
		app: { type: "string", default: "" },
		routes: { type: "string", default: "" },
		themes: { type: "string", default: "light,dark" },
		viewports: { type: "string", default: "desktop" },
		rules: { type: "string", default: "" },
		wait: { type: "string", default: "2500" },
		jobs: { type: "string", default: "4" },
		out: { type: "string", default: "" },
	},
});
const list = (s) =>
	s
		.split(",")
		.map((x) => x.trim())
		.filter(Boolean);
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const runOnly = values.rules ? { type: "rule", values: list(values.rules) } : { type: "tag", values: WCAG };

const app = values.app;
const routes = values.routes ? list(values.routes) : app ? Object.keys(SEARCHER_SCREENS) : ROUTES;
const jobs = [];
for (const route of routes)
	for (const viewport of app ? ["window"] : list(values.viewports))
		for (const theme of list(values.themes)) jobs.push({ route, viewport, theme });

const out = values.out;
const log = (line) => {
	console.log(line);
	if (out) appendFileSync(out, line + "\n");
};
if (out) {
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(
		out,
		`# Accessibility check: ${app || values.base}\n\nStarted ${new Date().toISOString()}, ${jobs.length} pages.\n\n`,
	);
}

// One entry per distinct problem, keyed by rule, colours and the element's tag and classes, so a component
// that fails on 40 cards is one entry with a count and the pages it was seen on.
const found = new Map();
const failedPages = [];

const started = Date.now();
let done = 0;

// axe on the page as it stands, every failing element recorded under its problem. Text whose contrast axe
// cannot measure (on a gradient or an image, under a translucent layer) is recorded too, as `unmeasured`: a
// page with no failures may only have nothing axe could read.
async function audit(page, where, theme) {
	await page.evaluate(axeSource);
	const { nodes, errors } = await page.evaluate(async (runOnly) => {
		const { violations, incomplete } = await window.axe.run(document, {
			runOnly,
			resultTypes: ["violations", "incomplete"],
		});
		const unmeasured = incomplete
			.filter((v) => v.id === "color-contrast")
			.map((v) => ({
				...v,
				id: "unmeasured",
				nodes: v.nodes.map((n) => ({ ...n, reason: n.any[0]?.data?.messageKey ?? n.any[0]?.message })),
			}));
		// A rule that throws (a colour axe cannot parse) reports one node and drops the rest of the page.
		const errors = [...violations, ...incomplete].filter((v) => v.error).map((v) => `${v.id}: ${v.error.message}`);
		const nodes = [...violations, ...unmeasured.filter((v) => !v.error)].flatMap((v) =>
			v.nodes.map((node) => {
				const el = document.querySelector(node.target[0]);
				return {
					rule: v.id,
					impact: v.impact,
					help: v.help,
					element: el ? `<${el.tagName.toLowerCase()} class="${el.getAttribute("class") ?? ""}">` : node.html,
					text: (el?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
					data: v.id === "color-contrast" ? node.any[0]?.data : undefined,
					// Why it failed: the colour pair says it for contrast; for any other rule, axe's own message and the
					// element it names (the target covering this one, say).
					reason:
						node.reason ??
						(v.id === "color-contrast"
							? undefined
							: [...node.any, ...node.all, ...node.none]
									.slice(0, 1)
									.map((c) => [c.message, c.relatedNodes?.[0]?.html.slice(0, 160)].filter(Boolean).join(": "))[0]),
				};
			}),
		);
		return { nodes, errors };
	}, runOnly);
	for (const n of nodes) {
		const d = n.data;
		const pair = d ? `${d.fgColor} on ${d.bgColor}` : "";
		const key = [n.rule, d ? theme : "", pair, n.reason ?? "", n.element].join("|");
		if (!found.has(key))
			found.set(key, {
				...n,
				theme,
				pair,
				ratio: d?.contrastRatio,
				needed: d?.expectedContrastRatio,
				count: 0,
				where: new Set(),
			});
		const e = found.get(key);
		e.count++;
		e.where.add(where);
	}
	// The page's other findings are kept; the page is listed as not fully checked.
	if (errors.length) throw new Error(`axe rule did not run, ${errors.join("; ")}`);
	return nodes.filter((n) => n.rule !== "unmeasured").length;
}

async function check(job, open) {
	const where = `${job.route} (${job.theme}, ${job.viewport})`;
	try {
		const n = await open(job, (page) => audit(page, where, job.theme));
		done++;
		const eta = Math.round((((Date.now() - started) / done) * (jobs.length - done)) / 1000);
		log(`- [${done}/${jobs.length}] ${where}: ${n} failing element${n === 1 ? "" : "s"} (ETA ${eta}s)`);
	} catch (e) {
		done++;
		failedPages.push(`${where}: ${e.message.split("\n")[0]}`);
		log(`- [${done}/${jobs.length}] ${where}: could not check (${e.message.split("\n")[0]})`);
	}
}

if (app) {
	// The installed app's settings say where the runs are; the copy never resumes or queues a search.
	const data = mkdtempSync(join(tmpdir(), "a11y-searcher-"));
	try {
		const saved = JSON.parse(readFileSync(SEARCHER_SETTINGS, "utf8"));
		writeFileSync(
			join(data, "settings.json"),
			JSON.stringify({ ...saved, queue: [], interrupted: [], resumeOnLaunch: false }),
		);
	} catch {} // no installed app: the copy starts empty
	const env = { ...process.env, TILESEARCH_DATA: data };
	delete env.ELECTRON_RUN_AS_NODE;
	const port = 9300 + Math.floor(Math.random() * 600);
	const child = spawn(app, [`--remote-debugging-port=${port}`], { env, stdio: "ignore" });
	let browser;
	for (let i = 0; !browser && i < 60; i++)
		browser = await chromium
			.connectOverCDP(`http://127.0.0.1:${port}`)
			.catch(() => new Promise((r) => setTimeout(r, 500)));
	if (!browser) throw new Error(`${app} did not open a DevTools port`);
	while (!browser.contexts()[0]?.pages()[0]) await new Promise((r) => setTimeout(r, 200));
	const page = browser.contexts()[0].pages()[0];
	for (const job of jobs)
		await check(job, async ({ route, theme }, run) => {
			await page.evaluate((t) => (localStorage.clear(), localStorage.setItem("theme", t)), theme);
			await page.reload({ waitUntil: "load" });
			await page.waitForTimeout(1500);
			await SEARCHER_SCREENS[route](page);
			await page.waitForTimeout(Number(values.wait));
			return run(page);
		});
	await browser.close();
	child.kill();
	await once(child, "exit");
	rmSync(data, { recursive: true, force: true });
} else {
	const browser = await chromium.launch();
	const queue = [...jobs];
	await Promise.all(
		Array.from({ length: Number(values.jobs) }, async () => {
			while (queue.length)
				await check(queue.shift(), async ({ route, viewport, theme }, run) => {
					const ctx = await browser.newContext({
						viewport: VIEWPORTS[viewport],
						colorScheme: theme,
						reducedMotion: "reduce",
					});
					await ctx.addInitScript((t) => localStorage.setItem("theme", t), theme);
					try {
						const page = await ctx.newPage();
						await page.goto(values.base + route, { waitUntil: "load", timeout: 90000 });
						await page.waitForTimeout(Number(values.wait));
						return await run(page);
					} finally {
						await ctx.close();
					}
				});
		}),
	);
	await browser.close();
}

// The report: contrast first, worst ratio first; then every other rule, the most widespread first.
const entries = [...found.values()];
const contrast = entries.filter((e) => e.rule === "color-contrast").sort((a, b) => a.ratio - b.ratio);
const other = entries
	.filter((e) => e.rule !== "color-contrast" && e.rule !== "unmeasured")
	.sort((a, b) => b.where.size - a.where.size);
const unmeasured = entries.filter((e) => e.rule === "unmeasured").sort((a, b) => b.count - a.count);
const show = (e) =>
	`  ${e.count} element${e.count === 1 ? "" : "s"} like \`${e.element.slice(0, 180)}\`${e.text ? ` "${e.text}"` : ""}\n  on ${[...e.where].join("; ")}`;

const pairs = new Map();
for (const e of contrast) {
	const k = `${e.ratio}:1 ${e.pair} (${e.theme})`;
	pairs.set(k, (pairs.get(k) ?? 0) + e.count);
}
log(`\n## Colour contrast: ${contrast.length} components, ${contrast.reduce((s, e) => s + e.count, 0)} elements\n`);
log("By colour pair:\n");
for (const [k, n] of pairs) log(`- ${k}: ${n}`);
log("");
for (const e of contrast)
	log(`- ${e.ratio}:1, needs ${e.needed}: ${e.pair}, ${e.data.fontSize} ${e.data.fontWeight}, ${e.theme}\n${show(e)}`);
log(`\n## Other rules: ${other.length} components\n`);
for (const e of other) log(`- ${e.rule} (${e.impact}): ${e.help}${e.reason ? `. ${e.reason}` : ""}\n${show(e)}`);
const reasons = new Map();
for (const e of unmeasured) reasons.set(e.reason, (reasons.get(e.reason) ?? 0) + e.count);
log(`\n## Contrast axe could not measure: ${unmeasured.reduce((s, e) => s + e.count, 0)} elements\n`);
log(`By reason: ${[...reasons].map(([r, n]) => `${r} ${n}`).join(", ")}\n`);
for (const e of unmeasured.slice(0, 25)) log(`- ${e.reason}\n${show(e)}`);
if (failedPages.length) log(`\n## Pages that could not be checked\n\n${failedPages.map((p) => `- ${p}`).join("\n")}`);
log(`\nFinished in ${Math.round((Date.now() - started) / 1000)}s.`);
process.exit(contrast.length || other.length || failedPages.length ? 1 : 0);
