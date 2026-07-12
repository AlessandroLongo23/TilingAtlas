import { ConfigsClient } from "./_configs-client";

// The vertex-configuration alphabet, per palette — the middle layer between the tile palette and the
// tilings in the Library. Makes the config counts (e.g. 7,389 for the reduced combined palette) tangible
// by rendering each config's tiles fanned around the vertex. Data from public/vertex-configs/*.json
// (tools/ctrnact-oracle/alphabets/export_vertex_configs.py).
export default function ConfigsPage() {
	return <ConfigsClient />;
}
