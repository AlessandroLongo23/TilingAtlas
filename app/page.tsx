import Link from "next/link";
import { loadLandingData } from "@/lib/services/landingData";
import { HeroRotator } from "@/components/landing/hero-rotator";
import { HeroSpecimenProvider } from "@/components/landing/hero-specimen";
import { LandingButtons } from "@/components/landing/landing-buttons";
import { CollectionCard } from "@/components/landing/collection-card";
import { CompletenessBadge } from "@/components/landing/completeness-badge";
import { LibraryMosaic } from "@/components/landing/library-mosaic";
import { TheoryRing } from "@/components/landing/theory-ring";
import { ParquetMini } from "@/components/landing/parquet-mini";
import { HyperbolicMini, PlayMini, SphericalMini } from "@/components/landing/geometry-minis";
import { HatMini, PenroseMini } from "@/components/landing/coming-soon-minis";
import { UpdatesGate } from "@/components/updates/updates-gate";
import { CURRENT_DATE, CURRENT_VERSION } from "@/lib/updates/entries";

// The landing page (spec: docs/superpowers/specs/2026-07-22-landing-page-design.md).
// Conventional skeleton, catalog material: every visual is a real render from the atlas, every
// number is computed from the atlas files at request time. force-dynamic so each request gets a
// fresh hero specimen and a re-dealt library mosaic.
export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("en-US");

export default async function HomePage() {
	const data = await loadLandingData();
	const { counts } = data;

	return (
		<main className="flex-1 bg-surface text-fg">
			{/* P1+P2 — hero: drifting live specimen rotating through a pool every 10 s with the
			    radial-wave transition, masthead over a legibility scrim, citable caption. */}
			<section className="relative min-h-[520px] h-[68vh] flex items-center overflow-hidden">
				<HeroSpecimenProvider initialId={data.heroPool[0]?.id ?? null}>
					<HeroRotator specimens={data.heroPool} />
					<div
						aria-hidden="true"
						className="absolute inset-y-0 left-0 w-full md:w-[46rem] bg-linear-to-r from-surface via-surface/85 via-55% to-transparent pointer-events-none"
					/>
					<div className="relative z-10 px-6 md:px-12 max-w-2xl">
						<h1 className="text-4xl md:text-5xl font-semibold tracking-tight">The Tiling Atlas</h1>
						<p className="mt-4 text-base md:text-lg text-fg-secondary">
							A catalogue of tilings of the plane, the sphere, and the hyperbolic plane.
						</p>
						<p className="mt-3 text-sm text-fg-secondary">
							<Link href="/library" className="hover:text-fg transition-colors">
								Over {Math.floor(counts.total / 1000) * 1000} tilings
							</Link>
						</p>
						<div className="mt-8">
							<LandingButtons />
						</div>
					</div>
				</HeroSpecimenProvider>
			</section>

			{/* P6 — start here: three quiet deep links for the newcomer. */}
			<section className="border-y border-line-subtle bg-surface-raised/40">
				<p className="max-w-6xl mx-auto px-6 md:px-12 py-3 text-xs text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1">
					<span className="uppercase tracking-wider text-[10px]">Start here</span>
					<span aria-hidden="true" className="mx-1">
						·
					</span>
					<Link href="/theory/uniform-tilings#tilings-vertices-and-notation" className="text-fg-secondary hover:text-fg transition-colors">
						What is a tiling?
					</Link>
					<span aria-hidden="true">·</span>
					<Link href="/theory/uniform-tilings#the-three-regular-tilings" className="text-fg-secondary hover:text-fg transition-colors">
						The eleven uniform tilings
					</Link>
					<span aria-hidden="true">·</span>
					<Link href="/theory/uniform-tilings#why-exactly-eleven" className="text-fg-secondary hover:text-fg transition-colors">
						Why exactly eleven?
					</Link>
				</p>
			</section>

			{/* P3+P4+P5 — the collections: a full-bleed wall, cells split by hairlines only.
			    Mixed cell sizes on a 4×3 field: Play claims 2×2, Parquet 2×1, the other six 1×1 —
			    the one combination that fills twelve cells exactly, so document order alone places
			    the wall with no holes and no explicit grid coordinates. The row track is FIXED,
			    not minmax(…, auto): a media box with an intrinsic aspect (the disk, the
				    ball) inflates an auto row to max-content and the rows stop matching, which is
				    the whole point of a modular wall. Media flexes into what the caption leaves. */}
			<section>
				<h2 className="text-xs uppercase tracking-wider text-fg-muted px-6 md:px-12 pt-10 pb-4">
					The collections
				</h2>
				<div className="ta-wall grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 auto-rows-[22rem] sm:auto-rows-[19rem] lg:auto-rows-[21rem] gap-px border-t border-line-subtle">
					{/* The three live cells (Play, Hyperbolic, Spherical) render the real /play canvases rather
					    than baked stills, so their media takes the drag and the caption below carries the link
					    — see CollectionCard's `interactive`. */}
					<CollectionCard
						title="Play"
						span="2x2"
						interactive
						subtitle={`${fmt(counts.total)} tilings`}
						href={`/play?source=reference&tiling=${encodeURIComponent(data.play.id)}`}
						description="Explore any tiling in the atlas from the interactive viewer."
						badge={<CompletenessBadge tone="complete" label="all three geometries" />}
					>
						<PlayMini cell={data.play.cell} />
					</CollectionCard>

					<CollectionCard
						title="Library"
						subtitle={`${fmt(counts.euclidean)} Euclidean tilings`}
						href="/library"
						description="Every tiling on a filterable shelf: geometry, tile class, symmetry."
						badge={<CompletenessBadge tone="complete" label="complete through k = 6" />}
					>
						<LibraryMosaic tilings={data.mosaic} />
					</CollectionCard>

					<CollectionCard
						title="Theory"
						subtitle="Undersand the concepts"
						href="/theory"
						description="In the theory section, you can learn about the geometric concepts behind tilings."
						badge={<CompletenessBadge tone="proven" label="exactly 11, proven" />}
					>
						<TheoryRing tilings={data.uniformEleven} />
					</CollectionCard>

					<CollectionCard
						title="Parquet deformations"
						span="2x1"
						subtitle=""
						href="/parquet"
						description="Tilings that deform across a strip, in the tradition of Huff and Hofstadter."
						badge={<CompletenessBadge tone="infinite" label="infinite family" />}
					>
						<ParquetMini />
					</CollectionCard>

					<CollectionCard
						title="Hyperbolic"
						interactive={!!data.hyperbolicPatch}
						subtitle={`${fmt(counts.hyperbolic)} tilings`}
						href="/library?geo=hyperbolic"
						description="Tilings of the hyperbolic plane, developed into the Poincaré disk."
						badge={<CompletenessBadge tone="infinite" label="infinite family" />}
					>
						{data.hyperbolicPatch ? (
							<HyperbolicMini patch={data.hyperbolicPatch} data={data.hyperbolicPatchData ?? undefined} />
						) : null}
					</CollectionCard>

					<CollectionCard
						title="Spherical"
						interactive={!!data.sphericalSolid}
						subtitle={`${fmt(counts.spherical)} tilings`}
						href="/library?geo=spherical"
						description="Platonic and Archimedean solids as tilings of the sphere."
						badge={<CompletenessBadge tone="finite" label="finite catalogue" />}
					>
						{data.sphericalSolid ? <SphericalMini solidId={data.sphericalSolid} /> : null}
					</CollectionCard>

					<CollectionCard
						title="Aperiodic"
						subtitle="page not built yet"
						comingSoon
						description="The hat and its relatives. Tilings that never repeat."
						>
						<HatMini />
					</CollectionCard>

					<CollectionCard
						title="Substitution"
						subtitle="page not built yet"
						comingSoon
						description="Penrose and the subdivision families."
						>
						<PenroseMini />
					</CollectionCard>
				</div>
			</section>

			{/* P7 — footer with the citation block. */}
			<footer className="border-t border-line-subtle">
				<div className="max-w-6xl mx-auto px-6 md:px-12 py-8 flex flex-col gap-2 text-xs text-fg-muted">
					{/* The landing page carries no Nav, so this line is the only "what's new" affordance here. */}
					<p>
						Updated{" "}
						{new Date(`${CURRENT_DATE}T00:00:00Z`).toLocaleDateString("en-GB", {
							day: "numeric",
							month: "short",
							timeZone: "UTC",
						})}{" "}
						· v{CURRENT_VERSION} —{" "}
						<Link href="/updates" className="text-accent hover:underline">
							what&rsquo;s new
						</Link>
					</p>
					<p>
						Built by Alessandro Longo as part of an MSc thesis on the enumeration of k-uniform
						tilings. Counts on this page are computed from the atlas data, never typed in.
					</p>
					<p className="font-mono">
						Cite as: A. Longo, <span className="italic">The Tiling Atlas: a catalogue of tilings of the
						plane, the sphere, and the hyperbolic plane</span>, 2026.
					</p>
				</div>
			</footer>

			{/* Mounted here, not in the root layout, so /defense, which is also outside (app),
			    cannot ever pop this mid-talk. */}
			<UpdatesGate />
		</main>
	);
}
