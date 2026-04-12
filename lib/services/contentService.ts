import { create } from "zustand";
import { extractTableOfContents, structureTableOfContents, type TableOfContentsItem } from "@/utils/tableOfContents";

interface ContentServiceState {
	path: string | null;
	content: string | null;
	sections: TableOfContentsItem[];
	isLoading: boolean;
	error: string | null;
	loadContent: (path: string) => Promise<void>;
}

export const useContentService = create<ContentServiceState>()((set, get) => ({
	path: null,
	content: null,
	sections: [],
	isLoading: false,
	error: null,
	async loadContent(path: string) {
		const { isLoading, content, path: currentPath } = get();
		if (isLoading) return;
		if (content && currentPath === path && !get().error) return;

		set({ isLoading: true, error: null, path });
		try {
			const res = await fetch(path);
			if (!res.ok) throw new Error(`Failed to load content from ${path} (${res.status})`);
			const md = await res.text();
			if (!md.trim()) throw new Error("Loaded content is empty");
			const flat = extractTableOfContents(md);
			set({
				content: md,
				sections: structureTableOfContents(flat),
				isLoading: false,
			});
		} catch (e) {
			set({ error: e instanceof Error ? e.message : String(e), isLoading: false });
		}
	},
}));
