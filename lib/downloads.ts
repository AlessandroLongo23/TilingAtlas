// Where the TileSearch installers live: assets of the repository's latest GitHub release.
//
// Not public/: every deployment Vercel keeps holds a full copy of public/, and each installer is over
// 100 MB against a 10 GB team quota (CLAUDE.md, "Shipped data under public/"). A release asset is stored
// once. The asset names carry no version (tools/searcher/app/package.json, `artifactName`), so
// /releases/latest/download/<name> always serves the newest build and a release needs no site change.
// ⚑ "Latest" is the newest non-prerelease release of the whole repository: a release of anything else
// published here would take it over. Mark such a release as a prerelease, or not latest.
// A platform without an asset here gets no download button; it is not offered a broken link.

export type Os = "mac" | "windows";

const ASSETS: Partial<Record<Os, string>> = {
	mac: "TileSearch-mac-arm64.zip",
	windows: "TileSearch-windows-x64-setup.exe",
};

const REPO = "https://github.com/AlessandroLongo23/TilingAtlas";

export const releasePage = `${REPO}/releases/latest`;

export function downloadUrl(os: Os): string | null {
	const asset = ASSETS[os];
	return asset ? `${REPO}/releases/latest/download/${asset}` : null;
}

export const OS_NAME: Record<Os, string> = { mac: "macOS", windows: "Windows" };
