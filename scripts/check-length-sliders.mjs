// Drive the REAL length sliders on /play, one at a time, and prove each one changes the tiling.
//
// Not the __stores back door: that hook is registered by a lazily-loaded chunk, so it is undefined at
// --setup time, and it would in any case skip the thing under test. This moves the actual <input
// type="range"> the user moves, and asserts the canvas pixels change — a slider that renders but does
// not redraw is exactly the failure worth catching.
//
// ⚑ ONE SLIDER AT A TIME, 2026-08-18. The first version moved two sliders together and asked only
// whether ANY of the four screenshots differed, which is a test that a family with eight phantom
// sliders passes as easily as one with none. The shelf shipped 134 rows carrying more sliders than the
// tiling had freedom, and this script was the closest thing to a check on them. Now each slider is
// swept alone from its low end to its high end, and a slider that leaves the canvas untouched fails
// the run and is named.
//
// Usage: node scripts/check-length-sliders.mjs [tilingId] [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

const id = process.argv[2] ?? "plen-pythagorean";
const out = process.argv[3] ?? "/tmp";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
await page.goto(`http://localhost:3000/play?tiling=${id}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector("canvas", { timeout: 60000 });
// Scope to the param panel: /play also carries a lineWidth range and other hidden ones, so a bare
// input[type=range] resolves to the wrong element and then waits forever for it to be visible.
const PANEL = 'div.absolute.bottom-4 input[type="range"]';
// /play blocks the main thread for ~8s parsing the eager atlas, so the panel simply is not mounted
// yet; poll for it instead of guessing a constant. It also rewrites its own URL once the deep link
// resolves, which destroys the execution context mid-evaluate, so settle before touching anything.
for (let i = 0; i < 40 && (await page.$$(PANEL)).length < 1; i++) await page.waitForTimeout(1000);
await page.waitForTimeout(3500);

// A family with more than four parameters folds the rest away; open them so every one is reachable.
const more = page.locator("div.absolute.bottom-4 button", { hasText: /more (parameter|corner)/ });
if (await more.count()) { await more.first().click(); await page.waitForTimeout(600); }

let sliders = await page.$$(PANEL);
console.log(`${id}: ${sliders.length} slider(s)`);
if (!sliders.length) { console.error("FAIL: no length sliders on the panel"); await browser.close(); process.exit(1); }

/** Set a range input the way a drag does: native setter + an input event React listens to. */
async function setSlider(i, value) {
	sliders = await page.$$(PANEL);   // re-query: a redraw can replace the nodes
	await sliders[i].evaluate((el, v) => {
		const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
		set.call(el, String(v));
		el.dispatchEvent(new Event("input", { bubbles: true }));
		el.dispatchEvent(new Event("change", { bubbles: true }));
	}, value);
	await page.waitForTimeout(900);
}

// The LARGEST canvas, not the first. /play mounts a thumbnail canvas per catalogue card, and which one
// comes first in the DOM depends on where the sidebar happens to be scrolled — so `.first()` quietly
// screenshotted a 150px card that no slider can change, and reported every family as dead.
const mainCanvas = async () => {
	const boxes = await page.$$eval("canvas", (ns) => ns.map((n, i) => [i, n.clientWidth * n.clientHeight]));
	const [best] = boxes.sort((a, b) => b[1] - a[1]);
	return (await page.$$("canvas"))[best[0]];
};
const shot = async (name) => {
	const buf = await (await mainCanvas()).screenshot({ path: `${out}/slider-${name}.png` });
	return createHash("sha1").update(buf).digest("hex").slice(0, 12);
};
const label = async () => (await page.$$eval("div.absolute.bottom-4 span.text-accent",
	(ns) => ns.map((n) => n.textContent?.trim()).filter((t) => t?.includes("=")))).join("  |  ");

const bounds = await page.$$eval(PANEL, (ns) => ns.map((n) => [Number(n.min), Number(n.max)]));
const home = bounds.map(([lo, hi]) => lo + (hi - lo) * 0.5);
for (let i = 0; i < home.length; i++) await setSlider(i, home[i]);
const base = await shot("home");
console.log(`  home         ${base}   ${await label()}`);

const dead = [];
for (let i = 0; i < bounds.length; i++) {
	const [lo, hi] = bounds[i];
	const seen = new Set([base]);
	for (const v of [lo + (hi - lo) * 0.08, lo + (hi - lo) * 0.92]) {
		await setSlider(i, v);
		seen.add(await shot(`p${i}-${v.toFixed(3)}`));
	}
	await setSlider(i, home[i]);            // put it back so the next slider is tested alone
	console.log(`  slider ${String(i + 1).padStart(2)}    ${seen.size > 1 ? "moves the tiling" : "CHANGES NOTHING"}`);
	if (seen.size === 1) dead.push(i + 1);
}

if (dead.length) {
	console.error(`FAIL: ${dead.length} of ${bounds.length} sliders change nothing (${dead.join(", ")}) — ` +
		`the family has fewer degrees of freedom than it offers`);
	await browser.close();
	process.exit(1);
}
console.log(`PASS: all ${bounds.length} sliders move the tiling`);
await browser.close();
