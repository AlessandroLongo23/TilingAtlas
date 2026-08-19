// Simple build-time feature gates. Flip to re-enable.

// Screenshot buttons on the Tiles (prototile) / Configs (vertex-config) / Library reference cards are
// wired end-to-end but their capture output isn't ready to ship, so their rendering is gated here — one
// flip turns all three back on. The older Library tiling-card / tiling-list-item screenshot buttons
// predate this work and are intentionally NOT gated by this flag.
//
// /play no longer rides this flag. Its export is a different feature with a real capture path
// (lib/render/capture.ts + components/export-image-modal.tsx); it gates per shelf instead, on
// canCaptureImage in lib/services/shelfRegistry.ts.
export const SCREENSHOT_BUTTONS_ENABLED = false;
