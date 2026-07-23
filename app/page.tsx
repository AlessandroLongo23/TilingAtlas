import Link from "next/link";
import { loadLandingData } from "@/lib/services/landingData";
import { HeroRotator } from "@/components/landing/hero-rotator";
import { LandingButtons } from "@/components/landing/landing-buttons";
import { CollectionCard } from "@/components/landing/collection-card";
import { CompletenessBadge } from "@/components/landing/completeness-badge";
import { LibraryMosaic } from "@/components/landing/library-mosaic";
import { TheoryRing } from "@/components/landing/theory-ring";
import { ParquetMini } from "@/components/landing/parquet-mini";
import { HyperbolicMini, SphericalMini } from "@/components/landing/geometry-minis";
import { HatMini, PenroseMini } from "@/components/landing/coming-soon-minis";
import { InteractiveTilingPreviewCard } from "@/components/interactive-tiling-preview-card";

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
					<CollectionCard
						title="Play"
						span="2x2"
						titleHref="/play"
						blurb="Pan, zoom and rotate any tiling in the catalogue. This patch is live: click it, then drag."
						count={`${fmt(counts.total)} tilings`}
						badge={<CompletenessBadge tone="complete" label="all three geometries" />}
					>
						<InteractiveTilingPreviewCard
							cell={data.play.cell}
							tilingId={data.play.id}
							title="4.6.12, the truncated trihexagonal tiling"
							homePeriods={5}
							className="w-full h-full rounded-none border-0"
						/>
					</CollectionCard>

					<CollectionCard
						title="Library"
						href="/library"
						blurb="Every tiling on a filterable shelf: geometry, tile class, symmetry."
						count={`${fmt(counts.euclidean)} Euclidean tilings`}
						badge={<CompletenessBadge tone="complete" label="complete through k = 6" />}
					>
						<LibraryMosaic tilings={data.mosaic} />
					</CollectionCard>

					<CollectionCard
						title="Theory"
						href="/theory"
						blurb="Why the angles must fit, and why exactly eleven uniform tilings exist."
						count="the 11 uniform tilings"
						badge={<CompletenessBadge tone="proven" label="exactly 11, proven" />}
					>
						<TheoryRing tilings={data.uniformEleven} />
					</CollectionCard>

					<CollectionCard
						title="Parquet"
						span="2x1"
						href="/parquet"
						blurb="Tilings that deform across a strip, in the tradition of Huff and Hofstadter."
						count="deformations"
						badge={<CompletenessBadge tone="infinite" label="infinite family" />}
					>
						<ParquetMini />
					</CollectionCard>

					<CollectionCard
						title="Hyperbolic"
						href="/library?geo=hyperbolic"
						blurb="Tilings of the hyperbolic plane, developed into the Poincaré disk."
						count={`${fmt(counts.hyperbolic)} tilings`}
						badge={<CompletenessBadge tone="infinite" label="infinite family" />}
					>
						{data.hyperbolicPatch ? <HyperbolicMini patch={data.hyperbolicPatch} /> : null}
					</CollectionCard>

					<CollectionCard
						title="Spherical"
						href="/library?geo=spherical"
						blurb="Platonic and Archimedean solids as tilings of the sphere."
						count={`${fmt(counts.spherical)} tilings`}
						badge={<CompletenessBadge tone="finite" label="finite catalogue" />}
					>
						{data.sphericalSolid ? <SphericalMini solidId={data.sphericalSolid} /> : null}
					</CollectionCard>

					<CollectionCard
						title="Aperiodic"
						comingSoon
						blurb="The hat and its relatives. Tilings that never repeat."
						count="in preparation"
					>
						<HatMini />
					</CollectionCard>

					<CollectionCard
						title="Substitution"
						comingSoon
						blurb="Penrose and the subdivision families."
						count="in preparation"
					>
						<PenroseMini />
					</CollectionCard>
				</div>
			</section>

			{/* P7 — footer with the citation block. */}
			<footer className="border-t border-line-subtle">
				<div className="max-w-6xl mx-auto px-6 md:px-12 py-8 flex flex-col gap-2 text-xs text-fg-muted">
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
		</main>
	);
}
