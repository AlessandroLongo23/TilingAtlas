#!/usr/bin/env node
// Renders the (k,p,v) hyperbolic sweep into a self-contained HTML report:
// one p×v table per k, plus count-vs-k and time-vs-k growth charts at fixed (p,v).
//
//   node scripts/hyp-sweep-report.mjs [--in <index.jsonl>] [--out <report.html>]
//
// Zero-dep by design (same rule as scripts/status.mjs). The whole dataset is inlined into the page,
// so the file opens from disk and publishes as an artifact unchanged. Regenerate after any new cell:
// the sweep appends to index.jsonl, and the newest line for a cell wins.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (flag, fallback) => {
	const i = argv.indexOf(flag);
	return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const IN = arg("--in", join(ROOT, "experiments/results/hyp-sweep/index.jsonl"));
const OUT = arg("--out", join(ROOT, "experiments/results/hyp-sweep/report.html"));

// ── data ─────────────────────────────────────────────────────────────────────────────────────────
const rows = readFileSync(IN, "utf8")
	.split("\n")
	.filter((l) => l.trim())
	.map((l) => JSON.parse(l));

// Last line wins: a cell re-run with a bigger cap supersedes its earlier timeout.
const byCell = new Map();
for (const r of rows) byCell.set(`${r.k}|${r.p}|${r.v}`, r);
const cells = [...byCell.values()];

const KS = [...new Set(cells.map((c) => c.k))].sort((a, b) => a - b);
const PS = [...new Set(cells.map((c) => c.p))].sort((a, b) => a - b);
const VS = [...new Set(cells.map((c) => c.v))].sort((a, b) => a - b);
// A censored cell has no t.total (it never finished); its elapsed time is the phases it did run.
const elapsed = (c) => c.t?.total ?? Object.values(c.t ?? {}).reduce((a, b) => a + b, 0);
const CAP = Math.max(...cells.filter((c) => c.status === "timeout").map(elapsed), 0);

// A cell counts every tiling with k ≤ its own k (by_k splits it). Both readings are useful, so the
// page carries a toggle: cumulative is what the cell natively enumerates, exact is by_k[k].
const data = cells.map((c) => ({
	k: c.k,
	p: c.p,
	v: c.v,
	ok: c.status === "ok",
	total: c.status === "ok" ? c.distinct : null,
	exact: c.status === "ok" ? (c.by_k?.[String(c.k)] ?? 0) : null,
	raw: c.raw_blocks ?? null,
	pruned: c.pruned ?? null,
	secs: c.status === "ok" ? elapsed(c) : null, // censored time is a lower bound, never plotted as a value
}));

const done = data.filter((d) => d.ok);
const censored = data.filter((d) => !d.ok);
// Headline totals per k: the union over a k-layer is NOT the sum of its cells (boxes nest — a (p,v)
// cell contains every smaller one), so the honest single number is the largest complete cell, i.e.
// the biggest box fully enumerated at that k.
const frontier = KS.map((k) => {
	const layer = done.filter((d) => d.k === k);
	const best = layer.reduce((a, b) => (b.total > (a?.total ?? -1) ? b : a), null);
	return { k, complete: layer.length, of: PS.length * VS.length, best };
});

// ── growth series: (p,v) pairs enumerated at EVERY k layer, so a line is never a broken comparison ─
const pairs = [];
for (const p of PS)
	for (const v of VS) {
		const pts = KS.map((k) => data.find((d) => d.k === k && d.p === p && d.v === v));
		// A growth chart needs growth: keep only boxes complete at every k whose count actually rises.
		// The flat ones (a box whose every tiling is already 1-uniform) plot as a horizontal line and a
		// meaningless 3s-vs-4s time wobble — they are read off the tables instead.
		if (pts.every((d) => d?.ok) && pts.at(-1).total > pts[0].total) pairs.push({ p, v, pts });
	}
const facets = VS.map((v) => ({ v, series: pairs.filter((s) => s.v === v) })).filter((f) => f.series.length);

const payload = { KS, PS, VS, CAP, data, facets: facets.map((f) => ({ v: f.v, series: f.series.map((s) => ({ p: s.p, pts: s.pts.map((d) => ({ k: d.k, total: d.total, exact: d.exact, secs: d.secs })) })) })) };

const fmt = (n) => (n == null ? "—" : n.toLocaleString("en-US"));
const nowStamp = new Date().toISOString().slice(0, 10);

// ── page ─────────────────────────────────────────────────────────────────────────────────────────
// Squared monochrome, inherited from the app's own design system (globals.css): zero radii, hairline
// rules, opaque cells on a line-coloured wall, mono for every figure. Colour appears ONLY as data —
// the blue sequential ramp from the dataviz reference palette, validated for both surfaces.
const html = `<title>Hyperbolic (k, p, v) enumeration sweep</title>
<style>
:root {
  color-scheme: light;
  --ground: #f9f9f7;
  --surface: #fcfcfb;
  --ink: #0b0b0b;
  --ink-2: #52514e;
  --ink-3: #898781;
  --line: #e1e0d9;
  --line-2: #c3c2b7;
  /* sequential blue, steps 100→700 — magnitude only */
  --s0: #eef4fd; --s1: #cde2fb; --s2: #9ec5f4; --s3: #6da7ec; --s4: #3987e5;
  --s5: #256abf; --s6: #184f95; --s7: #0d366b;
  --on-light: #0b0b0b; --on-dark: #ffffff;
  --censor: #898781;
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    color-scheme: dark;
    --ground: #0d0d0d; --surface: #1a1a19; --ink: #ffffff; --ink-2: #c3c2b7; --ink-3: #898781;
    --line: #2c2c2a; --line-2: #383835;
    --s0: #14243a; --s1: #0d366b; --s2: #184f95; --s3: #256abf; --s4: #3987e5;
    --s5: #6da7ec; --s6: #9ec5f4; --s7: #cde2fb;
    --on-light: #ffffff; --on-dark: #0b0b0b;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --ground: #0d0d0d; --surface: #1a1a19; --ink: #ffffff; --ink-2: #c3c2b7; --ink-3: #898781;
  --line: #2c2c2a; --line-2: #383835;
  --s0: #14243a; --s1: #0d366b; --s2: #184f95; --s3: #256abf; --s4: #3987e5;
  --s5: #6da7ec; --s6: #9ec5f4; --s7: #cde2fb;
  --on-light: #ffffff; --on-dark: #0b0b0b;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font: 400 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 1080px; margin: 0 auto; padding: 40px 24px 72px; display: flex; flex-direction: column; gap: 40px; }
h1 { font-size: 25px; line-height: 1.2; font-weight: 650; letter-spacing: -0.015em; margin: 0; text-wrap: balance; }
h2 { font-size: 16px; font-weight: 650; letter-spacing: -0.01em; margin: 0; }
p { margin: 0; max-width: 68ch; color: var(--ink-2); }
.eyebrow { font: 500 11px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink-3); }
section { display: flex; flex-direction: column; gap: 14px; }
.mono, td, th { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }

/* headline row — the run's shape, before any table */
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); }
.stat { background: var(--surface); padding: 12px 14px; display: flex; flex-direction: column; gap: 3px; }
.stat b { font: 600 22px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }
.stat span { font-size: 11px; color: var(--ink-3); line-height: 1.35; }

/* the wall: opaque cells, 1px gaps, no radii — the app's own motif */
.tables { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
table { border-collapse: separate; border-spacing: 1px; background: var(--line); width: 100%; }
caption { text-align: left; padding: 0 0 8px; font-size: 13px; font-weight: 600; color: var(--ink); }
caption em { font-style: normal; font-weight: 400; color: var(--ink-3); }
th, td { font-size: 12px; text-align: right; padding: 6px 8px; background: var(--surface); font-weight: 400; }
th { color: var(--ink-3); font-size: 10.5px; letter-spacing: 0.04em; }
th.corner { text-align: left; color: var(--ink-3); }
td.cell { color: var(--on-light); }
td.deep { color: var(--on-dark); }
td.zero { color: var(--ink-3); }
td.censor {
  color: var(--censor);
  background:
    repeating-linear-gradient(135deg, var(--line) 0 1px, transparent 1px 5px),
    var(--surface);
}
tbody th { text-align: right; }

.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.seg { display: flex; gap: 1px; background: var(--line); border: 1px solid var(--line); }
.seg button {
  font: 500 11.5px/1 ui-sans-serif, system-ui, sans-serif;
  padding: 6px 11px; border: 0; background: var(--surface); color: var(--ink-2); cursor: pointer;
}
.seg button[aria-pressed="true"] { background: var(--ink); color: var(--ground); }
.seg button:focus-visible { outline: 2px solid var(--ink); outline-offset: 1px; }

.legend { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; font-size: 11px; color: var(--ink-3); }
.ramp { display: flex; align-items: center; gap: 6px; }
.ramp i { display: flex; }
.ramp i b { width: 15px; height: 9px; display: block; }
.swatch-censor { width: 15px; height: 9px; display: inline-block; vertical-align: -1px;
  background: repeating-linear-gradient(135deg, var(--line-2) 0 1px, transparent 1px 5px), var(--surface); border: 1px solid var(--line); }

.charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 20px; }
figure { margin: 0; display: flex; flex-direction: column; gap: 6px; background: var(--surface); border: 1px solid var(--line); padding: 12px 12px 8px; }
figcaption { font-size: 11.5px; color: var(--ink-3); }
figcaption b { color: var(--ink-2); font-weight: 600; }
svg { display: block; width: 100%; height: auto; overflow: visible; }
.scroll { overflow-x: auto; }
.note { font-size: 12.5px; color: var(--ink-3); max-width: 74ch; }
.note code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; color: var(--ink-2); }
a { color: inherit; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>

<div class="wrap">
  <header style="display:flex;flex-direction:column;gap:10px">
    <span class="eyebrow">Čtrnáct engine · combinatorial enumeration · ${nowStamp}</span>
    <h1>Hyperbolic tilings by uniformity, palette and valence</h1>
    <p>Every cell of the sweep enumerates the tilings of the hyperbolic plane built from regular
    <span class="mono">{3…p}</span>-gons with at most <span class="mono">v</span> edges at a vertex and at most
    <span class="mono">k</span> vertex orbits — identity decided by the minimal Delaney–Dress symbol of the
    quotient, so two entries differ iff the tilings genuinely differ. Boxes nest: a cell contains every
    smaller one, and counts are cumulative in <span class="mono">k</span> unless switched to exact below.</p>
    <div class="stats">
      <div class="stat"><b>${fmt(data.length)}</b><span>cells attempted (k × p × v)</span></div>
      <div class="stat"><b>${fmt(done.length)}</b><span>enumerated to completion</span></div>
      <div class="stat"><b>${fmt(censored.length)}</b><span>censored at the ${Math.round(CAP)}s cap — no count, not zero</span></div>
      ${frontier
			.map(
				(f) =>
					`<div class="stat"><b>${fmt(f.best?.total ?? 0)}</b><span>largest complete box at k ≤ ${f.k} · p ${f.best?.p}, v ${f.best?.v}</span></div>`,
			)
			.join("\n      ")}
    </div>
  </header>

  <section>
    <div style="display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:12px">
      <div style="display:flex;flex-direction:column;gap:4px">
        <span class="eyebrow">One table per uniformity</span>
        <h2>Distinct tilings by palette and valence</h2>
      </div>
      <div class="controls">
        <div class="seg" role="group" aria-label="Count mode">
          <button type="button" data-mode="total" aria-pressed="true">Cumulative k ≤ K</button>
          <button type="button" data-mode="exact" aria-pressed="false">Exactly k = K</button>
        </div>
      </div>
    </div>
    <div class="legend">
      <span class="ramp">fewer
        <i><b style="background:var(--s0)"></b><b style="background:var(--s1)"></b><b style="background:var(--s2)"></b><b style="background:var(--s3)"></b><b style="background:var(--s4)"></b><b style="background:var(--s5)"></b><b style="background:var(--s6)"></b><b style="background:var(--s7)"></b></i>
      more (log scale)</span>
      <span><span class="swatch-censor"></span> censored — hit the cap, count unknown</span>
    </div>
    <div class="tables" id="tables"></div>
    <p class="note">Rows are the palette bound <code>p</code> (largest polygon allowed), columns the valence
    bound <code>v</code> (most edges at a vertex). A censored cell is not an absence of tilings: the solver
    was still producing raw blocks when the clock ran out, so the true count is strictly larger than
    anything below it. Zero cells are real — below <code>1/p + 1/v &lt; 1/2</code> the geometry is spherical or
    Euclidean, so no hyperbolic tiling exists.</p>
  </section>

  <section>
    <div style="display:flex;flex-direction:column;gap:4px">
      <span class="eyebrow">Fixed palette and valence, varying uniformity</span>
      <h2>How the count grows with k</h2>
    </div>
    <p>Each line is one <span class="mono">(p, v)</span> box enumerated at every uniformity, so the three
    points are strictly comparable. Log scale: a straight line is geometric growth in <span class="mono">k</span>.</p>
    <div class="charts" id="growth"></div>
  </section>

  <section>
    <div style="display:flex;flex-direction:column;gap:4px">
      <span class="eyebrow">The same boxes, measured in wall-clock</span>
      <h2>How the cost grows with k</h2>
    </div>
    <p>Solver time for the same boxes, on the same log scale, so the two charts can be read against each
    other: cost climbs faster than the count it buys.</p>
    <div class="charts" id="cost"></div>
  </section>

  <section>
    <span class="eyebrow">Reading the frontier</span>
    <p class="note">The censored band is where this enumeration currently ends, and it is a compute wall
    and not a mathematical one — every censored cell was still emitting raw blocks at the cap. Raising the
    cap moves the wall; nothing in the method changes. Regenerate this page after any new cell with
    <code>node scripts/hyp-sweep-report.mjs</code>.</p>
  </section>
</div>

<script>
const D = ${JSON.stringify(payload)};
const STEPS = ["--s0","--s1","--s2","--s3","--s4","--s5","--s6","--s7"];
const cellOf = (k,p,v) => D.data.find(d => d.k===k && d.p===p && d.v===v);
let MODE = "total";

// Log-binned magnitude → ramp step. Zero is its own state (never a ramp colour: "none" is not "few").
function stepFor(n, max) {
  if (!n) return null;
  const f = Math.log(n + 1) / Math.log(max + 1);
  return Math.min(STEPS.length - 1, Math.max(0, Math.round(f * (STEPS.length - 1))));
}

function renderTables() {
  const max = Math.max(...D.data.filter(d => d.ok).map(d => d[MODE] || 0), 1);
  document.getElementById("tables").innerHTML = D.KS.map(k => {
    const head = D.VS.map(v => '<th scope="col">v ' + v + "</th>").join("");
    const body = D.PS.map(p => {
      const tds = D.VS.map(v => {
        const c = cellOf(k, p, v);
        if (!c) return '<td class="zero">·</td>';
        if (!c.ok) return '<td class="censor" title="censored at the cap — raw blocks still arriving">cap</td>';
        const n = c[MODE];
        const s = stepFor(n, max);
        if (s === null) return '<td class="zero" title="no hyperbolic tiling exists in this box">0</td>';
        const deep = s >= 5 ? " deep" : "";
        const title = "p " + p + ", v " + v + " — " + n.toLocaleString() + " tilings from " +
          (c.raw ? c.raw.toLocaleString() : "?") + " raw blocks in " + (c.secs != null ? c.secs.toFixed(1) + "s" : "?");
        return '<td class="cell' + deep + '" style="background:var(' + STEPS[s] + ')" title="' + title + '">' + n.toLocaleString() + "</td>";
      }).join("");
      return '<tr><th scope="row">p ' + p + "</th>" + tds + "</tr>";
    }).join("");
    const label = MODE === "total" ? "k ≤ " + k : "k = " + k;
    return '<div class="scroll"><table><caption>' + label + ' <em>— ' +
      (MODE === "total" ? "every tiling with at most " + k + " vertex orbit" + (k > 1 ? "s" : "") : "exactly " + k + "-uniform only") +
      '</em></caption><thead><tr><th class="corner">' + (MODE === "total" ? "≤" + k : "=" + k) + "</th>" + head +
      "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }).join("");
}

// ── charts ───────────────────────────────────────────────────────────────────────────────────────
// Ordinal blue ramp by p (an ordered quantity, so one hue with monotone lightness — not categorical
// hues). Light and dark each get steps validated against their own surface.
const P_LIGHT = { 4:"#86b6ef", 5:"#5598e7", 6:"#2a78d6", 7:"#1c5cab", 8:"#104281" };
const P_DARK  = { 4:"#184f95", 5:"#256abf", 6:"#3987e5", 7:"#6da7ec", 8:"#9ec5f4" };
const isDark = () => {
  const t = document.documentElement.getAttribute("data-theme");
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
};
const colorOf = p => (isDark() ? P_DARK : P_LIGHT)[p] || (isDark() ? "#9ec5f4" : "#2a78d6");

function chart(facet, valueOf, opts) {
  const W = 300, H = 190, L = 44, R = 34, T = 12, B = 26;
  const vals = facet.series.flatMap(s => s.pts.map(valueOf)).filter(n => n != null && n > 0);
  if (!vals.length) return "";
  const lo = Math.min(...vals, opts.floor), hi = Math.max(...vals);
  const ly = n => Math.log10(Math.max(n, lo));
  const y = n => H - B - ((ly(n) - ly(lo)) / Math.max(ly(hi) - ly(lo), 0.0001)) * (H - T - B);
  const x = k => L + ((k - D.KS[0]) / Math.max(D.KS.at(-1) - D.KS[0], 1)) * (W - L - R);

  // decade gridlines, at most one per power of ten
  let grid = "";
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    const t = Math.pow(10, e);
    if (t < lo || t > hi * 1.05) continue;
    grid += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) +
      '" stroke="var(--line)" stroke-width="1"/>' +
      '<text x="' + (L - 6) + '" y="' + (y(t) + 3.5).toFixed(1) + '" text-anchor="end" font-size="9" fill="var(--ink-3)">' +
      opts.tick(t) + "</text>";
  }
  const axis = D.KS.map(k => '<text x="' + x(k) + '" y="' + (H - B + 15) + '" text-anchor="middle" font-size="10" fill="var(--ink-3)">k ' + k + "</text>").join("");

  const ends = [];
  const lines = facet.series.map(s => {
    const c = colorOf(s.p);
    const pts = s.pts.map(pt => ({ k: pt.k, n: valueOf(pt) })).filter(pt => pt.n != null && pt.n > 0);
    if (!pts.length) return "";
    const d = pts.map((pt, i) => (i ? "L" : "M") + x(pt.k).toFixed(1) + " " + y(pt.n).toFixed(1)).join(" ");
    // 2px surface ring on each marker so overlapping series stay separable
    const dots = pts.map(pt =>
      '<circle cx="' + x(pt.k).toFixed(1) + '" cy="' + y(pt.n).toFixed(1) + '" r="3.5" fill="' + c +
      '" stroke="var(--surface)" stroke-width="2"><title>p ' + s.p + ", v " + facet.v + ", k " + pt.k + " — " +
      opts.tip(pt.n) + "</title></circle>").join("");
    const last = pts.at(-1);
    ends.push({ x: x(last.k) + 7, y: y(last.n), p: s.p });
    return '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="2" stroke-linejoin="round"/>' + dots;
  }).join("");

  // Direct labels are mandatory at this series count, so they must not collide: walk them top-down
  // and push each down to clear the previous by one line-height.
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 11);
  const labels = ends.map(e =>
    '<text x="' + e.x + '" y="' + (e.y + 3.5).toFixed(1) + '" font-size="10" fill="var(--ink-2)" ' +
    'font-family="ui-monospace, Menlo, monospace">p' + e.p + "</text>").join("");

  return '<figure><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + opts.aria(facet) + '">' +
    grid + axis + lines + labels +
    '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '" stroke="var(--line-2)"/>' +
    "</svg><figcaption><b>valence ≤ " + facet.v + "</b> · " + opts.unit + ", log scale</figcaption></figure>";
}

function renderCharts() {
  document.getElementById("growth").innerHTML = D.facets.map(f => chart(f, pt => pt[MODE], {
    floor: 1, unit: "distinct tilings",
    tick: t => t >= 1000 ? (t / 1000) + "k" : String(t),
    tip: n => n.toLocaleString() + " tilings",
    aria: f => "Distinct tilings against k for valence " + f.v,
  })).join("");
  document.getElementById("cost").innerHTML = D.facets.map(f => chart(f, pt => pt.secs, {
    floor: 1, unit: "solver seconds",
    // Gridlines are exact decades — never round a tick label onto a line it doesn't sit on.
    tick: t => t >= 1000 ? (t / 1000) + "ks" : t + "s",
    tip: n => n.toFixed(1) + " seconds",
    aria: f => "Solver seconds against k for valence " + f.v,
  })).join("");
}

document.querySelectorAll(".seg button").forEach(b => b.addEventListener("click", () => {
  MODE = b.dataset.mode;
  document.querySelectorAll(".seg button").forEach(o => o.setAttribute("aria-pressed", String(o === b)));
  renderTables(); renderCharts();
}));
// Charts read theme-dependent hexes (SVG strokes can't be var()-driven per series), so repaint on flip.
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderCharts);
new MutationObserver(renderCharts).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

renderTables();
renderCharts();
</script>
`;

writeFileSync(OUT, html);
console.log(
	`wrote ${OUT}\n  cells ${data.length} (${done.length} complete, ${censored.length} censored @ ${Math.round(CAP)}s)` +
		`\n  growth series ${pairs.length} across ${facets.length} facets`,
);
