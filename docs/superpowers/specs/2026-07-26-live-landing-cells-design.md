# Live landing cells — design (2026-07-26)

AL: make the Hyperbolic and Spherical cards on the landing page draggable/zoomable "with the same
controls we have in the play page", and split the card so the figure is interactive and the block
below it carries the link — the 2×2 Play cell too, with live media.

## What each card needed

| cell | renderer | starting point |
|---|---|---|
| Play (2×2) | `FlatCellRenderer` | the /theory preview card's pipeline, extracted to a hook |
| Hyperbolic | per-pixel WebGL2 disk | reads pan/rotation from the GLOBAL store — needed a local input path |
| Spherical | three.js + ArcballControls | already owns its input — needed only an on/off gate |

Controls match /play exactly. Play: drag pans, wheel zooms toward the cursor, Shift+wheel spins in 5°
detents, right-click resets. Hyperbolic: drag pans (Möbius translation), bare wheel rotates in
detents (the disk has no zoom), click centres the tile under the cursor, right-click recentres.
Spherical: drag spins the trackball, wheel dollies.

## Decisions

**The link moves to the caption.** A drag that begins inside an `<a>` fires the navigation on release,
so a whole-card link and interactive media cannot coexist. `CollectionCard` gains `interactive`: the
frame becomes a plain `div` and `href` moves onto the caption block. The dead `titleHref` prop is
removed. Interactive cards also lose the rest-state desaturation — that exists to make a still read
as a still.

**Click to activate.** Every live cell is inert until clicked; Esc or blur releases it. Focus *is* the
activation, so exclusivity across cards is free. This is what keeps the landing page scrollable: a
wheel handler that zooms must `preventDefault`. Touch rides the same switch via `touch-action`, so a
swipe on a phone scrolls until the reader has claimed the card.

**Per-instance view state, never the global store.** /play's controls live in the configuration store;
a landing card writing there would carry its pan into /play. The hyperbolic canvas takes an optional
`input` prop (offset, targetOffset, rotationDeg, resetSeq, click) and resolves those four values once
per frame from either source. Absent, /play's path is byte-for-byte what it was. Reset and click are
sequence counters, not flags — two owners of one object would race over clearing a consumed flag.

**Shared code, not copied code.** The /theory card's GL lifecycle became
`lib/hooks/useFlatCellPreview.ts`; both it and the landing Play cell call it. `stepCardControls` gained
a `pivotOffsetOnRotate` argument for the disk, which must not get the pivot-about-centre compensation
(it applies rotation inside its own Möbius map; canvas.tsx skips the same step).

**Home zoom.** `homePeriods` fits N lattice periods across the surface — right for a card showing one
named tiling, wrong for a surface showing whatever the atlas dealt, where a large k=7 cell asks for a
zoom below `ZOOM_MIN` and clamps to dense texture. The hook takes an optional fixed `homeZoom` in px
per tile edge; the Play cell passes 44, matching the thumbnail it replaced.

**Kill the 9.9 MB fetch.** The card was pulling all 28,453 developed records to read one. A record is
343 bytes at the median, so the generator inlines the 64 pool records into the bundled payload and the
chosen one goes down as a prop.

## Verification

Playwright, against the running app: wheeling over an inert card scrolls the page (scrollY 0 → 300);
after a click, drag and wheel each change canvas pixels on all three cells; zero fetches of
`hyperbolic-developed.json`; no console errors. /theory's 11 preview cards still drag and expand after
the extraction. All three caption links navigate.

## Not fixed

`SphericalCanvas` reads hue/wireframe/Islamic flags from the global store, so a client-side
back-navigation from /play with Islamic on renders the landing sphere as a star pattern. Every
thumbnail on the page already does this; the store is not persisted, so a fresh load is clean.
