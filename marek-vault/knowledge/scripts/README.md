---
type: index
tags: [scripts]
---

# Scripts and files Marek sent

One annotated note per script I've actually studied, plus a catalogue of everything received so far.
Workflow for a new one: it lands in `attachments/` (or the vault root if dropped manually), copy
`templates/script.md`, fill in what it does, which stage it belongs to, the notation it assumes, and
the source message anchor. Don't paste whole scripts into committed notes; summarise and cite.

## Annotated

- [[main_euclidean.cpp]] — the main Euclidean search driver (his "race me" file).
- [[Tes_Maker_euclidean_enum.py]] — the converter family's statistics variant.

## Received, not yet annotated

### Solvers / drivers (C++)
| File | What (from chat) | Day |
|---|---|---|
| `planar_tilings-main.zip` | The current STS implementation (Griffin's), with `tiling.h`, `solutions_processor.h`. Unzipped at vault root. | 07-13 |
| `main_BI1_3.cpp` | Variant driver; shows `encode_corner` usage. | 07-14 |
| `main_1247_1_0612.cpp` | Full 1.0612-edge hybrid system (old S/M/L size codes). | 07-14 |
| `main_1247_1_0612_G3.cpp` | Same, restricted to start from big-triangle vertices. | 07-14 |
| `main_1247_1_0612_G3_lim.cpp` | Big-triangle search, reduced tile set. | 07-14 |
| `main_generic_10eu.cpp` … `30eu.cpp` | Star-like shape collections (angle multiples of 36/30/20/12°). | 07-15 |
| `main_generic_polyominoes.cpp` | Polyominoes ≤ 11 as faces; four right-angle vertex types. | 07-15 |

All decoded structurally in [[main-cpp-workflow]].

### Converters / tools (Python, misc)
| File | What | Day |
|---|---|---|
| `edgebasicmp.py` | Sent right after the first call; presumably the basic edge computation (mp = multiprecision?). To annotate. | 07-13 |
| `Tyler.jar` | Old applet for playing with hyperbolic building blocks; one edge length, finite polygons only. | 07-13 |

### Data
| File | What | Day |
|---|---|---|
| `euclideansolver_18_A3A4A6Ac_44.txt` | Sample raw solution file (18 vertices; 44 edge types). See [[solution-file-format]]. | 07-13 |
| `euclideansolver_18_A3A4A6_o_49.txt` | Same, chiral batch (`_o`). | 07-13 |
| `output_A.txt` | The hybrid edge database, cut to same-edge identities. See [[solution-file-format]]. | 07-13 |
| `output_annotated.zip` | Annotated version of the above. To open. | 07-13 |
| `input_pg32_0_4947a.txt` | Rust hybrid-finder run targeting the 0.494717 family. | 07-13 |
| `solutions.zip` | The 5.5.5.3 / oo.5.3.3 dataset for the Atlas importer (folder = one solution file; k ≤ 25). Unzipped at vault root. | 07-15 |
| `46def.tes` | The {4,6} morph demo with a slider. See [[tes-format]]. | 07-14 |
| `a1solver_03_S3S5_6_1_penta2.tes` | Hand-modified pentagram tiling (multi-round trigonometry example). | 07-15 |
| `hyperbolic.ppt` | His ~30 MB classification PowerPoint (sent via email link). The main visual reference for [[classification]] and [[hybrid-identities]]; has the extreme n=2 spiky-family render. | 07-13 |
| `tilings_exploration.txt` | The "list of ideas." Organized in [[marek-list-of-ideas]]. | 07-16 |

Images (51 pngs in `attachments/`) are embedded from the archive notes where he sent them.
