import { create } from "zustand";

export interface ScreenshotPreviewData {
	imageDataUrl: string | null;
	filename: string;
	rulestring: string;
	groupId: string | null;
	/** When true, shows the "Save to Supabase" option. */
	allowSupabaseUpload?: boolean;
}

interface ScreenshotPreviewState extends ScreenshotPreviewData {
	isOpen: boolean;
	open: (data: ScreenshotPreviewData) => void;
	close: () => void;
}

const initialData: ScreenshotPreviewData = {
	imageDataUrl: null,
	filename: "",
	rulestring: "",
	groupId: null,
	allowSupabaseUpload: false,
};

export const useScreenshotPreview = create<ScreenshotPreviewState>()((set) => ({
	...initialData,
	isOpen: false,
	open: (data) => set({ ...data, isOpen: true }),
	close: () => set({ ...initialData, isOpen: false }),
}));
