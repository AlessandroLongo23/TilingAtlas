# Design system decisions

Numbered, newest last. Each records what was decided, why, and what it cost. A decision is reversed by a new
entry that names the old one, never by editing it.

## D1 · A design system of its own folder, shared by both apps (2026-11-07)

The tokens lived in `app/styles/tokens/`, the components in `components/ui/`, their CSS inside a 975-line
`app/globals.css`. They are now one folder, `design-system/`, that both the atlas and the Searcher import from
the repo root. A single place makes the boundary visible: what is in it is shared and governed, what is not is
a page's own. Cost: one import path changed in 138 files.

## D2 · Compact density, 13px interface text (2026-11-07)

The Atlas is read like an instrument: long lists of tilings, counts, filters, a canvas that must stay large.
Interface text is 13px on an 18px line, controls are 32px, and body text with no class of its own is
interface text. Before this, body text defaulted to 16px and controls to 36px, while most screens set 11 to
14px by hand. On a phone the tokens raise every control to 44px and every text to at least 12px
(docs/mobile/DESIGN.md), so a call site never carries a phone size.

## D3 · A type scale of roles, each a bundle (2026-11-07)

Ten roles, from `micro` (10) to `display` (32), plus a fluid `hero` for the landing. The scale steps by one
pixel from 10 to 14, where most of the screen is, then opens up. Each role sets size, line height and
tracking together, so a call site writes one class and never a line height. Named by use, not by size, so a
change of value does not mean a rename across the code. The scale replaced 20 sizes in use: 9, 10, 10.5, 11,
11.5, 12, 12.5, 13, 14, 15, 16, 18, 20, 24, 28, 30, 32, 36, 40 and rem fractions. The semantic type tokens
that existed before (caption, label, body, heading-1 to -4) were referenced by nothing.

Axon names its composites by pixel (`ui-14-medium`) and NemTilmeld has none; the role names here are the
middle course: one name per job, the pixel value in the table.

## D4 · Tailwind's defaults cleared (2026-11-07)

`tokens/tailwind.css` sets `--color-*`, `--text-*`, `--radius-*`, `--shadow-*`, `--font-weight-*`,
`--leading-*` and `--tracking-*` to `initial` and refills each from the roles. A utility outside the token set
generates no CSS. That was already true for a typo and nobody noticed: `bg-surface-base` generated nothing on
eleven figure frames and the canvas's root. Now it is true by design, and `ds:check` reports it. Spacing keeps
Tailwind's 4px multiplier, which is the spacing token.

## D5 · Statuses stay ink; two signal hues for indicators (2026-11-07)

Danger keeps its red. Success, warning and info stay ink at different strengths: the tilings carry all the
colour on the site, and a hue on every status would compete with them. Where the hue is the information (a
run's dot that pulses green when results arrive, a defense timer turning amber), `signal-positive` and
`signal-attention` exist, for indicators only.

## D6 · Radius and elevation by role (2026-11-07)

Radii are named by what carries them (mark, tag, control, surface, overlay, sheet), elevation by what is lifted
(raised, float, overlay, modal, sheet). The tokens already said a card's radius is the surface radius and a
popover's the overlay radius; half the hand-drawn cards used the overlay radius. Nested corners stay
concentric by rule: the segmented track's corner is its option's plus the inset between them. `HoverPill`
copies the corner of the item under it, so one pill fits a nav link, a toolbar button and a menu row.

## D7 · The library's CSS classes: unlayered for structure, layered for surfaces (2026-11-07)

The `.ta-*` classes that build a control (`.ta-seg`, `.ta-tab`, `.ta-float`, `.ta-label`) are unlayered, so
no utility can break them. The surfaces a call site adds states to (`.ta-card`, `.ta-well`, `.ta-field`,
`.ta-link`) sit in `@layer components`, so a clickable card's `hover:border-…` still applies.

## D8 · A ratchet, not a gate (2026-11-07)

`ds:check` fails only when a file's count of a rule rises above `check-baseline.json`. It started at zero
after the migration, so in practice any new hand-written look or off-scale value fails it; an exception carries
`ds-check: keep (reason)`, and a keep without a reason is ignored. NemTilmeld's checker works the same way.

## D9 · Every colour role resolves to a core step (2026-11-08)

The dark theme's six surfaces and the phone's four contrast fixes were oklch literals written in `themed.css`,
so the core layer was not the one place a colour was written. The neutral ramp gained the steps they needed (450,
550, 800, 850, 875, 925); two dark surfaces 0.005 apart in lightness (overlay and sunken) became one step, a
difference no one could see. The phone's disabled text was 4.3:1 on the sunken track, under the 4.5 its comment
claimed; it now shares muted's step (5.1:1). The dark accent fill on a phone moved to ultramarine-450 (white on it
5.3:1, was 4.7). `fg-accent` was referenced by nothing and is gone. The colours that hold in both themes (the
scrim, the hazard tape, the accent's contrast, the slider's thumb) moved to `semantic.css`, as Axon keeps its
static colours apart.

## D10 · Spacing: a curated set of steps, and the distances that mean something named (2026-11-08)

Tailwind v4 accepts any multiple of the unit, so the grid alone curated nothing: `p-7`, `pl-9`, `py-14` and eleven
`[Npx]` values were in use. Paddings, margins and gaps now take a fixed set of steps (half steps up to 3.5, then
4 5 6 8 10 12, then multiples of 4), checked by `ds:check`. Reading the off-scale ones turned up two distances
with a meaning: `pl-7` fourteen times was always "under a checkbox's label" (`pl-indent`), and `pr-14` was room
for the corner button (`pr-corner`). A tree's indent is computed from `--space-tree-step`.

## D11 · Icons have four sizes, tied to the type beside them (2026-11-08)

Lucide icons were sized nine ways (10 to 20) through `size={…}` and `h-N w-N`. They are now `size-icon-xs` 12,
`-sm` 14, `-md` 16 and `-lg` 18, matched to micro/caption, small/ui, body and title/heading, as a class (CSS beats
the SVG's width attribute). 119 icons moved; most changed by a pixel or none.

## D12 · Motion by role, with reduced motion in the token layer (2026-11-08)

The motion tokens existed, but the library's own CSS used them for 11 of about 40 timings; the rest were written
out (150, 160, 180, 220, 240, 260, 280, 340, 360, 380, 420, 600ms), call sites wrote `duration-300 ease-in-out`,
and JavaScript had its own (Framer seconds, WAAPI 650ms, `"220ms ease"`). Now: core holds durations and curves,
semantic names six roles by what moves, each a duration and a curve with a faster exit (Axon's model), and a call
site writes `motion-glide`, one class, the way a type role is one class. Tailwind's `ease-*` scale is cleared and
`duration-N` is a ds:check hit. Under reduced motion the four roles that move something (glide, travel, arrive,
settle) take 0.01ms in the token layer (NemTilmeld's model, narrowed: fades and feedback keep their time, since
they move nothing), which removed six per-rule reduced-motion blocks and trimmed three. `motion.ts` mirrors the roles for
JavaScript and `motion.test.ts` fails if the two drift.

## D13 · Layers by name above 20, breakpoints written once (2026-11-08)

`z-30` to `z-[1000]` meant five different things. Inside a component, `z-0` to `z-20` stack as before; anything
that covers other parts of the app names a layer (chrome, sheet, modal, menu, popup, cursor) with the numbers it
already had, so no stacking order changed. The catalogue tree's depth stack (it borrowed 12 to 50) is computed
inside its isolated scroller. The phone line `767.98px` was written in seven CSS rules; they read
`theme(--breakpoint-md)` now, so the line exists once.

## D14 · Elevation stays themed, two roles added (2026-11-08)

Considered: shadow geometry written once, with the dark theme as a multiplier on the alphas. The dark/light
ratios of the existing shadows run from 3.6 to 6, so one factor would have visibly changed three of five, and
the slider thumb's shadow (the same in both themes before) would have gone near-black. Each theme keeps its own
values, as NemTilmeld overrides its elevation in dark. Two literal shadows in the library became roles: `handle`
(a thumb, a selected pill) and `lift` (a card under the pointer).

## D15 · A quotation is a rule, not a box (2026-11-09)

A classification's definition sat in a card with an icon and a second copy of the page title, the look of a
notice. AL asked for it as a quote, elegant and not flashy. `.ta-quote` is a 2px rule in the default line colour,
16px in, the secondary ink, 72ch at most: the quietest mark that still sets a passage off, and no fill, so it
reads as part of the page. The words carry typographic quote marks; the type is upright. Two quote looks already
existed by hand (the article renderer's 4px focus-coloured rule in italics, the slides' accent rule) and were left
as they are; moving them onto this class changes how articles and slides look, which is a separate call.


## D16 · `cn()` knows the theme's scales (2026-11-09)

Primary buttons rendered black on blue in light mode. `cn()` ran tailwind-merge with its stock config, which
knows `text-sm` but not `text-ui`, so it read every type role as a colour and kept only the last of
`text-accent-contrast text-ui`. The same merge dropped a size wherever a colour followed it (tabs, dropdowns,
inputs, tooltips, kbd: about 50 calls across both apps), so those controls inherited a larger size. In dark mode
the inherited ink is light, which is why only light mode showed it. `lib/utils/cn.ts` now registers the type
roles, spacing, radius, shadow, blur, tracking and layer names, and `cn.test.ts` reads `tokens/tailwind.css` and
fails when the theme gains a name the merge does not know. The merge's rule that a later size deletes an earlier
`leading-*` is switched off: in Tailwind 4 the leading wins in any order.

## D17 · A popover for choices a list makes long (2026-11-09)

The Tiling Searcher's edge-orbit Dropdown listed every count from 19 to 34 and more, one row each, and AL asked
for the run page's column chart as the picker instead, with a face-orbit picker beside it. A Select's popup only
holds options, so `Popover` wraps Base UI's: the same field button as the Dropdown (its classes moved to
`POPUP_TRIGGER` in `popup.ts`, so the two cannot drift) opening the same `POPUP` paper, with any content inside.
It is meant for a pick that wants a picture, not as a second way to show a plain list.


## D18 · Every text role reads at 4.5:1, accent text has its own role (2026-11-09)

An axe run over both apps (`pnpm a11y`, D16's session) found 695 elements of the atlas and 159 of the Searcher
under WCAG's 4.5:1. Four causes held almost all of them, and each is now fixed at the token, not per element:

- Muted text on the desktop was neutral 500: 3.96:1 on the segmented track, 4.47 on the page. It is neutral 550
  everywhere (5.1:1 on the track), the value phones already had. The phone block keeps only disabled ink.
- Disabled ink was used for text people read (blurbs, counts, empty states, a gutter's line numbers), at 2.2 to
  2.5:1. `text-fg-disabled` is now for a disabled control only; readable text is `text-fg-muted`. A dim option in
  an OptionWall is still a control, so it is muted too, and the options beside it lift to secondary.
- The dark accent was one value for fill and text, and the two pull apart: white on it was 4.4:1, and it as text
  on the dark page 4.2 (3.4 on its own tint). The fill is now ultramarine 450 (white 5.3:1, darkening on hover)
  and accent text is a new role, `--color-text-accent` / `text-fg-accent` (ultramarine 300 in the dark, 5.1:1 on
  every dark surface). This replaces the phone's `.dark .bg-accent` override, which missed fills set by other
  classes (a checked box), and the per-element `oklch(… 0.72 c h)` lifts.
- Text faded with `opacity-*` or `/70` under the muted ink. Gone: muted is the quietest text there is.

`.ta-link` is underlined at rest in a faint accent, so a link in a sentence does not rely on hue alone (WCAG
1.4.1); the pointer darkens the underline.

## D19 · Numbers are picked from a chart of their counts (2026-11-09)

The atlas's filter panel picked k, e, M and t from walls of bare numbers, 22 cells for k alone, with nothing to
say which k holds 10 tilings and which 50,000. AL asked for the Tiling Searcher's column chart there instead.
`ColumnChart` (log-scale columns, counts on hover, pale columns for counts not final, ghost columns behind a
filtered count) and `ColumnPicker` (the chart with "All", where clicking the picked column again also means all)
moved into the library from the Searcher, which now imports them back. Columns always fit their box: in the
300px panel a column of k is about 12px, under WCAG 2.5.8's 24px target. A 24px floor that scrolled the chart
sideways hid k 12 to 22, and AL chose the whole spread over it. A host with room (the Searcher's popovers give
28px) should still give each column 24px.

