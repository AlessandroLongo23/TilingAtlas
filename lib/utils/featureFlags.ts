// Simple build-time feature gates. Flip to re-enable.

// Screenshot buttons on the Tiles (prototile) / Configs (vertex-config) / Library reference cards and the
// Play canvas are wired end-to-end but the capture output isn't ready to ship, so their rendering is gated
// here — one flip turns all four back on. The older Library tiling-card / tiling-list-item screenshot
// buttons predate this work and are intentionally NOT gated by this flag.
export const SCREENSHOT_BUTTONS_ENABLED = false;
