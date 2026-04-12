/**
 * Theory route — full markdown rendering (MDX + react-markdown + remark-math
 * + rehype-katex) is deferred to Phase 7. This is a placeholder that keeps
 * the route reachable.
 */
export default function TheoryPage() {
	return (
		<div className="flex-1 flex items-center justify-center p-8">
			<div className="max-w-lg text-center space-y-3">
				<h1 className="text-2xl font-medium text-zinc-200">Theory</h1>
				<p className="text-sm text-zinc-400">
					Markdown rendering (MDX for authored pages + react-markdown for DB content,
					with remark-math + rehype-katex) is scheduled for Phase 7. The source copy,
					TheorySidebar, and MarkdownRenderer component will all come online together.
				</p>
			</div>
		</div>
	);
}
