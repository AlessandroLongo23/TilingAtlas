"use client";

import { useState } from "react";
import { Download, CloudUpload } from "lucide-react";
import { useScreenshotPreview } from "@/stores/screenshotPreview";
import { uploadTilingScreenshot, dataUrlToWebPBlob } from "@/lib/services/tilingImages";
import { Modal } from "@/design-system/components/modal";
import { Button } from "@/design-system/components/button";
import { Notice } from "@/design-system/components/notice";
import { Spinner } from "@/design-system/components/spinner";
import { Tooltip } from "@/design-system/components/tooltip";

export function ScreenshotPreviewModal() {
	const { isOpen, imageDataUrl, filename, rulestring, groupId, allowSupabaseUpload, close } = useScreenshotPreview();

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
		<Modal open={isOpen} onOpenChange={handleOpenChange} title="Screenshot Preview" maxWidth="max-w-2xl">
			<div className="space-y-4 p-4">
				<div className="ta-well flex min-h-[280px] justify-center p-4">
					{imageDataUrl ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={imageDataUrl}
							alt="Screenshot preview"
							className="max-h-[320px] max-w-full rounded-control object-contain"
						/>
					) : (
						<div className="flex items-center justify-center">
							<Spinner size={32} label="Loading the screenshot" />
						</div>
					)}
				</div>

				{supabaseError ? <Notice tone="danger">{supabaseError}</Notice> : null}

				<div className="flex flex-col gap-3 pt-2 sm:flex-row">
					<Button
						variant="secondary"
						size="lg"
						className="w-full"
						onClick={handleSaveLocally}
						disabled={savingLocal || !imageDataUrl}
					>
						{savingLocal ? (
							<>
								<Spinner size={18} className="text-current" />
								Saving…
							</>
						) : (
							<>
								<Download className="size-icon-lg" />
								Save Locally
							</>
						)}
					</Button>
					{allowSupabaseUpload ? (
						// Disabled without a groupId; the note under the buttons says why.
						<Tooltip label="Replace the tiling image in Supabase storage">
							<Button
								variant="primary"
								size="lg"
								className="w-full"
								onClick={handleSaveToSupabase}
								disabled={savingSupabase || !imageDataUrl || !groupId}
							>
								{savingSupabase ? (
									<>
										<Spinner size={18} className="text-current" />
										Uploading…
									</>
								) : (
									<>
										<CloudUpload className="size-icon-lg" />
										Save to Supabase
									</>
								)}
							</Button>
						</Tooltip>
					) : null}
				</div>

				{allowSupabaseUpload && !groupId && imageDataUrl ? (
					<p className="text-small text-fg-muted">
						&ldquo;Save to Supabase&rdquo; is only available for tilings in the database.
					</p>
				) : null}
			</div>
		</Modal>
	);
}
