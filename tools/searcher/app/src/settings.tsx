// The app's settings: the defaults every new search starts from, how many run at once, and what the app
// does when it opens. They live in settings.json beside the window's own state (electron/main.ts), except
// "open at login", which is the system's login item.
import { Checkbox } from "@/components/ui/checkbox";
import { InfoDot } from "@/components/ui/info-dot";
import { Modal } from "@/components/ui/modal";
import { OptionWall } from "@/components/ui/option-wall";
import { RangeInput } from "@/components/ui/range-input";
import type { Api, Settings } from "./bridge";
import { ThreadsInput, threadsHint } from "./runs";

const api = () => window.tilesearch;

/** A labelled control, with its explanation behind an info dot. */
export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
	return (
		<div className="space-y-1.5">
			<div className="ta-label flex items-center gap-1.5">
				{label}
				{hint ? <InfoDot>{hint}</InfoDot> : null}
			</div>
			{children}
		</div>
	);
}

/** The engine's priority: nice 0, 10 or 19. */
export function PriorityInput({ value, onChange }: { value: number; onChange: (nice: number) => void }) {
	return (
		<OptionWall
			columns={3}
			options={[
				{ value: 0, label: "Normal" },
				{ value: 10, label: "Low" },
				{ value: 19, label: "Lowest" },
			]}
			selected={value}
			onChange={onChange}
		/>
	);
}
export const PRIORITY_HINT = "Low lets the search use the cores nothing else needs, and yield to the rest of the computer.";

export function SettingsModal({
	settings,
	onChange,
	onClose,
}: {
	settings: Settings;
	onChange: (s: Settings) => void;
	onClose: () => void;
}) {
	const save = (s: Parameters<Api["setSettings"]>[0]) => void api().setSettings(s).then(onChange);
	const max = settings.maxRunning;
	return (
		<Modal isOpen onOpenChange={(o) => !o && onClose()} title="Settings" size="md">
			<div className="space-y-6 p-5">
				<section className="space-y-4">
					<h3 className="text-sm font-semibold text-fg">New searches</h3>
					<Field label={`Threads · ${settings.threads}`} hint={threadsHint(settings.cores)}>
						<ThreadsInput value={settings.threads} cores={settings.cores} onChange={(threads) => save({ threads })} />
					</Field>
					<Field label="Priority" hint={PRIORITY_HINT}>
						<PriorityInput value={settings.nice} onChange={(nice) => save({ nice })} />
					</Field>
				</section>
				<section className="space-y-4">
					<h3 className="text-sm font-semibold text-fg">Queue</h3>
					<Field
						label={`Searches at once · ${max ? max : "no limit"}`}
						hint="Past this many, a new search, or a resumed one, waits in the queue and starts by itself when one ends. Stop a queued run to take it out of the queue."
					>
						<RangeInput
							min={0}
							max={Math.max(8, settings.cores)}
							value={max}
							onChange={(maxRunning) => save({ maxRunning })}
							aria-label="Searches at once"
						/>
						<p className="text-xs text-fg-muted">0 is no limit.</p>
					</Field>
				</section>
				<section className="space-y-3">
					<h3 className="text-sm font-semibold text-fg">When a search finishes</h3>
					<Checkbox
						label="Compress its tiling files (gzip)"
						checked={settings.compressFinished}
						onCheckedChange={(compressFinished) => save({ compressFinished })}
						hint={
							<InfoDot>
								Certificate text shrinks 10 to 90 times. The app reads compressed files as they are; other programs need
								them unpacked (Decompress on the run&rsquo;s page, or zcat, 7-Zip). A run you decompress stays so.
							</InfoDot>
						}
					/>
				</section>
				<section className="space-y-3">
					<h3 className="text-sm font-semibold text-fg">When the app opens</h3>
					<Checkbox
						label="Check for a new version"
						checked={settings.checkUpdates}
						onCheckedChange={(checkUpdates) => save({ checkUpdates })}
						hint={
							<InfoDot>
								Asks GitHub, where the app is published, for the latest version number, and shows what changed
								when there is a newer one. Nothing about you or your searches is sent; GitHub sees your IP
								address, as with any download.
							</InfoDot>
						}
					/>
					<Checkbox
						label="Resume the searches that were interrupted"
						checked={settings.resumeOnLaunch}
						onCheckedChange={(resumeOnLaunch) => save({ resumeOnLaunch })}
						hint={
							<InfoDot>
								The runs going when the app last quit, and any a crash or a restart cut off, start again where
								they stopped, through the queue. The queue itself is kept too. Off, they wait under Unfinished.
							</InfoDot>
						}
					/>
					<Checkbox
						label="Open the Tiling Searcher when you log in"
						checked={settings.openAtLogin}
						disabled={!settings.canOpenAtLogin}
						onCheckedChange={(openAtLogin) => save({ openAtLogin })}
						hint={
							<InfoDot>
								{settings.canOpenAtLogin
									? "With the option above, a computer that restarts overnight picks its searches back up."
									: "Only the installed app can open at login."}
							</InfoDot>
						}
					/>
				</section>
			</div>
		</Modal>
	);
}
