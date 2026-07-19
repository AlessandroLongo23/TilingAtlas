// M2 verification: the selection-transition wave on the flat shader. Load /play, settle on one tiling,
// switch to another via window.__play.select, then screenshot several frames across the 1.4s transition
// (700ms collapse + 700ms grow). Mid-transition frames should show tiles partially scaled about their
// centroids in a radial (centre-first) pattern — the wave. Headed → real GPU. Needs the dev server (:3000).
// Run: node scripts/wave-capture.mjs   (writes OUT/wave-<ms>.png)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = process.env.OUT || "/tmp/wave";
mkdirSync(OUT, { recursive: true });
const CLIP = { x: 480, y: 70, width: 900, height: 800 };

const browser = await chromium.launch({ headless: process.env.HEADLESS === "1" });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
await page.goto("http://localhost:3000/play", { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector("canvas", { timeout: 60000 });
await page.waitForFunction(() => window.__play?.list?.length > 0, { timeout: 30000 });

// Two distinct regular tilings so the collapse/grow swaps visibly different geometry.
const picked = await page.evaluate(() => {
	const list = window.__play.list;
	const a = list.find((t) => t.k === 1) || list[0];
	const b = list.find((t) => t.k === 1 && t !== a) || list[1];
	window.__A = list.indexOf(a);
	window.__B = list.indexOf(b);
	// Ensure the wave is enabled and the flat shader owns the fill.
	window.__stores.configuration.setState({ euclideanShader: true, tilingTransition: true, isIslamic: false });
	return { a: a.canonicalKey, b: b.canonicalKey };
});
console.log("A =", picked.a, " B =", picked.b);

async function settle(idx) {
	await page.evaluate((i) => {
		window.__play.select(window.__play.list[i]);
		const s = window.__stores.configuration.getState();
		s.controls.zoom = 55; s.controls.targetZoom = 55;
		s.controls.offset.x = 0; s.controls.offset.y = 0;
		s.controls.targetOffset.x = 0; s.controls.targetOffset.y = 0;
	}, idx);
	await page.waitForTimeout(1800);
}

await settle(await page.evaluate(() => window.__A));
await page.screenshot({ path: `${OUT}/wave-000-before.png`, clip: CLIP });

// Kick off the switch to B, then grab frames across the 1.4s transition.
await page.evaluate(() => window.__play.select(window.__play.list[window.__B]));
const stamps = [180, 420, 700, 950, 1250, 1600];
let prev = 0;
for (const t of stamps) {
	await page.waitForTimeout(t - prev);
	prev = t;
	await page.screenshot({ path: `${OUT}/wave-${String(t).padStart(4, "0")}.png`, clip: CLIP });
	console.log("shot", t, "ms");
}

await browser.close();
console.log("done ->", OUT);
