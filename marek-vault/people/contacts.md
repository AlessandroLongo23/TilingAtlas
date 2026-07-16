---
type: people
tags: [people, contacts]
status: from-chat
sources: ["archive/2026-07-13", "archive/2026-07-14", "archive/2026-07-15"]
---

# People: who to contact, how, and why

Everyone who came up in the chat, sorted by what I should do about them.

## Act now

### Brian Galebach
- **Who:** enumerated k-uniform tilings to k=7 before Marek; his method was similar to STS "at least
  that's what he said" but he never got past 7 and never published it. Marek broke his record and they
  compared notes. My thesis cites him as [20]. Last Marek heard, he had ideas about constrained
  tilings he wanted to search for.
- **How:** email **galebachb@ProbabilitySports.com** (it's also on his website, probabilitysports.com).
- **Why / opener:** Marek explicitly said "I suggest you do. Tell him I say hi." Ask about his method
  (why it stalled at 7 is an open mystery, Marek never figured it out) and his constrained-tilings
  ideas. ![[archive/2026-07-14#^msg-1526656989197766656]]

### Zeno / Eryk (ZenoRogue)
- **Who:** author of HyperRogue and the tes-catalog; holds a university position; 10+ years on
  rendering non-Euclidean geometry. Contributed the automatic duplicate detection to STS
  ([[canonical-form]]) and is a co-author of the Čtrnáct et al. paper my thesis cites. Marek uses
  "Eryk" and "Zeno" for the same person (publicly: Eryk Kopczyński; confirm with Marek).
- **How:** the **HyperRogue Discord server** (invite Marek sent: https://discord.gg/j4FRmSWW).
  No introduction needed: "just tell him you're talking with me."
  YouTube: https://www.youtube.com/@ZenoRogue · site: https://roguetemple.com/z/hyper/
- **Why:** three separate reasons.
  1. **Before writing more renderer code, read his docs** — hyperboloid-model coordinates projected
     to 2D, the tree-based tiling representation with unique tile codes, and his pages on the
     floating-point precision problem (which is much worse in hyperbolic projections). Marek:
     "it would prevent you from reinventing the wheel." ![[archive/2026-07-15#^msg-1526875394777677865]]
  2. Ask about **combining his tes-catalog with the Tiling Atlas** (Marek raised it, not me).
     https://zenorogue.github.io/tes-catalog/?c=H%2F
  3. He may have **pedagogy ideas** for the tutorial layer, given the university position.
- Also: camera/continuous-pan questions in HyperRogue are his territory, and citing "Čtrnáct et al."
  properly is another reason to talk. ![[archive/2026-07-14#^msg-1526661604853284967]]

### HyperRogue Discord, #tessellations channel
- **What:** post the TilingAtlas repo link there (Marek suggested it). He can also share it in
  Illustrating Mathematics, or invite me there. ![[archive/2026-07-15#^msg-1526921207713104002]]

### The "secret tilings mailing list"
- **What:** Marek offered access; I gave him longoa02@gmail.com for it. The hat-tiling authors were in
  this group and got the discovery news early. **Status: waiting on Marek.**
  ![[archive/2026-07-14#^msg-1526627802902823124]]

## Via Marek, later

### Chaim Goodman-Strauss
- **Who:** central figure of the tilings community (Marek spells it "Goodmann-Strauss"); currently focused on
  the hat tiling / aperiodic monotiles, so he "lets Marek work alone" on k-uniform. Cited Marek's work
  in *The Magic Theorem*. Co-introduced the doily notation the [[conway-symbol]] extends.
- **Why:** Marek thinks he "might have some ideas about a publication on hyperbolic tiling." That's a
  future conversation, probably with Marek in the loop. ![[archive/2026-07-14#^msg-1526655038712189061]]

### Arun
- **Who:** resolved when periodic 4-valent hyperbolic tilings cannot exist (arXiv:2302.05661; Marek
  helped with the paper). Surname not given in chat.
- **Why:** the paper carries an unproven hypothesis (Marek believes ≥5-valent always has a periodic
  solution). Read the paper first: https://arxiv.org/pdf/2302.05661

## Context only (no action)

- **Griffin** — third author of the paper; wrote the actual C++ implementation of STS (private GitHub
  repo; Marek has access and shares files on request). Disappeared years ago; the memory management
  is his code and Marek doesn't understand it. Practical consequence: engine changes start from the
  files Marek sends, not from a maintained upstream. ![[archive/2026-07-14#^msg-1526661659462991883]]
- **Branko Grünbaum** — originally enumerated k=3; *Tilings and Patterns* co-author. Marek once asked
  him about the 14-Archimedean-tiling exercise in his book; Grünbaum answered that reaching it "would
  not be that hard, but much uglier than my solution." Died 2018, historical only.
  ![[archive/2026-07-14#^msg-1526653532198015078]]
- **Joseph Myers** — hand-enumerated k=1 and k=2 star tilings (the oracle list my star search checks
  against; I found two tilings + an infinite family missing from it for k=2). Also a hat-paper author.
- **The hat-tiling authors** (Smith, Myers, Kaplan, Goodman-Strauss) — all were in the tiling group;
  Marek knew of the hat before the public did.
- **The origami artist** — unnamed, in the Illustrating Mathematics Discord; makes origami tessellation
  pictures. Marek built her a custom searcher (even-degree vertices, convex tiles only), a nice example
  of STS constraint flexibility ([[main-cpp-workflow]]).
- **"One guy in the HyperRogue server"** — believes flag orbits must be the base elements for a >2D
  version of STS. Relevant to the 3D extension ([[marek-list-of-ideas]]).
  ![[archive/2026-07-14#^msg-1526662609921900575]]

## Marek himself

- Discord **Marek14**; Czech Republic (CET). Hobbyist mathematician since high school (late '90s);
  earns his living translating books (latest: a book on Studio Ghibli films; currently between
  projects, "vacation mode"). Not a coder by his own account: he edits `main.cpp` variants and writes
  the Python converters, but the core implementation was Griffin's and the Rust hybrid finder is
  another implementation he drives. Tried college repeatedly, the administration overwhelmed him.
  "Way too disorganized to publish" by himself, which is exactly the gap I offered to fill (and he
  welcomed: "That would be great, yes").
- Name: čtrnáct = Czech for "fourteen" (https://en.wiktionary.org/wiki/čtrnáct). At my defense:
  explain it once, then "just call me Marek."
- Permission granted to cite the unpublished paper in the thesis. He read the whole thesis in a day
  and sent detailed comments (archive 2026-07-14 evening).
- "**ferkval**" is named after the Czech name of Snorkmaiden from the Moomins; he suggested
  "snorkval" to internationalise the joke. No one is supposed to guess this.
  ![[archive/2026-07-14#^msg-1526692145065623705]]

## Related

[[roadmap]] · [[canonical-form]] · [[00-start-here]]
