---
type: concept
tags: [notation, concept]
status: seeded
sources: ["tools/ctrnact-oracle/alphabets/palettes/regular.json", "tools/ctrnact-oracle/alphabets/gen_alphabet.py"]
---

# Palette JSON (the tile alphabet)

The tile set is *data*. A palette JSON declares the tiles; `alphabets/gen_alphabet.py` expands it into
the alphabet the C++ solver loads. A new tile family is mostly a new palette plus a bounded generator
change, not a search rewrite.

Palettes live at
[../../../tools/ctrnact-oracle/alphabets/palettes/](../../../tools/ctrnact-oracle/alphabets/palettes/).
The `regular` one is the smallest:

```json
{
  "name": "regular",
  "D": 12,
  "pinnedLegacy": true,
  "comment": "Regular {3,4,6,12} palette, 12-direction (octagon-blind, settled decision). …",
  "tiles": [
    { "kind": "regular", "n": 3,  "name": "3",  "famchar": "3" },
    { "kind": "regular", "n": 4,  "name": "4",  "famchar": "4" },
    { "kind": "regular", "n": 6,  "name": "6",  "famchar": "6" },
    { "kind": "regular", "n": 12, "name": "12", "famchar": "c" }
  ]
}
```

## Fields

- **name** — palette id; also the `PALETTE=<name>` make/run argument.
- **D** — number of directions = cyclotomic order the geometry uses. `12` = ℤ[ζ₁₂], enough for
  {3,4,6,12}. The `*-z24` palettes use `24` (ℤ[ζ₂₄]) to reach the octagon and star tiles.
- **tiles[]** — one entry per tile:
  - **kind** — tile family (`regular`, and others in the composite/star/isotoxal palettes).
  - **n** — polygon size (sides).
  - **name** — human label.
  - **famchar** — the single character the alphabet uses for this tile; note `12` → `c` (a single
    char is needed, so double-digit sizes get a letter code). *(confirm the full code table from
    `gen_alphabet.py` / chat.)*
- **pinnedLegacy** / **comment** — provenance; `pinnedLegacy` means entry order, symbols, and codes
  match the hand-written tables the generator must reproduce exactly (a regression guard).

## Existing palettes

`regular`, `regular-z24`, `star{18,20,24,…}`, `isotoxal-*`, `composite-convex`, `composite-decomp`,
`combined-z24`, `regular-scaled-123`, `regular-doubled`, `tetromino`. The engine's own composite-tiles
spec (`docs/superpowers/specs/2026-07-11-composable-tiles-design.md`) is the template for a new one.

## From the chat

- 
