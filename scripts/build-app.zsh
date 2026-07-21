#!/bin/zsh

set -euo pipefail

repo_root="${0:A:h:h}"
output_app_path="$repo_root/dist/Codex Skin Studio.app"
source_root="$repo_root/macos/CodexPro"
build_root="$(mktemp -d "${TMPDIR:-/tmp}/codex-skin-studio-build.XXXXXX")"
app_path="$build_root/Codex Skin Studio.app"
node_path="${CODEX_SKIN_NODE:-${CODEX_PRO_NODE:-$(whence -p node 2>/dev/null || true)}}"

cleanup() {
  /bin/rm -rf "$build_root"
}
trap cleanup EXIT

if [[ -z "$node_path" || ! -x "$node_path" ]]; then
  print -u2 -r -- "找不到可打包的 Node.js 22+。可通过 CODEX_PRO_NODE 指定。"
  exit 1
fi

node_major="$($node_path -p 'Number(process.versions.node.split(".")[0])')"
if (( node_major < 22 )); then
  print -u2 -r -- "需要 Node.js 22+，当前为 $($node_path --version)。"
  exit 1
fi

if [[ "$output_app_path" != "$repo_root/dist/Codex Skin Studio.app" ]]; then
  print -u2 -r -- "拒绝清理非预期应用路径：$output_app_path"
  exit 1
fi

/bin/mkdir -p "$repo_root/dist"
/bin/mkdir -p \
  "$app_path/Contents/MacOS" \
  "$app_path/Contents/Resources/runtime/bin" \
  "$app_path/Contents/Resources/runtime/src"

target_arch="$(uname -m)"
/usr/bin/swiftc \
  -parse-as-library \
  -swift-version 5 \
  -O \
  -target "${target_arch}-apple-macos14.0" \
  -framework AppKit \
  -framework SwiftUI \
  "$source_root"/*.swift \
  -o "$app_path/Contents/MacOS/CodexSkinStudio"

/bin/cp "$source_root/Info.plist" "$app_path/Contents/Info.plist"
/bin/cp "$node_path" "$app_path/Contents/Resources/runtime/node"
/bin/chmod 755 "$app_path/Contents/Resources/runtime/node"
/bin/cp "$repo_root/bin/codex-skin.mjs" "$app_path/Contents/Resources/runtime/bin/"
/bin/cp "$repo_root/src/"*.mjs "$app_path/Contents/Resources/runtime/src/"
/bin/cp -R "$repo_root/theme-packs" "$app_path/Contents/Resources/runtime/"

icon_source="$repo_root/assets/codex-pro-icon.png"
iconset="$build_root/CodexSkinStudioIcon.iconset"
/bin/mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  /usr/bin/sips -z "$size" "$size" "$icon_source" \
    --out "$iconset/icon_${size}x${size}.png" >/dev/null
  retina_size=$(( size * 2 ))
  /usr/bin/sips -z "$retina_size" "$retina_size" "$icon_source" \
    --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
/usr/bin/iconutil -c icns "$iconset" \
  -o "$app_path/Contents/Resources/CodexSkinStudioIcon.icns"

/usr/bin/xattr -cr "$app_path"
/usr/bin/codesign --force --deep --sign - "$app_path" >/dev/null

/usr/bin/plutil -lint "$app_path/Contents/Info.plist" >/dev/null
/usr/bin/codesign --verify --deep --strict "$app_path"
/usr/bin/ditto "$app_path" "$output_app_path"
# Do not remove the existing bundle before copying. A running themed Codex may
# have inherited a path below this bundle; keeping the directory alive prevents
# an app rebuild from invalidating that process's cwd mid-session.
for sign_attempt in 1 2 3; do
  /usr/bin/xattr -cr "$output_app_path"
  if /usr/bin/codesign --force --deep --sign - "$output_app_path" >/dev/null; then
    break
  fi
  if (( sign_attempt == 3 )); then
    print -u2 -r -- "无法签名输出应用：Finder 元数据持续回写。"
    exit 1
  fi
done
# The workspace may be backed by File Provider, which can re-add FinderInfo
# immediately. Deep verification proves the copied bundle remains sealed; the
# clean temporary bundle above is also required to pass strict verification.
/usr/bin/xattr -cr "$output_app_path"
/usr/bin/xattr -d com.apple.FinderInfo "$output_app_path" 2>/dev/null || true
/usr/bin/xattr -d 'com.apple.fileprovider.fpfs#P' "$output_app_path" 2>/dev/null || true
/usr/bin/codesign --verify --deep "$output_app_path"

print -r -- "已构建：$output_app_path"
print -r -- "架构：$target_arch；内置 Node：$($node_path --version)"
