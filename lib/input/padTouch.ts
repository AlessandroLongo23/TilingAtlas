// The touchpad of a DualShock 4 or a DualSense, read over WebHID. The Gamepad API reports that pad's
// click and nothing else, so the finger's position has to come from the controller's own input report.
// Chromium only, and the reader grants the device once (requestDevice needs a real click); after that
// getDevices hands it back on every visit. Everything here is a no-op where WebHID is missing.

// The slice of WebHID used here; TypeScript's DOM library does not carry it.
interface HidDevice {
	vendorId: number;
	productId: number;
	opened: boolean;
	open(): Promise<void>;
	receiveFeatureReport(id: number): Promise<DataView>;
	addEventListener(type: "inputreport", fn: (e: { reportId: number; data: DataView }) => void): void;
}
interface Hid {
	getDevices(): Promise<HidDevice[]>;
	requestDevice(o: { filters: { vendorId: number }[] }): Promise<HidDevice[]>;
}
const hid = () => (navigator as unknown as { hid?: Hid }).hid;

const SONY = 0x054c;
const DUALSENSE = new Set([0x0ce6, 0x0df2]); // DualSense, DualSense Edge; any other Sony pad reads as a DualShock 4

/**
 * Where the first touch point sits in an input report's data (which excludes the report id), or -1 for
 * a report that carries none. Each pad has a full report over USB (0x01) and a longer one over
 * Bluetooth (0x31 / 0x11) holding the same fields a byte or two further in; over Bluetooth 0x01 is a
 * short report with no touch data, told apart by its length.
 */
function touchOffset(productId: number, reportId: number, length: number): number {
	const [usb, bt, btOffset, usbOffset] = DUALSENSE.has(productId) ? [0x01, 0x31, 33, 32] : [0x01, 0x11, 36, 34];
	if (reportId === bt) return btOffset;
	return reportId === usb && length >= 63 ? usbOffset : -1;
}

const listening = new WeakSet<HidDevice>();

function listen(device: HidDevice, onMove: (dx: number, dy: number) => void): void {
	if (listening.has(device)) return;
	listening.add(device);
	let prev: { id: number; x: number; y: number } | null = null;
	device.addEventListener("inputreport", ({ reportId, data }) => {
		const o = touchOffset(device.productId, reportId, data.byteLength);
		if (o < 0 || o + 3 >= data.byteLength) return;
		// One byte of contact (top bit CLEAR while the finger is down, the rest a contact id), then x and
		// y as two 12-bit numbers packed into three bytes.
		const contact = data.getUint8(o);
		if (contact & 0x80) {
			prev = null;
			return;
		}
		const id = contact & 0x7f;
		const x = data.getUint8(o + 1) | ((data.getUint8(o + 2) & 0x0f) << 8);
		const y = (data.getUint8(o + 2) >> 4) | (data.getUint8(o + 3) << 4);
		if (prev && prev.id === id && (x !== prev.x || y !== prev.y)) onMove(x - prev.x, y - prev.y);
		prev = { id, x, y };
	});
}

export const touchpadSupported = () => !!hid();

/**
 * Start reading the touchpad of every granted Sony pad; `onMove` gets the finger's travel in touchpad
 * units (the pad is 1920 across). With `ask` the browser's device chooser opens first, which is only
 * allowed from a real click. Resolves to whether a pad is being read.
 */
export async function openTouchpad(onMove: (dx: number, dy: number) => void, ask = false): Promise<boolean> {
	const api = hid();
	if (!api) return false;
	try {
		const devices = (ask ? await api.requestDevice({ filters: [{ vendorId: SONY }] }) : await api.getDevices()).filter((d) => d.vendorId === SONY);
		for (const d of devices) {
			if (!d.opened) await d.open();
			listen(d, onMove);
			// Over Bluetooth both pads send the short report until this feature report is read once.
			d.receiveFeatureReport(DUALSENSE.has(d.productId) ? 0x05 : 0x02).catch(() => {});
		}
		return devices.length > 0;
	} catch {
		return false;
	}
}
