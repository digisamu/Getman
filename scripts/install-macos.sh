#!/usr/bin/env bash
# Installs or updates Getman on macOS from the latest GitHub release.
#
#   curl -fsSL https://raw.githubusercontent.com/digisamu/Getman/main/scripts/install-macos.sh | bash
#
# Set GETMAN_INSTALL_DIR to install somewhere other than /Applications.
set -euo pipefail

REPO="digisamu/Getman"
INSTALL_DIR="${GETMAN_INSTALL_DIR:-/Applications}"
APP="$INSTALL_DIR/Getman.app"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer is for macOS. Download other builds from https://github.com/$REPO/releases/latest" >&2
  exit 1
fi

case "$(uname -m)" in
  arm64) ARCH="arm64" ;;
  x86_64) ARCH="x64" ;;
  *) echo "Unsupported Mac architecture: $(uname -m)" >&2; exit 1 ;;
esac

WORK="$(mktemp -d)"
MOUNT="$WORK/mount"
cleanup() {
  hdiutil detach -quiet "$MOUNT" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

if [[ -d "$APP" ]]; then
  CURRENT="$(defaults read "$APP/Contents/Info" CFBundleShortVersionString 2>/dev/null || echo unknown)"
  echo "Updating Getman (installed: $CURRENT)…"
else
  echo "Installing Getman…"
fi

URL="https://github.com/$REPO/releases/latest/download/Getman-mac-$ARCH.dmg"
echo "Downloading $URL"
curl -fL --progress-bar -o "$WORK/Getman.dmg" "$URL"

mkdir -p "$MOUNT"
hdiutil attach -nobrowse -readonly -quiet -mountpoint "$MOUNT" "$WORK/Getman.dmg"

# Quit a running copy so it can be replaced.
if pgrep -xq Getman; then
  echo "Quitting the running Getman…"
  osascript -e 'quit app "Getman"' >/dev/null 2>&1 || true
  for _ in {1..20}; do pgrep -xq Getman || break; sleep 0.25; done
fi

SUDO=""
if [[ ! -w "$INSTALL_DIR" ]]; then
  echo "Administrator permission is needed to write to $INSTALL_DIR."
  SUDO="sudo"
fi

$SUDO rm -rf "$APP"
$SUDO ditto "$MOUNT/Getman.app" "$APP"
# The build is not notarized; clear the download flag so macOS opens it without the warning.
$SUDO xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true

VERSION="$(defaults read "$APP/Contents/Info" CFBundleShortVersionString)"
echo "Getman $VERSION is installed in $INSTALL_DIR. Your workspace and settings were kept."
