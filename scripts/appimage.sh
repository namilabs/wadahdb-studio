#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
wails build -tags webkit2_41
# linuxdeploy and its GTK/AppImage plugins must be installed or available in this cache.
DEPLOY_DIR="${LINUXDEPLOY_DIR:-$HOME/.cache/tauri}"
DEPLOY="${LINUXDEPLOY:-$DEPLOY_DIR/linuxdeploy-07333c6-x86_64.AppImage}"
if [[ ! -x "$DEPLOY" ]]; then
  echo "Install linuxdeploy and its gtk/appimage plugins; set LINUXDEPLOY and LINUXDEPLOY_DIR." >&2
  exit 1
fi
mkdir -p build/appimage/wadahdb-studio.AppDir/usr/bin build/appimage/wadahdb-studio.AppDir/usr/share/icons/hicolor/256x256/apps
cp build/bin/wadahdb-studio build/appimage/wadahdb-studio.AppDir/usr/bin/
cp build/icons/wadahdb-studio.png build/appimage/wadahdb-studio.AppDir/usr/share/icons/hicolor/256x256/apps/
cat > build/appimage/wadahdb-studio.desktop <<'DESKTOP'
[Desktop Entry]
Name=wadahdb-studio
Exec=wadahdb-studio
Icon=wadahdb-studio
Type=Application
Categories=Development;Database;
Terminal=false
DESKTOP
WEBKIT_DIR="$(pkg-config --variable=libdir webkit2gtk-4.1)/webkit2gtk-4.1"
mkdir -p build/appimage/wadahdb-studio.AppDir/usr/lib/webkit2gtk-4.1
cp "$WEBKIT_DIR"/WebKit*Process build/appimage/wadahdb-studio.AppDir/usr/lib/webkit2gtk-4.1/
cp -a "$WEBKIT_DIR/injected-bundle" build/appimage/wadahdb-studio.AppDir/usr/lib/webkit2gtk-4.1/
cd build/appimage
export PATH="$DEPLOY_DIR:$PATH"
export APPIMAGE_EXTRACT_AND_RUN=1
export OUTPUT="wadahdb-studio_0.1.0_amd64.AppImage"
export NO_STRIP=1
# Supply a downloaded runtime for offline/restricted-network packaging.
if [[ -n "${APPIMAGE_RUNTIME_FILE:-}" ]]; then export LDAI_RUNTIME_FILE="$APPIMAGE_RUNTIME_FILE"; fi
"$DEPLOY" --appdir wadahdb-studio.AppDir --executable ../bin/wadahdb-studio --desktop-file wadahdb-studio.desktop --icon-file ../icons/wadahdb-studio.png --custom-apprun ../../scripts/AppRun --plugin gtk --output appimage
