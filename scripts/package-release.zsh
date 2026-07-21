#!/bin/zsh

set -euo pipefail

app_path=""
skill_path=""
version=""
release_arch=""
output_root=""
app_name="Codex Skin Studio.app"
skill_name="customize-codex-theme"
bundle_id="com.ssyamv.codexskinstudio"

usage() {
  print -r -- "Usage: package-release.zsh --app <app> --skill <skill> --version <semver> --arch <arm64|x64> --output <directory>"
}

while (( $# > 0 )); do
  case "$1" in
    --app|--skill|--version|--arch|--output)
      if (( $# < 2 )); then
        print -u2 -r -- "$1 requires a value"
        exit 2
      fi
      option="$1"
      value="$2"
      shift 2
      case "$option" in
        --app) app_path="$value" ;;
        --skill) skill_path="$value" ;;
        --version) version="$value" ;;
        --arch) release_arch="$value" ;;
        --output) output_root="$value" ;;
      esac
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

for required in app_path skill_path version release_arch output_root; do
  if [[ -z "${(P)required}" ]]; then
    print -u2 -r -- "missing required argument: $required"
    exit 2
  fi
done
if [[ ! "$version" =~ '^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$' ]]; then
  print -u2 -r -- "invalid version: $version"
  exit 2
fi
if [[ "$release_arch" != "arm64" && "$release_arch" != "x64" ]]; then
  print -u2 -r -- "arch must be arm64 or x64"
  exit 2
fi

app_path="${app_path:A}"
skill_path="${skill_path:A}"
output_root="${output_root:A}"
if [[ ! -d "$app_path" || -L "$app_path" ]]; then
  print -u2 -r -- "App is missing or unsafe: $app_path"
  exit 1
fi
if [[ ! -f "$skill_path/SKILL.md" || -L "$skill_path" ]]; then
  print -u2 -r -- "Skill is missing or unsafe: $skill_path"
  exit 1
fi

temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/codex-skin-package.XXXXXX")"
cleanup() {
  /bin/rm -rf -- "$temporary_root"
}
trap cleanup EXIT

staged_app="$temporary_root/$app_name"
staged_skill="$temporary_root/$skill_name"
app_asset="Codex-Skin-Studio-${version}-macos-${release_arch}.zip"
skill_asset="customize-codex-theme-${version}.zip"

COPYFILE_DISABLE=1 /usr/bin/ditto \
  --norsrc --noextattr --noqtn --noacl \
  "$app_path" "$staged_app"
/usr/bin/codesign --verify --deep --strict "$staged_app"
staged_bundle_id="$(/usr/libexec/PlistBuddy \
  -c 'Print :CFBundleIdentifier' \
  "$staged_app/Contents/Info.plist" 2>/dev/null || true)"
if [[ "$staged_bundle_id" != "$bundle_id" ]]; then
  print -u2 -r -- "unexpected Bundle ID: ${staged_bundle_id:-missing}"
  exit 1
fi

COPYFILE_DISABLE=1 /usr/bin/ditto \
  --norsrc --noextattr --noqtn --noacl \
  "$skill_path" "$staged_skill"
/usr/bin/find "$staged_skill" -name .DS_Store -type f -delete

COPYFILE_DISABLE=1 /usr/bin/ditto \
  -c -k --norsrc --noextattr --noqtn --noacl --keepParent \
  "$staged_app" "$temporary_root/$app_asset"
COPYFILE_DISABLE=1 /usr/bin/ditto \
  -c -k --norsrc --noextattr --noqtn --noacl --keepParent \
  "$staged_skill" "$temporary_root/$skill_asset"

/bin/mkdir -p "$output_root"
for asset in "$app_asset" "$skill_asset" SHA256SUMS; do
  /bin/rm -f -- "$output_root/$asset"
done
/usr/bin/ditto "$temporary_root/$app_asset" "$output_root/$app_asset"
/usr/bin/ditto "$temporary_root/$skill_asset" "$output_root/$skill_asset"
(
  cd "$output_root"
  /usr/bin/shasum -a 256 "$app_asset" "$skill_asset" > SHA256SUMS
  /usr/bin/shasum -a 256 -c SHA256SUMS
)

print -r -- "packaged=$output_root/$app_asset"
print -r -- "packaged=$output_root/$skill_asset"
print -r -- "checksums=$output_root/SHA256SUMS"
