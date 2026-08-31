/** Project-wide constants. */

export const BATCH_SIZE = 1000;

// Pagination — distinct values per surface area.
export const CAMPAIGNS_PER_PAGE = 24;
export const TILINGS_PER_PAGE = 48;
export const LAB_ITEMS_PER_PAGE = 25; // polygons, VCs, seeds, expanded-seeds

// The community server. This invite code carries an expiry (2026-09-29); if the link ever stops
// resolving, regenerate it in Discord as never-expiring and replace it here.
export const DISCORD_INVITE = "https://discord.gg/cvZ2ev4WB";
