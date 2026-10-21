# Islamic geometric systems

<desktop-only>Every preview on this page is live: click a card to activate it, then drag to pan, scroll to zoom, hold Shift and scroll to rotate, and right-click to reset. The corner buttons expand a card in place or open the tiling in the Play view. In Play, press **I** to turn on the *Islamic construction*: the interlacing star pattern these tessellations were built to carry. It is off by default here, so the underlying tilings can be read on their own first.</desktop-only><phone-only>Every preview on this page is live: tap a card to activate it, then drag to pan, pinch to zoom, twist two fingers to rotate, and double-tap to reset; its Layers button turns on the overlays. Tap Done when you are finished. The corner buttons expand a card in place or open the tiling in the Play view. In Play, tick **Islamic** under View options to turn on the *Islamic construction*: the interlacing star pattern these tessellations were built to carry. It is off by default here, so the underlying tilings can be read on their own first.</phone-only>

## Two things, kept separate

An Islamic geometric pattern is two objects, not one. Underneath is a **tessellation**, a tiling of the plane, often by irregular tiles. On top is the **strapwork**: interlacing lines that cross each tile edge and join across the whole tiling into stars and rosettes. The tessellation is a real tiling in its own right, and this atlas catalogues it as one; the strapwork is an optional overlay.

The method that turns one into the other is old. E. H. Hankin described it in 1925 as *polygons in contact*: at the midpoint of every tile edge, draw two lines making a chosen angle with the edge, and extend each until it meets a line from a neighbouring edge. Craig Kaplan formalised the same idea for the computer (his software Taprats, and his 2005 paper on polygons in contact), and Jay Bonner's *Islamic Geometric Patterns* (2017) reconstructs the historical record around it, calling the underlying tiling the *generative tessellation* and the method the *polygonal technique*. One angle (Bonner's acute, median, or obtuse opening) sets the entire design's character.

Two axes organise the field, and they are independent. The **design system** is the tile set the tessellation is built from; the **pattern family** is how the strapwork crosses each edge. This page is arranged by design system. The pattern family is the Play view's *Islamic Angle* slider (its acute / median / obtuse buttons are Bonner's three openings).

## The regular-polygon system

The oldest and most widespread system uses only regular triangles, squares, hexagons, and dodecagons, laid on the regular and Archimedean grids. Its stars are three-, four-, six-, and twelve-pointed. These tessellations already live in this atlas as the certified Archimedean tilings; here they are the substrate for the classical six- and twelve-point patterns.

<card-grid>
<tiling-card tiling="isl-reg-3.6.3.6" title="3.6.3.6 · trihexagonal"></tiling-card>
<tiling-card tiling="isl-reg-3.4.6.4" title="3.4.6.4 · rhombitrihexagonal"></tiling-card>
<tiling-card tiling="isl-reg-4.6.12" title="4.6.12 · truncated trihexagonal"></tiling-card>
<tiling-card tiling="isl-reg-3.12.12" title="3.12.12 · truncated hexagonal"></tiling-card>
</card-grid>

The dodecagons of the 4.6.12 and 3.12.12 grids carry the twelve-pointed stars that dominate much Seljuk and later work; the hexagons of 3.6.3.6 carry the six-pointed ones.

## Fourfold system A

Bonner's fourfold system A is built around the octagon and the square, with an edge-length ratio of 1 : √2, and produces the eight- and sixteen-pointed stars found almost everywhere: Mamluk Egypt, the Nasrid Alhambra, and beyond. Its base tessellation is the octagon-and-square grid (the truncated-square tiling, 4.8.8). The acute opening on it gives the classic eight-pointed *khatam* star.

<card-grid cols="2">
<tiling-card tiling="isl-4a-488" title="4.8.8 · octagon and square"></tiling-card>
</card-grid>

## Fourfold system B

Bonner's fourfold system B builds on an octagon, a pentagon and two kinds of hexagon, with angles in multiples of 22.5°, and yields a different family of eight-pointed patterns. The representative here is a hexagon on that 22.5° grid that tiles by translation, standing for the system's geometry.

<card-grid cols="2">
<tiling-card tiling="isl-4b-parallelohex" title="Fourfold B · 22.5° grid"></tiling-card>
</card-grid>

## The fivefold system

The fivefold system is the richest, and the heart of Persian, Ilkhanid, and Timurid ornament. Its tiles (the decagon, pentagon, elongated hexagon (*bobbin*), concave hexagon (*bowtie*), and two rhombi) have edges in golden-ratio proportion and all angles multiples of 36°. Lu and Steinhardt's *girih tiles* (2007) are the canonical five-tile subset, decorated so the strapwork joins continuously across every edge.

A periodic tiling cannot have ten-fold rotational symmetry (the crystallographic restriction), so a repeating pattern can never give its decagons their full symmetry. The historical fivefold tilings fill the space between decagons with bobbins and bowties, and that is why they are so elaborate. The three tessellations here are the simplest members, single tiles that tile by translation: the bobbin, the wide rhombus (*torange*) and the bowtie (*sormeh dan*). Turn on the construction in Play to see the fivefold strapwork they carry.

<card-grid cols="3">
<tiling-card tiling="isl-5f-bobbin" title="Bobbin (elongated hexagon)"></tiling-card>
<tiling-card tiling="isl-5f-rhombus" title="Wide rhombus (torange)"></tiling-card>
<tiling-card tiling="isl-5f-bowtie" title="Bowtie (sormeh dan)"></tiling-card>
</card-grid>

The multi-decagon girih tilings (the ones with rings of ten-pointed stars) are harder, because the bowties and bobbins have to bridge between the decagons in exactly the right way. The atlas's combinatorial engine enumerates these directly: run on the five girih tiles, then reconstructed to geometry and reduced to distinct primitive tilings, it yields 4, 23, 55, and 103 of them with one through four vertex orbits. Those tilings (including the classic decagon-and-bowtie pattern) are in the Library and Play views under the fivefold system; turn on the construction there to see the ten-pointed stars.

<card-grid cols="2" caption="Two of the engine's girih tilings with two vertex orbits, both with decagons. Open one in Play and turn on the construction to see its ten-pointed stars.">
<tiling-card tiling="isl-girih-k2-001" title="Girih, k = 2"></tiling-card>
<tiling-card tiling="isl-girih-k2-002" title="Girih, k = 2"></tiling-card>
</card-grid>

## The sevenfold system

Sevenfold patterns are rare; Bonner's book includes nearly every historical example he knows of. The tiles are built on the heptagon and the fourteen-gon, with angles that are multiples of 180/7, and the stars have seven or fourteen points. The representative below is a heptagon-grid tessellation that tiles by translation.

<card-grid cols="2">
<tiling-card tiling="isl-7f-parallelohex" title="Sevenfold · 180/7 grid"></tiling-card>
</card-grid>

## Where the systems came from

The systems map onto history. The earliest Abbasid work (ibn Tulun, Cairo, 876–79) is simple three- and fourfold star patterns. Seljuk builders in eleventh- to thirteenth-century Anatolia and Persia brought the leap in complexity, especially the ten-point patterns. The fivefold system is the Persian heartland (Darb-i Imam (Isfahan, 1453), the Topkapı Scroll) while the Nasrid Alhambra is famous for fourfold and sixfold work carrying many of the seventeen wallpaper groups. Mamluk designers favoured bold medallions with rare sixteen-point stars; Mughal India preferred cleaner, precisely proportioned fields.

One debate is open. Lu and Steinhardt read the fivefold dual-level designs as anticipating quasicrystalline order by five centuries; Bonner and Peter Cromwell argue the historical examples are governed by ordinary translation symmetry. The question is open, and this atlas takes no side on it.

## Turning on the strapwork

<desktop-only>To see any of these as an Islamic pattern instead of a tiling, open it in Play and press **I**. The *Islamic Angle* slider sweeps between Bonner's acute, median, and obtuse openings; the style buttons switch between plain lines and woven interlace. The same tessellation gives a different classical pattern at each opening, which is the whole point of keeping the two objects separate.</desktop-only><phone-only>To see any of these as an Islamic pattern instead of a tiling, open it in Play and tick **Islamic** under View options. The *Islamic Angle* slider sweeps between Bonner's acute, median, and obtuse openings; the style buttons switch between plain lines and woven interlace. The same tessellation gives a different classical pattern at each opening, which is the whole point of keeping the two objects separate.</phone-only>

## References

- E. H. Hankin, *The Drawing of Geometric Patterns in Saracenic Art*, Memoirs of the Archaeological Survey of India 15 (1925).
- C. S. Kaplan, Islamic star patterns from polygons in contact, *Proceedings of Graphics Interface 2005* (2005), 177–185.
- P. J. Lu, P. J. Steinhardt, [Decagonal and quasi-crystalline tilings in medieval Islamic architecture](https://doi.org/10.1126/science.1135491), *Science* 315 (2007), 1106–1110.
- P. R. Cromwell, The search for quasi-periodicity in Islamic 5-fold ornament, *The Mathematical Intelligencer* 31(1) (2009), 36ff.
- J. Bonner, *Islamic Geometric Patterns: Their Historical Development and Traditional Methods of Construction*, Springer (2017).
