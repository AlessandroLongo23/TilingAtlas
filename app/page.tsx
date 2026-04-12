import Link from "next/link";

/**
 * Landing page. Source used the full Canvas as an animated background,
 * which is deferred to the /play route port. Here we render a static
 * gradient version of the hero card.
 */
export default function HomePage() {
	return (
		<div className="w-full h-full relative min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-950 to-black">
			<div className="w-full h-full flex items-center justify-center p-4">
				<div className="relative max-w-md w-full rounded-lg overflow-hidden backdrop-blur-md shadow-xl border border-zinc-700/50 bg-zinc-800/40">
					<div className="absolute inset-0 bg-gradient-to-br from-zinc-800/50 via-zinc-900/50 to-black/50" />
					<div className="relative z-10 p-8 md:p-10">
						<h1 className="text-white/90 text-3xl md:text-4xl font-medium tracking-tight">
							Welcome to <span className="font-bold text-green-400">Tiling Atlas</span>
						</h1>
						<p className="mt-3 text-zinc-300 text-sm md:text-base font-light">
							Explore the beauty of cellular automata on a variety of interactive tiling patterns
						</p>
						<div className="mt-8 flex flex-col gap-3">
							<Link
								href="/play"
								className="w-full inline-flex items-center justify-center h-10 px-6 text-sm font-medium bg-green-700 hover:bg-green-800 active:bg-green-900 text-white rounded-md transition-all duration-200 ease-in-out"
							>
								Start Exploring
							</Link>
							<div className="flex gap-2">
								<Link
									href="/library"
									className="flex-1 inline-flex items-center justify-center h-9 px-4 text-sm font-medium bg-zinc-700/60 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors border border-zinc-600/40"
								>
									Library
								</Link>
								<Link
									href="/lab"
									className="flex-1 inline-flex items-center justify-center h-9 px-4 text-sm font-medium bg-zinc-700/60 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors border border-zinc-600/40"
								>
									Lab
								</Link>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
