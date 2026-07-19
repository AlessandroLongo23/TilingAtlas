# Tiling spec card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/play` info panel's single tile-count line with a geometry-aware "tiling spec" card that reports symmetry, wallpaper group / lattice / point group, `{p,q}`, vertex orbits `k`, VC types `m` + partition, spherical V/E/F, and flagged rows for edge/tile orbits.

**Architecture:** A pure `buildTilingSpec(selected, symmetryData, orbitData)` in `lib/services/tilingSpec.ts` folds the three existing data sources into one discriminated-union `TilingSpec` (euclidean | hyperbolic | spherical). The play client builds it and threads it through `Canvas` → `TilingInfo` as a `spec` prop. `tiling-info.tsx` becomes a pure presenter that renders only the sections valid for the spec's geometry. Two of the requested facts (edge orbits, tile orbits) have no extraction logic yet, so they render as muted "not computed" rows behind an `EDGE_FACE_ORBITS_ENABLED = false` flag.

**Tech Stack:** TypeScript, React 19, Vitest + jsdom + `@testing-library/react`, Playwright (visual check).

**Spec:** `docs/superpowers/specs/2026-07-19-tiling-spec-card-design.md`

---

## File structure

- `lib/services/catalogueService.ts` (modify) — add `m`, `partition`, `wallpaperGroup`, `latticeShape` to `CatalogueTiling`.
- `lib/services/referenceAtlas.ts` (modify) — `referenceToCatalogue` passes those four fields through.
- `lib/services/tilingSpec.ts` (create) — `TilingSpec` type + `buildTilingSpec` + pure derivations + `EDGE_FACE_ORBITS_ENABLED`.
- `components/tiling-info.tsx` (rewrite) — spec-driven presenter; drops `tileCount`.
- `components/canvas.tsx` (modify) — add `spec` prop, pass to `TilingInfo`, remove dead `tileCount` state.
- `app/(app)/play/_play-client.tsx` (modify) — build `spec`, pass into `Canvas`.
- `tests/reference-to-catalogue.test.ts` (create), `tests/tiling-spec.test.ts` (create), `tests/tiling-info.render.test.tsx` (create).

---

## Task 1: Carry the vertex-type + wallpaper fields through to the play client

The four build-computed fields exist on `ReferenceTiling` but `referenceToCatalogue` drops them and `CatalogueTiling` has no slot for them. Add the slots and the pass-through.

**Files:**
- Modify: `lib/services/catalogueService.ts:13-41` (the `CatalogueTiling` interface)
- Modify: `lib/services/referenceAtlas.ts:321-337` (`referenceToCatalogue`)
- Test: `tests/reference-to-catalogue.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/reference-to-catalogue.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { referenceToCatalogue, type ReferenceTiling } from "@/lib/services/referenceAtlas";

const stub = (over: Partial<ReferenceTiling>): ReferenceTiling => ({
	id: "t-test",
	source: "galebach",
	k: 7,
	family: "3.4.6.12",
	renderCell: {} as ReferenceTiling["renderCell"],
	discoverer: "Galebach",
	...over,
});

describe("referenceToCatalogue vertex-type + wallpaper pass-through", () => {
	it("carries m, partition, wallpaperGroup, latticeShape", () => {
		const c = referenceToCatalogue(
			stub({ m: 3, partition: [5, 1, 1], wallpaperGroup: "p6m", latticeShape: "hexagonal" }),
		);
		expect(c.m).toBe(3);
		expect(c.partition).toEqual([5, 1, 1]);
		expect(c.wallpaperGroup).toBe("p6m");
		expect(c.latticeShape).toBe("hexagonal");
	});

	it("leaves them undefined when the source omits them", () => {
		const c = referenceToCatalogue(stub({}));
		expect(c.m).toBeUndefined();
		expect(c.wallpaperGroup).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/reference-to-catalogue.test.ts`
Expected: FAIL — `c.m` etc. are `undefined` because `referenceToCatalogue` doesn't copy them (and TS errors that `m` is not on `CatalogueTiling`).

- [ ] **Step 3: Add the four fields to `CatalogueTiling`**

In `lib/services/catalogueService.ts`, add this import near the other type imports at the top of the file:

```ts
import type { WallpaperGroup, LatticeShape } from "@/lib/classes/symmetry/types";
```

Then inside the `CatalogueTiling` interface, immediately before the closing `}` (after the `geometry?` field at line ~40), add:

```ts
	// Vertex-type classification carried through from ReferenceTiling (build-computed). k (above) counts
	// vertex ORBITS; m counts DISTINCT vertex configurations among them (m ≤ k); partition is their
	// multiplicities, descending, summing to k. Absent when the source has no per-orbit config data.
	m?: number;
	partition?: number[];
	// Exact wallpaper classification — REGULAR Euclidean tilings only (star tiles are non-convex ⇒ omitted,
	// NOTES §9.4). Absent for star tilings and for every hyperbolic/spherical entry.
	wallpaperGroup?: WallpaperGroup;
	latticeShape?: LatticeShape;
```

- [ ] **Step 4: Pass the fields through in `referenceToCatalogue`**

In `lib/services/referenceAtlas.ts`, inside the object returned by `referenceToCatalogue`, add after the `geometry: r.geometry,` line:

```ts
		m: r.m,
		partition: r.partition,
		wallpaperGroup: r.wallpaperGroup,
		latticeShape: r.latticeShape,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/reference-to-catalogue.test.ts`
Expected: PASS (both tests).

- [ ] **Step 6: Commit**

```bash
git add lib/services/catalogueService.ts lib/services/referenceAtlas.ts tests/reference-to-catalogue.test.ts
git commit -m "feat(play): carry m/partition/wallpaperGroup/latticeShape into CatalogueTiling"
```

---

## Task 2: The `buildTilingSpec` pure function

All derivation logic lives here — geometry split, orbifold from `{p,q}`, spherical point group + V/E/F via Euler, source preference for the Euclidean wallpaper fields.

**Files:**
- Create: `lib/services/tilingSpec.ts`
- Test: `tests/tiling-spec.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tiling-spec.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildTilingSpec } from "@/lib/services/tilingSpec";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import type { SymmetryData } from "@/lib/classes/symmetry/types";

const base = { certified: false as const, runIds: [] as string[], renderCell: null };

const euclid: CatalogueTiling = {
	...base,
	canonicalKey: "t123",
	k: 7,
	family: "3.4.6.12",
	m: 3,
	partition: [5, 1, 1],
	wallpaperGroup: "p6m",
	latticeShape: "hexagonal",
};

describe("buildTilingSpec", () => {
	it("euclidean: derives orbifold from the group, carries k/m/partition, flags orbits", () => {
		const spec = buildTilingSpec(euclid, null, { k: 7, orbitAt: () => -1 });
		expect(spec.geometry).toBe("euclidean");
		if (spec.geometry !== "euclidean") throw new Error("geometry");
		expect(spec.label).toBe("3.4.6.12");
		expect(spec.wallpaperGroup).toBe("p6m");
		expect(spec.orbifold).toBe("*632");
		expect(spec.latticeShape).toBe("hexagonal");
		expect(spec.k).toBe(7);
		expect(spec.m).toBe(3);
		expect(spec.partition).toEqual([5, 1, 1]);
		expect(spec.edgeOrbits).toBeNull();
		expect(spec.faceOrbits).toBeNull();
	});

	it("euclidean: live symmetryData overrides the build-computed group/lattice", () => {
		const sd = { group: "p4m", orbifold: "*442", latticeShape: "square" } as unknown as SymmetryData;
		const spec = buildTilingSpec(euclid, sd, null);
		if (spec.geometry !== "euclidean") throw new Error("geometry");
		expect(spec.wallpaperGroup).toBe("p4m");
		expect(spec.orbifold).toBe("*442");
		expect(spec.latticeShape).toBe("square");
	});

	it("hyperbolic: Coxeter + orbifold from {p,q}", () => {
		const t: CatalogueTiling = {
			...base,
			canonicalKey: "h",
			k: 1,
			family: "{7,3}",
			wythoff: { p: 7, q: 3, rings: [true, false, false] },
		};
		const spec = buildTilingSpec(t, null, null);
		if (spec.geometry !== "hyperbolic") throw new Error("geometry");
		expect(spec.label).toBe("{7,3}");
		expect(spec.coxeter).toBe("[7,3]");
		expect(spec.orbifold).toBe("*732");
		expect(spec.rings).toEqual([true, false, false]);
		expect(spec.snub).toBe(false);
	});

	it("spherical Platonic: point group + V/E/F via Euler", () => {
		const t: CatalogueTiling = {
			...base,
			canonicalKey: "s",
			k: 1,
			family: "5.5.5",
			spherical: { p: 5, q: 3, solid: "dodecahedron" },
		};
		const spec = buildTilingSpec(t, null, null);
		if (spec.geometry !== "spherical") throw new Error("geometry");
		expect(spec.label).toBe("{5,3}");
		expect(spec.solidName).toBe("Dodecahedron");
		expect(spec.pointGroup).toBe("Ih");
		expect(spec.orbifold).toBe("*532");
		expect(spec.counts).toEqual({ V: 20, E: 30, F: 12 });
	});

	it("spherical Archimedean: solid name only, no {p,q}, no counts", () => {
		const t: CatalogueTiling = {
			...base,
			canonicalKey: "a",
			k: 1,
			family: "3.6.6",
			spherical: { solid: "truncated-tetrahedron" },
		};
		const spec = buildTilingSpec(t, null, null);
		if (spec.geometry !== "spherical") throw new Error("geometry");
		expect(spec.label).toBe("3.6.6");
		expect(spec.solidName).toBe("Truncated tetrahedron");
		expect(spec.pointGroup).toBeNull();
		expect(spec.counts).toBeNull();
	});

	it("V/E/F for the other four Platonic solids", () => {
		const mk = (p: number, q: number, solid: string): CatalogueTiling => ({
			...base, canonicalKey: solid, k: 1, family: "x", spherical: { p, q, solid },
		});
		const cube = buildTilingSpec(mk(4, 3, "cube"), null, null);
		const octa = buildTilingSpec(mk(3, 4, "octahedron"), null, null);
		const tetra = buildTilingSpec(mk(3, 3, "tetrahedron"), null, null);
		const icosa = buildTilingSpec(mk(3, 5, "icosahedron"), null, null);
		if (cube.geometry !== "spherical" || octa.geometry !== "spherical") throw new Error();
		if (tetra.geometry !== "spherical" || icosa.geometry !== "spherical") throw new Error();
		expect(cube.counts).toEqual({ V: 8, E: 12, F: 6 });
		expect(octa.counts).toEqual({ V: 6, E: 12, F: 8 });
		expect(tetra.counts).toEqual({ V: 4, E: 6, F: 4 });
		expect(icosa.counts).toEqual({ V: 12, E: 30, F: 20 });
		expect(cube.pointGroup).toBe("Oh");
		expect(tetra.pointGroup).toBe("Td");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/tiling-spec.test.ts`
Expected: FAIL — `Cannot find module '@/lib/services/tilingSpec'`.

- [ ] **Step 3: Write the implementation**

Create `lib/services/tilingSpec.ts`:

```ts
// Pure fold of the three tiling data sources (the selected CatalogueTiling, the live exact symmetry
// analysis, the live vertex-orbit count) into one geometry-tagged spec object for the /play info card.
// No React, no side effects — the presenter (components/tiling-info.tsx) never re-decides which fields
// apply. Geometry-specific facts (orbifold, spherical V/E/F, point group) are derived here from {p,q}.
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import type { SymmetryData } from "@/lib/classes/symmetry/types";
import type { OrbitData } from "@/lib/services/orbitsFromExactSource";
import { ORBIFOLD_SIGNATURE } from "@/lib/classes/symmetry/types";
import { geometryOf } from "@/lib/services/referenceAtlas";

// Edge- and tile-orbit extraction does not exist yet (AL owns that logic). Until it does, buildTilingSpec
// leaves both fields null and the card renders a muted "not computed" row. When the extractor lands, fill
// the two fields in buildTilingSpec and flip this to true — one boolean plus one function, no layout change.
export const EDGE_FACE_ORBITS_ENABLED = false;

export interface OrbitCounts {
	/** Vertex orbits (= k for a k-uniform tiling). */
	k: number | null;
	/** Distinct vertex-configuration types among the k orbits (m ≤ k). */
	m: number | null;
	/** Multiplicities of the m types, descending, summing to k (e.g. [5,1,1] at k=7, m=3). */
	partition: number[] | null;
	/** Edge orbits — null until EDGE_FACE_ORBITS_ENABLED and the extractor land. */
	edgeOrbits: number | null;
	/** Tile/face orbits — null until the extractor lands. */
	faceOrbits: number | null;
}

interface BaseSpec extends OrbitCounts {
	/** Headline label: a vertex-config string ("3.4.6.12") or a Schläfli symbol ("{7,3}"). */
	label: string;
}

export interface EuclideanSpec extends BaseSpec {
	geometry: "euclidean";
	wallpaperGroup: string | null; // e.g. "p6m"
	orbifold: string | null; // Conway signature, e.g. "*632"
	latticeShape: string | null; // e.g. "hexagonal"
}

export interface HyperbolicSpec extends BaseSpec {
	geometry: "hyperbolic";
	coxeter: string; // "[7,3]"
	orbifold: string; // full reflection group, "*732"
	rings: [boolean, boolean, boolean]; // Coxeter–Dynkin ring states
	snub: boolean;
}

export interface SphericalSpec extends BaseSpec {
	geometry: "spherical";
	solidName: string; // "Dodecahedron", "Truncated tetrahedron"
	pointGroup: string | null; // Td/Oh/Ih — Platonic {p,q} only
	orbifold: string | null; // "*532" — Platonic only
	counts: { V: number; E: number; F: number } | null; // Platonic only
}

export type TilingSpec = EuclideanSpec | HyperbolicSpec | SphericalSpec;

// Conway orbifold of the full reflection group of a regular {p,q}: the (2,p,q) triangle's three orders,
// sorted descending, prefixed with *. {7,3}->"*732", {5,3}->"*532", {4,3}->"*432".
function reflectionOrbifold(p: number, q: number): string {
	return "*" + [p, q, 2].sort((a, b) => b - a).join("");
}

// Named polyhedral point group of a Platonic {p,q}; the five solids fall into three groups.
function platonicPointGroup(p: number, q: number): string | null {
	const key = `${Math.min(p, q)}${Math.max(p, q)}`; // orientation-independent {p,q}
	if (key === "33") return "Td"; // tetrahedron
	if (key === "34") return "Oh"; // cube / octahedron
	if (key === "35") return "Ih"; // dodecahedron / icosahedron
	return null;
}

// V/E/F of a regular polyhedron {p,q}: pF=2E, qV=2E, V-E+F=2 ⇒ E = 2pq/(2p+2q-pq). Returns null unless
// the case is spherical (denom > 0) and the counts come out as positive integers.
function platonicCounts(p: number, q: number): { V: number; E: number; F: number } | null {
	const denom = 2 * p + 2 * q - p * q;
	if (denom <= 0) return null;
	const E = (2 * p * q) / denom;
	const V = (4 * p) / denom;
	const F = (4 * q) / denom;
	if (!Number.isInteger(E) || !Number.isInteger(V) || !Number.isInteger(F)) return null;
	return { V, E, F };
}

// "truncated-tetrahedron" -> "Truncated tetrahedron"; "cube" -> "Cube".
function prettySolid(id: string): string {
	const s = id.replace(/-/g, " ");
	return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildTilingSpec(
	selected: CatalogueTiling,
	symmetryData: SymmetryData | null,
	orbitData: OrbitData | null,
): TilingSpec {
	const base: OrbitCounts = {
		k: orbitData?.k ?? selected.k ?? null,
		m: selected.m ?? null,
		partition: selected.partition ?? null,
		edgeOrbits: null, // flagged — see EDGE_FACE_ORBITS_ENABLED
		faceOrbits: null,
	};

	const geometry = geometryOf(selected);

	if (geometry === "spherical" && selected.spherical) {
		const { p, q, solid } = selected.spherical;
		const platonic = p != null && q != null;
		return {
			geometry: "spherical",
			label: platonic ? `{${p},${q}}` : selected.family,
			solidName: prettySolid(solid),
			pointGroup: platonic ? platonicPointGroup(p, q) : null,
			orbifold: platonic ? reflectionOrbifold(p, q) : null,
			counts: platonic ? platonicCounts(p, q) : null,
			...base,
		};
	}

	if (geometry === "hyperbolic" && selected.wythoff) {
		const { p, q, rings, snub } = selected.wythoff;
		return {
			geometry: "hyperbolic",
			label: `{${p},${q}}`,
			coxeter: `[${p},${q}]`,
			orbifold: reflectionOrbifold(p, q),
			rings,
			snub: !!snub,
			...base,
		};
	}

	// Euclidean. Prefer the live exact symmetry analysis; fall back to the build-computed fields; derive
	// the orbifold from whichever group we have if the analysis didn't supply one.
	const wallpaperGroup = symmetryData?.group ?? selected.wallpaperGroup ?? null;
	const orbifold =
		symmetryData?.orbifold ?? (wallpaperGroup ? ORBIFOLD_SIGNATURE[wallpaperGroup] : null);
	const latticeShape = symmetryData?.latticeShape ?? selected.latticeShape ?? null;
	return {
		geometry: "euclidean",
		label: selected.family,
		wallpaperGroup,
		orbifold,
		latticeShape,
		...base,
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/tiling-spec.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/services/tilingSpec.ts tests/tiling-spec.test.ts
git commit -m "feat(play): buildTilingSpec — geometry-aware tiling spec fold"
```

---

## Task 3: Rewrite `tiling-info.tsx` as a spec-driven presenter

The panel becomes pure: it renders the sections the spec carries, hides sections that don't apply to the geometry, keeps the Euclidean-only VC thumbnails, and drops the tile-count line entirely.

**Files:**
- Rewrite: `components/tiling-info.tsx`
- Test: `tests/tiling-info.render.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/tiling-info.render.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TilingInfo } from "@/components/tiling-info";
import type { TilingSpec } from "@/lib/services/tilingSpec";

const orbits = { k: 1, m: null, partition: null, edgeOrbits: null, faceOrbits: null };

function hover() {
	fireEvent.mouseEnter(screen.getByRole("group", { name: "Tiling information" }));
}

describe("TilingInfo spec card", () => {
	it("euclidean: shows wallpaper group, orbifold, lattice, k/m and no tile-count line", () => {
		const spec: TilingSpec = {
			geometry: "euclidean",
			label: "3.4.6.12",
			wallpaperGroup: "p6m",
			orbifold: "*632",
			latticeShape: "hexagonal",
			k: 7,
			m: 3,
			partition: [5, 1, 1],
			edgeOrbits: null,
			faceOrbits: null,
		};
		render(<TilingInfo spec={spec} />);
		hover();
		expect(screen.getByText("p6m")).toBeInTheDocument();
		expect(screen.getByText("*632")).toBeInTheDocument();
		expect(screen.getByText("hexagonal")).toBeInTheDocument();
		expect(screen.getByText("Vertices (k)")).toBeInTheDocument();
		expect(screen.getByText("3 [5·1·1]")).toBeInTheDocument();
		expect(screen.queryByText(/tiles in view/i)).not.toBeInTheDocument();
		// edge/tile orbits flagged
		expect(screen.getAllByText("not computed").length).toBe(2);
	});

	it("hyperbolic: shows Coxeter group + orbifold, no lattice", () => {
		const spec: TilingSpec = {
			geometry: "hyperbolic",
			label: "{7,3}",
			coxeter: "[7,3]",
			orbifold: "*732",
			rings: [true, false, false],
			snub: false,
			...orbits,
		};
		render(<TilingInfo spec={spec} />);
		hover();
		expect(screen.getByText("[7,3]")).toBeInTheDocument();
		expect(screen.getByText("*732")).toBeInTheDocument();
		expect(screen.queryByText("Lattice")).not.toBeInTheDocument();
	});

	it("spherical Platonic: shows point group and V/E/F", () => {
		const spec: TilingSpec = {
			geometry: "spherical",
			label: "{5,3}",
			solidName: "Dodecahedron",
			pointGroup: "Ih",
			orbifold: "*532",
			counts: { V: 20, E: 30, F: 12 },
			...orbits,
		};
		render(<TilingInfo spec={spec} />);
		hover();
		expect(screen.getByText("Dodecahedron")).toBeInTheDocument();
		expect(screen.getByText("Ih")).toBeInTheDocument();
		expect(screen.getByText("Vertices")).toBeInTheDocument();
		expect(screen.getByText("30")).toBeInTheDocument();
	});

	it("renders nothing expanded until hovered", () => {
		const spec: TilingSpec = {
			geometry: "hyperbolic", label: "{7,3}", coxeter: "[7,3]", orbifold: "*732",
			rings: [true, false, false], snub: false, ...orbits,
		};
		render(<TilingInfo spec={spec} />);
		expect(screen.queryByText("[7,3]")).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/tiling-info.render.test.tsx`
Expected: FAIL — the current `TilingInfo` takes `tileCount`/`vcs`, has no `spec` prop, and renders a "Tiles" line, so the group-name query and content assertions fail (or a TS error on the `spec` prop).

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `components/tiling-info.tsx` with:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import type { VCWithOccurrences } from "@/classes/Tiling";
import type { TilingSpec } from "@/lib/services/tilingSpec";
import { VertexConfigurationThumbnail } from "./vertex-configuration-thumbnail";
import { Button } from "./ui/button";

interface TilingInfoProps {
	spec: TilingSpec | null;
	/** Euclidean vertex-configuration thumbnails, computed by the flat canvas. Empty for other geometries. */
	vcs?: VCWithOccurrences[];
}

const GEOMETRY_LABEL: Record<TilingSpec["geometry"], string> = {
	euclidean: "Euclidean",
	hyperbolic: "Hyperbolic",
	spherical: "Spherical",
};

function SectionTitle({ children }: { children: ReactNode }) {
	return <h4 className="text-xs font-medium text-fg-muted uppercase tracking-wider">{children}</h4>;
}

// One "Label   value" row. `muted` renders a de-emphasised placeholder for a not-yet-computed field.
function Row({ label, value, muted }: { label: string; value: ReactNode; muted?: boolean }) {
	return (
		<div className="flex items-center justify-between gap-4">
			<span className="text-sm text-fg-secondary">{label}</span>
			<span className={muted ? "text-sm italic text-fg-muted/60" : "text-sm font-medium text-fg"}>
				{value}
			</span>
		</div>
	);
}

// Three Coxeter–Dynkin nodes; filled when the corresponding mirror is ringed (active).
function RingDiagram({ rings }: { rings: [boolean, boolean, boolean] }) {
	return (
		<span className="inline-flex items-center gap-0.5 font-mono">
			{rings.map((on, i) => (
				<span key={i}>{on ? "●" : "○"}</span>
			))}
		</span>
	);
}

// Orbit section — shown for every geometry. m is hidden when absent; edge/tile orbits are flagged.
function OrbitSection({ spec }: { spec: TilingSpec }) {
	return (
		<div className="flex flex-col gap-1.5">
			<SectionTitle>Orbits</SectionTitle>
			<Row label="Vertices (k)" value={spec.k ?? "—"} />
			{spec.m != null ? (
				<Row
					label="VC types (m)"
					value={spec.partition ? `${spec.m} [${spec.partition.join("·")}]` : String(spec.m)}
				/>
			) : null}
			<Row label="Edge orbits" value={spec.edgeOrbits ?? "not computed"} muted={spec.edgeOrbits == null} />
			<Row label="Tile orbits" value={spec.faceOrbits ?? "not computed"} muted={spec.faceOrbits == null} />
		</div>
	);
}

export function TilingInfo({ spec, vcs = [] }: TilingInfoProps) {
	const [isHovered, setIsHovered] = useState(false);

	return (
		<div
			className="relative"
			role="group"
			aria-label="Tiling information"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<Button variant="secondary" size="icon" icon={Info} aria-label="Tiling information" />

			{isHovered && spec ? (
				<div className="absolute left-0 top-10 z-50 min-w-56 max-w-[340px] rounded-lg border border-line bg-surface-overlay/95 p-3 shadow-xl backdrop-blur-sm">
					<div className="flex flex-col gap-3">
						{/* Header: Schläfli / vertex-config label + geometry (+ solid name for spherical) */}
						<div className="flex flex-col gap-0.5">
							<div className="flex items-baseline justify-between gap-3">
								<span className="font-mono text-sm font-semibold text-fg">{spec.label}</span>
								<span className="text-xs text-fg-muted">{GEOMETRY_LABEL[spec.geometry]}</span>
							</div>
							{spec.geometry === "spherical" ? (
								<span className="text-xs text-fg-secondary">{spec.solidName}</span>
							) : null}
						</div>

						{/* Symmetry — Euclidean */}
						{spec.geometry === "euclidean" && (spec.wallpaperGroup || spec.latticeShape) ? (
							<div className="flex flex-col gap-1.5 border-t border-line pt-3">
								<SectionTitle>Symmetry</SectionTitle>
								{spec.wallpaperGroup ? (
									<Row
										label="Group"
										value={
											<span className="font-mono">
												<span>{spec.wallpaperGroup}</span>
												{spec.orbifold ? <span className="ml-1.5 text-fg-muted">{spec.orbifold}</span> : null}
											</span>
										}
									/>
								) : null}
								{spec.latticeShape ? (
									<Row label="Lattice" value={<span className="capitalize">{spec.latticeShape}</span>} />
								) : null}
							</div>
						) : null}

						{/* Symmetry — Hyperbolic */}
						{spec.geometry === "hyperbolic" ? (
							<div className="flex flex-col gap-1.5 border-t border-line pt-3">
								<SectionTitle>Symmetry</SectionTitle>
								<Row
									label="Group"
									value={
										<span className="font-mono">
											<span>{spec.coxeter}</span>
											<span className="ml-1.5 text-fg-muted">{spec.orbifold}</span>
										</span>
									}
								/>
								<Row label="Coxeter–Dynkin" value={<RingDiagram rings={spec.rings} />} />
								{spec.snub ? <Row label="Form" value="snub" /> : null}
							</div>
						) : null}

						{/* Symmetry — Spherical (Platonic only) */}
						{spec.geometry === "spherical" && spec.pointGroup ? (
							<div className="flex flex-col gap-1.5 border-t border-line pt-3">
								<SectionTitle>Symmetry</SectionTitle>
								<Row
									label="Point group"
									value={
										<span className="font-mono">
											<span>{spec.pointGroup}</span>
											{spec.orbifold ? <span className="ml-1.5 text-fg-muted">{spec.orbifold}</span> : null}
										</span>
									}
								/>
							</div>
						) : null}

						{/* Counts — Spherical (Platonic only) */}
						{spec.geometry === "spherical" && spec.counts ? (
							<div className="flex flex-col gap-1.5 border-t border-line pt-3">
								<SectionTitle>Counts (V − E + F = 2)</SectionTitle>
								<Row label="Vertices" value={spec.counts.V} />
								<Row label="Edges" value={spec.counts.E} />
								<Row label="Faces" value={spec.counts.F} />
							</div>
						) : null}

						{/* Orbits — every geometry */}
						<div className="border-t border-line pt-3">
							<OrbitSection spec={spec} />
						</div>

						{/* Vertex-configuration thumbnails — Euclidean only */}
						{spec.geometry === "euclidean" && vcs.length > 0 ? (
							<div className="border-t border-line pt-3">
								<SectionTitle>Vertex configurations</SectionTitle>
								<div className="mt-2 flex flex-wrap gap-3">
									{vcs.map(({ vc, occurrences }, i) => (
										<div key={vc.name + i} className="w-24 shrink-0">
											<VertexConfigurationThumbnail
												vc={vc}
												size={96}
												showName
												showOccurrences
												occurrences={occurrences}
											/>
										</div>
									))}
								</div>
							</div>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/tiling-info.render.test.tsx`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add components/tiling-info.tsx tests/tiling-info.render.test.tsx
git commit -m "feat(play): tiling-info spec card — geometry-aware presenter"
```

---

## Task 4: Wire the spec through Canvas and the play client

Feed the card its `spec` from the play client (which holds `selected`, `symmetryData`, `orbitData`), and remove the now-dead `tileCount` plumbing in the canvas.

**Files:**
- Modify: `components/canvas.tsx` (props ~63-74, destructure ~174-183, dead state at ~197 and ~278, update block ~445-450, JSX ~1025)
- Modify: `app/(app)/play/_play-client.tsx` (imports, spec memo, `<Canvas>` props ~486-495)

- [ ] **Step 1: Add the `spec` prop to Canvas**

In `components/canvas.tsx`, add the import alongside the other type imports near the top:

```ts
import type { TilingSpec } from "@/lib/services/tilingSpec";
```

In the `CanvasProps` interface, add after `orbitData?: OrbitData | null;`:

```ts
	/** Geometry-aware spec for the info card (built in the play client). Null while loading. */
	spec?: TilingSpec | null;
```

In the `Canvas({ ... })` destructure, add after `orbitData = null,`:

```ts
	spec = null,
```

- [ ] **Step 2: Remove the dead `tileCount` state and swap the JSX**

In `components/canvas.tsx`:

Delete the line `const prevTileCountRef = useRef(-1);` (near line 197).

Delete the line `const [tileCount, setTileCount] = useState(0);` (near line 278).

Replace the update block (near lines 445-450):

```ts
						// The tile-count + VC overlay is informational; re-render it only when the numbers
						// actually change, so a slider drag doesn't re-render the overlay every frame for nothing.
						if (t.nodes.length !== prevTileCountRef.current) {
							prevTileCountRef.current = t.nodes.length;
							setTileCount(t.nodes.length);
						}
						const nextVcs = t.vcs ?? [];
```

with:

```ts
						// The VC overlay is informational; re-render it only when the configs actually change,
						// so a slider drag doesn't re-render the overlay every frame for nothing.
						const nextVcs = t.vcs ?? [];
```

Replace the JSX (near line 1025):

```tsx
				<TilingInfo tileCount={tileCount} vcs={vcs} />
```

with:

```tsx
				<TilingInfo spec={spec} vcs={vcs} />
```

- [ ] **Step 3: Build the spec in the play client and pass it down**

In `app/(app)/play/_play-client.tsx`, add the import near the other `@/lib/services` imports:

```ts
import { buildTilingSpec } from "@/lib/services/tilingSpec";
```

After the `const orbitData = useVertexOrbits(selected);` line (near line 240), add:

```ts
	// The geometry-aware spec for the info card. Rebuilt only when the selection or its live analyses
	// change — never per frame. Null while nothing is selected.
	const tilingSpec = useMemo(
		() => (selected ? buildTilingSpec(selected, symmetryData, orbitData) : null),
		[selected, symmetryData, orbitData],
	);
```

In the `<Canvas ... />` element (near lines 486-495), add the prop after `orbitData={orbitData}`:

```tsx
					spec={tilingSpec}
```

- [ ] **Step 4: Verify types and the full build**

Run: `pnpm tsc --noEmit`
Expected: no errors. (Confirms `tileCount` is truly gone and `spec` threads cleanly.)

Run: `pnpm build`
Expected: build completes with no errors or new warnings.

- [ ] **Step 5: Run the full test suite**

Run: `pnpm test`
Expected: PASS, including the three new files. No previously-passing test regresses.

- [ ] **Step 6: Commit**

```bash
git add components/canvas.tsx "app/(app)/play/_play-client.tsx"
git commit -m "feat(play): wire tiling spec card through Canvas; drop tile-count line"
```

---

## Task 5: Visual verification across the three geometries

Confirm the card renders correctly against the real running app for one tiling per geometry.

**Files:** none (verification only).

- [ ] **Step 1: Ensure the dev server is up**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/play` — if not `200`, start it with `pnpm dev` (reuse any running instance; Next 16 refuses a second dev server for the same dir).

- [ ] **Step 2: Capture the Euclidean card**

Drive the app to a Euclidean tiling and hover the info button, then screenshot. Run:

```bash
node scripts/visual-check.mjs --url "http://localhost:3000/play" \
  --setup "document.querySelector('[aria-label=\"Tiling information\"]')?.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true}))" \
  --wait 400 --out /tmp/spec-euclid.png
```

Then Read `/tmp/spec-euclid.png` and confirm: header label + "Euclidean", a Symmetry section (group + orbifold + lattice), an Orbits section with k and the two muted "not computed" rows, and no "tiles in view" line.

- [ ] **Step 3: Capture the Hyperbolic and Spherical cards**

Switch geometry (the play client's geometry toggle, or deep-link to a hyperbolic/spherical tiling), hover, and capture each. For each, Read the PNG and confirm the geometry-appropriate sections: hyperbolic shows the Coxeter group + ring diagram and no lattice; spherical shows the solid name, point group, and the V/E/F counts block.

If a card shows a wrong or empty section for its geometry, fix `tiling-info.tsx` (presentation) or `buildTilingSpec` (data) and re-capture before proceeding.

- [ ] **Step 4: Final commit (only if Step 3 required fixes)**

```bash
git add -A
git commit -m "fix(play): tiling spec card visual adjustments"
```

---

## Notes for the implementer

- The `m`, `partition`, `wallpaperGroup`, `latticeShape` fields may be sparsely populated in the shipped atlas JSON. The pass-through (Task 1) is correct regardless; where a field is absent the card hides that row (m) or falls back (wallpaper group/lattice hidden if both null). Do not fabricate values.
- Edge orbits and tile orbits are intentionally unimplemented. Leave them null and the flag `false`. AL fills the extraction later; the UI is ready.
- Spherical V/E/F and point group resolve for Platonic entries only (they carry `spherical.p`/`q`). Archimedean entries carry only `solid` + `family`, so the card shows the solid name and the vertex-config label without the counts/point-group blocks — this is the approved behavior, not a bug.
- Keep the hover interaction and the `Info` trigger button unchanged; only the expanded content changes.
```
