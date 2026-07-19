#!/usr/bin/env bash
# Download the public-domain wallpaper-group cell-structure diagrams from Wikimedia Commons into
# public/wallpaper-groups/. All source files are "Public domain" on Commons (verified via the
# imageinfo API), so no attribution is required. Reproducible: URLs are derived from the md5 of the
# underscore filename (Commons path = /commons/<h0>/<h0h1>/<File>).
#
# Usage: bash scripts/fetch-wallpaper-diagrams.sh
set -euo pipefail

DEST="$(cd "$(dirname "$0")/.." && pwd)/public/wallpaper-groups"
mkdir -p "$DEST"
UA="TilingAtlas/1.0 (thesis project; longoa02@gmail.com) curl"

# commons-basename (without the "Wallpaper_group_diagram_" prefix or ".svg") -> local kebab name
declare -a MAP=(
  "p1:p1" "p1_rect:p1-rect" "p1_rhombic:p1-rhombic" "p1_square:p1-square"
  "p2:p2" "p2_rect:p2-rect" "p2_rhombic:p2-rhombic" "p2_square:p2-square"
  "pm:pm" "pm_rotated:pm-rotated"
  "pg:pg" "pg_rotated:pg-rotated"
  "cm:cm" "cm_rotated:cm-rotated"
  "pmm:pmm" "pmm_square:pmm-square"
  "pmg:pmg" "pmg_rotated:pmg-rotated" "pmg_square:pmg-square"
  "pgg:pgg" "pgg_rhombic:pgg-rhombic" "pgg_square:pgg-square"
  "cmm:cmm-rhombic" "cmm_square:cmm-square"  # base cmm.svg IS the rhombic depiction;
  # the "cmm rhombic" Commons name is a redirect to the pgg diagram, so do not use it
  "p3:p3" "p3m1:p3m1" "p31m:p31m"
  "p4:p4" "p4m:p4m" "p4g:p4g"
  "p6:p6" "p6m:p6m"
)

for entry in "${MAP[@]}"; do
  src="${entry%%:*}"
  dst="${entry##*:}"
  out="$DEST/$dst.svg"
  # Idempotent: skip anything already fetched so a rate-limited run can just be re-run.
  if [ -s "$out" ]; then
    echo "  $dst.svg  (already present, skipping)"
    continue
  fi
  file="Wallpaper_group_diagram_${src}.svg"
  hash="$(printf '%s' "$file" | md5 -q)"
  url="https://upload.wikimedia.org/wikipedia/commons/${hash:0:1}/${hash:0:2}/${file}"
  echo "  $dst.svg  <-  $url"
  # --retry handles 429/5xx (rate limiting) but not 404, so a wrong name fails fast.
  curl -fsSL --retry 6 --retry-delay 4 -A "$UA" "$url" -o "$out"
  sleep 1
done

# The Commons diagrams ship a fixed 21cm×12cm frame pinned top-left (preserveAspectRatio xMinYMin),
# so the square-viewBox groups (p4/p4m/p4g and the *-square variants) render small and off-centre.
# Drop the cm frame (intrinsic aspect ratio then follows the viewBox) and centre the drawing so each
# diagram fills its card.
python3 - "$DEST" <<'PY'
import re, glob, os, sys
for f in glob.glob(os.path.join(sys.argv[1], "*.svg")):
    s = open(f, encoding="utf-8").read()
    n = re.sub(r'\s+width="21cm"\s+height="12cm"', '', s, count=1)
    n = n.replace('preserveAspectRatio="xMinYMin meet"', 'preserveAspectRatio="xMidYMid meet"')
    if n != s:
        open(f, "w", encoding="utf-8").write(n)
PY

echo "Done: $(ls "$DEST" | wc -l | tr -d ' ') files in $DEST"
