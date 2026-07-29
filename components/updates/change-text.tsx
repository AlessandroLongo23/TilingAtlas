"use client";

import { Fragment } from "react";

// The only markup an update line may carry is **bold**, so this splits on it directly instead of
// mounting react-markdown. The modal lives in the app shell and is opened rarely; pulling the
// markdown stack (react-markdown + remark-gfm + remark-math + rehype-katex + rehype-raw) into every
// page's bundle to render one bold run would be a bad trade. tests/updates.test.ts asserts the
// entries carry nothing else.

const BOLD = /\*\*([^*]+)\*\*/g;

export function ChangeText({ text }: { text: string }) {
	const parts: React.ReactNode[] = [];
	let last = 0;
	// A fresh lastIndex each call — the regex is module-level and /g is stateful.
	BOLD.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = BOLD.exec(text)) !== null) {
		if (m.index > last) parts.push(<Fragment key={parts.length}>{text.slice(last, m.index)}</Fragment>);
		parts.push(
			<strong key={parts.length} className="font-semibold text-fg">
				{m[1]}
			</strong>,
		);
		last = m.index + m[0].length;
	}
	if (last < text.length) parts.push(<Fragment key={parts.length}>{text.slice(last)}</Fragment>);
	return <>{parts}</>;
}
