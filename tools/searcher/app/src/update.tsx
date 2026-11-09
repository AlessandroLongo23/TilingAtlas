// The update window: shown at launch when the release has a newer version than this one (electron/main.ts asks
// for it). It says what changed and opens the atlas's download page; installing stays by hand, since the app
// is not signed and macOS will not let an unsigned app replace itself.
import { Download } from "lucide-react";
import { Button } from "@/design-system/components/button";
import { Modal } from "@/design-system/components/modal";
import { Notice } from "@/design-system/components/notice";
import type { Update } from "./bridge";

const api = () => window.tilesearch;

const INSTALL: Record<Update["os"], string> = {
	mac: "Unzip the download and move The Tiling Searcher to Applications, replacing this one. It isn't signed yet, so macOS asks once more: System Settings → Privacy & Security → Open Anyway.",
	windows:
		"Run the installer: it replaces this version. When Windows says it protected your PC, click More info, then Run anyway.",
};

/** A line of release notes: its **label:** in bold, `code` in mono. */
function Note({ text }: { text: string }) {
	const [, label, rest] = /^\*\*(.+?)\*\*\s*(.*)$/s.exec(text) ?? [null, null, text];
	return (
		<li>
			{label ? <span className="font-medium text-fg">{label} </span> : null}
			{rest.split(/(`[^`]+`)/).map((part, i) =>
				/^`.+`$/.test(part) ? (
					<code key={i} className="font-mono text-small">
						{part.slice(1, -1)}
					</code>
				) : (
					part
				),
			)}
		</li>
	);
}

export function UpdateModal({ update, current, onClose }: { update: Update; current: string; onClose: () => void }) {
	return (
		<Modal
			open
			onOpenChange={(o) => !o && onClose()}
			title={`The Tiling Searcher ${update.version} is out`}
			size="md"
			description={`A newer version than this one, ${current}`}
			footer={
				<div className="flex items-center justify-between gap-2">
					<Button variant="ghost" label="Skip this version" onClick={() => (void api().skipUpdate(update.version), onClose())} />
					<div className="flex gap-2">
						<Button label="Later" onClick={onClose} />
						<Button variant="primary" icon={Download} label="Download" href={update.url} onClick={onClose} />
					</div>
				</div>
			}
		>
			<div className="space-y-4 p-5 text-body text-fg-secondary">
				<p>You have {current}.</p>
				{update.notes.length ? (
					<section className="space-y-2">
						<h3 className="text-body font-semibold text-fg">What&rsquo;s new</h3>
						<ul className="list-disc space-y-1.5 pl-5 leading-relaxed">
							{update.notes.map((n, i) => (
								<Note key={i} text={n} />
							))}
						</ul>
					</section>
				) : null}
				<Notice tone="info" className="text-small leading-relaxed">
					{INSTALL[update.os]} Your runs and settings stay where they are.
				</Notice>
			</div>
		</Modal>
	);
}
