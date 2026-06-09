# Review 2026-06-09 — work-order specs

> **Provenance.** 42-agent adversarial review (7 readers / 5 critics / per-finding adversarial
> verification), 2026-06-09. 32 confirmed critical/major findings + 21 minors; 1 finding refuted in
> verification (the "D-D pivot cannot deliver k=4" claim — refuted because master §23.5–23.6 already
> measured and recorded exactly that). Every item below carries evidence verified against the sources
> at review time. These are **work-order specs**, not ledger entries — when an item lands, the ledger
> note + SYNC entry are written per the normal protocol and the checkbox here flips.

## The one-paragraph verdict

The mathematics (thm:weight → cor:box chain) is real. The execution is not aligned with it: every
certified count ran the tuned pool and is certified by oracle-match against a Galebach re-encoding;
the proven configuration has never been run and its tractability is unmeasured. The star lane is
certified-per-tiling but its thesis-side definitions cannot express its own results. All three
methods (torus / orbifold / Delaney–Dress) wall before k=4 on the current record — and at least three
sound, untried levers exist before "un-tameable" is allowed as a verdict.

## Execution order (amended from Alessandro's proposal)

| Step | What | Spec | Why this position |
|---|---|---|---|
| **0** | Decision gate: proven-config pool measurement | [00-decision-gate.md](00-decision-gate.md) | Step 2's wording **branches on this outcome**. Run parallel to step 1. |
| **1** | Code bugs (decisive-path soundness + doctrine) | [01-code-bugs.md](01-code-bugs.md) | Cheap; shrinks the unsoundness surface; digest-gated. |
| **1.5** | Two theory prerequisites: TH-1 (octagon lemma), TH-3/ST-1 (star definitions) | [03-theory-obligations.md](03-theory-obligations.md) | They gate specific thesis sentences — pull them ahead of step 2. |
| **2** | Thesis alignment (text ⇄ code ⇄ docs) | [02-thesis-alignment.md](02-thesis-alignment.md) | Needs DG-1's outcome + TH-1 + ST-1. |
| **3** | Theory: completeness/correctness/speed-up lemmas | [03-theory-obligations.md](03-theory-obligations.md) | TA-owned; unblocks OP-3 and the star lane. |
| **4** | Optimizations (explored directions) | [04-optimizations.md](04-optimizations.md) | After step 1 so the digest baseline is stable. |
| **5** | Star polygons + new directions | [05-star-and-new-directions.md](05-star-and-new-directions.md) | After ST-1 conventions; Myers-2009 oracle is the next certifiable target. |

## ID scheme

`DG-*` decision gate · `CB-*` code bugs · `TX-*` thesis text · `TH-*` theory obligations ·
`OP-*` optimizations · `ST-*` star/new directions. Owners: **CC** (code), **TA** (theory/proofs),
**AL** (Alessandro — decisions/runs). Cross-references use these IDs; each item names its primary
spec file so nothing is double-specified.

## Standing rules for all items

1. **Digest discipline.** Any change touching the decisive path re-runs the k≤2 digests
   (`6f9ca9cf…` / `f3e2e051…`) and the k=3 oracle regression. A changed digest is never silently
   accepted: it is either a found bug (loud, ledger entry) or a rejected change.
2. **Never-silent.** Any new cap/filter must emit a truncation event; "empirically spurious" is an
   oracle-dependent argument and may not support a completeness claim.
3. **Thesis honesty rule.** Until DG-1 resolves, no thesis sentence may state or imply that a
   proven-configuration enumeration was executed.
