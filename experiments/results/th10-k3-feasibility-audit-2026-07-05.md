# TH-10 → k=3 feasibility: audit of the proof-as-it-stands (2026-07-05, CC for AL)

**One-line verdict: the weight bound that would make k=3 feasible is NOT proven, and the
current attack plan, even if it fully succeeds, does not by itself close it — because the
binding constraint for k=3 is the *additive* constant, and no sub-obligation on any attack
list touches it.**

This is not a claim that the program is wrong. The lower bound is pinned, the toolkit is
theorem-grade, most bands are classified, and the 7-reviewer pass did its job. The problem is
narrower and more annoying than a broken lemma: the effort is aimed at the linear coefficient,
and k=3 is decided by the constant term.

---

## 1. What is actually proven, and what it gives for k=3

The proof architecture is a two-factor product:

  s\*(Λ)  ≤  (2/√3)·H  +  c₀            [Climb Theorem — thin-regime note §3]
  H       ≤  c₁·k      +  c₂            [Compensation law — the band program]

with H = detΛ/λ₁. The **band program (E2/E3/E4/E5/T2/R1) is entirely about c₁** (the linear
coefficient). Its current state, per the band ledgers:

| band (λ₁)            | linear bound      | status                                    |
|----------------------|-------------------|-------------------------------------------|
| = 1 (thin)           | 2.31k             | proven (E2 + Climb)                        |
| = √3                 | 2k                | proven (E3 + T3)                           |
| (√3, 1+√2) band-4    | 2.73k             | **mod E4-A′ purity lemma** (the extremals) |
| oct / 12-gon (wide)  | ~3.5–3.9k crude   | **E5 open**                                |
| round                | O(√k)             | R1 constants open                          |
| (1, √3)              | 8k−1              | **T2 open** — measured empty, unproven     |

So the linear coefficient is in decent shape (≤2.73k) on the bands that carry the extremals,
with two live linear hazards (T2, wide/E5). Fine so far.

**The killer is c₀.** The review's honest bound (E-3, [supplied] packing+routing proof) is
**c₀ ≈ 50**, replacing a fake "≤12". Every band's stated bound is "linear·k **+ c₀**". Plug in
band-4 at k=3:

  s\*(3) ≤ (2/√3)(2.31·3) + 50 ≈ 8.0 + 50 = **58**.

|W(58)| ≈ 8×10¹² ⇒ pair stage ≈ 3×10²⁵. **Hopeless.** For comparison the k=3 feasibility cliff
is s(3) ≤ 10 (|W(10)|≈7.3M, pair stage ≈2.7×10¹³, weeks–months). The additive term alone blows
the budget by ~15 orders of magnitude, and it does so **no matter how tight c₁ gets.** A perfect
2.5k linear bound still gives 7.5 + 50 = 57.5.

The sharp, c₀-value-independent statement: **k=3 needs a proven additive ≤ ~2; any additive above
~2 kills it** (additive 15 → s(3)≈23 → W(23) pair ≈6×10¹⁹, still dead). The proof currently
delivers ~50 and nothing in the plan targets it. The review itself says so and then filed it as
item 9 of 16: *"the k=3 unlock is equivalent to: additive constant ≤ 2.5 … now a tracked
obligation; no note pins any additive constant yet"* (E-9). It is tracked but unscheduled — it
appears in no attack-order list (crux-frame §5, assembly-status "remaining fights", E4 verdict all
enumerate only linear band fights). Meanwhile crux-frame §1 proposes *absorbing* the round-case
slack **into** the additive constant — pushing the wrong way.

---

## 2. The measured truth is fine — but you are forbidden from using it

From the catalogue (reproduced independently, `weight-tightness.csv`, 1339 rows):

- s\* maxima 5/6/7/10/12/14 for k=1..6.
- additive residual s\* − 2.33k = 2.67, 1.34, **0.01**, 0.68, 0.35, 0.02. The *true* additive is
  ~0 for k≥3.
- (1,√3) band: 0 occupants of 1339. T2 is empirically absolute.

So in reality s\*(3)=7 and the additive is ~0 — comfortably feasible. **But this is measurement,
not proof, and the entire thesis contribution is that Galebach's completeness has no proof.** If
you bound the k=3 proven run using "s\* ≤ 7 measured on the catalogue" or "T2 empty on the
catalogue," you have assumed the catalogue is complete — which is the thing the run is supposed to
establish independently. Every catalogue-measured bound is *evidence for what to prove*, never a
substitute. This is why c₀ ≈ 0 in the data does not rescue you: you must *prove* it small a priori.

---

## 3. The fix, and why it is cheap (this is the actionable part)

c₀ is a **proof artifact, not an intrinsic cost.** It appears because the band bounds compute
|V(Q)| and H by counting and then feed H into the *generic* Climb Theorem, whose endpoint-repair
step is a worst-case local edge-walk (~50 edges to reconnect two vertices at distance ≤ √5). That
generic step is only needed when you don't know the structure. **You do know the structure** — the
band classifications prove the tiling is a cyclic word of rings/layers. That word hands you an
*explicit* generating walk, whose weight is its length, with additive 0.

M1 §6 already does exactly this for the lower-bound family and never pays c₀: the strip climb
vector is c = n_T·ζ⁴ + n_S·ζ⁶, weight ≤ walk length by construction. I checked the sandwich in
exact ℚ(√2,√3) (`th10-k3-additive-check`, appendix): for SᵃTSᵇT strips, house(c) = |c| = 2k−0.27
and ⌈house⌉ = walk = 2k, so **wt(c) = 2k exactly, additive 0** — verified for 8 words. The generic
route would report ~2k+50 for the identical vector.

The same mechanism applies to the band that actually holds the extremals. E4-A already proves the
circumference-2 grammar (s squares, t triangles, x hexagon-rings; |V|=2p+x, H=s+(√3/2)t+√3x).
The explicit climb generator for that word has walk length ≈ s+t+2x with the same house sandwich
⇒ additive 0 — instead of the note's stated (8/3)k **+ c₀**. For t4125 = s0·t2·x4 this gives
wt ≤ 10 = the measured s\*, versus (2/√3)·5√3 + 50 = 60 from the generic route. **It is a rewrite
of the last step of each band lemma, not a new theorem.** The machinery is in hand.

Round and wide bands are the genuine remainder: they have no layered word, so the explicit-walk
trick doesn't transfer directly and they still need their own small-additive argument (R1 for
round; E5 already needed for wide). But round is O(√k) over 344 tilings with small s\* at small k,
and wide is already on the list. The extremal-bearing elongated bands — the ones that set the
constant — are the cheap ones.

---

## 4. Recommended order, for k=3 feasibility specifically (not for "tighten TH-10 as a result")

These are different goals. "Tighten TH-10" is served by M1+M2 (already near). "Make k=3 run"
requires the conjunction below; each item is independently fatal if left open.

1. **Pin the additive constant via explicit ring-walk generators.** Rewrite the closing step of
   the thin/√3/band-4 lemmas to exhibit the generator as a walk and bound its weight by the house
   sandwich (M1 §6 template). Target additive ≤ 2. Highest leverage, lowest cost, currently
   unscheduled. *Without this, everything else is irrelevant for k=3.*
2. **Close T2, or get any unconditional in-band bound ≤ ~3k for λ₁∈(1,√3).** Cannot be discharged
   by "measured empty" for the proven run (circularity, §2). This is the hardest-looking piece and
   it alone caps you at 8k if it stays open.
3. **E5 wide compensation** to bring oct/12-gon from ~3.9k crude down to ~2.5k. Borderline
   otherwise (W(12) pair ≈5×10¹⁴).
4. E4-A′ purity lemma (linear part of band-4 — nearly done) and R1 round small-k (additive for the
   non-layered case).

If you only have budget for one: **#1.** It is the piece that is both binding and off the map, and
it converts the beautiful lower-bound machinery you already have into an upper-bound instrument.

---

## 5. Blunt summary

You have spent the effort proving H ≤ ~2.7k (the coefficient) and pinning s\* ≥ 2.5k (the floor).
Both are real. But k=3 doesn't care about the coefficient once it's below ~3 — it cares about the
+50 sitting on top of it, which the plan never mentions, and which your own review flagged and then
buried. The tractable, high-value move is to finish the upper bounds as *explicit walks* (as M1
already does going down), not as |V|/H counts fed to a generic theorem that re-imports a 50-edge
repair you never actually need. Do that, close T2, and the scout's "GO" stops being example-mode.

---

### Appendix — evidence (reproducible)

- **Catalogue backbone** (`thesis/figures/charts/weight-tightness.csv`): s\* max per k = 5/6/7/10/12/14;
  additive residual s\*−2.33k ≈ {2.67,1.34,0.01,0.68,0.35,0.02}; count of tilings with 1<λ₁<√3 = 0.
- **Exact additive check** (sympy, ℚ(√2,√3)): for SᵃTSᵇT, house(c)=|c|, ⌈house⌉ = walk length = 2k
  ⇒ wt(c)=2k, additive 0 (8 words). Generic Climb route on the same vector: ~2k + c₀, c₀≈50 (E-3).
- **Feasibility (|W(s)|~s⁸ anchored W(7)=423169):** s=10 → pair ≈2.7×10¹³ (feasible); s=14 →
  ≈5.9×10¹⁵; s=23 → ≈6×10¹⁹; s=58 → ≈3×10²⁵ (the current proven route at k=3).
- **Scout** (`experiments/results/th10-scout-2026-07-05.log`): ran on the *measured* pool, labeled
  UNPROVEN throughout; its own efficiency-prune at c²=4/3 silently dropped a k=1 tiling (10/11) —
  a live instance of "completeness knobs are not speed dials."

Sources read: `resources/research/{weight-bound-program, th10-review-synthesis, th10-R2-crux-frame,
th10-R2-assembly-status, th10-R2-thin-regime, th10-M1-arithmetic-toolkit-and-strips,
th10-R2-E4-band4}-2026-07-03.md`.
