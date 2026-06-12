# Thesis Proof-Figure Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce CC's data deliverables for the proof-figure pass — the Gen figure renders (F19 oblique k=3 pair + G1/G2 explanatory underlays) and the extractable seed-set/lattice census table — and hand them to TA, *without* any heavy enumeration run.

**Architecture:** Extend the existing `figures/` build route (`tilingFigure` already supports an `anatomy`/`transition` explanatory mode; `build.ts` only wires the snapshot galleries) with an opt-in `--explanatory` branch driven by a small manifest of specific tilings. Identify the oblique class with a holohedry classifier over the certified catalogue. Extract the census table from existing `experiments/results/*-census-table-*.log` files. Everything renders from the **already-certified** catalogue (digest `99919f42a7b58e76`) — no solver run, so no single-writer coordination needed for this plan.

**Tech Stack:** TypeScript under `tsx`, the `figures/` IR→TikZ/SVG→`latexmk` pipeline, Vitest, TinyTeX.

**Spec:** `docs/superpowers/specs/2026-06-12-thesis-proof-figures-design.md`

---

## Scope of THIS plan vs. deferred work

THIS plan covers, from the spec's data manifest:
- **F19** `fig:oblique` Gen pair (manifest item 1)
- **G1/G2** explanatory Gen underlays (manifest item 2)
- **Seed-set / lattice census table** (manifest item 4) — extractable from existing logs
- The **TA handoff doc + SYNC entry** (manifest's "assemble specs for TA")

**Deliberately deferred (NOT in this plan — they are independent subsystems):**
- **Per-stage performance profile** (manifest item 5, `results.tex:444`) and **star-family growth/timing** (item 6, `results.tex:452`): the census logs do *not* carry fill-rate / gate-cost granularity, so these need fresh, *coordinated* heavy runs (single-writer rule, see [[subagent-long-runs]] and [[parallel-cc-sessions]]). Do these only after confirming who's driving integration.
- **G6 DFS-structure export** (`algorithm.tex:54`, `:100`): `PipelineLogger` is purely a progress/timing logger — emitting tree structure needs *new instrumentation* in the vc-generation and seed-assembly code (`lib/classes/algorithm/SeedBuilder.ts` et al.). That is its own subsystem and deserves its own recon + plan. Flag to the user; do not bolt it on here.

These are the spec's items 5–6 and G6 — left as a follow-on so this plan stays a no-heavy-run, low-risk unit.

---

## Pre-flight (run once before Task 1)

- [ ] **Confirm a clean, isolated workspace and no competing writer.**

```bash
cd /Users/alessandro/Desktop/University/Thesis/TilingAtlas
git status --short          # expect only the known SYNC/spec/plan edits; nothing in figures/
git log --oneline -3
tail -20 docs/SYNC.md        # confirm no other agent is mid-write on figures
```
Expected: no uncommitted changes under `figures/`. If another session is touching `figures/` or mid-figure-run, stop and ask who drives (see [[parallel-cc-sessions]]). This plan only *reads* the certified catalogue and *writes* new files, but the delivery target `../thesis/figures/generated/` is TA-owned — never overwrite existing gallery PDFs there.

- [ ] **Baseline the existing build still works (no regressions from later edits).**

```bash
pnpm tsx figures/build.ts --no-latex --no-deliver
```
Expected: `[build] N figures emitted …` then `★ figure build complete`, exit 0. Note N for comparison after Task 2.

---

## Task 1: Identify the two oblique k=3 tilings (exact holohedry)

> ⚠ **CORRECTION applied during execution (2026-06-12).** The original draft of this task wrote a
> *float* `latticeClass` from the reduced-basis angle/length. That is WRONG for Bravais
> classification: it omits the **centred-rectangular signature** `2|u·v| = |u|²`, so it labels every
> centred-rectangular cell "oblique" and over-counts 21 vs. the true 2. Fixed by using the
> codebase's trusted exact `holohedry()` (`lib/classes/algorithm/LatticeEnumerator.ts`) on the exact
> cell basis — DRY, and it carries a "must never underestimate" soundness note. Float classifier
> discarded.

**Files:**
- Create: `figures/tiling/oblique-k3.test.ts` (identification + permanent regression guard)

The oblique/p2 Bravais class is **holohedry == 2** (lattice point group = ±I only). The exact cell
basis is `deserializeCell(ring, t.cellCodec).basisExact` (exact `Cyclotomic` vectors); feed it to
`holohedry(a, b)`. NOTES §12.2: k=3 has exactly two oblique tilings; `LatticeEnumerator` names them
**t3046, t3055**. The test asserts the hol==2 set is exactly `{t3046, t3055}` — the hard STOP gate.

- [ ] **Step 1: Write the failing test.**

```ts
// figures/tiling/latticeClass.test.ts
import { describe, it, expect } from 'vitest';
import { latticeClass } from './latticeClass';

const v = (x: number, y: number) => ({ x, y });

describe('latticeClass', () => {
  it('square: equal lengths, 90°', () => {
    expect(latticeClass([v(1, 0), v(0, 1)])).toBe('square');
  });
  it('hexagonal: equal lengths, 60/120°', () => {
    expect(latticeClass([v(1, 0), v(0.5, Math.sqrt(3) / 2)])).toBe('hexagonal');
  });
  it('rectangular: unequal lengths, 90°', () => {
    expect(latticeClass([v(1, 0), v(0, 2)])).toBe('rectangular');
  });
  it('oblique: unequal lengths, generic angle', () => {
    expect(latticeClass([v(1, 0), v(0.37, 1.42)])).toBe('oblique');
  });
  it('centred-rectangular: equal lengths, generic angle (rhombic)', () => {
    // |u|=|v| but angle not 60/90/120 → rhombic/centred-rect, NOT oblique
    expect(latticeClass([v(1, 0), v(0.8, 0.6)])).toBe('centred-rectangular');
  });
});
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `pnpm vitest run figures/tiling/latticeClass.test.ts`
Expected: FAIL — `latticeClass` is not defined / module missing.

- [ ] **Step 3: Implement the classifier.**

```ts
// figures/tiling/latticeClass.ts
export type Vec = { x: number; y: number };
export type LatticeClass =
  | 'hexagonal'
  | 'square'
  | 'rectangular'
  | 'centred-rectangular'
  | 'oblique';

const EPS = 1e-6;

/**
 * Bravais class of a 2-D lattice from a reduced basis [u, v]. Classification is on the
 * REDUCED basis (Gauss-reduced, as `tilingFigure` uses), so |u| ≤ |v| and the angle is
 * in [60°, 120°]. Oblique = no length equality AND no special angle. This mirrors the
 * `hol` (holohedry) grouping in the certified census: oblique ↔ hol = 2.
 */
export function latticeClass([u, v]: [Vec, Vec]): LatticeClass {
  const lu = Math.hypot(u.x, u.y);
  const lv = Math.hypot(v.x, v.y);
  const cos = (u.x * v.x + u.y * v.y) / (lu * lv);
  const eqLen = Math.abs(lu - lv) < EPS * Math.max(lu, lv);
  const right = Math.abs(cos) < EPS; // 90°
  const hex = Math.abs(Math.abs(cos) - 0.5) < EPS; // 60° or 120°
  if (eqLen && hex) return 'hexagonal';
  if (eqLen && right) return 'square';
  if (right) return 'rectangular';
  if (eqLen) return 'centred-rectangular'; // rhombic
  return 'oblique';
}
```

- [ ] **Step 4: Run the test, verify it passes.**

Run: `pnpm vitest run figures/tiling/latticeClass.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: List the oblique k=3 tilings from the certified catalogue.**

Run this one-off (uses the same load path as `build.ts`):
```bash
pnpm tsx -e '
import { loadSnapshot } from "./figures/snapshot";
import { ensureOrbits } from "./figures/tiling/orbits";
import { buildCellModel } from "./figures/tiling/cellModel";
import { latticeClass } from "./figures/tiling/latticeClass";
import fs from "node:fs";
const snap = loadSnapshot();
const orbits = ensureOrbits(snap.tilings);
const oracle = JSON.parse(fs.readFileSync("figures/data/oracle-map.json","utf8")).matched;
for (const t of snap.tilings.filter(t=>t.k===3)) {
  const m = buildCellModel(t.cellCodec, orbits[t.canonicalKey]);
  const cls = latticeClass(m.basis);
  if (cls === "oblique") console.log(oracle[t.canonicalKey] ?? "(unmatched)", t.canonicalKey);
}'
```
Expected: **exactly two** lines printed (NOTES §12.2: k=3 has 2 oblique). Record both t-codes — they feed Task 2's manifest. If the count is not 2, STOP: the classifier or the catalogue disagrees with NOTES §12.2 — investigate before proceeding (a wrong count means a wrong figure claim in a completeness thesis).

- [ ] **Step 6: Commit.**

```bash
git add figures/tiling/latticeClass.ts figures/tiling/latticeClass.test.ts
git commit -m "figures: lattice Bravais-class classifier; identify the 2 oblique k=3 tilings"
```

---

## Task 2: Explanatory-figures manifest + `--explanatory` build branch

**Files:**
- Modify: `figures/build.ts` (add an `EXPLANATORY` manifest array + an opt-in branch in `main()`)

We render specific tilings as single explanatory PDFs using `tilingFigure`'s existing `anatomy` mode. F19 gets the two oblique tilings (basis overlay ON — the whole point is the oblique cell). G1/G2 get clean underlays (fade transition, no markers) for TA to annotate with Λ₈ / centre / axis in TikZ. These are **underlays**, not finished figures — the proof-specific annotation is TA's TikZ overlay (ownership split).

- [ ] **Step 1: Add the explanatory manifest near the top of `figures/build.ts`** (after the `OUT`/`THESIS_FIG` consts, ~line 30). Replace `<OBLIQUE_KEY_1>` / `<OBLIQUE_KEY_2>` with the two canonicalKeys from Task 1 Step 5, and pick `G1_KEY`/`G2_KEY` (see Step 2 note).

```ts
import type { TilingFigureOptions } from './tiling/tilingFigure';

type ExplanatoryEntry = {
  id: string;                 // file stem, e.g. "oblique-t3041"
  canonicalKey: string;
  opts: Omit<TilingFigureOptions, 'windowMm' | 'edgeMm'> & { windowMm?: number; edgeMm?: number };
  note: string;               // why this render exists (for the contact sheet / handoff)
};

// Filled from Task 1 Step 5 (oblique) + chosen by inspection (G1 4.8.8, G2 mirror-axis patch).
const EXPLANATORY: ExplanatoryEntry[] = [
  {
    id: 'oblique-A',
    canonicalKey: '<OBLIQUE_KEY_1>',
    opts: { strategy: 'byNGon', anatomy: { basis: true, latticePoints: true }, windowMm: 70, edgeMm: 8 },
    note: 'F19: oblique k=3 tiling recovered by join-closure; basis = oblique cell.',
  },
  {
    id: 'oblique-B',
    canonicalKey: '<OBLIQUE_KEY_2>',
    opts: { strategy: 'byNGon', anatomy: { basis: true, latticePoints: true }, windowMm: 70, edgeMm: 8 },
    note: 'F19: second oblique k=3 tiling; basis = oblique cell.',
  },
  {
    id: 'octagon-488',
    canonicalKey: '<G1_KEY>', // the 4.8.8 entry in the k=1 catalogue
    opts: { strategy: 'byNGon', windowMm: 70, edgeMm: 8 },
    note: 'G1 underlay: clean 4.8.8 patch for TA to overlay Λ₈ vectors + square holes.',
  },
  {
    id: 'incidence-axis',
    canonicalKey: '<G2_KEY>', // a tiling with an obvious mirror axis (e.g. a reflective k=2/k=3)
    opts: { strategy: 'byNGon', anatomy: { transition: {} }, windowMm: 70, edgeMm: 8 },
    note: 'G2 Panel B underlay: clean patch for TA to draw a reflection axis along edges/bisectors.',
  },
];
```

- [ ] **Step 2: Add the `--explanatory` branch in `main()`** — right after the gallery `entries` are filtered (~line 156, before `// --- emit ---`). It emits the explanatory `.tex`/`.svg`/`.pdf` into a separate `out/explanatory/` dir and (on deliver) copies PDFs to `../thesis/figures/generated/explanatory/`. It runs *instead of* the gallery loop when `--explanatory` is passed, so it never disturbs the certified galleries.

```ts
  if (flag('--explanatory')) {
    const EX_OUT = path.join(ROOT, 'figures', 'out', 'explanatory');
    fs.mkdirSync(EX_OUT, { recursive: true });
    const exCompile: string[] = [];
    for (const e of EXPLANATORY) {
      const t = snap.tilings.find((x) => x.canonicalKey === e.canonicalKey);
      if (!t) throw new Error(`explanatory: canonicalKey not in certified snapshot: ${e.id} (${e.canonicalKey})`);
      const model = buildCellModel(t.cellCodec, orbits[e.canonicalKey]);
      const { ir, edgeMm } = tilingFigure(model, {
        windowMm: e.opts.windowMm ?? 70,
        edgeMm: e.opts.edgeMm ?? 8,
        ...e.opts,
      });
      const tex = emitTikz(ir, { edgeMm });
      fs.writeFileSync(path.join(EX_OUT, `${e.id}.tex`), tex);
      fs.writeFileSync(path.join(EX_OUT, `${e.id}.svg`), emitSvg(ir, { edgeMm }));
      exCompile.push(path.join(EX_OUT, `${e.id}.tex`));
    }
    console.error(`[explanatory] ${EXPLANATORY.length} figures emitted`);
    if (!flag('--no-latex')) {
      await pool(exCompile, os.cpus().length - 1, latexmk);
    }
    if (!flag('--no-deliver')) {
      const dir = path.join(THESIS_FIG, 'explanatory');
      fs.mkdirSync(dir, { recursive: true });
      for (const e of EXPLANATORY) {
        fs.copyFileSync(path.join(EX_OUT, `${e.id}.pdf`), path.join(dir, `${e.id}.pdf`));
      }
      // a README so TA knows what each underlay is and what to overlay
      const readme = EXPLANATORY.map((e) => `- ${e.id}.pdf — ${e.note}`).join('\n');
      fs.writeFileSync(path.join(dir, 'README.md'),
        `# Explanatory figure underlays (from TilingAtlas figures/build.ts --explanatory)\n\n${readme}\n`);
      console.error(`[explanatory] PDFs + README → ${dir}`);
    }
    console.error('★ explanatory build complete');
    return; // do not run the gallery pipeline in this mode
  }
```

- [ ] **Step 3: Emit-only smoke test (no LaTeX, no deliver) to catch wiring errors fast.**

Run: `pnpm tsx figures/build.ts --explanatory --no-latex --no-deliver`
Expected: `[explanatory] 4 figures emitted` then `★ explanatory build complete`, exit 0. Four `.tex` + four `.svg` files under `figures/out/explanatory/`. If a `canonicalKey not in certified snapshot` error fires, the placeholder key in the manifest was not replaced — fix from Task 1 Step 5 / Step 2 note.

- [ ] **Step 4: Eyeball the SVGs (fast, no TinyTeX needed).**

Open `figures/out/explanatory/oblique-A.svg` and `incidence-axis.svg` in a browser. Confirm: oblique-A shows the oblique parallelogram (`u`,`v` clearly non-orthogonal, unequal); incidence-axis shows a clean left→right fade patch. If oblique-A's cell looks square/hex, the wrong key was used — recheck Task 1.

- [ ] **Step 5: Commit.**

```bash
git add figures/build.ts
git commit -m "figures: --explanatory build branch + manifest (F19 oblique pair, G1/G2 underlays)"
```

---

## Task 3: Render explanatory PDFs and deliver to the thesis

**Files:** none new — runs the Task 2 branch with LaTeX + deliver.

- [ ] **Step 1: Full explanatory render + deliver.**

Run: `pnpm tsx figures/build.ts --explanatory`
Expected: `[explanatory] 4 figures emitted`, latexmk runs, `[explanatory] PDFs + README → …/thesis/figures/generated/explanatory`, `★ explanatory build complete`. Four PDFs delivered.

- [ ] **Step 2: Confirm the certified galleries were NOT disturbed.**

```bash
cd /Users/alessandro/Desktop/University/Thesis/thesis
git status --short figures/generated
```
Expected: only `figures/generated/explanatory/` is new (untracked). NO modifications to existing `k1/`, `k2/`, `k3/`, `gallery-*.tex`, `match-table-*.tex`. If any certified gallery PDF shows as modified, STOP — the explanatory branch leaked into the gallery path; revert and fix.

- [ ] **Step 3: Verify the certified digest is still intact (figure data unchanged).**

```bash
cd /Users/alessandro/Desktop/University/Thesis/TilingAtlas
node -e 'console.log(JSON.parse(require("fs").readFileSync("figures/data/catalogue-k1-3.json","utf8")).digests)'
```
Expected: includes `99919f42a7b58e76` (k=3). This plan must not have touched catalogue data; confirm it didn't.

- [ ] **Step 4: Commit (TilingAtlas side only; the thesis-side delivery is TA's repo).**

```bash
git add docs/superpowers/  # plan/spec; build.ts already committed
git commit -m "figures: deliver explanatory underlays (F19 + G1/G2) to thesis/figures/generated/explanatory"
```
Note: the delivered PDFs land in `../thesis/` (TA's repo) — do NOT commit there. The SYNC handoff (Task 5) tells TA to commit them.

---

## Task 4: Extract the seed-set / lattice census table

**Files:**
- Create: `figures/data-extract/censusTable.ts`
- Test: `figures/data-extract/censusTable.test.ts`
- Output: `figures/out/tables/census-k3.tex`

The census logs (`experiments/results/*-k3-census-table-*.log`) carry, per holohedry, Σ work-items / distinct lattices / multiplicity — exactly the seed-set/lattice numbers `algorithm.tex:80` owes. We parse the table block and emit a thesis `.tex` fragment. (Counts only; *timings* and *fill rates* are the deferred per-stage profile.)

- [ ] **Step 1: Write the failing test against the real log format.**

```ts
// figures/data-extract/censusTable.test.ts
import { describe, it, expect } from 'vitest';
import { parseCensus, censusToTex } from './censusTable';

const SAMPLE = `k=3  solve-calls=449  files=8
hol | Σ work items | distinct lattices | multiplicity
  2 |        10662 |               620 | 17.2×
  4 |        39019 |              1296 | 30.1×
  8 |         4008 |               225 | 17.8×
 12 |        18586 |               327 | 56.8×
ALL |        72275 |              2468 | 29.3×`;

describe('census parser', () => {
  it('extracts per-holohedry rows + the ALL total', () => {
    const c = parseCensus(SAMPLE);
    expect(c.k).toBe(3);
    expect(c.solveCalls).toBe(449);
    expect(c.rows).toHaveLength(5);
    expect(c.rows[0]).toEqual({ hol: '2', work: 10662, lattices: 620, mult: '17.2×' });
    expect(c.rows[4]).toEqual({ hol: 'ALL', work: 72275, lattices: 2468, mult: '29.3×' });
  });
  it('emits a booktabs tex fragment with a label', () => {
    const tex = censusToTex(parseCensus(SAMPLE));
    expect(tex).toContain('\\begin{table}');
    expect(tex).toContain('\\label{tab:lattice-census-k3}');
    expect(tex).toContain('72275');
  });
});
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `pnpm vitest run figures/data-extract/censusTable.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the parser + tex emitter.**

```ts
// figures/data-extract/censusTable.ts
export type CensusRow = { hol: string; work: number; lattices: number; mult: string };
export type Census = { k: number; solveCalls: number; rows: CensusRow[] };

export function parseCensus(log: string): Census {
  const head = log.match(/k=(\d+)\s+solve-calls=(\d+)/);
  if (!head) throw new Error('censusTable: no "k=… solve-calls=…" header found');
  const rows: CensusRow[] = [];
  for (const line of log.split('\n')) {
    const m = line.match(/^\s*(\d+|ALL)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*([\d.]+×)\s*$/);
    if (m) rows.push({ hol: m[1], work: Number(m[2]), lattices: Number(m[3]), mult: m[4] });
  }
  if (rows.length === 0) throw new Error('censusTable: no data rows parsed');
  return { k: Number(head[1]), solveCalls: Number(head[2]), rows };
}

export function censusToTex(c: Census): string {
  const body = c.rows.map((r) => {
    const hol = r.hol === 'ALL' ? '\\textbf{all}' : `$${r.hol}$`;
    const sep = r.hol === 'ALL' ? '\\midrule\n' : '';
    return `${sep}${hol} & ${r.work} & ${r.lattices} & ${r.mult} \\\\`;
  });
  return [
    `% AUTOGENERATED by figures/data-extract/censusTable.ts — regenerate from the census log.`,
    '\\begin{table}[ht]',
    '\\centering\\small',
    '\\begin{tabular}{rrrr}',
    '\\toprule',
    'holohedry $\\hol(\\Lambda)$ & work items & distinct lattices & multiplicity \\\\',
    '\\midrule',
    ...body,
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{Candidate-lattice census for $k=${c.k}$ (${c.solveCalls} solve-calls): work items and distinct period lattices per holohedry class. Multiplicity is work items per distinct lattice (orbit/dedup overlap).}`,
    `\\label{tab:lattice-census-k${c.k}}`,
    '\\end{table}',
    '',
  ].join('\n');
}
```

- [ ] **Step 4: Run the test, verify it passes.**

Run: `pnpm vitest run figures/data-extract/censusTable.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Generate the real fragment from the latest census log.**

```bash
mkdir -p figures/out/tables
pnpm tsx -e '
import fs from "node:fs";
import { parseCensus, censusToTex } from "./figures/data-extract/censusTable";
const logs = fs.readdirSync("experiments/results").filter(f=>/k3-census-table.*\.log$/.test(f)).sort();
const log = fs.readFileSync("experiments/results/"+logs[logs.length-1],"utf8");
fs.writeFileSync("figures/out/tables/census-k3.tex", censusToTex(parseCensus(log)));
console.log("wrote figures/out/tables/census-k3.tex from", logs[logs.length-1]);'
```
Expected: writes the fragment. Open it; confirm the ALL row reads 72275 / 2468 (or the latest log's numbers). ⚑ If the latest log shows the "265 duplicate seed entries — Σ inflated" warning, note it in the handoff so TA does not quote an inflated Σ as final — flag, never silently ship a number a log warned about.

- [ ] **Step 6: Commit.**

```bash
git add figures/data-extract/censusTable.ts figures/data-extract/censusTable.test.ts
git commit -m "figures: census-log parser → tab:lattice-census-k3 tex fragment"
```

---

## Task 5: TA handoff — bundle deliverables + SYNC entry

**Files:**
- Create: `figures/out/HANDOFF-proof-figures.md` (the bundle index for TA)
- Modify: `docs/SYNC.md` (append one dated CC→TA entry, 3–6 lines)

- [ ] **Step 1: Write the handoff index** capturing what's delivered and what TA does with each. Fill the oblique t-codes from Task 1.

```markdown
# Proof-figure pass — CC deliverables for TA (2026-06-12)

Spec: `TilingAtlas/docs/superpowers/specs/2026-06-12-thesis-proof-figures-design.md`
(6 figure specs G1–G6, grounded in correctness.tex proof text; ownership split inside.)

## Delivered now (this plan)
- **F19 `fig:oblique`** — `thesis/figures/generated/explanatory/oblique-A.pdf`, `oblique-B.pdf`
  (t-codes: <FILL>, <FILL>). The two oblique k=3 tilings; oblique cell drawn. Place per spec §F19.
- **G1 `fig:octagon` underlay** — `…/explanatory/octagon-488.pdf`. Clean 4.8.8 patch; overlay Λ₈
  vectors u,v=(1+√2)·axis and the square holes in TikZ (spec §G1).
- **G2 `fig:incidence` Panel B underlay** — `…/explanatory/incidence-axis.pdf`. Clean patch; draw
  the reflection axis along edges/bisectors (spec §G2).
- **`tab:lattice-census-k3`** — `TilingAtlas/figures/out/tables/census-k3.tex`. Fills the
  `algorithm.tex:80` seed-set/lattice owed table (counts only).

## NOT yet delivered (deferred — need coordinated runs / own recon)
- Per-stage performance profile (`results.tex:444`) + star-family growth/timing (`results.tex:452`)
  — census logs lack fill-rate/gate-cost granularity; needs a fresh coordinated run.
- G6 vc-gen / seed-assembly DFS trees (`algorithm.tex:54`, `:100`) — needs new generator
  instrumentation; separate plan.

## Figures that are TA-authored TikZ (specs only, no CC data needed)
G3 star-graph/dent-chain, G4 equivariant cascade, G5 reflection-cover — see spec.
```

- [ ] **Step 2: Append the SYNC entry** (newest last; 3–6 lines; signed CC). Do NOT rewrite existing entries.

```
**2026-06-12 — CC → TA+AL — Proof-figure pass: spec + first data deliverables.**
Spec `docs/superpowers/specs/2026-06-12-thesis-proof-figures-design.md` (6 figures G1–G6 grounded
in correctness.tex; ownership split). Delivered to `thesis/figures/generated/explanatory/`: F19
oblique k=3 pair + G1 4.8.8 + G2 axis underlays (TA overlays the proof annotations); `tab:lattice
-census-k3` tex at `figures/out/tables/census-k3.tex` (fills algorithm.tex:80, counts only).
DEFERRED (need coordinated runs / own recon): per-stage perf + star timings (results.tex:444/452),
G6 DFS trees. Index: `figures/out/HANDOFF-proof-figures.md`. — CC
```

- [ ] **Step 3: Docs invariant check + commit.**

```bash
pnpm docs:check
git add docs/SYNC.md figures/out/HANDOFF-proof-figures.md
git commit -m "docs: proof-figure handoff to TA — spec + F19/G1/G2 underlays + census table"
```
Expected: `docs:check` passes (SYNC entry ≤6 lines, no dead links). If it flags the entry length, trim to ≤6 lines.

---

## Self-review notes (filled during writing)

- **Spec coverage:** F19 (Task 1–3), G1/G2 underlays (Task 2–3), census table = manifest item 4 (Task 4), handoff (Task 5). Manifest items 5–6 (per-stage perf, star timings) and G6 explicitly deferred with reason. G1–G5 TikZ authoring is TA's, not CC's — correctly absent from this plan.
- **No heavy run:** every task reads the already-certified catalogue or existing logs. No solver invocation ⇒ no single-writer hazard for this plan (delivery to TA's repo is copy-only, gallery PDFs untouched — Task 3 Step 2 guards it).
- **Placeholders:** the only intentional fill-ins are `<OBLIQUE_KEY_*>` / `<G1_KEY>` / `<G2_KEY>` in Task 2 (resolved by Task 1 Step 5 + inspection) and the t-codes in Task 5 — each has an explicit resolution step. These are data-discovery, not unspecified code.
- **Type consistency:** `latticeClass([u,v])` ↔ `model.basis` (`[Vec,Vec]`); `tilingFigure(model, {windowMm,edgeMm,...opts})` matches the real signature; `parseCensus`→`censusToTex` share `Census`.
- **Risk:** if Task 1 Step 5 yields ≠2 oblique tilings, the figure claim is wrong — hard STOP built in.
