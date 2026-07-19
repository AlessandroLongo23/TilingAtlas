// Parity sweep before flipping euclideanShader on by default: for a spread of representative euclidean
// tilings, screenshot the flat render with the shader OFF (p5) vs ON (WebGL) at the same view, cropped to
// the canvas, so the two can be compared. Headed → real GPU. Needs the dev server (pnpm dev, :3000).
// Run: node scripts/parity-sweep.mjs   (writes OUT/<label>-{off,on}.png)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = process.env.OUT || "/tmp/parity";
mkdirSync(OUT, { recursive: true });
const CLIP = { x: 480, y: 70, width: 900, height: 800 };

const browser = await chromium.launch({ headless: process.env.HEADLESS === "1" });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
await page.goto("http://localhost:3000/play", { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector("canvas", { timeout: 60000 });
await page.waitForFunction(() => window.__play?.list?.length > 0, { timeout: 30000 });

// Pick representatives by predicate (the sweep prints what it actually chose).
const picks = await page.evaluate(() => {
	const list = window.__play.list;
	const find = (pred) => list.find(pred);
	const chosen = {
		star: find((t) => /star/.test(t.canonicalKey || "")),
		k3: find((t) => t.k === 3),
		parametric: find((t) => t.paramCell && t.k <= 2),
		regular: find((t) => t.k === 1 && !t.paramCell) || find((t) => t.k === 1),
	};
	// stash indices so we can re-select by index inside each scenario
	window.__pick = {};
	for (const [k, v] of Object.entries(chosen)) window.__pick[k] = v ? list.indexOf(v) : -1;
	const nameOf = (t) => t && (t.canonicalKey || "?");
	return Object.fromEntries(Object.entries(chosen).map(([k, v]) => [k, nameOf(v)]));
});
console.log("picks:", JSON.stringify(picks, null, 0));

async function selectByPick(key) {
	await page.evaluate((k) => {
		const i = window.__pick[k];
		if (i >= 0) window.__play.select(window.__play.list[i]);
		// moderate zoom so tiles are clearly visible for the compare
		const s = window.__stores.configuration.getState();
		s.controls.zoom = 55; s.controls.targetZoom = 55;
		s.controls.offset.x = 0; s.controls.offset.y = 0;
		s.controls.targetOffset.x = 0; s.controls.targetOffset.y = 0;
	}, key);
	await page.waitForTimeout(1600); // grid rebuild for the new tiling
}

async function shot(label, extra) {
	// OFF (p5)
	await page.evaluate((e) => window.__stores.configuration.setState({ euclideanShader: false, ...e }), extra);
	await page.waitForTimeout(700);
	await page.screenshot({ path: `${OUT}/${label}-off.png`, clip: CLIP });
	// ON (WebGL)
	await page.evaluate((e) => window.__stores.configuration.setState({ euclideanShader: true, ...e }), extra);
	await page.waitForTimeout(700);
	await page.screenshot({ path: `${OUT}/${label}-on.png`, clip: CLIP });
	console.log("wrote", label, "off/on");
}

const base = { showPolygonPoints: false, showPolygonFill: true, isIslamic: false, circlePacking: false, showSymmetryElements: false };

for (const key of ["star", "k3", "parametric", "regular"]) {
	await selectByPick(key);
	await shot(key, base);
}
// Dark-theme + outline-only on the regular tiling → exercises the white-stroke branch.
await selectByPick("regular");
await page.evaluate(() => document.documentElement.classList.add("dark"));
await shot("regular-dark-outline", { ...base, showPolygonFill: false });
await page.evaluate(() => document.documentElement.classList.remove("dark"));

await browser.close();
console.log("done ->", OUT);
