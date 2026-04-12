import { create } from "zustand";

export interface PipelineProgressState {
	isOpen: boolean;
	title: string;
	progress: number | null;
	message: string;
	canClose: boolean;
	open: (title: string, message?: string) => void;
	update: (progress: number | null, message: string) => void;
	complete: (message?: string) => void;
	fail: (message: string) => void;
	close: () => void;
}

export const usePipelineProgress = create<PipelineProgressState>()((set) => ({
	isOpen: false,
	title: "",
	progress: null,
	message: "",
	canClose: false,
	open: (title, message = "") =>
		set({ isOpen: true, title, progress: null, message, canClose: false }),
	update: (progress, message) => set((s) => ({ ...s, progress, message })),
	complete: (message = "Done") =>
		set((s) => ({ ...s, progress: 100, message, canClose: true })),
	fail: (message) => set((s) => ({ ...s, message, canClose: true })),
	close: () => set((s) => ({ ...s, isOpen: false, canClose: false })),
}));

// Backward-compatible standalone helpers (used by @/utils/fetchPipelineWithProgress).
export function openPipelineProgress(title: string, message = "") {
	usePipelineProgress.getState().open(title, message);
}
export function updatePipelineProgress(progress: number | null, message: string) {
	usePipelineProgress.getState().update(progress, message);
}
export function completePipelineProgress(message = "Done") {
	usePipelineProgress.getState().complete(message);
}
export function failPipelineProgress(message: string) {
	usePipelineProgress.getState().fail(message);
}
export function closePipelineProgress() {
	usePipelineProgress.getState().close();
}
