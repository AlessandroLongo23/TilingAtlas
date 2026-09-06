#!/bin/sh
# One incremental refresh of the genus shelves from whatever groups have landed.
# Idempotent: harvest -> generate -> atlas rows. Safe while the develop is still going.
set -e
cd "$(dirname "$0")"
python3 genus_harvest.py >/dev/null
python3 gen_genus_shelf.py --emit | tail -1
cd ../..
node scripts/build-genus-shelf.mjs --write | tail -2
