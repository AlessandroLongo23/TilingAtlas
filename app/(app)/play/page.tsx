/**
 * /play — the full playground with Canvas + Sidebar + Game of Life lives
 * here. Canvas (750 lines of p5 draw loop) and Sidebar (800 lines of
 * tightly-coupled controls) are intentionally deferred; see
 * components/canvas.tsx and components/sidebar.tsx for the deferral notes.
 *
 * When those land, this page will wire them together just like
 * src/routes/(app)/play/+page.svelte did.
 */
export default function PlayPage() {
	return (
		<div className="flex-1 flex items-center justify-center p-8">
			<div className="max-w-lg text-center space-y-3">
				<h1 className="text-2xl font-medium text-zinc-200">Play</h1>
				<p className="text-sm text-zinc-400">
					The interactive playground (Canvas + Sidebar + Game of Life) is the largest single
					component port and is tracked as deferred work. The data pipeline, stores, rendering
					primitives (useP5, P5Canvas, Chart wrappers), and UI primitives are all in place —
					the remaining work is wiring the ~1500 lines of Canvas + Sidebar to them.
				</p>
			</div>
		</div>
	);
}
