// M3 verification: the vertex-orbit dots on the flat shader. Picks the highest-k Regular-shelf tiling that
// carries orbit data (exactSource), turns on showVertexOrbits, and captures three frames for comparison:
//   orbit-p5.png   shader OFF  — p5 draws the dots + dims the tiles (the reference)
//   orbit-gpu.png  shader ON   — EuclideanCanvas draws the dots + dims the tiles (the port)
//   orbit-hover.png shader ON, mouse over the canvas centre — the hovered orbit's dots grow to 2x
// The GPU and p5 frames should match (pale-dimmed tiles, orbit-coloured dots); the hover frame should show
// one orbit enlarged. Headed → real GPU. Needs the dev server (:3000). Run: node scripts/orbit-capture.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = process.env.OUT || "/tmp/orbit";
mkdirSync(OUT, { recursive: true });
const CLIP = { x: 480, y: 70, width: 900, height: 800 };

const browser = await chromium.launch({ headless: process.env.HEADLESS === "1" });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
await page.goto("http://localhost:3000/play", { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector("canvas", { timeout: 60000 });
await page.waitForFunction(() => window.__play?.list?.length > 0, { timeout: 30000 });
await page.waitForTimeout(2500); // let the atlas shards merge so the Regular shelf is present

const picked = await page.evaluate(() => {
	const list = window.__play.list;
	const src = list.filter((t) => t.exactSource); // only these carry orbit data
	src.sort((a, b) => (b.k || 0) - (a.k || 0));
	window.__stores.configuration.setState({ showVertexOrbits: true, isIslamic: false });
	window.__play.select(src[0]);
	const s = window.__stores.configuration.getState();
	s.controls.zoom = 70; s.controls.targetZoom = 70;
	s.controls.offset.x = 0; s.controls.offset.y = 0;
	s.controls.targetOffset.x = 0; s.controls.targetOffset.y = 0;
	return { key: src[0].canonicalKey, k: src[0].k };
});
console.log("picked", picked.key, "k =", picked.k);
await page.waitForTimeout(3000); // wait for the async orbit-data compute + settle

async function shot(name, shader) {
	await page.evaluate((on) => window.__stores.configuration.setState({ euclideanShader: on }), shader);
	await page.waitForTimeout(1200);
	await page.screenshot({ path: `${OUT}/${name}.png`, clip: CLIP });
	console.log("wrote", name);
}

await shot("orbit-p5", false);
await shot("orbit-gpu", true);

// Hover: sweep the mouse across the canvas centre so it lands on a dot, then let the grow ease settle.
for (const [x, y] of [[930, 470], [929, 469], [930, 471]]) { await page.mouse.move(x, y); await page.waitForTimeout(120); }
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/orbit-hover.png`, clip: CLIP });
console.log("wrote orbit-hover");

await browser.close();
console.log("done ->", OUT);
