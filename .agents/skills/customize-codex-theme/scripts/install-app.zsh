#!/bin/zsh

set -euo pipefail

repository="ssyamv/codex-skin"
bundle_id="com.ssyamv.codexskinstudio"
app_name="Codex Skin Studio.app"
version=""
source_dir=""
install_root="${HOME}/Applications"
print_plan=0

usage() {
  print -r -- "Usage: install-app.zsh [--version <semver>] [--source-dir <release-dir>] [--install-root <dir>] [--print-plan]"
}

while (( $# > 0 )); do
  case "$1" in
    --version|--source-dir|--install-root)
      if (( $# < 2 )); then
        print -u2 -r -- "$1 requires a value"
        exit 2
      fi
      option="$1"
      value="$2"
      shift 2
      case "$option" in
        --version) version="$value" ;;
        --source-dir) source_dir="$value" ;;
        --install-root) install_root="$value" ;;
      esac
      ;;
    --print-plan)
      print_plan=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      print -u2 -r -- "unknown option: $1"
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$version" ]]; then
  if [[ -n "$source_dir" ]]; then
    print -u2 -r -- "--version is required with --source-dir"
    exit 2
  fi
  latest_url="$(/usr/bin/curl \
    --fail \
    --location \
    --silent \
    --show-error \
    --head \
    --output /dev/null \
    --write-out '%{url_effective}' \
    "https://github.com/${repository}/releases/latest")"
  latest_tag="${latest_url:t}"
  version="${latest_tag#v}"
fi

if [[ ! "$version" =~ '^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$' ]]; then
  print -u2 -r -- "invalid version: $version"
  exit 2
fi

host_arch="${CODEX_SKIN_INSTALL_ARCH:-$(/usr/bin/uname -m)}"
case "$host_arch" in
  arm64) release_arch="arm64" ;;
  x86_64) release_arch="x64" ;;
  *)
    print -u2 -r -- "unsupported architecture: $host_arch"
    exit 2
    ;;
esac

asset_name="Codex-Skin-Studio-${version}-macos-${release_arch}.zip"
checksum_name="SHA256SUMS"
install_root="${install_root:A}"
target_app="$install_root/$app_name"

if [[ -n "$source_dir" ]]; then
  source_dir="${source_dir:A}"
  asset_source="$source_dir/$asset_name"
  checksum_source="$source_dir/$checksum_name"
else
  release_base="https://github.com/${repository}/releases/download/v${version}"
  asset_source="$release_base/$asset_name"
  checksum_source="$release_base/$checksum_name"
fi

if (( print_plan )); then
  print -r -- "repository=$repository"
  print -r -- "version=$version"
  print -r -- "architecture=$release_arch"
  print -r -- "asset=$asset_name"
  print -r -- "source=$asset_source"
  print -r -- "install=$target_app"
  exit 0
fi

temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/codex-skin-install.XXXXXX")"
download_root="$temporary_root/download"
extract_root="$temporary_root/extract"
backup_app="$install_root/.Codex Skin Studio.app.backup-${version}-${$}"
backup_created=0
new_app_created=0
install_succeeded=0

cleanup() {
  exit_status=$?
  if (( exit_status != 0 || ! install_succeeded )); then
    if (( new_app_created )) && [[ -d "$target_app" && ! -L "$target_app" ]]; then
      /bin/rm -rf -- "$target_app"
    fi
    if (( backup_created )) && [[ -d "$backup_app" && ! -L "$backup_app" ]]; then
      /bin/mv "$backup_app" "$target_app"
      print -u2 -r -- "installation failed; restored previous App"
    fi
  fi
  /bin/rm -rf -- "$temporary_root"
}
trap cleanup EXIT

/bin/mkdir -p "$download_root" "$extract_root"
downloaded_asset="$download_root/$asset_name"
downloaded_checksums="$download_root/$checksum_name"

if [[ -n "$source_dir" ]]; then
  if [[ ! -f "$asset_source" || -L "$asset_source" ]]; then
    print -u2 -r -- "release asset is missing or unsafe: $asset_source"
    exit 1
  fi
  if [[ ! -f "$checksum_source" || -L "$checksum_source" ]]; then
    print -u2 -r -- "checksum file is missing or unsafe: $checksum_source"
    exit 1
  fi
  /usr/bin/ditto "$asset_source" "$downloaded_asset"
  /usr/bin/ditto "$checksum_source" "$downloaded_checksums"
else
  /usr/bin/curl --fail --location --silent --show-error \
    --output "$downloaded_asset" "$asset_source"
  /usr/bin/curl --fail --location --silent --show-error \
    --output "$downloaded_checksums" "$checksum_source"
fi

selected_checksum="$download_root/SHA256SUMS.selected"
checksum_line="$(/usr/bin/grep -E "^[0-9a-fA-F]{64}  ${asset_name}$" "$downloaded_checksums" || true)"
if [[ -z "$checksum_line" || "$checksum_line" == *$'\n'* ]]; then
  print -u2 -r -- "checksum entry is missing or ambiguous for $asset_name"
  exit 1
fi
print -r -- "$checksum_line" > "$selected_checksum"
(
  cd "$download_root"
  /usr/bin/shasum -a 256 -c "${selected_checksum:t}"
)

/usr/bin/ditto -x -k "$downloaded_asset" "$extract_root"
candidate_app="$extract_root/$app_name"
if [[ ! -d "$candidate_app" || -L "$candidate_app" ]]; then
  print -u2 -r -- "archive does not contain $app_name"
  exit 1
fi

/usr/bin/codesign --verify --deep --strict "$candidate_app"
candidate_bundle_id="$(/usr/libexec/PlistBuddy \
  -c 'Print :CFBundleIdentifier' \
  "$candidate_app/Contents/Info.plist" 2>/dev/null || true)"
if [[ "$candidate_bundle_id" != "$bundle_id" ]]; then
  print -u2 -r -- "unexpected Bundle ID: ${candidate_bundle_id:-missing}"
  exit 1
fi

candidate_node="$candidate_app/Contents/Resources/runtime/node"
candidate_cli="$candidate_app/Contents/Resources/runtime/bin/codex-skin.mjs"
if [[ ! -x "$candidate_node" || ! -f "$candidate_cli" || -L "$candidate_cli" ]]; then
  print -u2 -r -- "App runtime resources are incomplete"
  exit 1
fi

/bin/mkdir -p "$install_root"
if [[ -e "$target_app" || -L "$target_app" ]]; then
  if [[ ! -d "$target_app" || -L "$target_app" ]]; then
    print -u2 -r -- "refusing to replace non-App path: $target_app"
    exit 1
  fi
  if [[ -e "$backup_app" || -L "$backup_app" ]]; then
    print -u2 -r -- "backup path already exists: $backup_app"
    exit 1
  fi
  /bin/mv "$target_app" "$backup_app"
  backup_created=1
fi

/usr/bin/ditto "$candidate_app" "$target_app"
new_app_created=1
/usr/bin/codesign --verify --deep --strict "$target_app"
installed_bundle_id="$(/usr/libexec/PlistBuddy \
  -c 'Print :CFBundleIdentifier' \
  "$target_app/Contents/Info.plist")"
if [[ "$installed_bundle_id" != "$bundle_id" ]]; then
  print -u2 -r -- "installed Bundle ID changed unexpectedly"
  exit 1
fi

installed_node="$target_app/Contents/Resources/runtime/node"
installed_cli="$target_app/Contents/Resources/runtime/bin/codex-skin.mjs"
doctor_output="$temporary_root/doctor.json"
if ! "$installed_node" "$installed_cli" doctor --json > "$doctor_output"; then
  print -u2 -r -- "post-install doctor failed"
  exit 1
fi

install_succeeded=1
if (( backup_created )); then
  /bin/rm -rf -- "$backup_app"
  backup_created=0
fi

print -r -- "installed=$target_app"
print -r -- "version=$version"
print -r -- "architecture=$release_arch"
print -r -- "doctor=$(<"$doctor_output")"
