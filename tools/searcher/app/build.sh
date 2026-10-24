#!/bin/sh
# Build TileSearch.app: the SwiftUI front end, the tilesearch binary and the example boards in one bundle.
# usage: tools/searcher/app/build.sh [MAREK_SRC]   (default: the main checkout's materials/marek-source)
set -e
cd "$(dirname "$0")"
SRC=${1:-${MAREK_SRC:-$(git rev-parse --path-format=absolute --git-common-dir)/../materials/marek-source}}
make -s -C .. MAREK_SRC="$SRC"
APP=TileSearch.app
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/boards"
swiftc -O -swift-version 5 -parse-as-library -target arm64-apple-macos13 TileSearch.swift -o "$APP/Contents/MacOS/TileSearch"
cp ../tilesearch "$APP/Contents/Resources/"
cp ../boards/*.board "$APP/Contents/Resources/boards/"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>TileSearch</string>
<key>CFBundleIdentifier</key><string>atlas.tiling.tilesearch</string>
<key>CFBundleName</key><string>TileSearch</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
codesign -s - --force --deep "$APP"
echo "built $(pwd)/$APP"
