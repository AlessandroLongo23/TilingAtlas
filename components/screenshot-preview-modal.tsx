"use client";

import { useState } from "react";
import { Download, CloudUpload, Loader2 } from "lucide-react";
import { useScreenshotPreview } from "@/stores/screenshotPreview";
import { uploadTilingScreenshot, dataUrlToWebPBlob } from "@/lib/services/tilingImages";
import { Modal } from "./ui/modal";

export function ScreenshotPreviewModal() {
	const {
		isOpen,
		imageDataUrl,
		filename,
		rulestring,
		groupId,
		allowSupabaseUpload,
		close,
	} = useScreenshotPreview();

	const [savingLocal, setSavingLocal] = useState(false);
	const [savingSupabase, setSavingSupabase] = useState(false);
	const [supabaseError, setSupabaseError] = useState<string | null>(null);

	const handleSaveLocally = () => {
		if (!imageDataUrl) return;
		setSavingLocal(true);
		try {
			const link = document.createElement("a");
			link.href = imageDataUrl;
			link.download = filename;
			link.click();
		} finally {
			setSavingLocal(false);
			close();
		}
	};

	const handleSaveToSupabase = async () => {
		if (!imageDataUrl || !groupId) return;
		setSavingSupabase(true);
		setSupabaseError(null);
		try {
			const blob = await dataUrlToWebPBlob(imageDataUrl);
			const isDual = rulestring.includes("*");
			const result = await uploadTilingScreenshot(rulestring, groupId, blob, isDual);
			if (result.success) close();
			else setSupabaseError(result.error ?? "Upload failed");
		} catch (err) {
			setSupabaseError(err instanceof Error ? err.message : "Upload failed");
		} finally {
			setSavingSupabase(false);
		}
	};

	const handleOpenChange = (open: boolean) => {
		if (!open && !savingSupabase) close();
	};

	return (
		<Modal isOpen={isOpen} onOpenChange={handleOpenChange} title="Screenshot Preview" maxWidth="max-w-2xl">
			<div className="p-4 space-y-4">
				<div className="flex justify-center bg-zinc-900/60 rounded-lg p-4 border border-zinc-700/50 min-h-[280px]">
					{imageDataUrl ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img src={imageDataUrl} alt="Screenshot preview" className="max-w-full max-h-[320px] object-contain rounded-md" />
					) : (
						<div className="flex items-center justify-center text-zinc-500">
							<Loader2 size={32} className="animate-spin" />
						</div>
					)}
				</div>

				{supabaseError ? (
					<p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
						{supabaseError}
					</p>
				) : null}

				<div className="flex flex-col sm:flex-row gap-3 pt-2">
					<button
						onClick={handleSaveLocally}
						disabled={savingLocal || !imageDataUrl}
						className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-md border border-zinc-700/50 bg-zinc-800/40 hover:bg-zinc-700/60 text-white/90 font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{savingLocal ? (
							<>
								<Loader2 size={18} className="animate-spin" />
								Saving…
							</>
						) : (
							<>
								<Download size={18} />
								Save Locally
							</>
						)}
					</button>
					{allowSupabaseUpload ? (
						<button
							onClick={handleSaveToSupabase}
							disabled={savingSupabase || !imageDataUrl || !groupId}
							title={!groupId ? "This tiling is not in the database" : "Replace the tiling image in Supabase storage"}
							className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-md border border-zinc-700/50 bg-green-700/40 hover:bg-green-700/60 text-white font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{savingSupabase ? (
								<>
									<Loader2 size={18} className="animate-spin" />
									Uploading…
								</>
							) : (
								<>
									<CloudUpload size={18} />
									Save to Supabase
								</>
							)}
						</button>
					) : null}
				</div>

				{allowSupabaseUpload && !groupId && imageDataUrl ? (
					<p className="text-xs text-zinc-500">
						&ldquo;Save to Supabase&rdquo; is only available for tilings in the database.
					</p>
				) : null}
			</div>
		</Modal>
	);
}
