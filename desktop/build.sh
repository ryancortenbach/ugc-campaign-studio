#!/usr/bin/env bash
# Builds "Mint Labs.app", a native macOS window around the local agent app, and installs it in /Applications.
# Needs Xcode command line tools, Python with Pillow for the icon, and Node 22.13+ at run time.
set -euo pipefail
cd "$(dirname "$0")"
repo="$(cd .. && pwd)"
app="build/Mint Labs.app"
rm -rf build && mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources" build/AppIcon.iconset

swiftc -O -swift-version 5 MintLabs.swift -o "$app/Contents/MacOS/MintLabs" -framework Cocoa -framework WebKit -framework Speech -framework AVFoundation

python3 make_icon.py build/icon.png
for s in 16 32 128 256 512; do
  sips -z $s $s build/icon.png --out "build/AppIcon.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) build/icon.png --out "build/AppIcon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns build/AppIcon.iconset -o "$app/Contents/Resources/AppIcon.icns"

cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
 <key>CFBundleName</key><string>Mint Labs</string>
 <key>CFBundleDisplayName</key><string>Mint Labs</string>
 <key>CFBundleIdentifier</key><string>com.mintlabs.agent</string>
 <key>CFBundleExecutable</key><string>MintLabs</string>
 <key>CFBundleIconFile</key><string>AppIcon</string>
 <key>CFBundlePackageType</key><string>APPL</string>
 <key>CFBundleShortVersionString</key><string>0.1.0</string>
 <key>CFBundleVersion</key><string>1</string>
 <key>LSMinimumSystemVersion</key><string>13.0</string>
 <key>NSHighResolutionCapable</key><true/>
 <key>NSPrincipalClass</key><string>NSApplication</string>
 <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
 <key>NSMicrophoneUsageDescription</key><string>Mint Labs listens only while you press Dictate or Voice in the chat box.</string>
 <key>NSSpeechRecognitionUsageDescription</key><string>Mint Labs turns what you say into text for the chat box.</string>
 <key>MintLabsRepo</key><string>${repo}</string>
</dict></plist>
PLIST

codesign --force --sign - "$app" >/dev/null 2>&1
if [ "${1:-}" != "--no-install" ]; then
  rm -rf "/Applications/Mint Labs.app"
  cp -R "$app" /Applications/
  echo "Installed /Applications/Mint Labs.app"
else
  echo "Built desktop/$app"
fi
