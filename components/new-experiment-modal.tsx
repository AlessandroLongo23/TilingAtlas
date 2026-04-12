"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { PolygonType } from "@/classes/polygons/PolygonType";
import type { GeneratorParameters } from "@/classes";
import { Modal } from "./ui/modal";
import { PolygonPicker } from "./polygon-picker";
import { KSelector, kValuesFor, type KMode } from "./k-selector";
import { SearchCompletenessBar } from "./search-completeness-bar";
import { computeExperimentHash } from "@/lib/utils/experimentHash";
import { createCampaign, findCampaignByHash } from "@/lib/services/campaignService";
import { getAuthorName, setAuthorName, addOwnCampaignId } from "@/lib/utils/authorIdentity";

interface NewExperimentModalProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
}

export function NewExperimentModal({ isOpen, onOpenChange }: NewExperimentModalProps) {
	const router = useRouter();

	const [selectedNames, setSelectedNames] = useState<string[]>([]);
	const [generatorParameters, setGeneratorParameters] = useState<GeneratorParameters>({
		[PolygonType.REGULAR]: { n_max: 6 },
	});
	const [kMode, setKMode] = useState<KMode>("upto");
	const [uptoK, setUptoK] = useState(3);
	const [specificKValues, setSpecificKValues] = useState<number[]>([1, 2, 3]);
	const [authorName, setAuthorNameState] = useState(() => getAuthorName());
	const [submitting, setSubmitting] = useState(false);
	const [errorMsg, setErrorMsg] = useState("");

	const kValues = kValuesFor(kMode, uptoK, specificKValues);

	const run = async () => {
		if (selectedNames.length === 0) {
			setErrorMsg("Select at least one polygon type.");
			return;
		}
		if (kValues.length === 0) {
			setErrorMsg("Select at least one k value.");
			return;
		}
		setErrorMsg("");
		setSubmitting(true);

		try {
			const hash = await computeExperimentHash(selectedNames, kValues, true);
			const existing = await findCampaignByHash(hash);

			if (existing && (existing.status === "completed" || existing.status === "running" || existing.status === "pending")) {
				onOpenChange(false);
				router.push(`/lab/${hash}/polygons`);
				return;
			}

			if (authorName) setAuthorName(authorName);

			const result = await createCampaign({
				polygonConfig: { parameters: generatorParameters, names: selectedNames },
				kValues,
				kLimit: Math.max(...kValues),
				isExhaustive: true,
				uniqueHash: hash,
				authorName: authorName || undefined,
				dataSource: "worker",
			});

			if ("error" in result) {
				setErrorMsg(result.error);
				setSubmitting(false);
				return;
			}

			addOwnCampaignId(result.id);
			onOpenChange(false);
			router.push(`/lab/${hash}/polygons`);
		} catch (e) {
			setErrorMsg(e instanceof Error ? e.message : "Unexpected error");
			setSubmitting(false);
		}
	};

	return (
		<Modal isOpen={isOpen} onOpenChange={onOpenChange} title="New Experiment" maxWidth="max-w-2xl">
			<div className="p-5 flex flex-col gap-6">
				<div>
					<p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Polygon pool</p>
					<PolygonPicker
						selectedNames={selectedNames}
						onSelectedNamesChange={setSelectedNames}
						generatorParameters={generatorParameters}
						onGeneratorParametersChange={setGeneratorParameters}
					/>
				</div>

				<div>
					<p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Vertex count (k)</p>
					<KSelector
						mode={kMode}
						onModeChange={setKMode}
						uptoK={uptoK}
						onUptoKChange={setUptoK}
						specificKValues={specificKValues}
						onSpecificKValuesChange={setSpecificKValues}
					/>
				</div>

				<div>
					<p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Coverage</p>
					<SearchCompletenessBar selectedNames={selectedNames} kValues={kValues} />
				</div>

				<div>
					<label htmlFor="author-name" className="text-xs text-zinc-500 uppercase tracking-wide block mb-2">
						Author name <span className="normal-case text-zinc-600">(optional)</span>
					</label>
					<input
						id="author-name"
						type="text"
						value={authorName}
						onChange={(e) => setAuthorNameState(e.target.value)}
						placeholder="Your name"
						className="w-full h-9 px-3 rounded-lg bg-zinc-900/60 border border-zinc-700/60 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
					/>
				</div>

				{errorMsg ? (
					<p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
						{errorMsg}
					</p>
				) : null}

				<button
					onClick={run}
					disabled={submitting || selectedNames.length === 0 || kValues.length === 0}
					className="flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-medium transition-colors bg-green-600/20 border border-green-500/40 text-green-400 hover:bg-green-600/30 disabled:opacity-40 disabled:cursor-not-allowed"
				>
					{submitting ? (
						<>
							<Loader2 size={15} className="animate-spin" />
							Checking…
						</>
					) : (
						<>
							<Play size={14} />
							Run Experiment
						</>
					)}
				</button>
			</div>
		</Modal>
	);
}
