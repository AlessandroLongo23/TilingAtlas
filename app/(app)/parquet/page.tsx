import { ParquetClient } from "./_parquet-client";

// Proof-of-concept parquet-deformation viewer. Self-contained (no atlas data), so render it static.
export const dynamic = "force-static";

export default function ParquetPage() {
  return <ParquetClient />;
}
