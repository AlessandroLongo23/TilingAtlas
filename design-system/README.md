# The Tiling Atlas design system

One design system for both apps. The Tiling Atlas loads it through `app/globals.css`; the Tiling Searcher
(`tools/searcher/app`) imports the same files from the repo root through its Vite aliases. Nothing is copied,
so a change here lands in both.

```
design-system/
  tokens/        core.css → semantic.css + themed.css → tailwind.css   (the values, then the utilities)
  styles/        base, controls, surfaces, motion, tree                 (the library's CSS classes, .ta-*)
  components/    the React components                                    (import each from its own file)
  motion.ts      the motion roles for JavaScript (Framer Motion, WAAPI)  (motion.test.ts keeps it equal to the CSS)
  check.mjs      pnpm ds:check, and check-baseline.json, its ratchet
  migrate.py     moves code written before the design system onto it
  DECISIONS.md   why the system is the way it is
```

## Principles

- Tokens are the API. A call site names a role (`text-ui`, `bg-surface-raised`, `rounded-control`,
  `shadow-overlay`); it never writes a value. Tailwind's own scales are cleared, so `text-sm`, `rounded-lg`
  and `bg-red-500` generate nothing, and `pnpm ds:check` names them.
- Compact density. This is an instrument for reading data, so interface text is 13px, controls are 32px,
  and the dense range of the type scale steps by one pixel. A phone raises every control to 44px and no text
  below 12px, in the tokens, so no call site carries a phone size of its own.
- One look per job. Every pick-one-of-N is an `OptionWall`, every fold a `Disclosure`, every field a
  `.ta-field`. A look written by hand is a bug: the next change to it reaches the library and misses the copy.
- Extend, never fork. When a screen needs something the library lacks, add it here or give a component the
  parameter it is missing. A local variant of a library piece is how the inconsistencies came back last time.

## Tokens

Four files, each built only from the one before it (`tokens/`):

| Layer | File | Holds | Read by |
| --- | --- | --- | --- |
| Core | `core.css` | raw values: the oklch palette, font sizes, line heights and sizes named by pixel, the 4px unit, radii, durations and curves | semantic and themed only |
| Semantic | `semantic.css` | roles that hold in both themes: type, space, control and icon sizes, radius, motion, layers, the colours that do not change; the phone and reduced-motion overrides | the library, the theme |
| Themed | `themed.css` | colour and elevation roles, light in `:root` and dark under `.dark`; the phone's disabled ink | the library, the theme |
| Theme | `tailwind.css` | the Tailwind theme: every default scale cleared and refilled from the roles, and the `motion-*` utilities | call sites, as utilities |

A core value is only ever read by a role: the library's CSS writes `var(--shadow-handle)`, never a palette step or
a millisecond. Runtime code reads role names too: a canvas reads `var(--color-accent)`, and code that animates
from JavaScript imports `MOTION`, `fmMotion`, `cssMotion` or `SPRING` from `design-system/motion.ts`.

### Type

| Role | Size / line | Tracking | For |
| --- | --- | --- | --- |
| `text-micro` | 10 / 12 | 0 | section labels (`.ta-label`), tags on a thumbnail |
| `text-caption` | 11 / 14 | 0 | meta lines, counts, hints, a table's secondaries |
| `text-small` | 12 / 16 | 0 | dense controls (options, a sidebar's inputs), table cells |
| `text-ui` | 13 / 18 | 0 | the default: rows, buttons, menus, checkboxes |
| `text-body` | 14 / 20 | 0 | sentences in panels and dialogs |
| `text-title` | 16 / 22 | −0.01em | card, panel and dialog titles, a tiling's name |
| `text-reading` | 16 / 26 | 0 | article prose |
| `text-heading` | 18 / 24 | −0.01em | a view's or a section's heading |
| `text-headline` | 24 / 30 | −0.02em | a page title |
| `text-display` | 32 / 38 | −0.025em | a headline number, a page's big statement |
| `text-hero` | 32 to 72 / 0.98 | −0.025em | the landing's title, fluid with the viewport |

Each role sets size, line height and tracking together; weight is separate (`font-normal`, `font-medium`,
`font-semibold`). `leading-none`, `-tight` and `-relaxed` override a role's line height where a one-line badge
or a tight label needs it. On a phone, micro and caption become 12/16 and body 15/22. The body of the page is
`text-ui`, so text that names no role is interface text. A slide that scales with the viewport keeps its own
`text-[clamp(…)]` sizes.

### Colour

Surfaces `bg-surface` (the page), `-raised` (panels, paper), `-chrome`, `-overlay`, `-sunken` (the
segmented track). Text `text-fg`, `-secondary`, `-muted`, `-disabled`, `-inverse`, `-accent`; every text role
but `-disabled` reads at 4.5:1 or more on every surface, and `-disabled` is for a disabled control only, never
for text someone has to read. Lines `border-line-subtle`, `-line`, `-line-strong`, `-line-focus`. The accent
(`accent`, `-hover`, `-active`, `-subtle`, `-contrast`) is the fill, border and stroke of actions; accent text
and links are `text-fg-accent`, lighter than the fill in the dark theme. Statuses: `danger` keeps its red; `success`, `warning` and `info` are ink at different
strengths, because the tilings carry all the colour on this site. Two signal hues, `signal-positive` and
`signal-attention`, are for a small indicator where the hue is the information (a run's dot, a timer); never
for text roles or fills. `caution` is the hazard tape. Three colours stay the same in both themes and live in
`semantic.css`: `bg-scrim` under a dialog or a sheet (with `backdrop-blur-scrim`), `accent-contrast`, and the
slider's thumb.

Every role resolves to a core step; the dark theme's surfaces are neutral 800 to 925, not values of their own.

### Space and size

- **Spacing** is the 4px unit (`p-3` is 12px), on these steps only: `0 px 0.5 1 1.5 2 2.5 3 3.5 4 5 6 8 10 12 16
  20 24 28 32 40 48 64 80 96`. No `p-[5px]`: a value between steps is a step.
- **Named distances:** `pl-indent` (28: content under a checked option starts under its label), `pr-corner`
  (56: a heading's room for the corner button), `--space-tree-step` (16: one level of a tree).
- **Control heights:** `h-control-xs` 24, `-sm` 28, `-md` 32 (the default), `-lg` 36, `-touch` 44.
- **Icons:** `size-icon-xs` 12 (beside micro and caption), `-sm` 14 (small and ui), `-md` 16 (body), `-lg` 18
  (title and heading), as a class on the lucide icon, never `size={…}`.

### Radius and elevation

- **Radius by what carries it:** `rounded-mark` 2 (a chart's bars, a swatch), `-tag` 4, `-control` 6,
  `-surface` 8 (cards, panels, wells), `-overlay` 12 (popovers, dialogs, panels over a canvas), `-sheet` 16
  (large figure frames, sheets), `-pill`.
- **Elevation by what is lifted:** `shadow-raised` (paper on the page), `-handle` (a thumb or a selected pill on
  its track), `-lift` (a card picked up under the pointer), `-float` (a panel over a canvas), `-overlay` (a
  popover), `-modal` (a dialog), `-sheet` (a phone's bottom sheet, casting upward). `drop-shadow-handle` for a
  handle drawn inside a figure; `backdrop-blur-float` for frosted paper.

### Motion

A transition names its role, and the role sets duration and curve together: `transition-[width] motion-glide`.
A bare `transition` or `transition-colors` is feedback. There is no `duration-*` or `ease-*`.

| Role | In / out | Curve | For |
| --- | --- | --- | --- |
| `motion-feedback` | 120 / 120 | out | a state change in place: colour, border, a press, a thumb's swell |
| `motion-floating` | 200 / 150 | out-strong / out | a dialog, a popover or a menu arriving, and the scrim under it |
| `motion-glide` | 240 / 150 | out-strong | something moving inside the page: a pill, a fold, a panel's width |
| `motion-travel` | 360 / 200 | drawer | a sheet or a panel crossing the screen, and what rides on it |
| `motion-arrive` | 360 | out-strong | content that comes once and stays: a toolbar's rise, a grid's cards |
| `motion-settle` | 600 | out-strong | a slow change: a bar growing to new data, a preview drifting |

`animate-pulse` (1600) and `animate-spin` are the two loops. Reduced motion is handled in the tokens: glide,
travel, arrive and settle finish at once, so a call site needs no `motion-reduce:` of its own for them; feedback
and fades keep their time. JavaScript reads the same roles from `motion.ts` and checks reduced motion itself.

### Layers and breakpoints

- **Layers:** `z-0`, `z-10` and `z-20` stack inside a component. What covers other parts of the app names its
  layer: `z-chrome` 30 (controls over a canvas, sticky bars), `z-sheet` 40 (a phone's sheet, its top bar),
  `z-modal` 50 (a dialog, a lifted card, their scrim), `z-menu` 60 (the phone's menu), `z-popup` 400 (dropdowns,
  menus, tooltips: above dialogs), `z-cursor` 1000 (the gamepad cursor).
- **Breakpoints:** `md` is the line between a phone and everything else; `xs` (380) is a small phone; `sm`, `lg`,
  `xl`, `2xl` as Tailwind's. The token layer's own phone rules read `theme(--breakpoint-md)`, so the line is
  written once.

## Components

| Job | Use | Not |
| --- | --- | --- |
| Pick one of N, or several (`multi`) | `OptionWall` (`columns` for a grid, none for a wrapping row; `dense`; an option's `shortcut`, `sub`, `dim`, `title`) | chip rows, rows of `Button`s swapping variants, hand-made `aria-pressed` groups |
| Switch between panels | `Tabs` | `role="tab"` by hand |
| Step through pages | `Pagination` | |
| An action | `Button` (`primary`, `secondary`, `ghost`, `danger`; sizes `xs` 24, `sm` 28, `md` 32, `lg` 36, `icon`, `bar`; `href` renders a link) | a raw `<button>` with its own fill |
| An on/off toggle drawn as a button | `Button pressed={…}` | a hand-styled pressed fill |
| An on/off setting in a panel | `Checkbox` (label, shortcut keycap) | a native checkbox, a second switch style |
| The bar over a canvas | `FloatingToolbar`, `ToolbarButton`, `ToolbarDivider`, `ToolbarReveal` | |
| The canvas's corner buttons | `CornerControls` | |
| A menu of actions | `ActionMenu` (a button) or `ContextMenu` (right click) | |
| Copy to clipboard | `CopyButton` | |
| Text, a number | `Input` | a raw `<input>` |
| Search | `SearchInput` (`aria-label` when there is no visible label; `size="sm"` in a dense sidebar) | |
| One value from a list | `Dropdown` | a native `<select>` |
| A choice a list would make long (columns to click) | `Popover`: a Dropdown's button opening a panel of your own | a popup positioned by hand |
| A number picked by how much each holds (k, orbits) | `ColumnPicker`; the chart alone: `ColumnChart` (`column-chart.tsx`) | an `OptionWall` of numbers with no counts |
| A number on a scale | `Slider` (label and readout), `RangeInput` (the bare track); a range: `IntervalSlider` | a native range input |
| A colour | `ColorPad`, `HueRing` | |
| A labelled control (a settings row) | `Field` (`hint` behind an `InfoDot`, `aside` for an "All" on the label line, `inline`) | the label row by hand |
| A section label | `.ta-label`; with a count: `SectionHeading` | `uppercase tracking-…` by hand |
| A section that folds | `Disclosure` | a chevron and a fold by hand |
| The chevron of anything that folds | `FoldChevron` | `ChevronRight` or `ChevronDown` with its own rotation |
| Show or hide a block with motion | `Reveal` | a height animation of its own |
| A block of content on the page | `.ta-card` | `rounded-… border border-line… bg-…` by hand |
| A definition or a passage quoted on the page | `.ta-quote` (the source line goes inside it) | a card, a tinted box, `border-l-…` by hand |
| The frame around a figure, a preview, a placeholder | `.ta-well` (`rounded-sheet` for a large figure) | the same, tinted, by hand |
| A text box, a select's trigger, a combobox | `.ta-field` (the library's fields already are) | a bordered box by hand |
| A panel over a canvas | `.ta-float` | `bg-surface-raised/95 … shadow ring-1 backdrop-blur` |
| What a dropdown, menu or combobox opens into | `POPUP`, `POPUP_ITEM` (`popup.ts`) with a `HoverPill` inside | the popup's classes copied |
| A dialog | `Modal`; a phone sheet: `bottom-sheet.tsx` | a fixed overlay by hand |
| An error, a warning, a note | `Notice` (`danger`, `warning`, `success`, `info`) | a tinted box by hand |
| Something loading | `Spinner` | `animate-spin` on an icon |
| A link in running text | `.ta-link`; in muted text `.ta-link-quiet` | `text-fg-accent hover:underline` by hand |
| Name a control under the pointer | `Tooltip` (`label`, `shortcut`; `delay` `instant`, `normal` or `late`) | the browser's `title=`, a delay in milliseconds |
| An explanation; a keycap; a tag | `InfoDot`; `Kbd`; `Badge` (status tones; tags `solid`, `ink`, `outline`, `line`, `dashed`, `raised`; `caps`) | a raw `<kbd>`, a `<span>` styled as a tag |
| The selected surface on something that is not a tab | `.ta-tab-on` | the tab's fill and ring copied |

Specialised controls, one job each: `BasisPad`, `HankinPad`, `VelocityPad`, `DiskThumbnail`,
`ThumbnailSkeleton`, `AnimatedNumber`, `SwapIcon`.

Props follow one convention: extra classes through `className`; an accessible name is `aria-label`;
something that opens takes `open` and `onOpenChange`; a value takes `value` and `onChange`, a choice
`selected` and `onChange`. A new component keeps to it.

Motion comes with the components: `HoverPill`, one hover highlight per row or list, gliding from item
to item and taking each item's corner; it is built into the toolbar, the `Dropdown`, the menus, every segmented
control and the nav, and a list of rows drops one in. `SegIndicator`, the segmented control's selection pill
and hover pill. `NavActivePill`, the active link's sliding fill. `Reveal`, the one show and hide.

## Governance

`pnpm ds:check` reads both apps and the library and reports, per rule and per file:

- **tokens:** a text size off the scale, a radius or shadow that is not a role, a colour the theme does not
  define (Tailwind silently generates nothing for one, as it did for `bg-surface-base` on eleven frames), a raw
  colour in a class, a line height, weight or tracking off the set, a duration or curve that is not a motion
  role, a layer by number above 20, a spacing step off the scale, a blur or drop shadow off the set, a
  breakpoint of its own, an icon sized by `size={…}`, motion written out in JavaScript (`"220ms ease"`,
  `ease: [...]`), and a `var(--…)` of a token that does not exist (as `var(--color-bg)` did in five figures);
- **css:** in the library's CSS and the apps' own, a duration, curve, colour, breakpoint or layer written out
  where a token has the role, and a token that does not exist;
- **adoption:** a hand-written copy of a look the library owns.

It fails when any file has more hits of a rule than `check-baseline.json` records, so the count can only fall.
`pnpm ds:check <paths…>` checks just those files; `--files` lists every hit; `--update` writes the baseline,
and is run only after the count went down. A hit that must stay carries `ds-check: keep (the reason)` on its
line or the line above; a keep without a reason is not honoured.

Adding a token: the raw value goes in `core.css`, its role in `semantic.css` or (both blocks of)
`themed.css`, and the utility in `tailwind.css`; then a row in the tables above. Adding a component: one file in
`components/`, built from tokens and the existing pieces, its row in the table, and a call site migrated onto it
in the same change.

## Migrating from before the design system

`python3 design-system/migrate.py <files…>` rewrites classes and imports; `pnpm ds:check <files…>` then lists
what needs a person. The rewrite:

| Before | After |
| --- | --- |
| `text-[9px]`, `[10px]`, `[10.5px]`, `[0.5rem]` to `[0.65rem]` | `text-micro` |
| `text-[11px]`, `[11.5px]`, `[0.7rem]` | `text-caption` |
| `text-xs`, `text-[12px]`, `[12.5px]` | `text-small` |
| `text-[13px]`, `[0.8rem]` | `text-ui` |
| `text-sm`, `text-[14px]` | `text-body` |
| `text-base`, `text-[15px]`, `[16px]` | `text-title` with a font weight in the same class list, `text-reading` without |
| `text-lg`, `text-xl`, `text-[18px]`, `[20px]` | `text-heading` |
| `text-2xl`, `text-[24px]`, `[28px]` | `text-headline` |
| `text-3xl` and up, `text-[30px]` and up | `text-display` (the landing's title: `text-hero`) |
| `max-md:text-xs` beside micro or caption | removed: the role is 12px on a phone |
| `leading-snug` / `leading-normal` / `leading-[1.6…]` beside `text-reading` | `leading-tight` / removed / removed |
| `font-bold` and heavier; `font-light` and lighter | `font-semibold`; `font-normal` |
| `tracking-tighter`, `tracking-[-0.0…em]`; `tracking-wider`, `-widest`, `tracking-[0.1…em]` | `tracking-tight`; `tracking-caps` |
| `rounded`, `rounded-sm`, `rounded-[3px]`, `[4px]`; `rounded-[1px]`, `[2px]` | `rounded-tag`; `rounded-mark` |
| `rounded-md`, `-lg`, `-xl`, `-2xl` (sides too: `rounded-t-md`) | `rounded-control`, `-surface`, `-overlay`, `-sheet` (`rounded-t-control`) |
| `shadow`, `shadow-sm`; `shadow-md`, `-lg`; `shadow-xl`, `-2xl` | `shadow-raised`; `shadow-overlay`; `shadow-modal` |
| `bg-surface-base` (and `text-`, `border-`) | `bg-surface` |
| `@/components/ui/X` | `@/design-system/components/X` |

By hand, because each needs a judgement:

| Before | After |
| --- | --- |
| a stock colour: `red-*`; `green-*`, `emerald-*`; `yellow-*`, `amber-*`; `neutral-*` | `danger`; `signal-positive` on an indicator, else `success`; `signal-attention` on an indicator, else `warning`; a `fg-*` role |
| `SidebarSection`; `Fold` | `Disclosure`; `Reveal show={…}` |
| `ButtonGroup`, `Toggle`; `ToggleButton`; `Switch`; `MultiSelect` | `OptionWall`; `Button pressed`; `Checkbox`; `Field` around an `OptionWall multi` |
| `classes=`; `fullWidth`; `ariaLabel=` | `className=`; `className="w-full"`; `aria-label=` |
| `Modal isOpen`; `SearchInput activeSearch` / `onSearchChange` | `Modal open`; `SearchInput value` / `onChange` |
| `Tooltip delay={0}` and up to 150, `{200}` to `{400}`, `{800}` | `delay="instant"`, the default, `delay="late"` |
| `Button size="sm"` (32px), default (36px) | `size="md"`, the default (32px); `size="lg"` (36px) |
| `--shadow-sm`, `-md`/`-lg`, `-xl`; `--z-tooltip`; `--radius-md`, `-lg`, `-xl` | `--shadow-raised`, `-overlay`, `-modal`; `--z-popup`; `--radius-control`, `-surface`, `-overlay` |
| `duration-150`; `-200`, `-300`; `-500`, `-700` (and the `ease-*` beside them) | `motion-feedback`; `motion-glide` (`motion-travel` for what rides on a sheet, `motion-floating` for a fade in); `motion-settle` |
| `--duration-fast`, `-base`, `-slow`; `--ease-out`, `-out-strong`, `-drawer`, `-standard` | `--duration-feedback`, `-glide`, `-arrive`; `--ease-feedback`, `-glide`, `-travel`, `-pulse` |
| `z-30`, `z-40`, `z-50`, `z-[60]`, `z-[999]`; `z-[var(--z-popup)]` | `z-chrome`, `z-sheet`, `z-modal`, `z-menu`, `z-cursor`; `z-popup` |
| lucide `size={11}`, `{12}`; `{13}`, `{14}`; `{15}`, `{16}`; `{18}`, `{20}`; `h-4 w-4` on an icon | `size-icon-xs`; `-sm`; `-md`; `-lg`; `size-icon-md` |
| `pl-7` under a checkbox; `pr-14` beside the corner button; `p-[5px]` and other px | `pl-indent`; `pr-corner`; the nearest step |
| `bg-black/25` to `/50` with `backdrop-blur-[2px]` under a dialog; `backdrop-blur-sm`; `drop-shadow-sm` | `bg-scrim backdrop-blur-scrim`; `backdrop-blur-float`; `drop-shadow-handle` |
| `max-[380px]:`, `min-[…]:` | `max-xs:`, a named breakpoint |
| Framer `{ duration: 0.25, ease: [...] }`, WAAPI `{ duration: 650, easing }`, `"220ms ease"` | `fmMotion("glide")`, `{ duration: MOTION.settle.ms, easing: cssEase(MOTION.settle.ease) }`, `cssMotion("glide")` |
