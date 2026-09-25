import Link from "next/link";
import { loadLandingData } from "@/lib/services/landingData";
import { HeroRotator } from "@/components/landing/hero-rotator";
import { HeroSpecimenProvider } from "@/components/landing/hero-specimen";
import { LandingButtons } from "@/components/landing/landing-buttons";
import { LandingPhoneNav } from "@/components/landing/landing-phone-nav";
import { CollectionCard } from "@/components/landing/collection-card";
import { CompletenessBadge } from "@/components/landing/completeness-badge";
import { LibraryMosaic } from "@/components/landing/library-mosaic";
import { TheoryRing } from "@/components/landing/theory-ring";
import { ParquetMini } from "@/components/landing/parquet-mini";
import { HatMini, HyperbolicMini, PlayMini, SphericalMini } from "@/components/landing/geometry-minis";
import { IsohedralMini } from "@/components/landing/isohedral-mini";
import { PentagonMini } from "@/components/landing/pentagon-mini";
import { UpdatesGate } from "@/components/updates/updates-gate";
import { CURRENT_DATE, CURRENT_VERSION } from "@/lib/updates/entries";
import { DiscordIcon } from "@/components/icons/discord";
import { DISCORD_INVITE } from "@/lib/constants";
import { APERIODIC_VIEWS } from "@/app/(app)/aperiodic/_views";

// The landing page (spec: docs/superpowers/specs/2026-07-22-landing-page-design.md).
// Conventional skeleton, catalog material: every visual is a real render from the atlas, every
// number is computed from the atlas files at request time. force-dynamic so each request gets a
// fresh hero specimen and a re-dealt library mosaic.
export const dynamic = "force-dynamic";

const START_HERE = [
	["tilings-vertices-and-notation", "What is a tiling?"],
	["the-three-regular-tilings", "The eleven uniform tilings"],
	["why-exactly-eleven", "Why exactly eleven?"],
] as const;

const fmt = (n: number) => n.toLocaleString("en-US");

export default async function HomePage() {
	const data = await loadLandingData();
	const { counts } = data;

	return (
		<main className="flex-1 bg-surface text-fg">
			<LandingPhoneNav />
			{/* One column; sections are separated by 64px of space, not by rules. The grid below sits on
			    the same text edge as the headings. */}
			<div className="mx-auto max-w-7xl px-6 md:px-12">
			{/* P1+P2, hero: the masthead on plain paper, the live specimen framed beside it (below it on
			    a phone), rotating through a pool every 10 s with the radial-wave transition. */}
			<section className="pt-12 lg:pt-16 grid gap-10 lg:gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start">
				<HeroSpecimenProvider initialId={data.heroPool[0]?.id ?? null}>
					<div className="flex flex-col lg:pt-10">
						<p className="ta-label">
							<Link href="/library" className="hover:text-fg transition-colors max-md:inline-flex max-md:min-h-11 max-md:items-center">
								{fmt(counts.total)} tilings
							</Link>
						</p>
						<h1 className="mt-5 text-5xl md:text-6xl xl:text-7xl font-semibold tracking-[-0.035em] leading-[0.98]">
							The Tiling Atlas
						</h1>
						<p className="mt-6 max-w-md text-lg md:text-xl leading-snug text-fg-secondary">
							A catalogue of tilings of the plane, the sphere, and the hyperbolic plane.
						</p>
						<div className="mt-10">
							<LandingButtons />
						</div>
					</div>
					<div className="relative h-80 sm:h-[26rem] lg:h-[34rem] rounded-surface ring-1 ring-line-subtle overflow-hidden">
						<HeroRotator specimens={data.heroPool} />
					</div>
				</HeroSpecimenProvider>
			</section>

			{/* P6, start here: three deep links for the newcomer, as hover chips on one line with the label. */}
			<nav aria-label="Start here" className="mt-8 pt-3 border-t border-line-subtle flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px]">
				<span className="ta-label mr-3">Start here</span>
				{START_HERE.map(([hash, label]) => (
					<Link
						key={hash}
						href={`/theory/uniform-tilings#${hash}`}
						className="inline-flex h-7 items-center px-2.5 rounded-control text-fg hover:bg-surface-overlay hover:text-accent transition-colors max-md:h-11 max-md:text-sm"
					>
						{label}
					</Link>
				))}
			</nav>

			{/* P3+P4+P5, the collections: three rows of four columns, each row one wide card and two
			    square ones, so every row sums to four and document order alone places the grid. The
			    row track is FIXED, not minmax(…, auto): a media box with an intrinsic aspect (the disk,
			    the ball) would inflate an auto row and the rows would stop matching. Media flexes into
			    what the caption leaves, and the caption is the same shape on every card, so each row
			    has one text baseline. */}
			<section className="mt-10">
				<p className="ta-label">Nine collections</p>
				<h2 className="mt-2 mb-6 text-[28px] leading-tight font-semibold tracking-[-0.02em]">The collections</h2>
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 auto-rows-[24rem] sm:auto-rows-[22rem] lg:auto-rows-[23rem] gap-4 max-sm:auto-rows-[21rem]">
					{/* The four live cells (Play, Hyperbolic, Spherical, Aperiodic) render real canvases
					    instead of baked stills, so their media takes the drag and the caption below carries
					    the link — see CollectionCard's `interactive`. */}
					<CollectionCard
						title="Play"
						span="2x1"
						interactive
						subtitle={`${fmt(counts.total)} tilings`}
						href={`/play?source=reference&tiling=${encodeURIComponent(data.play.id)}`}
						description="Explore any tiling in the atlas from the interactive viewer."
						badge={<CompletenessBadge tone="complete" label="3 geometries" />}
					>
						<PlayMini cell={data.play.cell} />
					</CollectionCard>

					<CollectionCard
						title="Library"
						subtitle={`${fmt(counts.euclidean)} Euclidean tilings`}
						href="/library"
						description="Every tiling on a filterable shelf: geometry, tile class, symmetry."
						badge={<CompletenessBadge tone="complete" label="k ≤ 6 complete" />}
					>
						<LibraryMosaic tilings={data.mosaic} />
					</CollectionCard>

					<CollectionCard
						title="Theory"
						subtitle="11 uniform tilings"
						href="/theory"
						description="In the theory section, you can learn about the geometric concepts behind tilings."
						badge={<CompletenessBadge tone="proven" label="11 · proven" />}
					>
						<TheoryRing tilings={data.uniformEleven} />
					</CollectionCard>

					<CollectionCard
						title="Hyperbolic"
						interactive={!!data.hyperbolicPatch}
						subtitle={`${fmt(counts.hyperbolic)} tilings`}
						href="/library?geo=hyperbolic"
						description="Tilings of the hyperbolic plane, developed into the Poincaré disk."
						badge={<CompletenessBadge tone="infinite" label="infinite" />}
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
						badge={<CompletenessBadge tone="finite" label="finite" />}
					>
						{data.sphericalSolid ? <SphericalMini solidId={data.sphericalSolid} /> : null}
					</CollectionCard>

					<CollectionCard
						title="Parquet deformations"
						span="2x1"
						subtitle="1 family, parametric"
						href="/parquet"
						description="Tilings that deform across a strip, in the tradition of Huff and Hofstadter."
						badge={<CompletenessBadge tone="infinite" label="infinite" />}
					>
						<ParquetMini />
					</CollectionCard>

					<CollectionCard
						title="Aperiodic"
						span="2x1"
						interactive
						subtitle={`${APERIODIC_VIEWS.length} constructions`}
						href="/aperiodic?view=hat"
						description="Tilings that never repeat, by substitution and by projection."
						badge={<CompletenessBadge tone="infinite" label="infinite" />}
					>
						<HatMini />
					</CollectionCard>

					<CollectionCard
						title="Isohedral"
						subtitle="93 types, IH1 to IH93"
						href="/isohedral"
						description="Every tiling with one tile up to symmetry, with its corners and edges live."
						badge={<CompletenessBadge tone="proven" label="93 · proven" />}
					>
						<IsohedralMini />
					</CollectionCard>

					<CollectionCard
						title="Pentagons"
						subtitle="15 types"
						href="/pentagons"
						description="The convex pentagons that tile the plane, a list Rao closed in 2017."
						badge={<CompletenessBadge tone="proven" label="15 · proven" />}
					>
						<PentagonMini />
					</CollectionCard>
				</div>
			</section>

			{/* P7 — footer with the citation block. */}
			<footer className="mt-16 border-t border-line-subtle">
				<div className="pt-8 pb-12 flex flex-col gap-2 text-xs text-fg-muted">
					{/* The landing page carries no Nav, so this line is the only "what's new" affordance here. */}
					<p>
						Updated{" "}
						{new Date(`${CURRENT_DATE}T00:00:00Z`).toLocaleDateString("en-GB", {
							day: "numeric",
							month: "short",
							timeZone: "UTC",
						})}{" "}
						· v{CURRENT_VERSION} —{" "}
						<Link href="/updates" className="text-accent hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center">
							what&rsquo;s new
						</Link>
					</p>
					<p>
						Built by Alessandro Longo as part of an MSc thesis on the enumeration of k-uniform
						tilings.
					</p>
					{/* The landing page carries no Nav, so the header's Discord button is repeated here. */}
					<a
						href={DISCORD_INVITE}
						target="_blank"
						rel="noreferrer"
						className="mt-1 inline-flex w-fit items-center gap-1.5 text-fg-secondary hover:text-fg transition-colors max-md:min-h-11 max-md:text-sm"
					>
						<DiscordIcon size={14} />
						Join the Discord
					</a>
				</div>
			</footer>
			</div>

			{/* Mounted here, not in the root layout, so /defense, which is also outside (app),
			    cannot ever pop this mid-talk. */}
			<UpdatesGate />
		</main>
	);
}
