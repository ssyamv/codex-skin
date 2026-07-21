#!/bin/zsh

set -euo pipefail

repo_root="${0:A:h:h}"
build_root="$(mktemp -d "${TMPDIR:-/tmp}/codex-theme-model-test.XXXXXX")"

cleanup() {
  /bin/rm -rf "$build_root"
}
trap cleanup EXIT

/usr/bin/swiftc \
  -swift-version 5 \
  "$repo_root/macos/CodexPro/CodexTheme.swift" \
  "$repo_root/macos/Tests/main.swift" \
  -o "$build_root/theme-model-test"

"$build_root/theme-model-test"
