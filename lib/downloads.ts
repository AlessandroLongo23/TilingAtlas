// Where The Tiling Searcher's installers live: assets of the fixed GitHub release `the-tiling-searcher-latest`.
//
// Not public/: every deployment Vercel keeps holds a full copy of public/, and each installer is over
// 100 MB against a 10 GB team quota (CLAUDE.md, "Shipped data under public/"). A release asset is stored
// once. The asset names carry no version (tools/searcher/app/package.json, `artifactName`), and a new
// build replaces the files in place, so a release needs no site change:
//   node tools/searcher/release.mjs publish [notes.md]
// which also saves GitHub's download counts first, since replacing a file resets its count.
// A fixed tag, not /releases/latest: "latest" is the newest release of the whole repository, so any
// other release published here would take the buttons over.
// A platform without an asset here gets no download button; it is not offered a broken link.
// The buttons open downloadPage(os), which starts the download: Vercel Web Analytics counts it as a page
// view, the one way to count a click on Hobby (custom events need Pro).

export type Os = "mac" | "windows";

const ASSETS: Partial<Record<Os, string>> = {
	mac: "TheTilingSearcher-mac-arm64.zip",
	windows: "TheTilingSearcher-windows-x64-setup.exe",
};

const RELEASE = "https://github.com/AlessandroLongo23/TilingAtlas/releases/tag/the-tiling-searcher-latest";
const DOWNLOAD = "https://github.com/AlessandroLongo23/TilingAtlas/releases/download/the-tiling-searcher-latest";

export const releasePage = RELEASE;

export function downloadUrl(os: Os): string | null {
	const asset = ASSETS[os];
	return asset ? `${DOWNLOAD}/${asset}` : null;
}

/** The platforms with an installer. */
export const platforms = () => Object.keys(ASSETS) as Os[];

/** The atlas page that starts the download (app/searcher/download/[os]). */
export const downloadPage = (os: Os) => (ASSETS[os] ? `/searcher/download/${os}` : null);

export const OS_NAME: Record<Os, string> = { mac: "macOS", windows: "Windows" };
