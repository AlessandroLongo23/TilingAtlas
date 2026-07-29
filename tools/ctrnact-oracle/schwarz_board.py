#!/usr/bin/env python3
"""The Schwarz-triangle BOARD: one (p, q, r) reflection group, its alphabet and its edge lengths.

Shared front end for the three Schwarz developers (Euclidean patch, spherical SO(3), hyperbolic
SU(1,1)). Nothing here develops anything — it turns the triple (p, q, r) into the two tables every
back end needs, and states the conventions that were read off Marek Čtrnáct's certificates rather
than guessed.

THE BOARD. The (p, q, r) Schwarz tiling is the plane / sphere / disk cut by the mirrors of the
(p, q, r) reflection group: one triangle with angles π/p, π/q, π/r, repeated by reflection. Its sign
is the sign of 1/p + 1/q + 1/r − 1 — spherical when positive, Euclidean when zero, hyperbolic when
negative. Marek's solvers cover 223 224 233 234 235 (spherical), 236 244 (Euclidean), 237 245
(hyperbolic).

THE ALPHABET, read off the certificates:

  * CORNER letters `Sn` name a corner of ANGLE π/n — not a site of rotation order n. The distinction
    only shows on the isoceles boards: on (2,2,3) the π/3 corner is written S3 and its site tag is
    D12, i.e. rotation order 6, because the (2,2,3) triangle is mirror-symmetric and the tiling
    therefore carries twice the rotation the triangle group alone would give. Reading Sn as "site of
    order n" would reject every one of those certificates. So the angle is π/n and the rotation order
    is derived, as everywhere else, from 2π / Σ(listed angles).
  * DIGON letters come in undrawn/drawn pairs A2/B2, C2/D2, E2/F2, one pair per EDGE class, and every
    edge carries a digon whether or not it is drawn (Marek, 2026-07-27). A letter names the pair of
    ANGLES its edge joins, so an edge class is an unordered pair of corner letters, and the pairs are
    lettered in lexicographic order of (angle index, angle index) over the sorted triple:

        (2,3,6) → A/B = S2–S3,  C/D = S2–S6,  E/F = S3–S6      (three classes)
        (2,2,3) → A/B = S2–S2,  C/D = S2–S3                    (two: the triple has a repeat)
        (2,4,4) → A/B = S2–S4,  C/D = S4–S4

    `letter_pairs` derives that map from the triple, and `derive_letter_pairs` re-derives it from a
    corpus's own vertex figures so the two can be checked against each other rather than trusted.

EDGE LENGTHS. The triangle is rigid (its three angles are fixed), so the sides follow from the law of
cosines for angles, with the side joining the A-corner and the B-corner opposite the third angle C:

    spherical    cos c  = (cos C + cos A cos B) / (sin A sin B)
    hyperbolic   cosh c = (cos C + cos A cos B) / (sin A sin B)
    Euclidean    c ∝ sin C                                    (the limit; only the ratio is defined)

On (2,3,6) that gives 1 : √3 : 2 for A : C : E, which is the table develop_freedraw.py's sch236 grid
carries by hand — reproduced here from the formula, and asserted in the selftest.
"""
import math

# Marek's boards, by the id his corpora use. Value is the angle triple (p, q, r), always sorted.
BOARDS = {
    "223": (2, 2, 3),
    "224": (2, 2, 4),
    "233": (2, 3, 3),
    "234": (2, 3, 4),
    "235": (2, 3, 5),
    "236": (2, 3, 6),
    "237": (2, 3, 7),
    "244": (2, 4, 4),
    "245": (2, 4, 5),
}

# Undrawn/drawn digon letter per edge class, in the order the classes are lettered.
DIGON_PAIRS = (("A2", "B2"), ("C2", "D2"), ("E2", "F2"))
DIGON_LETTERS = tuple(x for pair in DIGON_PAIRS for x in pair)
DRAWN_LETTERS = tuple(pair[1] for pair in DIGON_PAIRS)

TWO_PI = 2 * math.pi


class BoardError(Exception):
    pass


def geometry_of(pqr):
    """'spherical' | 'euclidean' | 'hyperbolic' from the sign of 1/p + 1/q + 1/r − 1."""
    s = sum(1.0 / n for n in pqr) - 1.0
    if s > 1e-12:
        return "spherical"
    if s < -1e-12:
        return "hyperbolic"
    return "euclidean"


def triangle_count(pqr):
    """Triangles in the whole tiling — the order of the (p,q,r) reflection group. Spherical only
    (Euclidean and hyperbolic boards are infinite); returns None otherwise."""
    s = sum(1.0 / n for n in pqr) - 1.0
    if s <= 1e-12:
        return None
    n = 4.0 / s
    return int(round(n))


def corner_letter(n):
    return f"S{n}"


def side_length(pqr, i, j):
    """Length of the side joining corner i and corner j of the (p,q,r) triangle (indices into pqr).

    Spherical and hyperbolic lengths are absolute — the triangle is rigid, there is no similarity —
    so this is THE length, not a ratio. The Euclidean board has only a shape, so its lengths are
    normalised to make the shortest side 1, which is the convention develop_freedraw.py's sch236
    edge_len table already uses (1 : √3 : 2)."""
    if i == j:
        raise BoardError("a side joins two distinct corners")
    k = ({0, 1, 2} - {i, j}).pop()
    A, B, C = (math.pi / pqr[i], math.pi / pqr[j], math.pi / pqr[k])
    geo = geometry_of(pqr)
    if geo == "euclidean":
        # Law of sines: sides are proportional to the sine of the opposite angle. Normalise on the
        # shortest side so the smallest edge class is 1.
        sins = [math.sin(math.pi / pqr[m]) for m in range(3)]
        return math.sin(C) / min(sins)
    num = math.cos(C) + math.cos(A) * math.cos(B)
    den = math.sin(A) * math.sin(B)
    x = num / den
    if geo == "spherical":
        return math.acos(max(-1.0, min(1.0, x)))
    return math.acosh(max(1.0, x))


def letter_pairs(pqr):
    """{digon letter: (corner letter, corner letter)} for one board, both letters of each pair.

    Classes are the DISTINCT unordered pairs of corner letters, lettered in lexicographic order of
    the pair. A repeated angle (the isoceles boards) collapses two index pairs onto one class; this
    asserts they agree on length rather than assuming it."""
    by_pair = {}
    for i in range(3):
        for j in range(i + 1, 3):
            key = tuple(sorted((pqr[i], pqr[j])))
            ln = side_length(pqr, i, j)
            if key in by_pair and abs(by_pair[key] - ln) > 1e-9:
                raise BoardError(f"board {pqr}: {key} has two lengths {by_pair[key]} vs {ln}")
            by_pair[key] = ln
    out = {}
    for idx, key in enumerate(sorted(by_pair)):
        if idx >= len(DIGON_PAIRS):
            raise BoardError(f"board {pqr} needs more than {len(DIGON_PAIRS)} edge classes")
        for letter in DIGON_PAIRS[idx]:
            out[letter] = (corner_letter(key[0]), corner_letter(key[1]))
    return out


def edge_lengths(pqr):
    """{digon letter: side length}, both letters of each class mapping to the same length."""
    pairs = letter_pairs(pqr)
    lens = {}
    for letter, (a, b) in pairs.items():
        na, nb = int(a[1:]), int(b[1:])
        i = pqr.index(na)
        j = next(m for m in range(3) if pqr[m] == nb and m != i)
        lens[letter] = side_length(pqr, i, j)
    return lens


def alphabet(pqr):
    """{letter: interior angle in radians} — corners Sn at π/n, every digon at 0."""
    units = {corner_letter(n): math.pi / n for n in set(pqr)}
    for letter in DIGON_LETTERS:
        units[letter] = 0.0
    return units


def derive_letter_pairs(certs):
    """Re-derive {digon letter: (corner, corner)} from a corpus's own vertex figures.

    Each vertex of a Schwarz board carries ONE corner letter (every corner meeting there has the same
    angle), so the set of corner letters a digon letter is listed beside, over the whole corpus, IS
    the pair of corner letters its edge joins — a singleton meaning both ends are the same letter.
    Used to CHECK letter_pairs() against the data instead of trusting the lexicographic rule."""
    seen = {}
    for cert in certs:
        for vt in cert["types"]:
            corners = {c for c in vt["figure"] if c.startswith("S")}
            if len(corners) != 1:
                raise BoardError(f"vertex figure {vt['figure']} mixes corner letters {corners}")
            corner = corners.pop()
            for c in vt["figure"]:
                if c in DIGON_LETTERS:
                    seen.setdefault(c, set()).add(corner)
    out = {}
    for letter, corners in seen.items():
        cs = sorted(corners, key=lambda s: int(s[1:]))
        if len(cs) == 1:
            out[letter] = (cs[0], cs[0])
        elif len(cs) == 2:
            out[letter] = (cs[0], cs[1])
        else:
            raise BoardError(f"digon {letter} sits at {len(cs)} corner classes: {cs}")
    return out


def check_corpus(pqr, certs):
    """The derived letter→corner-pair map must agree with the board's own, on every letter the corpus
    uses. Returns the derived map. Raises when the corpus is not this board's — which is how the
    misfiled certificates in Marek's 237 drop are told apart from the real ones."""
    want = letter_pairs(pqr)
    got = derive_letter_pairs(certs)
    for letter, pair in got.items():
        if letter not in want:
            raise BoardError(f"letter {letter} is not in board {pqr}'s alphabet")
        if want[letter] != pair:
            raise BoardError(f"letter {letter} joins {pair}, board {pqr} says {want[letter]}")
    used = {c for cert in certs for vt in cert["types"] for c in vt["figure"] if c.startswith("S")}
    known = {corner_letter(n) for n in pqr}
    if not used <= known:
        raise BoardError(f"corner letters {sorted(used - known)} are not in board {pqr}")
    return got


def board_label(board_id):
    p, q, r = BOARDS[board_id]
    return f"({p},{q},{r})"


def _selftest():
    assert geometry_of((2, 3, 6)) == "euclidean"
    assert geometry_of((2, 4, 4)) == "euclidean"
    assert geometry_of((2, 3, 7)) == "hyperbolic"
    assert geometry_of((2, 4, 5)) == "hyperbolic"
    for b in ("223", "224", "233", "234", "235"):
        assert geometry_of(BOARDS[b]) == "spherical", b
    assert triangle_count((2, 3, 4)) == 48
    assert triangle_count((2, 3, 5)) == 120
    assert triangle_count((2, 2, 3)) == 12
    assert triangle_count((2, 3, 3)) == 24

    # (2,3,6): the hand table develop_freedraw.py's sch236 grid carries is 1 : √3 : 2 for A : C : E.
    L = edge_lengths((2, 3, 6))
    assert letter_pairs((2, 3, 6))["A2"] == ("S2", "S3"), letter_pairs((2, 3, 6))
    assert letter_pairs((2, 3, 6))["C2"] == ("S2", "S6")
    assert letter_pairs((2, 3, 6))["E2"] == ("S3", "S6")
    assert abs(L["A2"] - 1.0) < 1e-12, L
    assert abs(L["C2"] - math.sqrt(3.0)) < 1e-12, L
    assert abs(L["E2"] - 2.0) < 1e-12, L
    assert L["A2"] == L["B2"] and L["C2"] == L["D2"] and L["E2"] == L["F2"]

    # (2,4,4): the square grid's barycentric subdivision, 1 : √2 with the 45-45 side the long one.
    L = edge_lengths((2, 4, 4))
    assert letter_pairs((2, 4, 4))["A2"] == ("S2", "S4")
    assert letter_pairs((2, 4, 4))["C2"] == ("S4", "S4")
    assert abs(L["A2"] - 1.0) < 1e-12, L
    assert abs(L["C2"] - math.sqrt(2.0)) < 1e-12, L

    # (2,2,3) on the sphere: two quarter-circle meridians and a π/3 equatorial arc. The equatorial
    # edge joins the two π/2 corners, so it is the A class; the meridians are C.
    L = edge_lengths((2, 2, 3))
    assert letter_pairs((2, 2, 3))["A2"] == ("S2", "S2")
    assert letter_pairs((2, 2, 3))["C2"] == ("S2", "S3")
    assert abs(L["A2"] - math.pi / 3) < 1e-12, L
    assert abs(L["C2"] - math.pi / 2) < 1e-12, L

    # A hyperbolic board's sides are real lengths, and the (2,3,7) triangle is the smallest one.
    L = edge_lengths((2, 3, 7))
    assert all(v > 0 for v in L.values())
    assert L["A2"] < L["C2"] < L["E2"], L

    # Every board's angle triple closes: the three angles sum to more/less than π by the sign.
    for bid, pqr in BOARDS.items():
        s = sum(math.pi / n for n in pqr)
        geo = geometry_of(pqr)
        if geo == "spherical":
            assert s > math.pi + 1e-12, bid
        elif geo == "hyperbolic":
            assert s < math.pi - 1e-12, bid
        else:
            assert abs(s - math.pi) < 1e-12, bid
    print("[selftest] schwarz_board PASS")


if __name__ == "__main__":
    _selftest()
