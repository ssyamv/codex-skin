# Codex Skin Studio theme contract

## Contents

1. Paths and components
2. Background decision
3. Generator config
4. Theme pack schema
5. CLI contract
6. Installation and running-process gate
7. Security boundaries
8. Evidence checklist
9. Recovery matrix

## 1. Paths and components

The Skill directory is self-contained. Resolve paths relative to `SKILL.md` instead of assuming the current working directory.

The App is normally installed at:

- `~/Applications/Codex Skin Studio.app`
- `/Applications/Codex Skin Studio.app` when it is already present and writable by the user

Inside the App:

```text
Contents/Resources/runtime/node
Contents/Resources/runtime/bin/codex-skin.mjs
```

User themes are installed below:

```text
~/Library/Application Support/Codex Skin Studio/Themes/<theme-id>
```

Theme runtimes are isolated below:

```text
~/Library/Application Support/Codex Skin Studio/Runtime/<theme-id>
```

No component writes theme data inside `~/.codex`.

## 2. Background decision

Use this decision before touching the image:

| User intent | Required action |
|---|---|
| Generate a new background | Use `imagegen` |
| Regenerate or replace a background visually | Use `imagegen` |
| Modify, restyle, extend, remove, or add visual content | Use `imagegen` |
| Use an existing PNG/JPEG/WebP unchanged | Do not generate; copy the original bytes through the generator |

Never use local drawing scripts, PIL, ImageMagick composition, SVG rewriting, or CSS-generated substitute artwork for a requested generated/editable background.

Prefer a landscape image with a quiet region behind the conversation surface. Avoid fine text, logos, UI screenshots, and high-frequency detail. Keep the important subject away from controls likely to cover it.

## 3. Generator config

`scripts/create-theme-pack.mjs` accepts:

```text
--config <json> --hero <png|jpg|jpeg|webp> --output <new-directory>
```

The JSON requires:

```json
{
  "id": "quiet-orbit",
  "displayName": "Quiet Orbit",
  "eyebrow": "A CALM ORBITAL WORKSPACE",
  "summary": "A dark, low-detail workspace with a quiet blue horizon.",
  "appearance": "dark",
  "colors": {
    "surface": "#10141D",
    "text": "#E8EEF8",
    "muted": "rgba(232, 238, 248, 0.62)",
    "accent": "rgb(99, 153, 255)",
    "border": "rgba(130, 166, 220, 0.28)",
    "code": "#171D29"
  }
}
```

Rules:

- `id`: 3–48 lowercase ASCII characters, digits, and single hyphens between segments.
- `displayName`, `eyebrow`, `summary`: non-empty strings.
- `appearance`: exactly `light` or `dark`.
- All six colors are required.
- Colors must be `#RRGGBB`, `rgb()` with channels from 0–255, or `rgba()` with alpha from 0–1.
- The output directory must not already exist.
- The source image must be at most 20 MiB and its bytes must identify PNG, JPEG, or WebP.

The generator performs no pixel transformation. `hero` and `preview` contain the same validated source bytes.

## 4. Theme pack schema

The output contains exactly:

```text
<theme-id>/
├── theme.json
├── theme.css
├── hero.<ext>
└── preview.<ext>
```

`theme.json` uses schema version 1:

```json
{
  "schemaVersion": 1,
  "id": "quiet-orbit",
  "displayName": "Quiet Orbit",
  "eyebrow": "A CALM ORBITAL WORKSPACE",
  "summary": "A dark, low-detail workspace with a quiet blue horizon.",
  "appearance": "dark",
  "cssFile": "theme.css",
  "heroFile": "hero.png",
  "previewFile": "preview.png"
}
```

CSS requirements:

- Root every rule at `html[data-codex-skin="<theme-id>"]`.
- Prefix private variables with `--cs-<theme-id>-`.
- Include exactly one `__CODEX_SKIN_HERO_IMAGE__` placeholder.
- Do not change fonts, type metrics, layout, visibility, pointer behavior, or control geometry.
- Let the runtime safety validator reject anything outside the supported visual surface.

## 5. CLI contract

Set these shell variables from the installed App path:

```bash
RUNTIME_NODE="APP/Contents/Resources/runtime/node"
RUNTIME_CLI="APP/Contents/Resources/runtime/bin/codex-skin.mjs"
```

Supported operations:

```text
RUNTIME_NODE RUNTIME_CLI themes list --json
RUNTIME_NODE RUNTIME_CLI themes validate PACK_DIR --json
RUNTIME_NODE RUNTIME_CLI themes install PACK_DIR [--replace] --json
RUNTIME_NODE RUNTIME_CLI themes remove THEME_ID --json
RUNTIME_NODE RUNTIME_CLI start --theme THEME_ID
RUNTIME_NODE RUNTIME_CLI status --theme THEME_ID --json
RUNTIME_NODE RUNTIME_CLI doctor --theme THEME_ID --json
RUNTIME_NODE RUNTIME_CLI verify --theme THEME_ID --json
RUNTIME_NODE RUNTIME_CLI snapshot --theme THEME_ID --output FILE.png
RUNTIME_NODE RUNTIME_CLI stop --theme THEME_ID
RUNTIME_NODE RUNTIME_CLI uninstall --theme THEME_ID
```

`uninstall` removes runtime state but keeps the installed theme pack. `themes remove` removes a user theme pack and refuses built-ins or a live theme.

## 6. Installation and running-process gate

The installer defaults to the latest stable `ssyamv/codex-skin` GitHub Release, selects the host architecture, verifies SHA-256 and code signing, validates the exact Bundle ID, and installs into `~/Applications` with recoverable backup semantics.

Preview the resolved release and destination before writing:

```text
scripts/install-app.zsh --print-plan
```

Install the latest stable release:

```text
scripts/install-app.zsh
```

Supported explicit inputs:

```text
--version <semver>
--source-dir <local-release-directory>
--install-root <directory>
--print-plan
```

`--source-dir` requires `--version` and is intended for a locally downloaded or test Release directory containing the selected ZIP plus `SHA256SUMS`. The installer verifies everything before changing the destination, keeps any previous App in a same-parent backup, runs post-install `doctor`, and restores the previous App if that final check fails.

Before `start`, check whether ordinary Codex is running. When it is:

- `themes validate` and offline `themes install` may continue.
- Do not automatically start, launch, quit, or kill Codex.
- Tell the user the theme is installed and ask them to exit ordinary Codex before launch verification.

The runtime itself also refuses unsafe launch conditions.

## 7. Security boundaries

- Never modify the signed official Codex bundle.
- Never modify `app.asar` or inject persistent files into Codex.
- Never edit or delete the ordinary Chromium profile.
- Never write theme or runtime state into `~/.codex`.
- App installation is user-scoped and must not invoke `sudo`.
- App installation must not remove quarantine with `xattr -d`.
- App installation must not disable Gatekeeper with `spctl --master-disable` or equivalent commands.
- Never terminate an ordinary Codex process automatically.
- Only remove directories that pass the runtime ownership marker and exact-theme checks.

## 8. Evidence checklist

A completed launched installation records:

1. `themes validate ... --json`: candidate ID and paths.
2. `themes install ... --json`: installed source equals `user`.
3. `doctor --theme ... --json`: static prerequisites and signature checks.
4. `verify --theme ... --json`: live runtime verification.
5. Optional but preferred `snapshot`: visual evidence inspected for readability.

If ordinary Codex is running, label the result “installed, launch deferred.” Do not report `doctor` or `verify` as passed unless those commands actually ran successfully.

## 9. Recovery matrix

| Failure | Required recovery |
|---|---|
| Generator or validation fails | Keep the previous installed theme; correct config/image and regenerate into a new directory |
| Replace fails before install completes | Confirm the theme store restored its backup; run `themes list --json` |
| Start or verify fails | Run `stop --theme THEME_ID`, preserve logs, run `doctor`, and report the exact failing check |
| App update fails | Restore the same-parent App backup and re-run code-signature and Bundle ID checks |
| User asks to roll back theme runtime | Run `stop`, then `uninstall --theme THEME_ID`; keep the pack unless removal was requested |
| User asks to delete the theme | Stop it first, then run `themes remove THEME_ID --json` |
| Ordinary Codex is running | Do not kill it; keep the offline install and defer launch |

Always scope stop, restore, uninstall, and remove operations to the exact App or theme involved.
