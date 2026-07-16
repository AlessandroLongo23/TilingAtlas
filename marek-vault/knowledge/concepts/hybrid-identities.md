---
type: concept
tags: [concept, hybrid, notation]
status: from-chat
sources: ["archive/2026-07-13", "marek-vault/output_A.txt", "marek-vault list-of-ideas"]
---

# Hybrid identities: symbols, edge functions, mixing rules

The machinery behind levels 5 and 6 of [[classification|the classification]]. This note decodes the
notation in his master output file (`output_A.txt`, a cut-down copy of his main edge database) and
the reasoning he walked me through on 2026-07-13.

## Hybrid symbols

Polygons in hybrid/multibrid tilings get a two-part label: a **letter** = multiplier of the base
edge, a **number** = number of sides.

- `A3` = triangle with the base edge (A = 1×).
- `B5` = pentagon with twice the base edge (B = 2×).
- `E7` = heptagon with five times the base edge (E = 5×).
- So A=1, B=2, C=3, D=4, E=5, … ![[archive/2026-07-13#^msg-1526158576614379520]]
- `Aoo`, `Doo`, `Hoo` = horocyclic apeirogons of various edge length. He writes `oo` for the infinity
  symbol because it's easier in plain-text files; in "fancier literature" use ∞.

Highest letter he has used in a real search: H or I, but no solutions came from those; **G** is the
highest that produced actual tilings. ![[archive/2026-07-14#^msg-1526700180051595397]]

A vertex is written as a parenthesised list with exponents for repeats:

```
(A6^2,Boo^3)   two base-edge hexagons + three apeirogons of twice the base edge
```

Hybrid symbols even work in Euclidean geometry (the edge resolves to 0) and on the sphere (imaginary).

## The edge function

`e(...)` takes a tuple of polygons and returns the base edge at which they fit exactly around a
vertex (inner angles sum to 2π). ![[archive/2026-07-13#^msg-1526158902146760824]]

Two vertex combinations are part of the same hybrid identity when their edge functions agree:

```
e(A3,A4^2,A7) = e(A4,A7,A14)
```

The geometric reason for that specific one: surround a heptagon with a layer of squares and
triangles and you get a regular 14-gon. The heptagon isn't special, so this is an **infinite family**
(11-gon → 22-gon, and so on). ![[archive/2026-07-13#^msg-1526159072641155142]] Its Euclidean case
is `n=6`; its spherical cases are a family of Johnson solids (diminished/gyrated
rhombicosidodecahedra) at `n=5`.

The edge length itself is found by numerical (Newton-type) iteration, see [[edge-length-solver]], and
recorded to ~50 decimal places. Proving these numerically-found lengths are exactly equal is an open
research direction, listed in [[open-questions]].

## Mixing rules

A mixing rule rewrites one vertex into another, like simplifying an equation. Take a shared identity,
cancel the common polygons on both sides:

```
(A3,A4^2,Aoo) = (A4,Aoo^2)      both sides share A4, Aoo → cancel
(A3,A4) = (Aoo)                 "inner angles of A3 + A4 = inner angle of Aoo"
```

Once you have the rule, you can substitute it anywhere: replacing `Aoo` in `(A3,A4^2,Aoo)` gives
`(A3^2,A4^3)`. ![[archive/2026-07-13#^msg-1526164297473065023]]

A grouping is quoted compactly as one member plus the list of rules that generate the rest. The "big
triangle" system has 106 vertex combinations, given as `(A3^4,A4^2)` plus 9 mixing rules.
![[archive/2026-07-13#^msg-1526165546729603115]]

### The "dimension" of an identity grouping

The number of mixing rules needed to recreate the whole grouping starting from a single member. The
`(A3,A4)=(Aoo)` system above is one-dimensional (one rule, three combinations). He knows systems with
ten or more irreducible rules.

## Three infinite families of mixing rules

1. `(A3)=(Bn)` — in a system `(A3^4,An^2)`, put a triangle on each face of the n-gon; two triangles
   plus an n-gon make a straight angle, so the result is an n-gon of twice the edge.
   ![[archive/2026-07-13#^msg-1526166312269647922]]
2. `(A3^2)=(An)` — in a system `(A3^n)`.
   ![[archive/2026-07-13#^msg-1526166626163228703]]
3. The degenerate `(B3^5)=(B5^3)` family: start from `(A3^5n, A3n^5n)` and apply
   `(A3^4,A3n)=(A5n^3)`. At `n=2` this already gives edge > 4 absolute units, huge spiky polygons.
   ![[archive/2026-07-13#^msg-1526167088945823744]] This is the structure he told Goodman-Strauss he
   wants to bear his name. ![[archive/2026-07-13#^msg-1526168535292837898]]

## Multibrid: sets whose edges add to π

Important in multibrid tilings: a vertex with an even count of every polygon can be halved to a set
whose angles sum to π (e.g. `(A6^4)` → `(A6^2)`). Those half-sets matter because a multibrid tiling
must contain vertices lying on the edge of a larger polygon, where that polygon takes up π and the
rest must fill the other π. (From the list-of-ideas file, [[marek-list-of-ideas]].)

## Apeirogonal arithmetic

The abstract end of multibrid study: relations between apeirogons that probably never resolve into
tilings. Example:

```
([x]oo, [x+2]oo^3) = ([x+1]oo^3, [x+3]oo)
```

Read: pick base edge K so one apeirogon of edge `xK` and three of edge `(x+2)K` fit around a vertex;
then three of `(x+1)K` and one of `(x+3)K` also fit. Works for any positive real `x`, though he only
tested integers. ![[archive/2026-07-13#^msg-1526191287429107782]]

## The two families that motivated / still escape him

- **`(A5,A18)=(A6,A9)`** — "the weirdest one." Its only pentagon-bearing vertex is asymmetrical, so
  pentagons can have neither axial nor rotational symmetry; every pentagon must have its 5 vertices in
  5 different orbits. Older search methods failed here. STS found the smallest solutions in the
  **16-uniform** space, and this is the problem that made him build STS.
  ![[archive/2026-07-13#^msg-1526168863866093669]] ![[archive/2026-07-13#^msg-1526170038871130193]]
- **`(A3^2,Aoo)=(A8,A24)`** — vertices `(A3^3,Aoo^2)` and `(A3,A8,A24,Aoo)` share a triangle and an
  apeirogon, so they *can* connect, yet he has never found a hybrid tiling there. Possibly impossible
  for some unknown reason. Tracked in [[open-questions]]. ![[archive/2026-07-15#^msg-1526870326011756664]]

## Related

[[classification]] · [[edge-length-solver]] · [[hyperbolic-tilings]] · [[solution-file-format]] · [[glossary]]
