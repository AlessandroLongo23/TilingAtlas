#!/usr/bin/env bash
# Download the five 2D Bravais-lattice diagrams from Wikimedia Commons into public/lattices/.
# Source: the "Bravais lattice" article's 2-D table, by Commons user Officer781, licensed
# CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0). Attribution lives in
# public/lattices/CREDITS.txt. Reproducible: URLs are derived from the md5 of the filename.
#
# Usage: bash scripts/fetch-lattice-diagrams.sh
set -euo pipefail

DEST="$(cd "$(dirname "$0")/.." && pwd)/public/lattices"
mkdir -p "$DEST"
UA="TilingAtlas/1.0 (thesis project; longoa02@gmail.com) curl"

# commons filename (without .svg) -> local name matching the app's LatticeShape values
declare -a MAP=(
  "2d_mp:oblique"              # monoclinic primitive
  "2d_op_rectangular:rectangular"  # orthorhombic primitive
  "2d_oc_rectangular:rhombic"      # orthorhombic centred == rhombic / centred rectangular
  "2d_tp:square"              # tetragonal primitive
  "2d_hp:hexagonal"          # hexagonal primitive
)

for entry in "${MAP[@]}"; do
  src="${entry%%:*}"
  dst="${entry##*:}"
  out="$DEST/$dst.svg"
  if [ -s "$out" ]; then
    echo "  $dst.svg  (already present, skipping)"
    continue
  fi
  file="${src}.svg"
  hash="$(printf '%s' "$file" | md5 -q)"
  url="https://upload.wikimedia.org/wikipedia/commons/${hash:0:1}/${hash:0:2}/${file}"
  echo "  $dst.svg  <-  $url"
  curl -fsSL --retry 6 --retry-delay 4 -A "$UA" "$url" -o "$out"
  sleep 1
done

echo "Done: $(ls "$DEST"/*.svg | wc -l | tr -d ' ') files in $DEST"
