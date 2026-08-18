# Making 2.06M tilings findable: ship the index, or query it

**Status:** proposal, undecided. Written 2026-08-18 after Phase 0/1 landed.
**Decides:** how the browse UI answers "what exists" without loading what exists.

## Where we are

Measured on a production build, against the deployed build:

| | deployed | now |
|---|---|---|
| /library JSON requests | 118 | 67 |
| /library wire bytes | 14.1 MB | 1.2 MB |
| /library JS heap | 756 MB | 73 MB |
| facet memo, base atlas | 47,033 ms | 3 ms |

Speed is no longer the problem. Two things still are.

**Findability.** ~84,388 entries cannot be reached by browsing — scaled k3–k7 (43,317), regular
k8/9/10 (30,163), euhalf k5–k9 (10,211). `CatalogueListPanel` builds its k rows from *loaded*
tilings, so the row that would trigger the fetch can never appear. An atlas that ships a corpus you
cannot navigate to is presenting a partial catalogue as a complete one.

**Scale.** 920 MB of `public/`, 2.06M records, and more arriving from Marek, Craig and Joseph. The
tail still loads whole shards: reaching one page of `ie01-k14` costs 19.7 MB. And no query can cross
a shelf boundary — "all 3-uniform star tilings, wherever they live" is unanswerable today.

## Step 0, regardless of what follows: the manifest

A build-time file of per-`(shelf, board, k)` counts, so a k row can exist before its data does.

- **Pro.** Fixes the 84,388 outright. Small, static, no new dependency. Every option below needs it
  anyway as the navigation layer.
- **Con.** Counts must be generated from the shelf registry, not by scanning files — a generic scan
  mis-classifies the decoration shelves, and wrong counts are worse than none.

This is not the decision. The decision is what sits under it.

## Option A — client-side facet index

Ship a columnar, dictionary-encoded index; filter, count and paginate off it; fetch geometry per
visible tile.

Measured: **2–3 MB gzipped for all 2.01M records**, using a ~954-row segment table for everything
constant across a contiguous run and synthesizing 92.7% of ids from `(prefix, padWidth, ordinal)`.
All 34 predicates in `matchesReferenceFilters` are pure per-record and build-computable.

- **Pro.** Stays fully static — no runtime dependency, no egress, nothing to operate. Works offline
  and on a CDN. Cross-shelf filtering becomes possible for the first time.
- **Pro.** The precedent is proven here: `renderCell`-from-`exactSource` is the same move one level
  down, and it worked.
- **Con.** 2–3 MB is not free, and it grows with every corpus drop — the exact curve we are trying
  to get off.
- **Con.** `f.query` resists precomputation: it substring-matches synthesized ids, so it needs its
  own path (match the 954 prefixes, then ordinal ranges).
- **Con.** Two traps that would silently corrupt filtering: the index must ship *derived*
  `geometryOf` (118,355 records carry no `geometry` field, and /library defaults to Euclidean — the
  raw field renders an empty library) and *derived* `subOf` (13 payload branches, and it is /play's
  whole tree axis).

## Option B — server-side index (Postgres/Supabase)

Put the same columns in Postgres and query them. Geometry stays on the CDN.

- **Pro.** Nothing ships. The index stops being a payload that grows with the corpus.
- **Pro.** `f.query` becomes a `WHERE`. Counts for unloaded shelves become a `COUNT` — the manifest
  stops being a generated file and becomes a query.
- **Pro.** Supabase is already in this stack: auth, service client, migrations. 2M rows with a few
  indexed columns is unremarkable for Postgres.
- **Pro.** Cross-shelf faceted search is the natural shape of the thing, not a special case.
- **Con.** Browse gains a runtime dependency where today everything is static. Needs a degraded path
  when it is down, and that path is Option A in miniature.
- **Con.** Egress and an operational surface that did not exist. Local dev needs the DB seeded.
- **Con.** The corpus becomes reproducible-from-git only if the index build is part of the pipeline;
  a hand-loaded table is a second source of truth waiting to drift.

⚑ The 2026-08-17 note records that Supabase was "considered and rejected". Read in context, that was
about **hosting the payload**, which was the right call — geometry belongs on the CDN. It says
nothing about the index. This option should be decided on its own merits, not inherited.

## Option C — range-addressable payload container

Independent of A/B: chunk each shelf file into gzipped 256-record blocks in one file, with a footer
offset table, fetched by HTTP Range.

Measured: one page of `ie01-k14` costs **11,078 bytes** against a 19.7 MB whole-shard read, decoding
`sameRecords`-identical. Vercel serves 206 on static assets and caches the whole object, so unseen
offsets still hit the edge.

- **Pro.** Fixes the tail — the k≥3 shelves that today are all-or-nothing.
- **Con. It is not a compression win.** Chunking costs **+18.5% against simply gzipping each file
  whole** (75.98 MB vs 64.13 MB corpus-wide). Plain `.gz` compresses better and does nothing else.
  Justify this on random access or not at all.
- **Con.** Three sharp edges: a multi-range header makes Vercel return the *entire file* with a 200;
  the file-wide `geom` table must be hoisted into the footer or `scaled-k7` fans 585 shapes to 15,805
  and loses half its ratio; and the Cache API rejects 206 outright, so chunk caching must be
  hand-rolled over IndexedDB or synthesized 200s.

## Recommendation

Do the **manifest** now — it fixes a correctness bug and every path needs it.

Then decide A vs B deliberately, and I lean **B**, because the property that makes A awkward is
exactly the property B removes: an index that ships is a payload that grows, and this corpus's whole
trajectory is "more arrives every month". The static-site purity is worth something, but it is worth
less than a browse layer that stops being re-engineered every time the corpus doubles.

Defer **C** until the tail is actually the complaint. It is real, well-measured and self-contained,
and it will still be there.

## Independent of all of the above

- `reshard-star-shards.mjs` writes plain JSON *and* reads with bare `JSON.parse` — it will silently
  mis-handle a packed base atlas the moment it runs. Fifteen scripts bypass the encoder; the fix
  that holds is a CI grep guard, not fifteen edits.
- `tri45-k4-999 > tri45-k4-1000` lexicographically, and `reference-shelf.tsx:1738` sorts ids as
  strings — /library's order is wrong on eight files.
- `period-k3-075` reports periods `{1,3,6}` instead of `{1,3}`: one hexagon's nominal 158.5° rounds
  to 159 at one corner and 158 at another.
- Cache headers are `max-age=3600`, not `immutable`, because the shard URLs carry no content hash.
  Threading a build hash through the `*ShardUrl` builders is the real fix.
- The remaining 73 MB of /library heap is **undecomposed**. Suspects: 49 never-evicting module
  caches, `displayGroups` allocating a `{key, members}` per record (~39 MB when the corpus was
  larger), and ten memos doing full passes per filter change. Measure before optimising — the
  opposite order produced the wrong heap diagnosis earlier in this session.
