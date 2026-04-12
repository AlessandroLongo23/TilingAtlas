import Link from "next/link";
import { Home, BookOpen } from "lucide-react";

export default function NotFound() {
	return (
		<div
			className="min-h-screen flex items-center justify-center p-8"
			style={{
				background: "linear-gradient(135deg, #18181b 0%, #27272a 50%, #18181b 100%)",
			}}
		>
			<div className="max-w-md w-full text-center p-10 rounded-2xl border border-zinc-700/50 bg-zinc-800/60 backdrop-blur-xl shadow-2xl">
				<div className="mb-6">
					<span className="inline-flex items-center justify-center w-16 h-16 text-2xl font-bold text-green-400/90 bg-green-400/10 rounded-xl border border-green-400/20">
						404
					</span>
				</div>
				<h1 className="text-3xl font-semibold text-zinc-50 mb-2 tracking-tight">Page not found</h1>
				<p className="text-zinc-400 mb-2 leading-relaxed">
					The page you&rsquo;re looking for doesn&rsquo;t exist or has been moved.
				</p>
				<p className="text-zinc-600 text-xs mb-8">Check the URL or use the links below to navigate.</p>
				<div className="flex flex-col sm:flex-row gap-3 justify-center">
					<Link
						href="/play"
						className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-green-700/90 text-white font-medium text-sm border border-green-700/50 hover:bg-green-700 transition-all"
					>
						<Home size={18} />
						<span>Go to Play</span>
					</Link>
					<Link
						href="/theory"
						className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-zinc-700/50 text-zinc-200 font-medium text-sm border border-zinc-700/80 hover:bg-zinc-700/70 transition-all"
					>
						<BookOpen size={18} />
						<span>Go to Theory</span>
					</Link>
				</div>
			</div>
		</div>
	);
}
