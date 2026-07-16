---
type: concept
tags: [algorithm, concept]
status: from-chat
sources: ["archive/2026-07-13", "archive/2026-07-14", "tools/ctrnact-oracle/eu_pruner.cpp"]
---

# Deduplication and the missing canonical form

Correction to what I seeded earlier. There are two different things here, and the chat makes clear
Marek has one but not the other.

## What exists: automatic duplicate detection (Eryk's)

STS emits duplicates (the same tiling reached by different glue orders, or related by symmetry). The
**automatic duplicate detection** that removes them was **Eryk's contribution**, and it "works great."
![[archive/2026-07-13#^msg-1526148523450695773]] In his paper, Eryk also wrote a treatise meant as a
proof of completeness; on my reading of it, the part that is actually *proven* is the **duplicate
test**, not the whole search's completeness. ![[archive/2026-07-14#^msg-1526652279460073694]] So the
dedup is both real and the best-justified piece.

## What is still missing: a canonical form

STS "still lacks some form of canonization." When it runs multithreaded, the same tiling can have many
equivalent representations, and which one the program records first is essentially random. He wants a
**canonical form** that any tiling can be converted to, so the recorded representative is deterministic.
![[archive/2026-07-14#^msg-1526673075297587231]]

Dedup and canonicalisation are related but not the same: dedup detects that two representations denote
the same tiling and drops one; a canonical form maps every representation to a single fixed one up
front. STS has the former, not the latter.

## How this maps to the repo

The repo's `eu_pruner.cpp` / `reference/euclidean_pruner.py` computes a canonical fingerprint (CLAUDE.md
labels it Weisfeiler-Leman / DFA). **Open question:** is that the dedup Eryk wrote, or does the port add
the canonicalisation Marek says STS still lacks? Worth asking him directly, and worth reading the repo's
streaming-compact-pruner design
([../../../docs/superpowers/specs/2026-07-09-ctrnact-streaming-compact-pruner-design.md](../../../docs/superpowers/specs/2026-07-09-ctrnact-streaming-compact-pruner-design.md))
next to his answer.

## Chirality / mirror pairs

The repo's settled decision is that mirror pairs **merge** (counted once), which is what makes k=2 = 20
and matches A068599. From the chat: STS's vertex-adding step adds both chiralities of a chiral vertex
([[dual-search]]), and a count like "14 vertex configurations" for a tiling is only right if chiral
pairs are identified. ![[archive/2026-07-14#^msg-1526684361511141468]] So where exactly the merge
happens (search vs dedup) is part of the same open question above.

## A possible contribution (my side)

Soto-Sánchez's integer-matrix representation of a tiling also needed a canonical form, and I have
something that "solves (almost) the problem," but it requires the tiling expressed in that matrix form
first. ![[archive/2026-07-14#^msg-1526684577282654298]] This could be the canonization STS wants;
noted in [[roadmap]].

## Code

- Original: [../../../tools/ctrnact-oracle/reference/euclidean_pruner.py](../../../tools/ctrnact-oracle/reference/euclidean_pruner.py)
- C++ path: [../../../tools/ctrnact-oracle/eu_pruner.cpp](../../../tools/ctrnact-oracle/eu_pruner.cpp)

## Related

[[dual-search]] · [[pipeline]] · [[open-questions]] · [[roadmap]]
