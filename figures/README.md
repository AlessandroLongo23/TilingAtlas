# Thesis figure pipeline

Data-driven, reproducible figure generation for the thesis (`../../thesis`). One TypeScript
figure IR, two emitters: **TikZ → standalone PDF** (thesis-final: LaTeX fonts, mm-precise line
widths) and **SVG** (instant browser preview). A shared style module keeps them from drifting.

Design doc: `~/.claude/plans/i-want-to-plan-immutable-platypus.md` (approved 2026-06-10).

## Commands

- `pnpm figures` — build all figures: data → IR → emit `.tex`/`.svg` → `latexmk` (parallel) →
  deliver PDFs + generated gallery `.tex` to `../thesis/figures/generated/` → contact sheet.
  Flags: `--only <substring>` `--k <n>` `--no-latex` (emit only) `--no-deliver`.
- `pnpm figures:data` — refresh `figures/data/` from Supabase (snapshot + oracle map).
  Requires `.env` service-role creds. **Hard-fails unless certified counts are exactly 11/20/61
  with the known digests** — the figure pipeline never renders unproven data silently.
- `pnpm figures:preview` — contact sheet: rasterize every built PDF (`pdftoppm`) into one
  `figures/out/contact-sheet/index.html` for fast eyeballing.

## Toolchain (one-time setup)

- TinyTeX at `~/Library/TinyTeX` (not on PATH — the build prepends
  `~/Library/TinyTeX/bin/universal-darwin`). Packages: `tlmgr install standalone pgf caption`
  (`subcaption.sty` ships in `caption`; deps auto-resolve).
- `pdftoppm` from poppler (`brew install poppler`) for the contact sheet.

## Layout

- `data/` — **committed** build inputs: `catalogue-k1-3.json` (certified snapshot),
  `oracle-map.json` (canonical_key → Galebach t-code), `orbits.json` (cached orbit
  assignments + VC names), `galebach.json` (pinned oracle).
- `ir/` — figure IR types. `style/` — palette + ColorStrategy (`byOrbit` | `byNGon` | `lineArt`).
- `tiling/` — exact cell → model (`cellModel`), orbit assignment (`orbits`), lattice
  replication (`patch`), figure assembly (`tilingFigure`).
- `emit/` — IR → TikZ (y-up) / SVG (y-flip).
- `tex/hand/` — hand-authored standalone TikZ (DFS tree, seed assembly, architecture);
  shares `tex/preamble-shared.tex` + generated colors so fonts/colors match generated figures.
- `out/` — gitignored intermediates.

## Conventions

- Unit edge = 1 model unit. Galleries `edgeMm≈3.8`; single figures `edgeMm=8`.
- Canonical orientation: shortest lattice vector (float Gauss reduction) rotated onto +x —
  rotation only, NEVER reflection (chirality is type-distinguishing).
- `byNGon` fills use the APP's hues (`polygonHue(n)` at S=40/B=100) for web↔thesis consistency.
- Line widths in mm (tile edge 0.25, hairline 0.12); orbit markers r=0.9mm; Okabe–Ito palette,
  white background.
- `byOrbit` colors VERTEX markers by orbit class (k-uniformity is vertex-orbit counting);
  tiles stay near-neutral. `byNGon` fills tiles by polygon type. `lineArt` is fills-off.
- Crack avoidance: fill+stroke on the same path, round joins.
