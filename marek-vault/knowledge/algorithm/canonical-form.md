---
type: concept
tags: [algorithm, concept]
status: stub
sources: ["tools/ctrnact-oracle/reference/euclidean_pruner.py", "tools/ctrnact-oracle/eu_pruner.cpp"]
---

# Canonical form (the pruner)

The solver emits duplicates: the same tiling reached by different glue orders, or related by symmetry.
The pruner collapses them to one representative per distinct tiling by computing a **canonical
fingerprint** and keeping the first of each.

CLAUDE.md describes this as Weisfeiler-Leman / DFA canonical form. That is the piece I understand
least and most want Marek to walk me through.

## What I need to pin down (from the chat)

- What graph/automaton is canonicalised — the dual? the corner-adjacency structure?
- How WL refinement and DFA minimisation combine into one canonical label.
- How mirror images are handled (the settled repo decision is that mirror pairs **merge** — counted
  once — matching A068599; is that done here in the pruner or later?).
- Streaming vs. in-memory: the repo has a "streaming compact pruner" design
  ([../../../docs/superpowers/specs/2026-07-09-ctrnact-streaming-compact-pruner-design.md](../../../docs/superpowers/specs/2026-07-09-ctrnact-streaming-compact-pruner-design.md)) —
  read that alongside his answer.

## Code

- Original: [../../../tools/ctrnact-oracle/reference/euclidean_pruner.py](../../../tools/ctrnact-oracle/reference/euclidean_pruner.py)
- C++ path: [../../../tools/ctrnact-oracle/eu_pruner.cpp](../../../tools/ctrnact-oracle/eu_pruner.cpp)

## From the chat

- 
