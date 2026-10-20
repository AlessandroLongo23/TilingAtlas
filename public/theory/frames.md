# Frames

A frame is a region that a single tile covers in exactly two ways, where no copy of the tile sits in the same place in both. Swap one tiling for the other and every tile moves. The idea, the name and the search that finds them come from Craig Knecht, who posted them to The Tiling List in October 2026; the credits are at the end of this page.

<frame-figure set="iamond5" shape="0" frame="0" caption="The smallest frame of the P pentiamond: two copies, tiled two ways. Switch between the tilings, or overlay them: every tile of tiling 2 (dashed) cuts across tiles of tiling 1.">
</frame-figure>

## Two tilings, nothing in common

The definition has two conditions, and both matter.

**Exactly two tilings.** Many regions have several tilings. A frame has two and no more, so it is the smallest place where the tile has a choice to make.

**No tile in common.** If the two tilings shared a tile, that tile would play no part in the choice: remove it and the rest is a smaller region with the same two tilings. Requiring every tile to move means the region is the choice and nothing else.

Holes are allowed. A frame can be a ring, or a region with several holes, as long as the tile covers it in exactly these two ways.

<frame-figure set="iamond5" shape="0" frame="2" caption="A P-pentiamond frame of three tiles around a single-triangle hole. The hole is part of the frame's shape: fill it, and the region is no longer tileable at all.">
</frame-figure>

## The smallest flips

Take any two tilings of any region and look at where they differ. Wherever the tiles disagree, the two tilings cover the same cells in two different ways, and those cells fall apart into pieces that can be swapped independently. The minimal such pieces are what the search on this page collects: regions where swapping is all-or-nothing.

This is the language of *local moves*. A set of local moves connects the tilings of a region if any tiling can be turned into any other by swapping one small patch at a time. For dominoes, William Thurston showed in 1990 that one move suffices on every simply connected region: turn a 2×2 square of two dominoes by a quarter turn. Lozenges have the same property with the three-lozenge hexagon. The census agrees, and it is a good check on it: of the 9,786 domino frames the atlas holds, exactly one has no hole, the 2×2 square, and of the 58 lozenge frames exactly one has no hole, the hexagon. Every other frame of those two tiles has a hole, and on regions with holes the flips are known not to suffice.

<frame-figure set="omino2" shape="0" frame="4" caption="A domino frame: four dominoes around a one-cell hole. Fill the hole and the region has nine cells, which no set of dominoes can cover.">
</frame-figure>

For most tiles nothing like Thurston's theorem is known. Igor Pak's survey of tile invariants (2003) calls it the *local move property* and remarks how few sets of tiles are known to have it. Frames show directly when a tile cannot have it, as the section on infinite series below explains.

## Fundamental polyads

The same objects appeared in physics. Greg Huber, Craig Knecht, Walter Trump and Robert Ziff, studying random tilings of large sphinx-shaped regions, needed moves that change one tiling of a region into another without ever producing an invalid state. They called a hole-free polyiamond tileable by sphinxes a *polyad*, and a polyad a *fundamental polyad* when its tilings split into two sets with no sphinx in the same position across them. Their Monte Carlo simulation picks a polyad, finds it in the current tiling, and replaces it by another of its tilings.

A frame is a stricter cousin: exactly two tilings instead of two families, and holes allowed. Knecht's search for frames grew out of a search for the fundamental polyads of the hat tile; when Dave Smith asked on the list how the hat examples related to polyads, Dale Walton asked whether they were really "fundamental holes", and Knecht answered that he had been looking at frames with two tilings and no tile in the same position.

## How the search works

Knecht's *overlap-debt* search builds both tilings at once.

1. Put one tile of tiling 1 on the lowest cell of the region to be found. That cell has to be covered by some tile of each tiling, and its lowest cell can only be this one.
2. Every cell covered by one tiling and not yet by the other is a **debt**: the other tiling must pay it. Take the debt with the fewest ways to be paid, and try each tile of the owing tiling that covers it, overlaps nothing of its own tiling, and is not a tile the other tiling already has.
3. When no debt is left, both tilings cover the same region with no tile in common. Count all the tilings of that region and keep it if there are exactly two.

The search never decides the region in advance: the region is whatever the debts close up into. It stops at the first closure because a frame cannot contain a smaller closed pair (swapping that pair alone would be a third tiling), and that is why it is complete. The figure replays the search on a five-tile frame of the P pentiamond.

<debt-figure set="iamond5" shape="0" frame="36" caption="The overlap-debt search building a five-tile frame of the P pentiamond. Filled tiles are tiling 1, dashed tiles tiling 2, and red is debt: covered by one tiling and not yet by the other. Each step pays the lowest debt.">
</debt-figure>

The atlas runs the same search in C++ on all ten grids of Craig Kaplan's heesch-sat. Two of its changes are mathematical. The two tilings play symmetric roles, so the search only follows the order in which tiling 1's tile on the lowest cell has the smaller orientation, which halves it. And the bound on the number of tiles is checked before a tile is placed: how a tile changes the debts depends only on how many of its cells the other tiling already covers, so a tile that would break the bound is never tried. On every grid and every size checked, it returns the same frames as the original program and as an independent brute-force enumeration.

## Infinite series

Some frames come in families. Cut a frame across with a straight line along the grid, pull the two halves apart by one period, and fill the gap with a copy of the slab the cut passed through. If the result is again a frame, and so is the next one, the frame may start an infinite series.

Knecht's program proves such series instead of guessing them. Each member is tiled slab by slab, and away from the two ends every slab looks the same, so the number of tilings of the k-th member is a fixed matrix raised to the k-th power. A sequence like that obeys a linear recurrence whose length is bounded by the size of the matrix, so checking enough consecutive members proves the count is two for all of them. The same is done for pairs of tilings with no tile in common.

A proved series has a sharp consequence. Its k-th member has exactly two tilings, and they share no tile, so the only way to get from one to the other is to replace every tile at once. As k grows, that replacement grows without bound, so no finite set of local moves can connect all the tilings of that tile. For the P pentiamond, Frame Finder proves 54 such series from the frames of up to five tiles. The atlas checked every one of them directly, by counting the tilings of each member up to the twelfth.

## The census

The [frames explorer](/frames) holds every frame of at most N tiles a tiling, for every free polyform of each size from 2 cells up, on each of the ten grids: 1,822,452 frames on 1,856 of 3,666 shapes. The number N is the same for every shape of a size, and it is stated with each set, the way the uniform-tiling shelves state how far in k they reach. Small tiles reach N = 12; pentiamonds stop at 7 and tetrahexes at 5, where the next N would have taken too long or produced more than 200,000 frames.

The same lists hold the regions the search closes that turn out to have more than two tilings: 2,387,962 of them, with up to 918 tilings each. Each carries a pair of tilings with no tile in common and no smaller closed pair inside it, which is what the overlap-debt search builds, and the explorer draws every tiling the region has. These are not frames, and the search does not find every region with three or more tilings: a region where every pair of tilings shares a tile, or splits into smaller closed pairs, is never reached. They are counted by a second run with its own N, stated with each set; on fifteen sets it reaches one or two tiles less than the frames do. With them the explorer holds 4,210,414 regions on 1,878 shapes.

<atlas-figure src="/theory/images/frames/kite.png" caption="A frame of an 8-kite, the size of the hat, with a hole in the middle. Tiling 1 on the left, tiling 2 on the right.">
</atlas-figure>

<atlas-figure src="/theory/images/frames/bevelhex.png" caption="A frame on the 4.6.12 grid: twelve-sided cells joined by squares and hexagons, ten tiles in each tiling.">
</atlas-figure>

On seven of the grids (kites, drafters, abolos, half-Cairo, octasquare, trihex and bevelhex), copies are placed on the grid only. A region listed there may have further tilings that use copies off the grid, so on those grids a frame is a frame of the grid-aligned tile.

## Credits

**Craig Knecht** posed the question of frames with two disjoint tilings, found the overlap-debt search, and published *Frame Finder*, the program that finds frames and proves their infinite series, on The Tiling List: "finding all the fundamental polyads for the polyiamonds" (1 October 2026), "Hat Tile Fundamental Polyads" (11–13 October 2026) and "A GUI program that finds frames that have two disjoint tilings for a tile" (18 October 2026). He wrote that the program itself was written by an AI assistant from his ideas.

**Walter Trump**'s tiling program prints every tiling of a frame; it is what Knecht used to find the first fundamental polyads, and Frame Finder's interface, with its frame designer and tiles coloured by orientation, follows it, in Knecht's words.

**Greg Huber, Craig Knecht, Walter Trump and Robert M. Ziff** introduced fundamental polyads. **Dave Smith** and **Dale Walton** discussed the hat examples on the list.

The census here was computed by the atlas, with the grids of **Craig S. Kaplan**'s heesch-sat.

## References

- G. Huber, C. Knecht, W. Trump, R. M. Ziff, [Entropy and chirality in sphinx tilings](https://doi.org/10.1103/PhysRevResearch.6.013227), *Physical Review Research* 6, 013227 (2024). [arXiv:2304.14388](https://arxiv.org/abs/2304.14388), first posted as "Riddles of the sphinx tilings".
- W. P. Thurston, Conway's tiling groups, *American Mathematical Monthly* 97 (1990), 757–773.
- J. H. Conway, J. C. Lagarias, Tiling with polyominoes and combinatorial group theory, *Journal of Combinatorial Theory, Series A* 53 (1990), 183–208.
- I. Pak, [Tile invariants: new horizons](https://www.math.ucla.edu/~pak/papers/tilesurvey.pdf), *Theoretical Computer Science* (2003).
- C. S. Kaplan, [heesch-sat](https://github.com/isohedral/heesch-sat), the grids and polyform enumeration used for the census.
- [The Tiling List](https://groups.google.com/g/tiling), the threads named under Credits.
