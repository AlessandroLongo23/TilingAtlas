import { create } from "zustand";

interface AudioState {
	isMuted: boolean;
	setMuted: (muted: boolean) => void;
	toggleMuted: () => void;
}

export const useAudio = create<AudioState>()((set) => ({
	isMuted: false,
	setMuted: (isMuted) => set({ isMuted }),
	toggleMuted: () => set((s) => ({ isMuted: !s.isMuted })),
}));
