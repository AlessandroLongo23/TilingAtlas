/**
 * Service for uploading tiling screenshots to Supabase Storage.
 *
 * Uses the existing "tilings" bucket with structure:
 * - Bucket: tilings (public)
 * - Path: {sanitizedGroupId}/{sanitizedRulestring}.webp
 * - Dual: {sanitizedGroupId}/{sanitizedRulestring}_dual.webp
 */

import { supabase } from "@/lib/supabase/client";
import { tilingStore } from "@/stores/legacyTilingStore";
import { sanitizeForStorage } from "@/utils/storageKey";

const BUCKET = "tilings";

function extractPathFromSupabaseUrl(url: string): string {
	if (!url) return "";
	try {
		const match = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
		if (!match) return "";
		return match[1].split("?")[0];
	} catch {
		return "";
	}
}

async function ensureFolderExists(sanitizedGroupId: string): Promise<void> {
	if (!supabase) return;
	await supabase.storage
		.from(BUCKET)
		.upload(`${sanitizedGroupId}/.keep`, new Blob([]), {
			contentType: "application/octet-stream",
			upsert: true,
		});
}

export async function dataUrlToWebPBlob(dataUrl: string): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			const canvas = document.createElement("canvas");
			canvas.width = img.width;
			canvas.height = img.height;
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				reject(new Error("Could not get canvas context"));
				return;
			}
			ctx.drawImage(img, 0, 0);
			canvas.toBlob(
				(blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
				"image/webp",
				0.9,
			);
		};
		img.onerror = () => reject(new Error("Failed to load image"));
		img.src = dataUrl;
	});
}

export async function uploadTilingScreenshot(
	rulestring: string,
	groupId: string,
	imageBlob: Blob,
	isDual = false,
): Promise<{ success: boolean; error?: string }> {
	if (!supabase) {
		return { success: false, error: "Supabase client not available" };
	}

	const baseRulestring = rulestring.replace(/\*$/, "");
	const dbRulestring = baseRulestring;
	const sanitizedRulestring = sanitizeForStorage(baseRulestring);
	const sanitizedGroupId = sanitizeForStorage(groupId);
	const filename = isDual ? `${sanitizedRulestring}_dual.webp` : `${sanitizedRulestring}.webp`;
	const storagePath = `${sanitizedGroupId}/${filename}`;

	try {
		await ensureFolderExists(sanitizedGroupId);

		const dbTiling = tilingStore.getTilingByRulestring(dbRulestring);
		const currentImageUrl = isDual ? dbTiling?.dual_image_url : dbTiling?.image_url;

		if (currentImageUrl) {
			const oldPath = extractPathFromSupabaseUrl(currentImageUrl);
			if (oldPath) {
				await supabase.storage.from(BUCKET).remove([oldPath]);
			}
		}

		const { error: uploadError } = await supabase.storage
			.from(BUCKET)
			.upload(storagePath, imageBlob, { contentType: "image/webp", upsert: true });

		if (uploadError) {
			console.error("Upload error:", uploadError);
			return { success: false, error: uploadError.message };
		}

		const {
			data: { publicUrl },
		} = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

		const updateField = isDual ? "dual_image_url" : "image_url";
		const { error: updateError } = await supabase
			.from("legacy_tilings")
			.update({ [updateField]: publicUrl })
			.eq("rulestring", dbRulestring);

		if (updateError) {
			console.error("Update error:", updateError);
			return { success: false, error: updateError.message };
		}

		await tilingStore.refresh();

		return { success: true };
	} catch (err) {
		console.error("uploadTilingScreenshot error:", err);
		return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
	}
}
