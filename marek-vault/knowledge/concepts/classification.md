---
type: concept
tags: [concept, classification]
status: from-chat
sources: ["archive/2026-07-13", "marek-vault list-of-ideas (tilings_exploration.txt)"]
---

# Marek's classification of tilings by regular polygons

His own scheme, told over the chat on 2026-07-13 and written up in his "list of ideas" file
([[marek-list-of-ideas]]). Six levels of increasing complexity, all for tilings made of regular
polygons. This is the backbone of how he thinks about the whole catalogue, so it is the backbone of
the atlas.

## The six levels

| Level | Name | Definition |
|---|---|---|
| 1 | **Regular** | Isohedral *and* uniform. The three regular tilings; no explanation needed. |
| 2 | **Archimedean** (uniform / semiregular) | 1-uniform, at least 2 kinds of polygon. Anything vertex-transitive that isn't regular. |
| 3 | **Pseudo-Archimedean** | Every vertex has the same *configuration*, but the tiling is not uniform (not vertex-transitive). |
| 4 | **Combination** | Every vertex has the same *combination* of polygons, but not the same configuration (the cyclic order around the vertex varies). |
| 5 | **Hybrid** | Even the combinations differ between vertices. |
| 6 | **Multibrid** (multi-hybrid) | Regular polygons of several different edge lengths, edges commensurable, integer multiples of a common base edge. |

Level 3 is the one that surprised me: a single vertex configuration used everywhere, yet the tiling
still fails to be vertex-transitive. Marek's favourite example is the one he jokes sits in the centre
of the Round Table at Camelot (`5553.png`).

For level 4, the example he sent (`4d_4f.png`) has two hexagons and two triangles at every vertex,
but some vertices are `3.6.3.6` and others `3.3.6.6`. Same combination, different configuration.

## What unifies levels 1 through 4: the edge function

Levels 1 to 4 all share one property: every vertex has the same *combination* of polygons, so the
edge length forced by that combination (the "edge function" of the combination) is the same
everywhere. See [[hybrid-identities]] for the edge function itself.

Hybrids (level 5) break this. Different vertices have different combinations, so the edge functions
of several different combinations have to resolve to the *same* value. That coincidence is rare,
which is exactly why hybrids are "significant outliers and a fascinating area of research" (his
words). In hyperbolic geometry they are mysterious; in the Euclidean plane they are comparatively
trivial because of scaling.

Marek knows, in hyperbolic geometry, of three infinite families of hybrid identities, one finite
related family, and 20 to 30 sporadic cases that don't seem related to anything.
![[archive/2026-07-13#^msg-1526155739465257061]]

## Level 6: multibrid, and apeirogonal arithmetic

Multibrid tilings mix regular polygons of several commensurable edge lengths. A large number of edge
identities is known, but only a small fraction resolve into actual tilings; Marek doesn't think any
known tiling uses four or more edge lengths. The unresolved identities, including infinite families,
are studied more abstractly. He calls that study "apeirogonal arithmetic" because the polygons
involved are mostly horocyclic apeirogons of varying edge length. See [[hybrid-identities]].

## The connection to Euclidean k-uniform tilings

A remark of his worth keeping in view: Euclidean k-uniform tilings are just a special case of
hybrids "existing outside of hyperbolic space." The whole k-uniform Euclidean enumeration
(A068599), the mainstream result STS is known for, is one slice of this larger hybrid picture.
![[archive/2026-07-15#^msg-1527051183519170741]]

## From the chat

- Level names, in order: ![[archive/2026-07-13#^msg-1526153390248431719]]
  ![[archive/2026-07-13#^msg-1526153543860486214]] ![[archive/2026-07-13#^msg-1526154460026372117]]
  ![[archive/2026-07-13#^msg-1526155273276751892]]
- Combination example `3.6.3.6` vs `3.3.6.6`: ![[archive/2026-07-13#^msg-1526155029306675301]]
- Hybrids trivial in Euclidean, mysterious in hyperbolic: ![[archive/2026-07-13#^msg-1526155434031845467]]
- The `(a,a,a,b)` discovery that got him into tilings (up to 4 uniform versions):
  ![[archive/2026-07-13#^msg-1526153757103100015]]

## Related

[[hybrid-identities]] · [[hyperbolic-tilings]] · [[k-uniform-tilings]] · [[glossary]]
