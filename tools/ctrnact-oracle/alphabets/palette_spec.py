#!/usr/bin/env python3
"""Palette normalisation shared by the alphabet generator and the developer.

The engine's two halves read the same palette file and must agree on its edge types to the letter:
`gen_alphabet.py` turns them into the gluing constraint the combinatorial search enforces, and
`develop_tri45.py` turns them into the STEP length each dart advances by. Anything derived rather
than written out therefore has to be derived in ONE place, which is this module.

Two shorthands, both optional, both inert when absent — every palette that spells its edge types out
by hand normalises to itself, byte for byte.

**edgeLens** — a tile may give the LENGTH of each boundary edge instead of a type label:

    { "kind": "composite", "name": "T45", "angles": [6, 3, 3], "edgeLens": ["1", "sqrt2", "1"] }

Distinct lengths across the whole palette are interned, in order of first appearance, as the edge
types `L1`, `L2`, … — however many different lengths the tiles have, that many types. The TYPE is
what the search glues on (like to like, and it never needs the number); the LENGTH is what develop
steps by. Writing the type labels by hand, as `tri45.json` does with S and H, stays equivalent.

**freedraw** — `"freedraw": true` splits every edge type into an undrawn and a drawn variant at the
SAME length, and lets the SEARCH choose between them per half-edge, which is Marek's proposal: the
drawn bit is just another edge type. A palette with no edge types at all gets one implicit unit
length first, so `"freedraw": true` on its own turns an equilateral palette into its edge-system
palette — that is the whole of `fdsq2` / `fdtri` / `fdhex` / `fdts`.

The drawn variants are named in `drawnTypes`, which is what `develop_marked.py` inks and merges
cells across; everything else it develops as ordinary geometry.

One case is deliberately NOT free: when a palette has more than one length, an edge's LENGTH is
fixed by the tile and only its drawn bit is free, so the edge is emitted as a two-element choice
`["L1", "L1#"]` instead of `"*"`. Then the corner class still records nothing about the marking —
which is what keeps sigma the identity on the marking — while the length stays pinned to the tile.
"""

_DRAWN_SUFFIX = "#"


def _as_edge_list(t):
    e = t.get("edges")
    return list(e) if e is not None else None


def normalize_palette(spec):
    """Rewrite a palette in place into the explicit form both halves of the engine consume."""
    lengths = dict(spec.get("edgeLengths") or {})
    by_length = {v: k for k, v in lengths.items()}

    # --- edgeLens: derive one edge type per distinct length ------------------------------------
    minted = 0
    for t in spec.get("tiles", []):
        lens = t.pop("edgeLens", None)
        if lens is None:
            continue
        if t.get("edges") is not None:
            raise SystemExit(f"[palette] tile {t.get('name')}: declares both edges and edgeLens")
        labels = []
        for L in lens:
            L = str(L)
            if L not in by_length:
                minted += 1
                lab = f"L{minted}"
                while lab in lengths:
                    minted += 1
                    lab = f"L{minted}"
                lengths[lab] = L
                by_length[L] = lab
            labels.append(by_length[L])
        t["edges"] = labels
    if lengths:
        spec["edgeLengths"] = lengths

    # --- freedraw: split every type into undrawn / drawn at the same length ---------------------
    fd = spec.get("freedraw")
    if not fd:
        return spec

    declared = list(spec.get("edgeTypes") or [])
    for t in spec.get("tiles", []):
        for e in (_as_edge_list(t) or []):
            for lab in ([e] if isinstance(e, str) else list(e)):
                if lab != "*" and lab not in declared:
                    declared.append(lab)
    for lab in lengths:
        if lab not in declared:
            declared.append(lab)

    if not declared:
        # No edge types anywhere: one implicit unit length, and the two variants get freedraw's own
        # names rather than L1 / L1#, because on a one-length grid "u" and "d" is what they are.
        pair = {None: ("u", "d")}
        spec["edgeTypes"] = ["u", "d"]
        spec["edgeLengths"] = {"u": "1", "d": "1"}
        for t in spec.get("tiles", []):
            t["edges"] = ["*"] * len(t["angles"])
        spec["drawnTypes"] = ["d"]
        return spec

    types, drawn, pair = [], [], {}
    for lab in declared:
        d = lab + _DRAWN_SUFFIX
        L = lengths.get(lab, "1")
        types += [lab, d]
        drawn.append(d)
        pair[lab] = (lab, d)
        lengths[lab], lengths[d] = L, L
    spec["edgeTypes"] = types
    spec["edgeLengths"] = lengths
    spec["drawnTypes"] = drawn

    single = len(pair) == 1
    for t in spec.get("tiles", []):
        e = _as_edge_list(t)
        if e is None:
            continue
        out = []
        for lab in e:
            if lab == "*" or not isinstance(lab, str):
                out.append("*")                       # already free: free over every type
            elif single:
                out.append("*")                       # one length: nothing left to pin
            else:
                out.append(list(pair[lab]))           # length pinned, drawn bit free
        t["edges"] = out
    return spec


def drawn_types(spec):
    """The edge-type labels that mean DRAWN, whether derived here or written out by the palette."""
    return list(spec.get("drawnTypes") or [])
