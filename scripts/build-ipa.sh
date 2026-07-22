#!/usr/bin/env bash
# scripts/build-ipa.sh
#
# Builds an installable .ipa of the KBC app for sideloading via AltStore /
# Sideloadly with a FREE Apple ID (no paid developer account required).
#
# What it does:
#   1. (optional) regenerates native ios/ folder from app.config via expo prebuild
#   2. installs CocoaPods deps if missing
#   3. archives the app with the Release configuration (which uses the EMPTY
#      KBCRelease.entitlements — push notifications entitlement would break
#      free-team signing, so Release is entitlement-free)
#   4. exports the archive to a signed .ipa using AltStoreExportOptions.plist
#
# The resulting .ipa is signed with your free Personal Team certificate.
# AltStore then RE-SIGNS it with your free Apple ID on install — that's what
# lets it run on your device despite the 7-day profile limit (AltStore refreshes
# the profile in the background).
#
# Usage:
#   ./scripts/build-ipa.sh                # archive + export
#   ./scripts/build-ipa.sh --prebuild     # also run `expo prebuild --clean` first
#
# Output: build/KBC.ipa

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

SCHEME="KBC"
WORKSPACE="ios/KBC.xcworkspace"
EXPORT_OPTIONS="scripts/AltStoreExportOptions.plist"
ARCHIVE_DIR="$PROJECT_ROOT/build/archive"
EXPORT_DIR="$PROJECT_ROOT/build"

# ── Parse args ────────────────────────────────────────────────────────────────
DO_PREBUILD=0
for arg in "$@"; do
  case "$arg" in
    --prebuild) DO_PREBUILD=1 ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

echo "▶ Building IPA for AltStore sideloading (free Apple ID)"
echo "  scheme:         $SCHEME"
echo "  workspace:      $WORKSPACE"
echo "  export options: $EXPORT_OPTIONS"
echo ""

# ── 1. Optional prebuild ──────────────────────────────────────────────────────
if [[ "$DO_PREBUILD" == "1" ]]; then
  echo "▶ Running expo prebuild --clean (regenerates ios/ folder)..."
  # --clean wipes the existing ios/ dir and regenerates it from app.config.
  # After prebuild you MUST reinstall pods and re-apply any manual Xcode changes.
  npx expo prebuild --platform ios --clean
  echo ""

  # expo-notifications plugin in app.json re-injects the aps-environment
  # entitlement during prebuild. A free Personal Team CANNOT provision push,
  # so empty both entitlement files — local notifications (alarms) still work
  # without it; only REMOTE push needs aps-environment.
  for ENT in KBC.entitlements KBCRelease.entitlements; do
    ENT_PATH="ios/KBC/$ENT"
    if [[ -f "$ENT_PATH" ]]; then
      cat > "$ENT_PATH" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict/>
</plist>
EOF
      echo "  emptied $ENT_PATH (free-team compatible)"
    fi
  done
fi

# ── 2. Pods ───────────────────────────────────────────────────────────────────
if [[ ! -f "ios/Podfile.lock" ]] || [[ "ios/Podfile" -nt "ios/Podfile.lock" ]]; then
  echo "▶ Installing CocoaPods..."
  (cd ios && pod install)
  echo ""
fi

# ── 3. Archive (Release config → empty entitlements → free-team friendly) ─────
rm -rf "$ARCHIVE_DIR"
mkdir -p "$ARCHIVE_DIR"

echo "▶ Archiving (Release configuration)..."
xcodebuild archive \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -archivePath "$ARCHIVE_DIR/KBC.xcarchive" \
  -destination "generic/platform=iOS" \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM=M26S98DGFB \
  | tail -30

echo ""

# ── 4. Export IPA ─────────────────────────────────────────────────────────────
echo "▶ Exporting IPA..."
rm -rf "$EXPORT_DIR/ipa-export"
mkdir -p "$EXPORT_DIR/ipa-export"

xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_DIR/KBC.xcarchive" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -exportPath "$EXPORT_DIR/ipa-export" \
  | tail -20

echo ""

# ── 5. Locate + rename the IPA ────────────────────────────────────────────────
IPA=$(find "$EXPORT_DIR/ipa-export" -name "*.ipa" -maxdepth 1 | head -1)
if [[ -z "$IPA" ]]; then
  echo "✖ ERROR: no .ipa produced. Check the export log above."
  exit 1
fi

VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" \
  "$ARCHIVE_DIR/KBC.xcarchive/Info.plist" 2>/dev/null || echo "1.0.0")
DEST="$EXPORT_DIR/KBC-${VERSION}.ipa"
cp "$IPA" "$DEST"

echo ""
echo "✓ IPA ready:"
echo "    $DEST"
echo ""
echo "Next: install via AltStore (see SIDEBUILD.md)."
