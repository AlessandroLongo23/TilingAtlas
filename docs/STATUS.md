# STATUS — TilingAtlas (current-state cache)

> **What this file is.** The 30-second "where are we" snapshot. **Mutable, disposable,
> clobber-tolerant** — if two agents overwrite it, nothing is lost, because the *canonical*
> history lives in the append-only **ledgers** below. Regenerate it from the latest signed
> entry of each ledger. **Never write history here.** — last updated 2026-08-03, CC
> (acting as TA too, AL authorization 2026-07-10).

## Engine cost per level is known, and the pruner store can leave RAM (2026-08-03)

The regular palette is timed k=1..13 with every level asserted against A068599. **A level costs
2.45x the one before** (solve 2.449x, engine 2.465x, fitted k=7..13, Apple M5 single-threaded):
k=8 11.9s, k=10 1m15.8s, k=13 12m27.7s. k=16 ~2h, k=19 ~1.5d, k=24 ~100 days over ~2.5e8 tilings,
so k>=21 stays the distributed problem §44 called it.

- **`EU_SPILL=<MB>` is new in `eu_pruner.cpp`** (Marek's proposal, 2026-08-03): caps resident
  solution bytes and spills the rest to disk, read back only for the matching bucket. Streamed
  k=13: 214.8 -> 75.6 MB peak RSS (2.84x) for +0.4% wall; resident pinned at 8 MB against a
  148.9 MB store. Catalog byte-identical on/off, `check-regular` PASS with the knob on and off.
  Unset = previous all-in-RAM behaviour, so nothing changes unless asked.
- **Root-split parallelism (`EU_SHARD_N/W`) is a flat 4.0-4.2x** on 10 cores, k=10..13, counts
  summing to A068599 at every k. Ceiling is 5.7-6.0x: one of the 44 seeds is ~17% of all shard
  CPU and the run ends waiting on it. More cores buy nothing without splitting that subtree.
- ⚑ **Fixed: `make MAXNUM=<k>` could silently ship an incomplete catalogue.** GNU Make 3.81
  compares mtimes at 1s granularity, so a stamp touched in the same second as the previous
  `eu_solver` did not force a rebuild; k=5 reported 0 tilings instead of 332, with no error.
  Now forced at parse time. Deleting the binary from the stamp *recipe* does NOT work (make has
  already stat'd it) and leaves no binary at all.
- ⚑ **Timings taken while other oracle work runs are worthless**: streamed k=12/k=13 first read
  2.27x slow, which invented a "streaming gets slower past k=12" crossover that does not exist
  (streaming is 0.79-0.81x of the file path). A thermal explanation was disproved by a canary.

Detail: DEVELOPMENT_NOTES.md §"what a level of k costs"; logs in `experiments/results/2026-08-03-*`.

## TEN isohedral edge shelves are LIVE, with curved edges (2026-08-05)

Marek's second PARAMETRIC board is in the atlas, at `ih-1`. `pnpm build` clean, 15 IH tests pass, and
the shelf is verified in the browser: period, fills, scaffold/lattice/orbit overlays, curvature.

- **`edges_isohedral_IH01` at `ih-1`** — 1,099 records eager of 14,759 decoded (k = 2…10 eager, 12 and
  14 lazy at 14.1 and 35.0 MB). Tile from Craig Kaplan's Tactile at the live parameter point, so this
  board needed no closure solver, unlike the pentagon one. `complete: false` (Marek's census carries no
  MAX line) and k = 16 is `dropped` — enumerated, 54,630 certificates, not shipped on our budget.
- **The patch builder is now SHARED** — `lib/freedraw/edgePatchCore.ts` takes a tile plus a walk closure
  and returns a `FreedrawPatch`, so both parametric shelves draw through `drawFreedraw` and inherit
  infinite scroll, the five fill modes, every overlay and the conformal lens. The pentagon file still
  holds its own copy; collapsing it is a mechanical diff, left for when that session is out of it.
- **The period holds k/2 tiles.** Marek's certificate cell is exactly TWO translation periods — 2k board
  vertices carrying k distinct orbit labels — measured at ratio 2.0000 on 153 records across every
  shipped k. Declared per board (`certCellPeriods`) and CHECKED against the lattice the develop found.
- **Edges bow**, one slider per distinct edge shape, ±0.5 as on `/isohedral`. Straight by default: an
  edge system is about which edges are DRAWN. Curvature moves no tiling vertex, so the walk, the lattice,
  the face merge and the ranks are untouched — it is a pure render-layer change. `FreedrawPatch` gained
  two optional curve arrays, omitted entirely when nothing bows, so the five straight boards are
  unchanged. Which way an edge bulges comes from the digon SLOT bit, pinned against Tactile.
- **All 14,759 records build a patch, 0 failures**, worst 157 ms at k = 14
  (`experiments/results/2026-08-04-ih01-patch-sweep.log`).
- ⚑ **The develop realises the MIRROR of Tactile's placement** — pre-existing, from the turn sign in the
  walk, and the pentagon shelf's walk shares the convention. Harmless under mirror-pairs-merge and the
  bows are correct relative to the tile. Flipping one shelf and not the other would be worse. AL call.
- **`edges_isohedral_IH02` at `ih-2`** — same counts as IH01 at every k, zero shared records (asserted).
  Its tile has TWO aspects, so `corner -> class` is not a function, the corner labelling had to be solved
  from eight candidates, and — since IH02's DEFAULT tile is the regular hexagon, where every wrong
  candidate develops — the test that pins it works at a generic parameter point.
- ⚑ **`certCellPeriods` was wrong and is gone.** The certificate cell is a whole number of periods, but
  which number is a property of the RECORD: IH01's is always 2, IH02's is 1 for 75 of 80 and 2 for 5.
  The builder now checks the period DIVIDES the certificate's count.
- **`edges_isohedral_IH03` at `ih-3`** — `abacBc`, two aspects, same counts again from disjoint data.
- **`scripts/solve-ih-board.ts` derives the board row** for any IH corpus, and separates what is forced
  (corpus incidence, 360° closure) from what is decisive (does it develop) from what is a tie-break
  (mirror pair). ⚑ It must test away from the DEFAULT parameters: IH02 and IH03 are the regular hexagon
  there, where every wrong corner labelling develops perfectly. Reproduces IH01's and IH02's answers.
- **`edges_isohedral_IH04` at `ih-4`** — six parameters, FIVE edge classes (`S J S S S`), and much
  deeper: 13/103/628/3977 where the others give 5/15/60/275, budget stops at k=8 (k=10 and 12 dropped).
  ⚑ Only the class occurring twice gets a digon slot, so four of its five classes cannot say which way
  an edge is crossed — harmless because those four are the S edges, equal to their own reverse, and
  `checkSlotsAreOpposite` asserts that pairing instead of assuming it.
- **`edges_isohedral_IH05` at `ih-5`** and **`IH06` at `ih-6`** — 7/28/166/1040/2336 and
  3/14/74/580/1224, census-exact, k ≤ 10 shipped. The first boards with FOUR aspects, and each broke a
  rule that had only held because four boards agreed on it.
- ⚑ **The certificate face count constrains nothing.** It is identically `rec.k` on all 48,998 earlier
  records, so the builder's "the period must divide it" gate was really "F divides k" and rejected
  every IH05 record (its k=6 period holds TWELVE tiles). Replaced by a fact about the board: the period
  is a whole number of Tactile's own cells, 1/2/2/2/4/4 across the six.
- ⚑ **IH06 marks a drawn edge at ONE END ONLY** (`C10` against `C12`), so read per dart its drawn set
  depends on which side the walk arrived from and 10 of 14 records at k=4 develop with no period at
  all. The bit is now resolved PER EDGE, drawn iff either dart says so: byte-identical on IH01-IH05,
  11,088 marks fixed on IH06. `or` and not `and` because only `or` keeps the full 1-skeleton in the
  corpus. ⚑ UNCONFIRMED by Marek; the develop reports the count per board so it stays visible.
- **`edges_isohedral_IH07` at `ih-7`** and **`IH08` at `ih-8`** — 5/15/60/230/1100 (k=4…12) and
  5/15/52/175/360/1288/1840/6500 (k=1…8), census-exact. All 11,645 records build at two parameter
  points, straight and bowed, with no slot failures.
- ⚑ **IH07 has ROTATION CENTRES, the first board that does.** Three of its corners are 120° and meet
  three copies of themselves, so a vertex figure tagged `Cn` is a 1/n of a vertex: it closes to 360/n
  and lists `vertex_corners / n` corners. Demanding a full turn from a third of one rejected both
  candidate labellings and the board read as unsolvable.
- ⚑ **IH08 names THREE corner letters for six corners** (`abcabc` repeats at period 3), so the 6 in
  `A6` is the tile's SIDE count and never was the letter count. It is also the only board with ODD k:
  one aspect and three S edges give it a bare tiling with a single vertex orbit, so it starts at k=1.
  Any code stepping these boards two at a time is wrong on it.
- ⚑ **COVERAGE FLAG, IH07: its census reads 1,100 at k=12, ZERO at k=14, 22,240 at k=16.** Nothing on
  this shelf grows like that, so the zero is recorded as `missing` and not believed. Ask Marek, along
  with IH06's one-sided drawn marks.
- **`edges_isohedral_IH09` at `ih-9`** and **`IH10` at `ih-10`** — 3/4/14/41/64/205/244/1328/1313/
  4152/3244 (k=1…11) and 5/16/80/175/465/1651/3117 (k=1…7), census-exact. Ten boards, 82,436 records.
- ⚑ **IH10 CANNOT BE BOWED, and the code refuses instead of drawing it.** A digon slot says which end of
  an edge a dart sits at, so a one-slot class has no direction bit — safe only where the edge is its own
  reverse, which held from IH04 to IH09 because every one-slot class was an S edge. IH10's single class
  is a J edge used six times with one slot, so a bow would come out mirrored on half the edges.
  `solveIhBoardFor` returns `unbowable`, the controls withhold the sliders, and each board now declares
  its slot counts, derived from its corpus and asserted against the shards.
- ⚑ **A `Dn` site tag is n/2-fold** (a dihedral group of order n has n/2 rotations). IH10 is the first
  corpus with mirror sites, `Aa`/`Ac`/`D6a`. It also has ZERO parameters, the only board that does.
- ⚑ **IH09's census FALLS**, 4,152 at k=10 to 3,244 at k=11. That is the board, not a short run — which
  is the contrast that makes IH07's zero at k=14 a gap and not a fact.
- **n = 13 fills a hole in the 3.4.n.4 shelf**, which shipped n = 7…12, 14…20, 23 and jumped 12 → 14
  with nothing saying so. 1/4/4/33/104/94/23/2097 at k = 1,7,8,13…16,20. ⚑ It is the FIRST AI1 drop with
  a census, and the census counts 416,137 certificates at k = 27…30 that the drop does not contain, so
  `HypPolyBoard` grew an OPTIONAL `missing` — absent means UNKNOWN on the other fourteen boards, never
  none. n = 21 and 22 are still absent from the shelf.
- **The octagonal antiprism (3.3.3.8) joins the spherical edge shelf**, 21,558 records at k = 1…5, 8, 9.
  ⚑ Its k=1…5 counts are identical to the square antiprism's from disjoint data (zero shared drawn-sets,
  32e/18f against 16e/10f). ⚑ Its census counts 2,925,191 at k=16 that the drop lacks: `missing: [16]`.
- **`quadrangles.txt` is a SPEC, not data** — Marek proposing isohedral quadrangles as a family, eight
  symmetry classes with their Conway symbols, forced edge shapes and angle conditions across all three
  geometries. Nothing to ingest; it is what a future solver would be written against.
- **The (2,3,4) F2 rerun is IN** — k=3 goes 5 → 10 and k=4 goes 2 → 13, both strict supersets: 16
  tilings that a shelf calling itself a catalogue was missing. ⚑ Only those two slices are rerun, so
  (2,3,4) k=5…11 and the whole of (2,3,5) (2,3,6) (2,3,7) (2,4,5) are still lower bounds — five boards
  short, not six. ⚑ The corpus arrives in the isohedral alphabet, so the Schwarz front end now carries
  a LEGACY/SLOTTED `Dialect`; re-decoding legacy (2,3,5) is byte-identical.

Detail: DEVELOPMENT_NOTES.md §"The IH01 shelf ships", §"IH05 and IH06", §"IH07 and IH08",
§"IH09 and IH10".

## The parametric pentagon shelf is LIVE, and the snub cube shipped — UNCOMMITTED (2026-08-04)

Both Marek drops are in the atlas. `pnpm build` clean, 283 tests pass across pentagon + freedraw, and
the shelf is verified in the browser: period, fills, grid toggle, G/P/O/X, zoom-out, lens.

- **Snub cube (3.3.3.3.4)** — 23,274 records, 0 failures, 10.6 MB, per-k matching the census. The
  shelf's first CHIRAL board (|G| = 24, the rotation group O), and the first row where `complete: false`
  and `missing: [8]` both fire: the census stops at k = 8 of a 24-vertex solid AND its 147,140 tilings
  are not in the zip. Live at `spe-33334`.
- **`edges_pentagons_01` is live at `pen-1`** — 744 records eager of 17,993 decoded. Kershner TYPE 1,
  proved from the vertex figures. The record ships NO geometry; `lib/pentagon/edge-board.ts` solves the
  board at the live slider point and `edgeDevelop.ts` re-develops the darts.
- **It renders as a PERIOD, so it behaves like every other edge shelf** (2026-08-04 pm).
  `edgePatch.ts` recovers the period lattice from the develop per parameter point and returns a
  `FreedrawPatch`, so `drawFreedraw` draws it: infinite scroll, the five fill modes, scaffold / period /
  orbit overlays, G/P/O/X, and the conformal lens. Cell area is known before the search — every
  certificate carries 12k darts, so F = k, E = 3k, V = 2k — which makes the second basis vector exact
  and sizes the develop in one step instead of doubling. **53,979 builds, 0 failures**
  (`experiments/results/pent-edges-periodic-patch.md`). `pentParams` is now store state, which the lens
  requires. ⚑ Also fixed in the SHARED renderer: `drawPatchPattern` blanked the canvas past 4,000
  lattice copies; it now trims to a 200k-primitive budget, as the fixed-grid branch always did.
- **The split-side board is solved.** Tile = the hexagon `A-b-B-c-C-d-Pi-b-D-e-E-a-A`, angles summing to
  720°, closure two linear equations. b is free because the two b-edges are antiparallel, which holds
  exactly when B + C = 180° — type 1's own constraint. Family stays 5-dimensional. It does not close at
  `lib/pentagon/types.ts`'s type 1 side defaults (residual 0.61, pinned in a test): those are a
  different type 1 tiling.
- **The parametric claim is a test, not a hope**: re-solving at another parameter point gives identical
  vertex/edge/drawn counts with a different shape. Plus two geometric checks on real records — every
  edge at a class length (2e-14) and every interior vertex closing out of tile corners (4e-7, 540
  vertices).
- ⚑ Open: k = 8 / 10 are lazy but only the deep-link path exercises the fetch; `pentParams` is in the
  store but NOT yet in the share URL, so a link still does not carry the shape; the shelf borrows
  `source: "freedraw"` for its class, so any new surface special-casing freedraw must know its k counts
  VERTEX orbits.

Detail: DEVELOPMENT_NOTES.md §"The parametric pentagon shelf is live".

## Čtrnáct's five levels are a library facet — UNCOMMITTED (2026-08-02)

`/library` has a **Level** filter under Hyperbolic and Spherical: Regular, Archimedean,
Pseudo-Archimedean, Combination, Hybrid, from Marek's own ladder in
`materials/writeups/tilings_exploration.txt` §2. Classified live by `lib/tilings/tiling-level.ts`, shown
with per-level counts, and repeated as a row in /play's info panel beside k and m. `pnpm build` clean,
58 tests pass across the eight affected files. 65,457 of 65,458 curved records classify.

- **The ladder is (k, m) plus one test the pair cannot make**: do the vertex configurations agree as
  MULTISETS. 3.4.7.4 and 3.4.4.7 are one combination in two cyclic orders (Combination); 4.7.14 is a
  second combination (Hybrid). Everything else follows from k and m, which the atlas already carried.
- **Curved-geometry only, by the mathematics and by the data.** A hybrid needs two combinations whose
  edge functions coincide, which is rare only where the edge function constrains anything; in E² it
  "resolves to 0" (Marek), so the top rung is free and meaningless. The Euclidean catalogue also ships
  no per-orbit configurations, only `m`/`partition`, which already have their own filters.
- ⚑ **Three hybrids in the whole 28,453-record developed hyperbolic catalogue** — `3.3.3.7.7 + 3.7.7.7`
  (twice) and `3.8.3.8.8 + 8.8.8.8`. Pinned by name in the tests, because that is the claim the shelf
  now makes. The AI1 shelf is the opposite: 32,194 of 36,945 are hybrid.
- **AI1 stays a SEPARATE axis from the levels**, deliberately: a level is computed from one tiling's own
  vertices, AI1 names the edge identity whose board it came from, and 4,751 AI1 records are not hybrid.
  Nesting the families under Hybrid would misfile one record in eight.
- ⚑ **`lib/render/johnsonSolids.ts` had 12 corrupt vertex configurations** and so did the spherical
  catalogue. `gen_johnson_ts.py` joined an already-dotted config string's own CHARACTERS with ".":
  "3.3.4.4" → "3...3...4...4", "4.5.10" → "4...5...1.0". Its catalogue loop was also append-only, so no
  re-run ever repaired it. Both fixed; regenerating now touches 12 lines and nothing else.
- ⚑ Open: `sp3-1-00001` ships `config: "3.4"`, the cuboctahedron's figure modulo a 2-fold site rotation
  where the vertex is 3.4.3.4. The one record the classifier returns null for, and it is on the card.
  Fix is in `develop_ai1_sph.py` plus a re-develop of sp3.

Detail: DEVELOPMENT_NOTES.md §"Marek's five levels become a filter".

## Marek's 2026-08-02 drop is in — UNCOMMITTED (2026-08-02)

Nine zips at 11:29–11:30, onto the two shelves the 07-31 drop built. 146,276 developed records, 73 MB,
**zero develop failures**, every per-k count matching the census Marek ships beside the certificates.
`pnpm build` clean; the two shelf test files pass (19 tests). No new renderer and no new developer.

- **Four spherical edge boards** (`public/spherical-edges/`): the octagonal prism (4.4.8), the
  heptagonal antiprism (3.3.3.7), the truncated octahedron (4.6.6) and the rhombicuboctahedron
  (3.4.4.4). One row each in `develop_sph_edges.py::BOARDS`. The corpus ids read like triangle groups
  and are not — every one of the four is a finite solid.
- **Five more of the 3.4.n.4 family** (`public/hyperbolic-poly/`): n = 17, 18, 19, 20, 23. 10,340
  records shipped of 146,417 enumerated, `--budget 4000` per board, every one truncated and saying so
  in `dropped`. The filenames encode polygon sizes in HEX, so `ai1_23` reads `S3S4S17S2e` for
  {3, 4, 23, 46}. Still no n = 13; now no 21 or 22 either.
- ⚑ **`edges_4443` is TWO polyhedra the census cannot separate.** The rhombicuboctahedron and J37 have
  V=24 E=48 F=26 and 3.4.4.4 at *every* vertex, so the old census-only key would have shipped J37 as an
  unnamed `4443v2`. `symmetry_orbits` moved down from `develop_ai1_sph.py` (which already had it for
  this exact pair) into `develop_sph_edges.py`, and both tables key on (census, vertex orbits).
  Measured |G| = 48 in one orbit against 16 in two. Split 14,271 / 5,649, summing to the census at
  every k. The cuboctahedron corpus re-keys unchanged (48/1, 12/2) — the regression that proves it.
- ⚑ **Two coverage claims came apart, so `SphEdgesBoard` grew two fields.** `complete` — 4443/j37 are
  MID-RUN (census stops at k=8 of a 24-vertex solid, no MAX marker). `missing` — 3337 is the opposite:
  a finished enumeration (census reaches k=14=V) whose k=14 slice, **334,772 tilings**, is not in the
  zip. Exhausted board, short copy. The shelf's old blanket claim that every k hole is the solid was
  also unbacked for 3334 and 3336, which shipped no census at all.
- **Both board tables are generated now**: `tools/ctrnact-oracle/emit_board_tables.py` prints them off
  the shards, the census files and the develop reports. It reproduces all nineteen prior rows exactly.
- ⚑ Open: nothing RENDERS `complete`/`missing`/`dropped` yet — data model only, on both shelves. And
  Marek shipped `pt_edges_448/3337/4443.exe`, which run here under wine, so "is 4443 k>8 empty or
  unenumerated?" is answerable on this machine.

Detail: DEVELOPMENT_NOTES.md §"Marek's 2026-08-02 drop"; reports in `experiments/results/sph-edges-*.md`
and `ai1-*.md`.

## Marek's 2026-07-31 drop is in — UNCOMMITTED (2026-07-31)

Three new shelves from the archives that arrived at 19:24, 191,473 developed records, 122 MB, **zero
develop failures**, every per-k count matching Marek's own census files. `pnpm build` clean, 17 new
tests pass. **No new renderer was written** — all three ride paths already in the repo.

- **6.6.8 hyperbolic edges** — one row in `develop_hyp_edges.py::BASES`, one in `HYP_EDGES_BASES`.
  15,017 records, k=1–9. k=10 is 53,417 more (~85 MB) and is omitted; the board's census has no `MAX`
  line, so it is a budget cut, not an exhausted board.
- **Ten finite polyhedral edge boards** (`public/spherical-edges/`, new `develop_sph_edges.py`): the
  triangular/pentagonal/hexagonal/heptagonal prisms, the truncated tetrahedron, the square/pentagonal/
  hexagonal antiprisms, the cuboctahedron and **J27**. 149,851 patterns — every certificate of all
  ten boards — in 49 MB. They draw through the
  spherical Schwarz adapter unchanged; its face type widened `[n,n,n][]` → `number[][]` and nothing
  else moved. Every board's k ceiling IS its vertex count, so these are complete, and the intermediate
  k holes are the solid, not a short run.
- **The 3.4.n.4 family** (`public/hyperbolic-poly/`, new `develop_ai1.py`): hyperbolic tilings by
  regular {3, 4, n, 2n}-gons at the ℓ where 3.4.n.4 closes, n = 7…16 (no 13 in the drop). 26,605
  records, 52 MB (26,605 of Marek's 232,000; see the budget note below). Renders through `developColors` with the face's POLYGON SIZE as the fill index.
- ⚑ **`cuboctahedron_edges` was two polyhedra.** The corpus holds 3.4.3.4 and 3.3.4.4 vertices: Marek's
  solver enumerates by angle closure, so the gyro-twin **J27** (triangular orthobicupola) comes back in
  the same run, sharing the edge length and V=12/E=24/F=14 exactly. 102,278 records split 20,799 /
  81,479. A board is now keyed on its VERTEX-FIGURE CENSUS; V/E/F does not separate the pair.
- ⚑ **Every AI1 board is TRUNCATED and says so.** 232,000 hyperbolic certificates would be ~350 MB, so
  `--budget 4000` ships a contiguous k prefix per board. `HypPolyBoard.dropped` (this shelf's budget)
  is kept separate from `hypPolyKGaps` (the corpus having nothing there) — two different claims.
- **The 3.4.n.4 family is now complete on both sides of the curvature split** (`public/spherical-poly/`,
  new `develop_ai1_sph.py`): its 20 spherical members, n = 3, 4, 5, in 55 kB. Each record carries its own
  solid, since at k > 1 these are neither uniform nor the board. `k` is the orbit count MEASURED off the
  solid's isometry group, not the certificate's — it agrees with Marek's on all 20, and it is what
  separates the rhombicuboctahedron (|G|=48, one orbit) from **J37** (|G|=16, two), a pair identical in
  V/E/F and in vertex figure at every vertex. n = 3 carries one great-circle face (at ρ = π/3 the
  hexagon's circumradius is exactly π/2); that record is the triangular cupola, and it is geometry, not
  a decode failure.
- Still open: `ai1_13` is absent from the drop, AI1 shipped no `.exe` so those runs cannot be extended
  here, and the Euclidean member (n = 6, 6,593 tilings by {3,4,6,12}) needs the ℤ[ζ₁₂] path, not this
  developer.

## The isohedral shelf is live — UNCOMMITTED (2026-07-31)

`/isohedral` lists all 93 Grünbaum–Shephard isohedral types with live vertex parameters and edge
shapes. Geometry from Craig Kaplan's Tactile, vendored under BSD-3 at `lib/isohedral/vendor/`
(byte-identical to GitHub master; npm's 1.0.0 is stale by a `fillRegionQuad` fix). `pnpm build` clean,
31 new tests pass.

- **81 of 93 render, and the page says which twelve do not and why.** IH19, 35, 48, 60, 63, 65, 70, 75,
  80, 87, 89, 92 need interior markings; they are selectable and replace the canvas with Kaplan's own
  explanation. G&S's 1977 paper is titled *The eighty-one types of isohedral tilings in the plane*.
- **It draws through `FlatCellRenderer`, so the tiling is unbounded** — one translational cell uploaded,
  instanced over the visible lattice in the vertex shader, two draw calls per frame at any zoom. AL
  corrected this mid-build; the first version was a finite patch, which was wrong in kind.
- **The cell is the nc × nc supercell**, because `getColour` reduces mod nc and a one-cell mesh would
  colour touching tiles the same. 49 of 81 genuinely need it. Ear-clipped via its own
  `lib/isohedral/cellMesh.ts`: /play's `buildCellMesh` fans from the centroid, which the curvature
  sliders invalidate. /play's builder untouched.
- Every per-type fact is derived from Tactile at module load, never transcribed; the tests pin the
  measured distributions and IH01's exact default geometry against a bad vendor update.
- **Edge sliders round-trip** (fixed same day, AL found it). Edge state is a shape template plus an
  amplitude the slider scales, so Randomize's shape survives being adjusted — the old model rebuilt the
  control points from the slider value and threw the random x's away on first touch. Randomize also
  quantizes onto the slider's step grid, or the control showed a rounded value the first drag then
  wrote back. Verified by screenshot hash across 26 sliders on four types.
- **No zoom slider.** The wheel owns zoom over an unbounded tiling; a slider duplicated it and, since
  reframing refits, yanked the view home when touched (AL). `HOME_PERIODS = 8` is now a constant that
  only sets where the view starts. Applied to `/pentagons` too (`HOME_PERIODS = 4`), whose "Patch"
  label also claimed an extent that tiling does not have.
- **The facts live in the shared info panel**, not a sidebar block (AL): `TilingSpec` grows
  `IsohedralFacts`/`PentagonFacts` beside `FreedrawFacts`/`ColorsFacts`, and both pages mount
  `TilingInfo` over their canvas as /play does. The orbit section is now conditional — /pentagons knows
  none of the four counts, and /isohedral's only certainty (tile orbits = 1) is not worth three blanks
  beside it.
- **Edge curves are flattened adaptively, from the Bézier's own error bound**, to a quarter-pixel
  budget that follows the zoom (AL saw segments at high magnification). Per edge, so cost tracks
  curvature; capped at 128 segments; the mesh re-tessellates when the zoom crosses a power of two, via
  `rehome` so the camera does not move. Affordable because `cellMesh.ts` now triangulates the prototile
  once and reuses the index list across the cell — 8 ms against 218 ms at the extreme.
- ⚑ Not done: drag-to-edit edge control points, wallpaper-group labels per type (derivable, but must be
  cross-checked against G&S before shipping a label), the marked types' interior markings.

Detail: DEVELOPMENT_NOTES.md §"the isohedral shelf: IH1–IH93 on the flat renderer".

## The hyperbolic freedraw renderer is finished (2026-07-31)

Marek's open item from 2026-07-29 is closed. The hyperbolic Schwarz shelf now draws through the
per-pixel WebGL path like every other hyperbolic shelf: the disk fills to the rim, panning re-anchors
through the side pairings and never drifts. The fully-drawn (2,4,5) triangle he could not find is
`hs245-3-00010` and renders. Roadmap item ticked in `marek-vault/ideas/roadmap.md`.

- **`force2d` deleted** from `HyperbolicEdgesCanvas` / `HyperbolicEdgesThumbnail` and all five Schwarz
  call sites. The reason it existed was wrong: the reducer never rebuilt side pairings from one edge
  length, it takes them from the developer's deck frames.
- **`maxTileRadius()`** (new, `hyperbolicDevelopClient.ts`) bounds the develop margin by the longest
  per-dart class on a scalene board, replacing three inlined copies that used the scalar `edge`.
  Regular boards compute the same number, so {p,q} records bake byte-identically.
- **The edge field measures a texel against its face's VERTEX STAR**, not its own sides. Closes a white
  pinhole at every vertex a bold run passes straight through — a defect on every hyperbolic edge shelf,
  not only this one. Cost 0.94–1.33× via a per-edge bbox reject; colorings byte-identical.
- ⚑ `hs237-3-00001` draws 0 of 6 edge orbits, so it renders as a blank disk with the scaffold off.
  Correct, but reads as broken — the shelf may want the scaffold forced on when nothing is drawn.
- ⚑ `tests/star-general-path.test.ts` fails on a 60 s timeout at ~160 s of real work. Pre-existing, on
  the superseded lattice path; untouched by this change.

Detail: DEVELOPMENT_NOTES.md §"the hyperbolic Schwarz shelf joins the per-pixel renderer"; numbers in
`experiments/results/hyp-schwarz-renderer-2026-07-31.md`.

## The Schwarz boards are a nine-board family across all three geometries — UNCOMMITTED (2026-07-28)

Marek's corpora (`materials/solvers/edges/Schwarz/`) are decoded and live. 135,636
certificates (122,419 curved + 13,217 Euclidean), **0 failures**. Surfaced on /library, /play and
/freedraw under all three geometries — verified in the browser, 2026-07-29.
`pnpm build` clean; `pnpm test` 1612 pass, 1 fail — the same pre-existing
`star-general-path.test.ts` 60 s timeout noted below (file untouched; it needs 167 s alone). Detail:
DEVELOPMENT_NOTES.md §"The Schwarz family becomes a family".

- **Three back ends, split by the sign of 1/p + 1/q + 1/r − 1.** Spherical (2,2,3) (2,2,4) (2,3,3)
  (2,3,4) (2,3,5) close under an SO(3) develop and ship finished geometry; hyperbolic (2,3,7) (2,4,5)
  ship darts and re-develop under the view; Euclidean (2,4,4) joins the planar grids beside (2,3,6).
  New: `tools/ctrnact-oracle/{schwarz_board,develop_schwarz}.py`, `lib/freedraw/schwarz.ts`.
- **Two conventions were READ off the certificates, not assumed.** `Sn` names an ANGLE π/n (not a site
  of rotation order n — the isoceles boards diverge and would reject), and a digon letter names a pair
  of ANGLES (which is why (2,4,4) has two edge classes and (2,3,6) three). `check_corpus` derives the
  map from each corpus and asserts it against the rule; that is also what filed the 16 (2,3,3)
  certificates Marek left in a folder named 236, with every file classifying to exactly one board.
- **Every spherical pattern is aligned onto ONE canonical board per shard.** Exact, not fitted: a
  developed instance is a flag and the board's group is transitive on flags of a given (corner, edge
  class). The geometry then ships once per shard instead of 61,914 times — **175 MB → 44 MB at full
  coverage**, which is what made (2,2,4) k=10 and (2,3,3) k=7 shippable at all.
- **`Darts` grew optional `alpha`/`elen`/`drawn`.** On a scalene board none of the three is derivable
  (one polygon size, three angles, three lengths, a digon on every edge). Absent on every existing
  record, so the {p,q} shelves develop byte-identically. The per-pixel disk shader DOES serve these
  boards (2026-07-31): its reducer takes side pairings from the developer's deck frames, which read
  `alpha`/`elen` already, and all 27 patterns certify in 3–18 ms. `force2d` is gone.
- **(2,4,4) needed ℤ[ζ₈] in `develop_freedraw.py`** (45° directions, sides 1 : √2). A `Ring` knob per
  grid; every `% 12` is now `% block.ndir`. Regression: all nine hexagonal k slices (86 MB) and
  sch236 k=3/k=4 regenerate **byte-identical**.
- **I had (2,4,4)'s board wrong and the develop caught it.** Not the barycentric subdivision (that
  would put the floor at k=3); y = ½ is not a mirror, so it is the square grid with both diagonals —
  four triangles per square, two vertex classes, floor k=2. All 270,768 faces measure 1 : 1 : √2.
- ⚑ **Coverage is Marek's run, not the board.** (2,2,4) has no k=8 and (2,3,5) no k=4 — gaps in the
  solve, surfaced by `schwarzKGaps` in the /freedraw board picker and asserted in the test suite.
  **(2,3,4) reran on 2026-07-29 to k=11** (842 → 5,974 certificates, contiguous k=3..11, 0 failures,
  same canonical board). A rerun that ADDS k is one manifest row; the board hoist is what keeps the
  new 5,132 tilings at 2.7 MB, not ~10 MB.
- ⚑ **The `F2` flag was a solver bug. Four boards are corrected; THREE ARE STILL SHORT.**
  (Marek, 2026-07-29.) A typo on the boards whose triangle has three different angles dropped every
  tiling that draws the longest edge class — which is why `E2` named all 103 scalene certificates and
  `F2` named none. A second bug (too few starting vertices) hit (2,2,3) and (2,2,4).

  | board | was | now | |
  |---|---|---|---|
  | (2,2,3) | 2,297 | **2,347** | the missing all-edges-drawn pattern is back at `ss223-2-00007` |
  | (2,2,4) | 65,257 | 65,257 | rerun CONFIRMS it; byte diffs are board orientation only |
  | (2,3,6) | 43 | **462** | k=3 5→10, k=4 38→452 |
  | (2,4,5) | 7 | **23** | k=3 5→10, k=4 2→13 |
  | (2,3,4) (2,3,5) (2,3,7) | | | ⚑ STILL SHORT — no corrected corpus yet |

  (2,3,3) and (2,4,4) are in neither bug and stand as shipped.
  **sch236 k=5 was DELETED, not corrected** (AL: better to show nothing than something false). The
  only slice we had came from the withdrawn build and Marek's drop stops at k=4; its k chip went too,
  and `sch236.test.ts` asserts the file stays absent.
  ⚑ Marek's drop for 236 again contained 16 misfiled certificates, all (2,3,3), holding exactly the
  247 that failed to develop. `--classify` catches this; never trust the folder name.
- **His solvers RUN here — see `docs/RUNNING_MAREK_SOLVERS.md`.** Reporting them unrunnable on this
  arm64 Mac was wrong for the third time. An extracted Homebrew `wine-stable` runs them via Rosetta 2
  with no sudo. Driver: `tools/ctrnact-oracle/run_schwarz_solver.sh`. My own runs reproduced Marek's
  k=3 exactly on (2,3,6), (2,4,5) and (2,3,7), and reached (2,3,4) k=5 at 1,568 (his: 80) and
  (2,3,5) k=4 at **0** — so that "gap" is an empty slice, not an unsearched one.

## /freedraw has a fifth grid: Schwarz (2,3,6) — UNCOMMITTED (2026-07-27)

Marek's `_schwarz.zip` (solver + 43 tilings at k=3 and k=4) is decoded and live as the `sch236` grid.
`pnpm build` clean; `pnpm test` 1602 pass, 1 fail — the same pre-existing `star-general-path.test.ts`
timeout noted below, file untouched. Detail: DEVELOPMENT_NOTES.md §"The Schwarz (2,3,6) board joins
/freedraw".

- **It is the first SCALENE board here.** Three edge classes at three lengths (1 : √3 : 2), where every
  other grid is equilateral and `develop_patch` hardcoded a unit step. √3 = 2z − z³ lives in ℤ[ζ₁₂], so
  the exact develop survives; `edge_len` + `Block.far_step` scale the step. Also the first board where
  EVERY edge carries a digon (drawn or not, the letter says which), so crossing to a neighbouring face
  hops the digon — `PatchComplex.adj`.
- **All three additions are `GRIDS`-table knobs, not new code paths.** Defaults reproduce the four old
  grids exactly: `hexagons_edges` regenerates byte-identical across nine k files / 86 MB, `squares_edges`
  byte-identical against pre-change code.
- **k=3 is the floor, not a gap** — the bare board already has three vertex orbits, so k=1 and k=2
  cannot exist (Marek). Finite tiles are polydrafters, and all of them are an even number of drafters.
- ⚑ **`F2` appears nowhere in the corpus.** It is the drawn 60–30 edge, so all 43 solutions leave that
  class undrawn — five of six letters used. The one real coverage gap; needs a rerun from Marek.
- ⚑ **The exhaustive-`Record` guard has a hole, now plugged for grids.** `FreedrawGrid` forced five
  sites to update but MISSED the /play sidebar tree: `SUB_ORDER` listed the freedraw subs as loose
  strings and `SUB_LABEL` is a `Record<string, string>`, so the grid loaded and counted but had no
  folder row (AL caught it). `FREEDRAW_GRID_SUBS` is now `as const satisfies` + an `Exclude` guard that
  fails the build naming the missing grid. **The colors and hyperbolic sub-axes are still hand-listed
  in the same `SUB_ORDER` and may have the same hole — unaudited.**
- ⚑ **A latent precision bug got fixed on the way**, and it moved shipped numbers. `regularOf` collapsed
  collinear boundary runs with an ABSOLUTE epsilon, which is exact on the integer bitmask grids but not
  on patch grids whose vertices ship rounded to 5 decimals. It suppressed every regular tile on the new
  board and under-counted DILATIONS on **ts**: `allRegular` 12 → 18 at k=2, 36 → 70 at k=3. `allUnit` is
  unchanged everywhere, so the classical slice never moved (4/7/17 oracle, 43 edge-to-edge, both
  dodecagon results all still hold). Goldens updated in `regular.test.ts` / `filter.test.ts`.

## The aperiodic shelf is one page with four views — UNCOMMITTED (2026-07-27)

The seven clusters listed here before are committed (through `4808b4e`). What is now in the working
tree is one piece of work: `/substitutions` + `/multigrid` merged into **`/aperiodic`**, joined by
**Penrose** and **the hat**, all four driving the same pan/rotate/zoom layer. `pnpm build` clean;
`pnpm test` 1569 pass, 1 timeout in `tests/star-general-path.test.ts` (untouched here — it takes 180 s
and times out under load). `pnpm docs:check` fails on the same 5 broken links, all in committed SYNC
entries. Detail: DEVELOPMENT_NOTES.md §"The aperiodic shelf: two pages merge into four views".

- **The registry is the extension point.** `app/(app)/aperiodic/_views.ts` lists the constructions
  (label, blurb, icon, group); the sidebar renders what it lists. AL's next additions — Wang tiles,
  more substitutions from the encyclopedia — are an entry plus a component.
- **`lib/hooks/useAperiodicView.ts` is the shared interaction layer**, on the same state and constants
  as /play and the theory cards (`lib/render/viewControls.ts`). Drag pans, wheel zooms at the cursor,
  Shift+wheel rotates in 5° detents, right-click resets. `subrosaGL` gained `uRot`/`uCentre`;
  `zoomAtPoint`/`resetCardControls` gained an optional `bounds` (existing callers untouched).
- **All four views are on the GPU.** `lib/render/triangulate.ts` (ear clipping + the barycentric edge
  mask) and `SubRosaGL.uploadPolygons` let the non-convex hat onto the batched renderer; `uploadTiles`
  keeps the fixed quad split for the rhombic views. Colours are unchanged — a `uSat` uniform lets the
  patch views ask for the atlas' own HSB(h, 40, 100) fill. Caps rose 18×/7×: Penrose depth 11 (143,010
  rhombi), hat level 6 (54,289 hats), both at 8.3 ms a frame on an M5.
- ⚑ **Headless WebGL numbers are worthless.** The hat-level-6 upload measures 11 s headless
  (SwiftShader) and 140 ms headed. CLAUDE.md says this about FPS; it is just as true of upload. Check
  the renderer string.
- **Patch framing is one rule at every level: fit the whole patch.** Scale across constructions is
  matched by pairing the default LEVELS on tile count (Penrose view default 6 = 1,140 rhombi vs hat
  level 4 = 1,156 hats), not by special-casing the default's framing — an earlier attempt did that and
  made the default the only slider position not showing the whole patch.
- **The sidebars are /play's, not their own.** `AperiodicSidebar` = `PageSidebar` + the `ta-wall` cell
  system + `.ta-tab` segments + the shared `Slider`/`Checkbox`/`Button`. No hand-rolled chips or bare
  range inputs remain on the page.
- ⚑ Switching views unmounts the old one, so its controls reset; `?view=` carries the view, not its
  parameters.

⚑ **`public/` is 669 MB, 504 MB of it tracked.** `hex-solutions-k9.json` alone is 56 MB for one array
entry. Nothing is broken by it; it is the next thing to get expensive.

## Three clusters were backfilled into the ledgers (2026-07-27, NOTES ×3)

They had shipped with no entry anywhere. Symmetry overlays now draw through a `Pen` interface
(`lib/render/overlayPen.ts`) so one implementation serves /play's p5 canvas and the preview cards' 2-D
layer — the old `canvas-overlays` module under `components/` is deleted; Penrose and the hat arrive as
finite patches with measured clean windows. `/defense` is an unlisted `force-static` `noindex` route outside the `(app)`
group, 40 slides from one markdown file with live atlas cards. The ring sweep answers the taxonomy
audit's unstated claim: 7-, 11-, 13-, 17-, 19- and 23-fold stars tile nothing at k ≤ 2, but **16-fold
does** (4 star-bearing at k=1, 2 at k=2) — an order no shipped palette reaches.
⚑ Ring D=42 was interrupted mid-solve; it is the one that would separate 7-fold-with-triangles from the
D=28 result. Re-run before the sweep is called complete.

## The landing wall is live (2026-07-26, NOTES §"three geometry cells go live") — UNCOMMITTED

The Play, Hyperbolic and Spherical cells on `/` render the real /play canvases instead of baked
thumbnails, with /play's controls. Each is inert until clicked, so the page still scrolls under an
untouched card; the card's link moved from the whole frame to the caption block, since a drag inside
an anchor navigates on release (`CollectionCard.interactive`). New shared pieces:
`lib/hooks/useFlatCellPreview.ts` (extracted from the /theory preview card, now used by both),
`useCardActivation`, `useInViewMount`; `HyperbolicDevelopedCanvas` takes an optional per-instance
`input` so an embedded disk never steers /play's global controls. The landing's 9.9 MB fetch of
`hyperbolic-developed.json` is gone — the pool's 64 records are inlined at build time.
⚑ A client-side back-navigation from /play with Islamic mode on still renders the landing sphere as a
star pattern: `SphericalCanvas` reads look flags from the global store, as every thumbnail does.

## Knowledge model (read once, then follow it)

Two tiers. Do not mix them.

- **Ledgers — sacred: append-only, never trimmed, ONE writer per file.** The natural-language
  history the thesis (`../../thesis/chapters/journey.tex`) is written from. Rotate to
  `archive/<name>-YYYY-MM.md` when large (rotation loses nothing).
  - `DEVELOPMENT_NOTES.md` — CC's session-by-session narrative (code/algorithm).
  - `../../resources/research/TA_LOG.md` — TA's chronological ledger (theory/proofs); topical
    detail in the sibling `resources/research/*.md` notes.
  - `SYNC.md` — CC⇄TA handoff log. Entries **3–6 lines**: what landed + commit + ledger link.
    Full pre-2026-06 history in `archive/SYNC-2026-06.md`.
- **Cache — this file.** Current state only. Overwrite freely.

## The hexagonal grid lands: {6,3} edge systems and 3-colorings (2026-07-25, NOTES §98) — UNCOMMITTED

★★ **The Euclidean decoration shelves now cover all three regular grids.** The honeycomb is a lattice with
a two-point basis, not a lattice (inside ℤ + ℤω only (a + b) mod 3 ∈ {0,1} are hexagon corners), so the
per-coset bitmask has nothing to index and the grid takes the **ts patch path** instead: one `GRIDS` row
per decoder plus `is_patch_grid()` in place of three `grid == "ts"` tests. **72,039 certificates, 0 develop
failures**, every k reproducing Marek's counts — edges 36,062 (k≤9), colorings 23,977 (19,975 surjective,
k≤8, no k=2 row: all twelve k=2 certificates use ≤2 colors). Anchor = the digon-free slice, exactly 1
certificate, the plain {6,3} tiling. Regressions hold: square edges `BIJECTION` 1420/1420, ts 3-colorings
byte-identical. New words on this board: **polyhex** beside polyomino / polyiamond / polyform.
⚑ **First lazy shards on the Euclidean decoration shelves** (`loadFreedrawShardsForK` /
`loadColorsShardsForK`, composable-shard shape). Eager = edges k≤6 + colorings k≤5 (4.9 MB); lazy = edges
k7/8/9 and colorings k6/7/8 (123.6 MB). **`public/` 522 → 676 MB** — dropping `hex-solutions-k9.json`
alone returns 58 MB and costs one array entry. Both corpora ship as `candidate`.

## Marek's 2026-07-25 drop: 4 new hyperbolic color bases in, 2 hexagon corpora NOW DONE (NOTES §96, §98)

★★ **The colors class goes from 2 hyperbolic bases to 6.** `hexagons_edges.zip` + `07-25_colors.zip`
extracted to `materials/corpora/` (six corpora, 127,584 certificates; Marek's own `results_2026-07-25.txt`
k-counts reproduce exactly from the certificate files). Shipped {8,3} {5,4} {6,4} {4,5}: four rows in
`develop_hyp_colors.BASES` were the whole decoder change, since `alphabet()` already solves ℓ from (p, q).
67,545 certificates decoded in 74 s, **0 develop failures**, 46,548 surjective colorings, every k Marek
solved. 2.6 MB eager + 29.8 MB lazy (`public/hyperbolic-colors/` 16 → 47 MB). `HYP_COLORS_BASES` drives
the loader, /library k-chips and /play deep links, so the app change is 4 rows there + 4 labels in
`catalogue-list-panel.tsx`. Verified in the running app at `hc45-1`, `hc64-2`, `hc83-5`, the lazy
`hc45-2` deep link, and /library `geo=hyperbolic&dec=colorings&k=4` (1,424 cards = 512 + 906 + 6). ⚑ {5,4}
starts at k=2 on purpose: three colors need ≥2 colored vertex classes there.
✓ **The two hexagon corpora are no longer parked** — decoded and shipped the same day; see the section
above. The hunch recorded here (steps embed in ℤ + ℤω like `TR_STEP`) was right about the embedding and
wrong about the consequence: `emit_pattern` demands every coset be a vertex, and a third of them are not.
⚑ **This work is UNCOMMITTED**, in the same shared tree as the mixed-shelf merge below.

## The 30/150 rhombus: 12 new mixed families, 71 → 83 (2026-07-25, NOTES §97) — UNCOMMITTED

★★ **AL was right and I was wrong.** One palette line (`cx4-30.150`, angles [2,10,2,10]) takes the k=1
mixed export from 19 families to 33 — **12 net new** after two turn out congruent to shipped ones. My
objection (α ∈ (0°,60°) is a proven range, so the rhombus is already in there) confused the *validity* of a
found family with the *discoverability* of one: families are recognised from DISCRETE seeds on the D=24 grid,
so a topology whose only discrete realisation sits at an unrepresented α is unreachable. Visible in the data
— 11 of the 12 have α ∈ (0°,60°), and the pre-existing 4-gon seeds (60/120, 75/105) both sit outside it.
Base arm reproduced the shipped 19 **byte-identical**, so the delta is clean. Shipped: 83 entries (k=1
15 → 27), each re-verified through the app's own `evaluateParamCell` (Σ area == |det| at 5 α samples).
`scripts/stabilize-family-ids.mjs` keeps shipped ids and default α stable across the re-export.
⚑ `maxValence=8` is an **incomplete** regime here (twelve 30° rhombus corners = a real 360° vertex a
valence-8 word cannot express) ⇒ **12 is a lower bound**. k=2 not run with the rhombus. 45/135 and 15/165
still unseeded. No new JOINs — the 12 are self-contained arcs.
⚑ **Provenance bug:** `make PALETTE=isotoxal-star-z24` does not reproduce the shipped tables —
`EU_PRUNE_OVERLAP=1` is never set by the Makefile, so a rebuild silently yields 285,899 vertexdefs against
the shipped 34,329. The flag belongs in the palette JSON.
⚑ **UNCOMMITTED, and blocked on the merge pass**: the rebuilt `public/reference-atlas-mixed.json` carries
`segments`, which only the uncommitted `lib/utils/paramCell.ts` understands. Commit the merge sources first.

## Decoration axis shipped (2026-07-25, NOTES §95)

★★ **The shelf now says what kind of thing each row is.** `Decoration = tilings | edges | colorings` sits
between geometry and tile class, present in all three geometries — a second segmented row on /play, a "Kind"
chip wall on /library. It deletes two workarounds for the same missing axis: /library's non-Euclidean class
relabeling (`NONEUC_CLASS_LABEL`) and the geometry-as-tile-class conflation behind /play's `single` collapse.
Derived from `tileClassOf`, so no atlas JSON was rebuilt. Euclidean reads 10,384 tilings / 112,499 edge
patterns / 226,337 colorings; hyperbolic 28,453 / 13,703 / 3,424 — all nine cells populated, which is the
evidence the axes are orthogonal. Islamic stays under Tilings (its 192 entries are tessellations; the
strapwork is an overlay), though it is the one shelf of the eight that is transcribed, not enumerated.
Old `class=freedraw` / `class=colors` links promote to `dec=edges` / `dec=colorings`.
Spec: `superpowers/specs/2026-07-25-decoration-axis-design.md`.
⚑ Next: fold the shape axis itself onto the period `p` (TILE_TAXONOMY §9), which is the other half of §3.

## Six entries were one 2-parameter family: the coupled families land, 87 → 83 (2026-07-26, NOTES §103)

★★ **AL, on k2-45/k2-46/k2-50: "the same tiling, just with a different angle for the rhombus and the star."**
Right, and it is SIX entries: `{k2-45, k2-46, k2-47, k2-49, k2-50, k2-57}` are one 2-parameter family. All
three records already said **flexdim 2, P 1, separable False** — the exporter gives a species its own slider
only when it flexes ALONE, and here they are coupled (t = r + s − 8 in 15° units, two free and the third
determined), so it develops one direction: a 1-D line through whichever grid member it started from, keyed
as its own family because the pinned angle enters the key. Developing the coupled family directly (the
exporter's own `develop_multi`, qeff from the full null-space basis) puts k2-50's seed at δ=(−1,−2) of
k2-45's family with Σarea = |det| = 8.929405237 — identical to nine decimals, isometry-confirmed.
**12 coupled records → 5 families**, 9 of which shipped. The four slice lines sit at 6-star angles {6,5,4,2}
units, exactly the palette's `{6*6, 6*5, 6*4, 6*2}`; the gap at `6*3` (45°) tiles, as do half-integer values.
So this is §102 one dimension up and it is an UNDERCOUNT, not redundancy: a 2-D continuum shown as four lines.
**Shipped (AL chose the 2-D pad):** mixed 87 → **83**, five entries with a real 2-parameter cell and a
polytope region. Axes are species-aligned, so k2-45's read "rhombus" and "3-pointed star". Old links keep
working — each absorbed slice carries its seat AND the direction its slider pointed, derived from the
shipped record. `components/param-region-pad.tsx` draws the polygon; `clampToRegion` projects any outside
point back in, so the pointer cannot reach an uncertified cell (verified by driving it).
⚑ The region model first doubled star vertex counts (a 3-pointed star IS a hexagon), letting an angle reach
300° where 240° is the maximum — the tests caught it via a self-intersecting tile. Corrected: V ↦ 24 − 48/V.
⚑ Next: same measurement on the isotoxal shelf; the Command-drag scrub does not yet clamp to the polytope.

## The α ranges were truncated: 41 mixed families widened, 3,015° of new sweep (2026-07-25, NOTES §102)

★★ **The exporter clipped every family where a tile's SPECIES changed, not where the tiling stopped.** AL,
from `/play` on k2-01: "nothing prevents the rhombus from shrinking even more and the triangle from becoming
a concave star. Eventually, when the rhombus disappears at 0°, they would become the star tiling k2-14."
All of it holds — the cell keeps tiling below 30° (covering multiplicity 1 on 300/300 samples), the rhombus
reaches zero area at exactly α=0, and that limit is congruent to shipped `ctrnact-star-k2-14` by explicit
isometry (139/139 cloud points). k2-01 now runs **(0°, 180°)** instead of (30°, 150°).
Census `scripts/scan-family-ranges.py`: **41 of 98 mixed families truncated, 3,015° gross** (2,235° net of
folded replay); every true range ends at a tile COLLAPSE on both sides. **18 of the 41** have no on-palette
grid configuration in the new arc, so the solver cannot supply it under another id — those tilings were
absent from the atlas outright. Blockers are palette gaps: `cx4-15.165` (18 families), `cx4-30.150` (13),
`cx4-45.135` (9), stars `3*45`, `4*75`, `6*15`. `isotoxal-star-z24` has cx4 at only 60.120/75.105 and 15 of
~33 grid-legal star species.
**This retires the merge machinery for concavity cuts.** All 6 shipped merges were the analytic continuation
of their own primary, so widening absorbs each partner as a plain duplicate: **0 merges, 11 aliases, same 87
entries, no segments** — one analytic cell, no seam, no pose, no star-flag unification. `segments` stays in
the code for a genuine branch point (AL's k2-56 case), where the branches are NOT one analytic arc.
Also found: **12 folded sliders** (6 rotation, 6 reflection) where α and c−α are the same tiling. Kept at
full sweep per AL, with the centre marked as a tick on the slider (`foldCentreDeg`).
⚑ **Two of my own primitives were wrong** and both are fixed: the radial patch fingerprint is only
NECESSARY for congruence (now confirmed by explicit isometry in both censuses — a false positive there
DELETES a tiling), and that isometry anchored on the first largest tile, which fails when a cell has several
largest-tile orbits (k2-05 has 9). The duplicate scan's family-label and equal-length prefilters are also
gone: a widened family carries a different label on each side of the cut.
⚑ Next: the isotoxal shelf (3,527 entries) has the same defect at ~36× scale, and its continuations carry
star tiles a convex-only shelf cannot express — AL deferred it as a taxonomy question. A prior session's
`scripts/probe-concave-extension.ts` independently agrees: 4 of 14 isotoxal k=1 families extend, k1-01 by
+119.8°. Then push widening upstream into `export_combined_families.py`, and re-measure the 2-parameter
census with both fixes.

## Mixed shelf merged (2026-07-25, NOTES §92–§94) — SUPERSEDED by §102 above

★★ **79 mixed entries → 71, each a single continuous sweep** (counts pre-rhombus; the shelf is 83 after
the 30/150 re-export above, still with the same 6 merged arcs). AL spotted that k2-58/k2-59 are two halves
of one deformation, cut where the flexing tile's alternating vertex crosses 180° (concave star ↔ convex
2n-gon). Census `scripts/scan-family-joins.py`: 6 mergeable arcs (all clean 2-paths) + 2 α-reversal
duplicates. Merge criterion is AL's — the branch that continues the family is the one with the SAME
rigid/flexing tile partition; congruence of the limit tiling alone is not enough (3 branches meet at the
k2-58 limit). Merged slider = `theta` (the flexing tile's alternating angle, join at 180°) on 3 arcs,
`sweep` (cumulative angle) on 3 where several orbits straighten from different sides. Seam pose and star
flags are baked at build time so nothing jumps or changes colour at the join.
**Committed on `feat/subrosa-editor`: the merge SOURCES only** — `paramCell.ts` (`segments`), the scanner,
the builder, the alias resolver + table, the slider label, the spec and the test. This is what §97 above was
blocked on. Deliberately NOT in that commit: `public/reference-atlas-mixed.json` and
`experiments/results/mixed-atlas-build.log`, which now carry the 30/150 rhombus re-export and belong with
it — at the merge commit the shipped shelf is still HEAD's unsegmented 79, which the segment-aware evaluator
reads unchanged. Spec: `superpowers/specs/2026-07-25-mixed-family-merge-design.md`.
⚑ Next: same sweep on the isotoxal/composable/scaled shelves, then move the merge upstream into
`export_combined_families.py` so the searcher emits merged families directly.

## Frontier (2026-07-23) — the hyperbolic shelf on exact identity

- ★★★ **SHIPPED: 28,453 hyperbolic tilings on /library + /play** (was 59 this morning, 6345 midday;
  AL "Add them ALL" 2026-07-23, NOTES §83). Union of every COMPLETED (k,p,v) sweep box; 12,168 k=1 +
  16,285 k=2; 14,106 per-pixel / 14,347 2D-path. NOT enumerated: the five timeout cells (k1-p8v8,
  k2-{p5v8,p6v7,p7v6,p8v6}) and all k≥3. Ghost-card /library bug = 12 duplicate exporter ids →
  fixed + `tests/atlas-id-unique.test.ts`.
  Identity/k = canonical minimal Delaney–Dress symbol from the block darts at the forced ℓ
  (`tools/ctrnact-oracle/dsymbol_from_darts.py`), validated by the Euclidean collapse
  11→10 / 24→20 = A068599 run through the SAME code at l=0. 59 legacy ids preserved; variants
  numbered per figure; k exact (1555 k=1, 4790 k=2). Scope stated in NOTES §82: k=1 {3..8}·v≤6,
  k=2 {3,4,6}·v≤6, regulars to v8. Renderability = stamped metadata (3265 per-pixel, 3080 on the
  2D path — float64 rim cap, not math).
- ★★ **(k,p,v) sweep filling** `experiments/results/hyp-sweep/` (AL directive): per-cell COMPLETE
  enumerations with counts by true k, tiling lists, timings; 900 s cap, resumable. Display layer
  (per-k tables, count/time-vs-k curves) pending sweep completion.
- Gates: `pnpm vitest run tests/hyperbolic-*.test.ts` (sampled suites + stamp honesty); the stamp
  script re-runs after every export. Known-failing on clean HEAD (NOT shelf): hue-ring,
  figure-emitters, playUrlState, dsym-generator, star-general-path, islamic-gate, oracle-symmetry×2.

## Frontier (2026-07-11) — the weight-law program

- ★★★ **k=3 CANDIDATE STAGE (C2) CLOSED at the proven pool** (2026-07-11; wording corrected
  2026-07-16, CC). Proof-anchored SMALLK_PROVEN=1 run certified three ways, all 61 / 303 raw
  cells / **0 ⚑**: serial probe (digest `6ef92456`), scout ×2 byte-identical (digest `7f2f4160`,
  = stability ×2). Per-tiling oracle bijection PASS (61/61 both ways, t3007 present, CB-4
  differential 242+1830 clean). Correction vs the 07-11 claim "61 no longer rest on the oracle":
  the proven W-pool (SMALLK_W_BOUND v2) reaches every k=3 period by theorem, so the LATTICE leg
  is oracle-free, but the SEEDING legs (C1/C3) ran the fast path (blanket-fan proven mode is
  future work O2, PeriodSolver.ts:728), so the counts keep their per-tiling oracle anchor.
  The blanket-fan re-run is the named step to a fully theorem-certified k=3; thesis §8.5 states
  this boundary exactly. Frozen artifact `.scout-cache/k3-proven-accepted-7f2f4160092c7ff3.ndjson`;
  SYNC 2026-07-11 + 2026-07-16. Open (benign): probe-vs-scout digest gap is
  representative-selection (raw-min-key vs primitive-reduced), same partition.
- ★★ **Small-k weight theorem PROVEN + REFEREED (3 agents, no fatal): max W = 5, 6, 7 at
  k = 1, 2, 3 EXACT**, per-branch proven pool radii (hex 6/8/10 via census+shells, square
  3/6/7, hol ≤ 4 via thm:weight generators 7/15/23 + joins). `docs/SMALLK_W_BOUND.md` (v2)
  + appendix PDF + artifacts `experiments/results/smallk-*`. **Consumed by the pipeline**:
  `SMALLK_PROVEN=1` mode (PeriodSolver poolConfig) is the proof-anchored k≤3 regime — full W(23)
  generator pool, per-branch census area boxes, solved axes by theorem, block-cap fail-fast throw.
- ★★ **pgg law proven for width-2 (Thms A/B/C, refereed)**: W = 2k + 2⌊(k−1)/3⌋ exact,
  attained ∀k ≥ 2; global-max-for-k≥4 claim is measured (k ≤ 13) + partially proven.
  `docs/WEIGHT_CEILING_PROOF.md` + appendix PDF.
- ★ **The no-caveats program has a DAG** (`docs/WEIGHT_PROOF_DAG.md`, 10 nodes, critical
  path D1→D6→D10). Landed 2026-07-10: **D1 slab engine incr. 1a** (width-2 T/S/H world
  machine-reproduced; `tools/slab-engine/engine.py`); **D3 consolidation REFEREED** — two
  bands CLOSED vs the pgg law via c₀-bypass word climbs (λ₁ = 1: W ≤ 2k; λ₁ = √3 hex:
  W ≤ 2k), one blocker (write E2-v2); **D2 ≡ E4-A′ ≡ 3.1(d)** identified (one finite check
  gates 378 tilings + unconditionalizes Thms A/C — engine incr. 1b closes it); **D6-snub
  re-scoped honestly** (0.966-forcing refuted, 829 domino vertices in-catalogue; route =
  row-word classification via engine incr. 2). Ledgers: SYNC 2026-07-10 entries ×5,
  `resources/research/th10-D3-consolidation-2026-07-10.md`, TA_LOG.
- Star lane (parked, scoped 2026-07-10): Myers anatomy + parametrization analysis done in
  conversation; W-machinery splits universal/family-modular; free-α families need TH-8
  regardless. No new artifacts beyond `experiments/results/smallk-*` siblings.

## Frontier (2026-06-10 evening — previous)

- ★★ **k ≤ 2 THEOREM-CERTIFIED, oracle-independent** (B1 + canonical augmentation + lem:ddrealize +
  lem:ddrealizer realizer + lem:corona; per-tiling torus match both directions). NOTES §27.
- ★★ **k = 3 RE-CERTIFIED PER-TILING, end-to-end CLOSED** (2026-06-10): the old certified digest
  `eb34499d5fba3457` was per-tiling WRONG (canceling duplicate + missing t3007 — NOTES §28); both
  defects fixed (§29), full no-cap re-sweep 449/449 seeds → **new anchor `99919f42a7b58e76`/61**,
  per-tiling oracle bijection PASSED ×2 (`recert-oracle-match.ts`); DB: old run de-certified, recert
  run `52d0cb2e` certified; figures snapshot/orbits/oracle-map regenerated → **92/92**; k=3 gallery
  FINAL incl. t3007.pdf. NOTES §31. ★ **Stability ×2 PASSED** (fresh sweep reproduced
  `99919f42a7b58e76`/61 byte-identical, 449/449, 0 timeouts —
  `experiments/results/k3-stability-regression-0d6c96b-2026-06-10.log`) — single-run residue closed;
  also the k=3 batch acceptance for the CB landings below.
- ★ **Review batch CB-2/7/8 LANDED, digest-neutral** (k≤2 byte-identical post-merge, `b81e823`):
  CB-2 Surd.sign provable error-bound filter (`216302b` — the fuzz test found a REAL wrong-sign at
  coefficient height ~2⁵⁶: the old 1e-6 gate was unsound in fact, not just in principle; NOTES §30);
  CB-7 primitivity-rejection guard + CB-8 tuned-pool regime banner/reach counting (`eefa6ac`,
  diagnostics-only; NOTES §32). **§32.2 Finding 2 SIGNED OFF by TA 2026-06-10** (sound; see
  `../resources/research/cb7-finding2-signoff-2026-06-10.md`); **all 3 sign-off asks LANDED** on
  `fix/cb7-finding2-followups` @ `d433b95` (counter + loud star-ladder truncation + docstring;
  NOTES §33) — **MERGED `9674c95`** after k≤2 probe re-check byte-identical on d433b95
  (`cb7-followups-probes-d433b95-2026-06-10.log`). (CB-9 push ✓ 2026-06-10.)
- ★ **Review batch CB-5/CB-4/CB-6 LANDED on `fix/cb5-cb4-cb6` @ `74e03a9` — ALL CB items now
  closed** (NOTES §35): CB-5 N≠24 throw (`983b8e3`); CB-4 always-on equivalence guard + standing
  import-disjoint congruence differential wired into the recert harness (`942da53`); CB-6 cull
  R_P+maxCircum (`46b0f79`). **The CB-4 guard fired on first contact with the k=3 artifact** —
  `reducedClassKey`'s float-window reduction was NOT class-canonical on skewed bases (direction-
  dependent false negatives; completeness, never soundness; certified 61 unaffected — lucky third
  rep). Fixed exact (`c802989`). Acceptance: k≤2 probes byte-identical ×2, suite 327/327, recert
  ★ PASS 61/61 + differential 0/2131 mismatches (`cb456-probes-*`, `k3-recert-...-18-22.log`).
  **MERGED to master 2026-06-11** (NOTES §35); the fresh k=3 batch-acceptance sweep ran under OP-1/2/3
  below (449/449, recert 61/61). ⚑ TA: thesis §19.6 congruence narrative gains the §35 sibling caveat.
- ★ **OP-1/2/3 LANDED, `feat/op123-sound-levers` @ `cf1908e`** (off master `0291e83`; NOTES §35) —
  the three sound levers in the mandated order. OP-1 prop:typeprune P2+V<k (k≤2 byte-identical; k=3
  re-baselined `99919f42a7b58e76`→`b5c622070cff8b4`, raw 362→302 = duplicate-cert cut). OP-2 census +
  counters (digest byte-identical; ⚑ branch-enum memoization is orbifold-lane, DEFERRED). OP-3 stage 1
  oblique-only grid-orbit reduction per lem:orbitdedup (fills CONSERVED raw=302; k=3 re-baselined
  `11ee1b1d582811d1`/61). All three: **61/61 per-tiling bijection** (t3007 in, 0 orphans/dupes).
  ★ **OP-9 Σ-vs-distinct table exists** (oblique 17.4×, ALL 20.6×; post-OP-3 oblique work-items 12.0×
  down). ✓ **R1 RESOLVED** (`1aa1c84`, AL-directed) — the second `reducedClassKey` float-tie false-NEG
  (t3019, 1:4.73 skinny cell), surfaced by OP-1's sound P2, is fixed at the source: exact (u,v)-coord
  reduction, no float window. Digest-neutral (k≤2 byte-identical, k=3 recert 61/61 with the exact-witness
  fallback now DORMANT). No leg-1 congruence caveat remains for the regular family; CB-4 disjoint in-file.
  F3b banners 76→0 post-OP-3 (A/B discharge abandoned ~50h; discharged on census=0 + the bijection).
  **MERGED to master 2026-06-11 (NOTES §38, op123 merge `7a19b6a`)** — master keeps its EQUIVALENT exact
  `surdFloor` reducedClassKey (op123's t3019 fixture passes on it; R2 witness redundant). Fresh no-cap
  sweep 449/449 → recert ★ 61/61, digest `11ee1b1d582811d1`/61, differential 0/2071.
- **DG-1 verdict stands:** proven-config lattice run INFEASIBLE even at k=1 (≈1,370 yr) ⇒ thesis
  honest-rewrite (TX option (b)) merged; the measurement is itself a thesis result. NOTES §25.
- Orbifold: correct-but-gated (NOTES §23.9). Star: 4(j) spike certified k=1 exact; ST-1 conventions
  CLOSED in thesis master. Seed-anchored D-D dead by mechanism (NOTES §26).
- ★ **ST-2 + ST-3(1+3) + ST-9 MERGED to master** (2026-06-11, NOTES §36, digest-neutral; ★ TA oracle
  spot-check PASS 43/43 `d8fd260`): Myers-2009 k=2 oracle (43 records, 34 in-ring, pins 36/40/42);
  productive star-fill positively covered via 4(i) + mutation check; honest run-matrix + §24 retitle.
  ⚑ **4(i) is measured OUTSIDE the tuned pool ⇒ tuned dentreg ceiling 12/13 Fig-4 tilings**.
- ★ **TH-4 / TH-13 star tables MERGED to master** (NOTES §37): d_max(envelope) = 9 exact ⇒ δ ≤ 18k,
  F ≤ 42k; TH-13 19/8/5 + single-variant regular-filler rider — constants INPUT, discharge is TA's.
- ★ **star-fill suite-gate MERGED**: heavy 4(i) test behind `RUN_STAR_FILL=1` (was OOMing default
  `pnpm test`). Final full suite 40/40 files, 386 passed, 1 skipped, 0 OOM.
- Orbifold: correct-but-gated (NOTES §23.9), branch `feat/c4-pool-bypass` PARKED. Star: 4(j) spike
  certified k=1 exact; ST-1 closed + TH-3 star theory landed (TA). Seed-anchored D-D dead by
  mechanism (NOTES §26).

## Thesis state

- **Thesis master = `7d76b58`** (ff-merged 2026-06-10 late, AL-directed; 85pp clean post-merge,
  0 undefined refs). Contains, as scoped commits: TH-1 octagon lemma (`8595b7d`), results
  restructure + prose swap (`ece66b0`), ST-1 star conventions closed (`cefccc6`), TH-9
  lem:orbitdedup (`ae61853`), D-D bound closed — lem:flagsharp δ≤12k−2 tight (`efe6d6c`), TH-3
  star quotient repair (`7d76b58`). Resources ledger at `9b0638e` (incl. the exact-δ script/data
  for the certified 92). Detail: TA_LOG (2026-06-10).
- **TH-2/C1-Part-B DISCHARGED** (2026-06-10 late): fill completeness is a lemma, not an assumption
  — `lem:fillreach` + `rem:fillreach`, prop:fanseed restated; branch `th2-fillreach-2026-06-10` @
  `8c0a39d` (87pp clean, 0 undefined refs), pending AL review/merge. Resources at `24451c0`.
  ✓ Both CC work orders from the audit LANDED (`c8bc258`, NOTES §34): buildBlock `min(60,·)` index
  cap asserted per candidate (⚑ + `diag.blockIndexCapTruncated`; sweeps must assert 0) and
  maxCellPolys default = max(20k+24, 24k); k≤2 probes byte-identical, F3 flags silent on the
  certified record. Detail: `../../resources/research/fill-completeness-lemma-TH2-2026-06-10.md`.

## Live NEXT — one per party

See `docs/NEXT.md` (the single curated source — duplicated nowhere else).

## Repo state (re-verify on read — this section goes stale fastest)

- **master = `82c89f1` (suite-gate merge) + doc-cache commits on top** (2026-06-11 wind-down —
  **NOT pushed**, ~47 ahead of origin/master). Linear
  chain on top of the prior `0bfbd0f`: ST merge (`f4c0973`), th4-th13 merge (`22f16b4`), op123 merge
  (`7a19b6a`) + AL ST-3 spot-check (`d8fd260`) + TA SEAT DENTS entry (`a54fa4f`) + op123 evidence
  (`7e6716b`), star-fill suite-gate merge (`82c89f1`). Each batch digest-gated; full suite 40/40 files,
  386 pass / 1 skip / 0 OOM.
- **k=3 anchor RE-BASELINED `99919f42a7b58e76` → `11ee1b1d582811d1`/61** (OP-3 orbit-reduced reps; recert
  ★ 61/61 per-tiling bijection, t3007 in). Artifact `.scout-cache/k3_3.4.6.12_cap0.ndjson`.
  ⚑ Old k=3 resume caches INVALID (seed indices shifted) — always fresh.
- **Open branches: master + 2 PARKED** — `feat/c1-proven-seeding` (merged ref, **8 uncommitted WIP files**
  in its worktree — AL keep/discard call) and `feat/c4-pool-bypass` (orbifold, parked). Detached worktree
  `op123-op2-sweep` (15 uncommitted scratch files) left untouched.
- Review work-orders: `docs/review-2026-06-09/` (CB code items ALL closed; ST-2/3/9 + TH-4/13 done).
- Supabase: k=3 run `52d0cb2e` certified (61) — ⚑ reflects the OLD `99919f42` digest; a re-cert DB
  refresh for the new `11ee1b1d` anchor is a follow-up (not done in the wind-down).
- **Reference (Oracle) shelf now serves k=8–10** (branch `feat/reference-atlas-k8-10`): per-k lazy
  shards `public/reference-atlas-k{8,9,10}.json` (2850/5960/11866 tilings, ~15/34/73 MB), fetched
  on demand when that k is selected. Čtrnáct, `reproduced` (display-only, never certified). Base
  atlas + render (24/page) unchanged. Spec/plan under `docs/superpowers/`.

## Ledger index

`DEVELOPMENT_NOTES.md` (CC narrative) · `SYNC.md` (handoff) + `archive/` (rotated history) ·
`../../resources/research/TA_LOG.md` (TA narrative) + `resources/research/*.md` (topical) ·
`../../thesis/chapters/journey.tex` (the sink the ledgers feed).
