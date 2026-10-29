// Where the TileSearch installers live: assets of the fixed GitHub release `tilesearch-latest`.
//
// Not public/: every deployment Vercel keeps holds a full copy of public/, and each installer is over
// 100 MB against a 10 GB team quota (CLAUDE.md, "Shipped data under public/"). A release asset is stored
// once. The asset names carry no version (tools/searcher/app/package.json, `artifactName`), and a new
// build replaces the files in place, so a release needs no site change:
//   gh release upload tilesearch-latest <zip> <setup.exe> <win zip> --clobber
// A fixed tag, not /releases/latest: "latest" is the newest release of the whole repository, so any
// other release published here would take the buttons over.
// A platform without an asset here gets no download button; it is not offered a broken link.

export type Os = "mac" | "windows";

const ASSETS: Partial<Record<Os, string>> = {
	mac: "TileSearch-mac-arm64.zip",
	windows: "TileSearch-windows-x64-setup.exe",
};

const RELEASE = "https://github.com/AlessandroLongo23/TilingAtlas/releases/tag/tilesearch-latest";
const DOWNLOAD = "https://github.com/AlessandroLongo23/TilingAtlas/releases/download/tilesearch-latest";

export const releasePage = RELEASE;

export function downloadUrl(os: Os): string | null {
	const asset = ASSETS[os];
	return asset ? `${DOWNLOAD}/${asset}` : null;
}

export const OS_NAME: Record<Os, string> = { mac: "macOS", windows: "Windows" };
