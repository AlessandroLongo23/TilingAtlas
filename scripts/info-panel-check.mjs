// The info panel across the atlas: opens each record in /play, pins the panel, measures it and writes a
// PNG of it. One record per shelf over all three geometries, so a layout change is seen on every kind of
// card and not only on the one being worked on.
//
//   node scripts/info-panel-check.mjs <outdir> <width> <height> [id ...]      BASE=http://localhost:3000
//
// A row is ✓ when the panel ends inside the window and nothing in it is wider than it. "scrolls" means
// the body is taller than the room it has and scrolls inside the card, which is correct in a short window.
import { chromium } from "playwright";
const [dir, W, H, ...only] = process.argv.slice(2);
const ALL = [
	// Euclidean
	["t1003", "eu regular k1"], ["ctrnact-08_34-4o_5d2_5e_5f3_6f-1", "eu regular k8"], ["ctrnact-10_34-4o_4u2_5d4_5f_6i_6j-1", "eu regular k10"],
	["hollow-8_4-3_8-5", "eu hollow"], ["ctrnact-isotoxal-family-k1-01", "eu isotoxal"], ["ctrnact-mixed-family-k1-01", "eu mixed"],
	["d-ctrnact-01_3t-4cs-1", "eu scaled"], ["penrose-k1-001", "eu penrose"], ["dom-ctrnact-01_i-2aa_4aa-1", "eu polyform"], ["isl-4a-488", "eu islamic"],
	["fd4436-2-00001", "eu freedraw"], ["colh3-3-00001", "eu colors"],
	// Hyperbolic
	["hyp-6-6-7", "hyp k1"], ["hyp-3-3-3-3-7", "hyp snub"], ["hyp-k2-4-5-5-5-5-5-5__4-5-5-5-5-5-5-di", "hyp k2 long"], ["he333334-2-00001", "hyp edges"], ["hc37-2-00001", "hyp colors"], ["hpq4568-10-00001", "hyp a.b.c.d k10"],
	// Spherical
	["sph-5-3", "sph platonic"], ["arch-cuboctahedron", "sph archimedean"], ["sph-square-pyramid", "sph johnson"], ["sph-ncx-12-25-15-a", "sph non-convex"],
	["sph-tor-16-36-20", "sph toroidal"], ["sph-hemi-tetrahemihexahedron", "sph hemi"], ["sph-iso-20-30-12", "sph isotoxal"], ["ss-12-30-12-d3-r20344", "sph star"],
	["sph-noble-d-3", "noble Hess"], ["sph-noble-td-3-1", "noble long"], ["sph-noble-d-4", "noble note"], ["sph-noble-stephanoid-prismatic", "noble family"], ["sph-noble-c-1", "noble cube"],
];
const list = only.length ? ALL.filter(([id]) => only.includes(id)) : ALL;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: Number(W), height: Number(H) } });
const errors = [];
p.on("pageerror", (e) => errors.push(String(e).slice(0, 140)));
const rows = [];
for (const [id, label] of list) {
	try {
		await p.goto(`${process.env.BASE ?? "http://localhost:3000"}/play?source=reference&tiling=${encodeURIComponent(id)}`, { waitUntil: "domcontentloaded" });
		await p.waitForSelector("canvas", { timeout: 60000 });
		await p.waitForTimeout(5500);
		await p.getByRole("button", { name: /Pin tiling information/ }).click();
		await p.waitForTimeout(700);
		const m = await p.evaluate(() => {
			const g = document.querySelector('[aria-label="Tiling information"]');
			const panel = g && [...g.children].find((c) => c.className.includes("ta-float") && c.tagName === "DIV");
			if (!panel) return null;
			const scroll = panel.children[1];
			const r = panel.getBoundingClientRect();
			// anything inside the panel wider than the panel is a horizontal overflow
			const wide = [...panel.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().right > r.right + 0.5).length;
			return { top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height), vh: innerHeight, content: scroll.scrollHeight, room: scroll.clientHeight, wide,
				sections: [...panel.querySelectorAll("h4")].map((h) => h.textContent), title: panel.children[0].textContent.slice(0, 60) };
		});
		if (!m) { rows.push({ id, label, error: "no panel" }); continue; }
		const box = await p.evaluate(() => { const r = document.querySelector('[aria-label="Tiling information"] > div.ta-float').getBoundingClientRect(); return { x: r.x - 6, y: r.y - 6, width: r.width + 12, height: r.height + 12 }; });
		await p.screenshot({ path: `${dir}/${label.replace(/[^a-z0-9]+/gi, "-")}.png`, clip: box, timeout: 60000, animations: "disabled" });
		rows.push({ id, label, ...m });
	} catch (e) { rows.push({ id, label, error: String(e).slice(0, 100) }); }
}
for (const r of rows) console.log(r.error ? `✗ ${r.label}: ${r.error}` : `${r.bottom <= r.vh && !r.wide ? "✓" : "✗"} ${r.label.padEnd(18)} ${String(r.h).padStart(4)}px tall, bottom ${r.bottom}/${r.vh}${r.content > r.room ? `, scrolls (${r.content} in ${r.room})` : ""}${r.wide ? `, ${r.wide} elements overflow sideways` : ""} | ${r.sections.join(" · ")}`);
console.log("page errors:", errors.length, [...new Set(errors)].slice(0, 3));
await b.close();
