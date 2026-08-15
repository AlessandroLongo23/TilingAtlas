# Marek drop, 2026-08-12: inventory, categories, and the work it implies

61 archives landed in `materials/solvers/` between 09:32 and 09:43 today, 173 MB compressed,
**3,308,640 certificates**. Three of them are re-downloads of corpora already extracted and already
shipped, so the new material is **3,192,379 certificates**. Nothing here has been unpacked into
`materials/corpora/` yet and nothing has been decoded.

This file is the working inventory for that drop. It is a cache, not a ledger: once the work below is
done, the durable record belongs in `docs/DEVELOPMENT_NOTES.md` and `docs/SYNC.md`.

## How the numbers were checked

Every archive was read without unpacking: certificates counted by streaming each member and counting
`Number of vertices:` blocks, then compared against the `solution_list.txt` census Marek ships inside
most of the archives. Script: `audit_drop.py` in this session's scratchpad, output `drop-audit.json`.

**Every shipped k matches its census exactly.** The only disagreements are k values the census reports
and the archive does not carry at all, listed under "the tails he did not ship" below. Seven archives
carry no census, so their coverage is unverifiable from the drop alone: `35bb`, `edges_33335`,
`ai2_13`, `ai2_15`, `hybrid_1_0531`, `hybrid_af5`, `ai1_17`.

⚑ A census that stops below a finite board's vertex count is a **budget cut, not a zero**. A k line
reading 0 inside the census is a real zero. The two must never be flattened into one statement on a
shelf, which is the `dropped` vs `hypPolyKGaps` distinction the AI1 shelf already makes.

## Three archives that carry nothing new

None of the three needed decoding, and the 2026-08-12 reorganisation resolved each one differently.
Paths below are the new ones (see `materials/solvers/README.md`).

| archive | what it is | what happened to it |
|---|---|---|
| `spherical/edges/3338.zip` | byte-identical to `materials/corpora/edges_3338`, all 56 files. Already shipped as `public/spherical-edges/x3338-*`. | kept: it is the only archive of that corpus, and the `b` build suffix was dropped from the name |
| `spherical/edges/schwarz_234.zip` | byte-identical to `materials/corpora/schwarz_edges_234_slotted`, all 211 certificates. Already decoded into `public/schwarz-sph/s234-k3…k8` (those four k5–k8 shards are the uncommitted change sitting in the working tree). | kept; the older `solver_schwarz_edges_234.zip` was deleted instead, because all 21 of its certificates sit inside this one |
| `hyperbolic/tilings/ai1_17.rerun.zip` | a **re-run** of `ai1_17.zip`: same k set, identical per-k counts (1, 9, 18, 9, 716, 1672, 1274, 414, 120 = 4,233), different solution order and different vertex-figure representatives in 27 of 37 files. No new information. | kept under a `.rerun` name: it is the only copy of those bytes, and it is a free determinism cross-check on `develop_ai1.py` |

## Category 1: spherical edge systems on new solids

Seven boards, 343,717 certificates, alphabet = the solid's faces plus the digon. These go through
`tools/ctrnact-oracle/develop_sph_edges.py`, one row each in `BOARDS`, out to
`public/spherical-edges/x<board>-k<k>.json`. The undecorated figure below is read off the certificates,
not inferred from the filename.

| id | figure | solid | V/E/F | k shipped | certificates | coverage |
|---|---|---|---|---|---|---|
| `4410` | 4.4.10 | decagonal prism | 20/30/12 | 1–3, 5, 6, 10, 12, 20 | 10,672 | complete: census caps at k = V = 20 |
| `4411` | 4.4.11 | hendecagonal prism | 22/33/13 | 1, 2, 6, 11, 12, 22 | 33,682 | complete: census caps at k = V = 22 |
| `3339` | 3.3.3.9 | enneagonal antiprism | 18/36/20 | 1–6, 9, 10 | 67,870 | census stops at 10, V = 18: cut |
| `33310` | 3.3.3.10 | decagonal antiprism | 20/40/22 | 1–6, 10 | 99,334 | census stops at 10, V = 20: cut |
| `468` | 4.6.8 | truncated cuboctahedron | 48/72/26 | 1–4, 6, 8, 12 | 37,234 | census stops at 12, V = 48: cut |
| `4435` | 3.4.5.4 | rhombicosidodecahedron | 60/120/62 | 1, 3–6, 8, 9 | 65,333 | k=10 (89,260) in the census, not in the archive |
| `33335` | 3.3.3.3.5 | snub dodecahedron | 60/150/92 | 1, 5, 6 | 29,592 | **no census**, and only three k: a slice |

Two traps carried over from boards already on this shelf. The snub dodecahedron is **chiral**, like the
snub cube (`33334`), so `board_project` needs its `_YFLIP` candidate to land a mirrored development;
that path exists and the per-k census check is what proves it fired. And `4435` has no `.exe` in its
archive, so its missing k=10 cannot be produced here.

## Category 2: hyperbolic edge systems on new bases

Nine boards, 375,131 certificates, through `develop_hyp_edges.py` (`BASES`) to
`public/hyperbolic-edges/e<base>-k<k>.json`. Every base already on that shelf has **one** face size
(6.6.7, 3^7, 4^5, …); all nine of these mix sizes. `alphabet()` derives the forced ℓ and the units from
`config` alone, so each should be one row, but the mixed-size case is untested there and that is the
thing to verify first.

| id | figure | k shipped | certificates | coverage |
|---|---|---|---|---|
| `33345` | 3.3.4.3.5 | 1, 2, 5 | 37,672 | complete (k3, k4 are real zeros) |
| `33444` | 3.4.3.4.4 | 2–5 | 53,467 | complete (k1 is a real zero) |
| `3447` | 3.4.7.4 | 1, 5, 7, 8 | 31,468 | complete (k2, k3, k4, k6 are real zeros) |
| `3448` | 3.4.8.4 | 1–6 | 54,688 | k=7 (140,130) in the census, not shipped |
| `3466` | 3.6.4.6 | 1–6 | 73,148 | complete |
| `4445` | 4.4.4.5 | 1–6 | 60,616 | complete |
| `4446` | 4.4.4.6 | 1–4 | 21,214 | complete |
| `4447` | 4.4.4.7 | 1, 2, 4, 5 | 5,099 | k=7 (1,114,854) in the census, not shipped |
| `4455` | 4.5.4.5 | 1–6 | 37,759 | complete |

## Category 3: Euclidean edge systems

Two archives, 158,515 certificates. Euclidean edge systems ship through `develop_freedraw.py`, whose
`GRIDS` table currently holds `square`, `triangle`, `ts`, `hex`, `sch236`, `sch244`.

`euclidean/edges/4436.zip` is the board **3.4.6.4** (rhombitrihexagonal), alphabet {3, 4, 6}, k=1–6, 18,992
certificates, complete against its census. No existing grid covers that alphabet, so it is a new
`GRIDS` row and, since its vertex set is not a lattice, the patch path (`step: None`) that `hex` and
`sch236` already take.

`euclidean/edges/33344.zip` is **two boards in one corpus**: the certificates hold both 3.3.4.3.4 (snub square) and
3.3.3.4.4 (elongated triangular). That is the cuboctahedron/J27 situation again, one multiset closing
into two distinct tilings, and it is the reason the id is a multiset and not a cyclic word. It is also
the reason to check before building anything: the shipped `ts` shelf already covers square-triangle
edge systems with **52 / 1,098 / 13,568** solutions at k=1/2/3, against this corpus's **20 / 325 /
2,527**. If those 2,527 are a subset of the 13,568, this archive adds nothing and should be dropped.

## Category 4: a new Schwarz board

`spherical/edges/schwarz_225.zip` is the (2,2,5) board, 21,642 certificates at k=2–8 and k=11, matching its
census line for line (k1, k9, k10 are real zeros). `public/schwarz-sph` currently carries 223, 224,
233, 234, 235; 236 and 244 live in `public/freedraw` as grids; 237 and 245 are in `public/schwarz-hyp`.
So 225 is a genuine gap in a shipped family, which by the atlas-completeness rule makes it higher
priority than its size suggests.

Its alphabet is `S2S5` plus `A2 B2 C2 D2`, so it needs the (2,3,6)-style dialect where the digon letter
carries the drawn bit and the multiplier letter carries the edge length. Both dialects already exist
after the F2 work (`5dec644`).

## Category 5: new families, no decoder anywhere

2,293,374 certificates, the bulk of the drop and all of the real work. The filenames spell polygon
sizes in **hex** (`Aa` = 10-gon, `A1e` = 30-gon); the certificate bodies spell them in decimal. The
leading letter is Marek's hybrid symbol: it is the tile's edge length as a multiple of the base edge
(`A` = base, `B` = twice, and so on), and `oo` is a horocyclic apeirogon. His own description is
`materials/writeups/tilings_exploration.txt`, lines 44 to 60.

### ai2_n: the {3, n} family, 641,294 certificates

Triangles and n-gons at one edge length, the companion to AI1's {3, 4, n, 2n} family (`develop_ai1.py`).
Read off the certificates: at n=7 the closing figures are 3^7, 3.3.7.3.7 and 3^5.7; at n=10 they are
3^10, 10^5, 3^6.10.10 and 3^8.10. Both are consistent with the edge length where **α(n) = 2·α(3) =
4π/n**, which is the identity a decoder should assert per board the way `develop_ai1.py::board_of`
asserts its two closures.

n = 3, 4, 5 are spherical (9 certificates in total, in `ai2_3-5.zip`), n = 6 is Euclidean (39,848,
k=1–18; its k=1 count is 4, the four Euclidean uniform tilings by triangles and hexagons), n ≥ 7 is
hyperbolic. Coverage by n is contiguous from 3 to 15. Per-archive: 7 → 39,140 (k≤7), 8 → 29,388 (k≤4),
9 → 277,367 (k≤4), 10 → 156,243 (k≤3), 11 → 699 (k≤2), 12 → 84,654 (k≤2), 13 → 13,145 (k≤2, no
census), 14 → 235 (k=1), 15 → 566 (k=1, no census).

`hyperbolic/tilings/ai2+3.zip` (355,012, k≤3) is a different animal: its alphabet mixes A3, A4, A5, A10 **and
apeirogons**, so it is not ai2 at a larger n. Best guess is ai2 combined with the ai3 family whose
three binaries arrived today with no output. Ask Marek before decoding.

### hybrid_*: 19 families at named edge lengths, 1,258,259 certificates

Hyperbolic hybrids in Marek's sense: two or more different vertex combinations whose edge functions
resolve to the same value. The name looks like that edge length (`hybrid_1_0612` = 1.0612), and
`hybrid_1_0612` is the same family as the 2023 `pt_1247_1_0612.exe` whose sample sits in
`materials/solver-output/` (same polygon set, the letter changed from S to A between the builds).
Treat the numeric reading as unverified until a decoder solves ℓ from the closure and reproduces it.

Fourteen at `1_*` and `2_*`: 0377 (33,731, k≤13), 0531 (40,462, k≤14, no census), 0612 (56,441, k≤9),
1555 (19,413, k≤10), 2537 (15,541, k≤7), 6628 (108,892, k≤5), 7191 (134,339, k≤5), 7627 (11,854, k≤3),
8365 (110,228, k≤5), 2_1408 (10,259, k≤3), 2_4484 (27,149, k≤2), 2_4578 (10,555, k≤2), 2_6212 (274,068,
k≤3), 2_9387 (31,957, k≤2). Five more named `af1`…`af5` (60,947 / 111,853 / 98,201 / 41,441 / 60,928).
What "af" stands for is not in any note here; af2, af4 and af5 carry apeirogons and af1, af3 do not.

Sample figures, to show the shape: `1_0612` closes 3^3.4.3.4, 3^4.4^2 and 5^4 at one ℓ; `2_6212` is
pentagons with 30-gons; `af1` is 4.5.4.5 with 3.10.3.10; `af5` is 6.10.6.10 with ∞.5.∞.5.

### The apeirogon and outlier families, 38,809 certificates

`hyperbolic/tilings/a1.zip` is {3, 5, ∞}, 18,313 certificates at k=3–25, the largest k range in the drop, and it
ships **no binary**. `hyperbolic/tilings/a2.zip` is {3, 4, ∞}, 10,142 at k=1–8, with its `.exe`.
`hyperbolic/tilings/356i.zip` is {3, 5, 6, 9, 18}, 8,524 certificates, and **starts at k=16**: the census is zero
everywhere below it, which is a statement about the family, not a budget. `hyperbolic/tilings/55310.zip` is
{3, 5, 10}, 1,105 at k=3–20. `hyperbolic/tilings/abcdtest_35bb.zip` is {3, 5, 11}, 725 at k=11–13, no census, and its binary
`pt_abcdtest.exe` came separately: the name says test corpus, so ask before shelving it.

## Category 6: three binaries with no output at all

`_unrun/ai3_1.exe`, `_unrun/ai3_2.exe`, `_unrun/ai3_3.exe`, `_unrun/hybrid_3_3086.exe`,
`_unrun/hybrid_2_9830.exe`, and `hyperbolic/tilings/abcdtest.exe` next to its corpus. These run here: extracted Wine through Rosetta, recipe in
`docs/RUNNING_MAREK_SOLVERS.md`. Each wants its `solver_<tag>/` output folder to exist first and reads
kmin then kmax on stdin. Start the range at the board's floor; raising kmin silently drops families,
which is the exact bug Marek hit on (2,2,3) and (2,4,4).

## The tails he did not ship

Seven k values appear in a census and not in the archive. Six of the seven have their `.exe` in the
same archive, so they can be re-run here instead of asked for.

| corpus | k | solutions | `.exe` present |
|---|---|---|---|
| `edges_4447` | 7 | 1,114,854 | yes |
| `ai2_14` | 2 | 685,845 | yes |
| `ai2_11` | 3 | 556,796 | yes |
| `edges_3448` | 7 | 140,130 | yes |
| `hybrid_1_0612` | 10 | 132,193 | yes |
| `edges_4435` | 10 | 89,260 | **no** |
| `edges_3338` | 16 | 2,925,191 | yes (duplicate corpus, k=16 is the full-board slice) |

Archives with no binary, so nothing in them can be extended locally: `edges_4435`, `edges_33335`,
`35bb`, `hyperbolic/55310`, `solver_356i`, `solver_a1`, `solver_ai1_17`, `hybrid_1_0531`,
`hybrid_1_8365`, `hybrid_af5`. (`hybrid_1_6628`'s binary is mis-filed inside `hybrid_1_7191.zip`.)

## The todo list

Ordered by cost per unit of catalogue, cheapest first. Every step ends with `pnpm build`.

### A. Housekeeping

1. ~~Reorganise `materials/solvers/` and remove what is duplicated.~~ **Done 2026-08-12**: the tree is
   now geometry → decoration → one file per corpus, 27 redundant files are gone (23 loose binaries that
   sit inside an archive, one strict-subset archive, three `.DS_Store`), and every file is hashed in
   `materials/solvers/MANIFEST.tsv`. Layout, naming rule and per-corpus atlas status:
   `materials/solvers/README.md`.
2. Unpack the 58 new archives into `materials/corpora/<tag>/`, one directory per corpus, and verify
   each against `materials/_as-received` the way the existing corpora were.
3. ~~Extend the catalogue tables in `materials/README.md`.~~ **Done**: the solver table moved into
   `materials/solvers/README.md` and is generated from the archives, so it cannot go stale the way the
   hand-written one did. The corpora table there is still stale and still needs the sweep.
4. Five corpora that predate this drop have never reached the atlas and three were never even
   unpacked: `spherical/edges/665.zip` (5.6.6 truncated icosahedron, 49,810 certificates),
   `hyperbolic/edges/669.zip` (6.6.9, 28,283), `hyperbolic/edges/4456.zip` (4.6.4.5, 13,857),
   `euclidean/tilings/ai1_6.zip` (6,593) and `euclidean/tilings/star.zip` (29). 98,572 certificates in
   all, on decoders that already exist. Cheapest catalogue growth available.

### B. Boards that reuse a decoder as-is

4. ~~`develop_sph_edges.py`: add `4410`, `4411`, `3339`, `33310`, `468`, `4435`, `33335`.~~
   **Done 2026-08-12**, plus `665` from the July backlog: 8 corpora, 393,528 certificates, every per-k
   count equal to the census, 0 develop failures, and the shelf's own test re-checking Euler = 2, the
   unit sphere, the forced arc and the vertex degree off the shipped shards. `4435` turned out to be
   **three** boards — the rhombicosidodecahedron plus the gyrate (J72) and parabigyrate (J73) Johnson
   solids, which the vertex census separates and the measured group order tells apart. Detail:
   DEVELOPMENT_NOTES 2026-08-12.
5. ~~`develop_hyp_edges.py`: add the mixed-size bases.~~ **Done 2026-08-12** for ten of the eleven:
   `669`, `3447`, `3448`, `3466`, `33345`, `4445`, `4446`, `4447`, `4455`, `4456`, 363,804
   certificates, every per-k count equal to its census, 0 develop failures. Seven slices over 20 MB
   (272,394 tilings, 365 MB) are developed and held back, each named in its row, the way the shelf
   already treats {3,7}, {3,8} and {4,6}.
   ⚑ **`33444` (3.4.3.4.4) is WITHHELD**: 11,404 of its 53,467 certificates fail with `tile face walk
   did not close`. Not the cyclic order (one canonical figure across the corpus), not the walk's
   64-step cap (512 fails identically), not a partial corpus (the survivors match no census line). A
   quotient FACE can be unbounded here and the developer raises instead of classifying it, the way
   `classify_tiles` classifies an unbounded TILE. That is the next thing to look at on this shelf.
   ⚑ `config` is the CYCLIC vertex figure off the certificates, not the id's digits: the id is a
   multiset, so `4435` develops as 3.4.5.4 and taking the digits in order would build the wrong board.
6. ~~`develop_schwarz.py` + `public/schwarz-sph`: add the (2,2,5) board.~~ **Done 2026-08-12**: 21,642
   certificates, V/E/F 12/30/20, every k matching the census, rendering on /freedraw. Its k=9 and k=10
   are census ZEROS, so `schwarzKGaps` reports them as holes in the run when they are properties of
   the board — the Schwarz row has no `complete`/`missing` pair to say which, the way
   `SPH_EDGES_BOARDS` does. Worth adding.

### C. Euclidean edges

7. Decide `edges_33344` before building it: check whether its k=1–3 solutions (20 / 325 / 2,527) are a
   subset of the shipped `ts` shelf (52 / 1,098 / 13,568). If yes, drop the archive and note why. If
   no, it is two boards, 3.3.4.3.4 and 3.3.3.4.4, and the census key has to separate them the way
   `develop_sph_edges.py` separates the cuboctahedron from J27.
8. Add `4436` (3.4.6.4) as a `GRIDS` row in `develop_freedraw.py`, patch path, alphabet {2, 3, 4, 6},
   18,992 certificates, k=1–6 complete.

### D. New decoders, the large work

9. ~~`develop_ai2.py`~~ **DONE 2026-08-14** for the hyperbolic half: n = 7…15, `--budget 15000` as a
   contiguous k prefix, **33,795 of 33,795 developed, 0 failures, 30 MB**, every per-k count matching
   the census where one exists. The identity α(n,ℓ) = 2·α(3,ℓ) and the closure rule a + 2b = n are
   asserted per board in `board_of` and re-checked in TS on every shipped record. Shares the ai1 shelf
   under board ids `t7`…`t15`. Report per board: `experiments/results/ai2-<n>.md`.
   Still open: the Euclidean n = 6 board (39,848) — check it for containment in the regular-palette
   catalogue BEFORE developing, since {3,6} ⊂ {3,4,6,12} means it may already be shipped, the same trap
   `33344` set. And the spherical twin for n = 3, 4, 5 (9 certificates, some degenerate: n=4's second
   k=1 record is two 180°-angled "squares", a great circle with four marked points).
10. Ask Marek what `ai2+3`, the `af` series and `abcdtest` are, and what edge length the `hybrid_x_yyyy`
    names encode. Four questions, and the answers decide the shape of the next two decoders.
11. `develop_hybrid.py`: 19 families, 1,258,259 certificates, hyperbolic, several polygon sizes at one
    base edge with apeirogons in some. The apeirogon is the new geometry on this shelf and it should be
    prototyped alone, on `hybrid_1_7627` (11,854 records, ∞.4.∞.4.4 and ∞.∞.4.4.4).
12. The outliers, once the hybrid path exists: `a1` {3,5,∞}, `a2` {3,4,∞}, `356i` {3,5,6,9,18} at
    k≥16, `55310` {3,5,10}, `35bb` {3,5,11}. Small, 38,809 records in total, and `a1`'s k=3–25 range
    would be the deepest thing on any shelf.

### E. Runs on this machine

13. Run the three orphan binaries: `pt_ai3_1/2/3`, `pt_hybrid_3_3086`, `pt_hybrid_2_9830`,
    `pt_abcdtest`. Measure one k before committing to a range, log to `experiments/results/` as it
    goes.
14. Re-run the six recoverable tails in the table above, cheapest first (`hybrid_1_0612` k=10 at
    132,193 and `edges_3448` k=7 at 140,130 are the plausible ones; `edges_4447` k=7 at 1.1 M and
    `edges_3338` k=16 at 2.9 M want a measured single-k estimate before anyone starts them).
15. Ask Marek for `edges_4435` k=10, the one missing tail with no binary here.

### G. From the chat, 2026-07-31 → 08-12

The Discord archive was re-exported on 08-13 (`marek-vault/archive/`, 646 new messages). Four items in it
bear directly on this queue; the rest of what he said is programme work and lives in
`marek-vault/ideas/roadmap.md`.

16. **A real zero in a census has an explanation, and the shelf should carry it.** Marek, 08-04: the
    figure has finitely many symmetries, each one constrains how many vertex orbits can exist, and the
    zero-runs follow from that. It is the missing half of the `dropped` vs `hypPolyKGaps` distinction
    above: a cut census is a budget, a zero inside a census is a symmetry obstruction, and neither is a
    bug. (chat 2026-08-04, msg-1534122995789074463)
17. **Two open doubts about the isohedral edge shelves, which are already live.** `ie01`…`ie10` and `pe1`
    shipped on `develop_ih_edges.py` / `develop_pent_edges.py` (commits `15339d0`, `a09dbda`, `c0f3e8b`).
    Marek raised both while building the solvers and neither has been checked against what we ship.
    IH01, IH02 and IH03 return identical counts at every k, which nobody can explain yet; if that is a
    solver artefact and not a bijection, three shelves are wrong together. And IH10's vertices are
    chiral, each joined to its antipode, and he suspects it counts mirror images as two patterns, which
    our merge convention forbids. `ie10` also ships k=1–7 where every other board ships even k only, so
    it is already the odd one out. (chat 2026-08-04, msg-1534233462607843329)
18. **`edges_4435` k=10** (item 15 above) is the only tail in this drop with no binary here. It is on the
    ask list in `marek-vault/questions/open-questions.md` so it does not get lost between the two files.
19. **The general-hyperbolic shelf needs a pass, not more entries.** His criticism, 08-12: too many
    tilings with large polygon counts, where long edges make them unreadable, and a k=2 cap that drops
    every system whose first solutions appear deeper. Both are shelf-shaping decisions, not decoding
    work. (chat 2026-08-12, msg-1537000731226411159)

### F. Ledger

20. `docs/DEVELOPMENT_NOTES.md` gets the narrative once each category lands: what the family is, the
    identity asserted, the traps. `docs/SYNC.md` gets 3 to 6 lines per milestone with the hash.
    `docs/STATUS.md` gets the new frontier. This file can then be deleted.
