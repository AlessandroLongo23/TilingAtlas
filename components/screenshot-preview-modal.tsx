"use client";

import { useState } from "react";
import { Download, CloudUpload, Loader2 } from "lucide-react";
import { useScreenshotPreview } from "@/stores/screenshotPreview";
import { uploadTilingScreenshot, dataUrlToWebPBlob } from "@/lib/services/tilingImages";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";

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
				<div className="flex justify-center bg-surface-raised/60 rounded-lg p-4 border border-line min-h-[280px]">
					{imageDataUrl ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img src={imageDataUrl} alt="Screenshot preview" className="max-w-full max-h-[320px] object-contain rounded-md" />
					) : (
						<div className="flex items-center justify-center text-fg-muted">
							<Loader2 size={32} className="animate-spin" />
						</div>
					)}
				</div>

				{supabaseError ? (
					<p className="text-sm text-danger bg-danger-subtle border border-danger/30 rounded-md px-3 py-2">
						{supabaseError}
					</p>
				) : null}

				<div className="flex flex-col sm:flex-row gap-3 pt-2">
					<Button
						variant="secondary"
						size="lg"
						fullWidth
						onClick={handleSaveLocally}
						disabled={savingLocal || !imageDataUrl}
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
					</Button>
					{allowSupabaseUpload ? (
						<Button
							variant="primary"
							size="lg"
							fullWidth
							onClick={handleSaveToSupabase}
							disabled={savingSupabase || !imageDataUrl || !groupId}
							title={!groupId ? "This tiling is not in the database" : "Replace the tiling image in Supabase storage"}
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
						</Button>
					) : null}
				</div>

				{allowSupabaseUpload && !groupId && imageDataUrl ? (
					<p className="text-xs text-fg-muted">
						&ldquo;Save to Supabase&rdquo; is only available for tilings in the database.
					</p>
				) : null}
			</div>
		</Modal>
	);
}
