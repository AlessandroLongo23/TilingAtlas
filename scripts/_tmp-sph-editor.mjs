import { chromium } from "playwright";
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.setDefaultTimeout(180000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForSelector("canvas");
await page.waitForTimeout(15000);
await page.screenshot({ path: out + "-a.png", timeout: 180000 });
const handles = await page.locator("svg circle.cursor-grab").all();
console.log("handles:", handles.length);
if (handles.length) {
	const b = await handles[0].boundingBox();
	await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
	await page.mouse.down();
	await page.mouse.move(b.x + b.width / 2 + 14, b.y + b.height / 2 - 22, { steps: 6 });
	await page.mouse.up();
	await page.waitForTimeout(6000);
	await page.screenshot({ path: out + "-b.png", timeout: 180000 });
}
console.log("page errors:", errors.length, errors.slice(0, 3));
await browser.close();
