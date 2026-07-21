# Codex Skin Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a macOS Codex Skin Studio app and a distributable `customize-codex-theme` Skill that generates, installs, verifies, and restores safe custom Codex themes and backgrounds.

**Architecture:** Replace the hard-coded theme enum with a versioned theme-pack store shared by the Node CLI and Swift app. Keep image generation in the Skill through `imagegen`, but make theme construction, validation, installation, rollback, app installation, and release verification deterministic scripts with narrow filesystem boundaries.

**Tech Stack:** Node.js 22 ESM and `node:test`, Swift 5/SwiftUI, zsh, GitHub Actions, Codex Skill metadata and `imagegen`.

---

### Task 1: Establish a reproducible source baseline on the feature branch

**Files:**
- Modify: `.gitignore`
- Track: existing app source, tests, docs, launchers, runtime assets, and the approved design/plan

- [ ] **Step 1: Create the approved implementation branch**

Run:

```bash
git switch -c codex/custom-theme-skill
```

Expected: `git branch --show-current` prints `codex/custom-theme-skill`.

- [ ] **Step 2: Run the untouched baseline verification**

Run:

```bash
npm run verify
```

Expected: syntax checks pass and all existing Node tests report zero failures.

- [ ] **Step 3: Tighten repository hygiene before staging**

Add these entries to `.gitignore` while preserving current build and artifact rules:

```gitignore
.worktrees/
tmp/
*.zip
SHA256SUMS
```

Run:

```bash
git status --short --untracked-files=all
git check-ignore -v tmp/imagegen/codex-pro-icon-chroma.png
```

Expected: `tmp/` is ignored and `dist/` remains ignored.

- [ ] **Step 4: Stage the existing product baseline explicitly**

Run:

```bash
git add .gitignore README.md package.json codex-skin \
  "Codex Makima.command" "Codex Faye.command" \
  "Stop Codex Skin.command" "Stop Codex Faye.command" \
  assets bin docs macos scripts src test themes \
  artifacts/runtime/makima-runtime-left-static.png \
  makima-codex-ui-concept-v1.png rin-tohsaka-codex-ui-concept-v1.png \
  saber-codex-ui-concept-v1.png
git diff --cached --check
```

Expected: no `dist/`, `tmp/`, private profile, state file, log, or secret is staged.

- [ ] **Step 5: Commit the verified baseline**

```bash
git commit -m "chore: capture Codex skin app baseline"
```

### Task 2: Add a versioned dynamic theme-pack store

**Files:**
- Create: `src/theme-store.mjs`
- Create: `test/theme-store.test.mjs`
- Create: `theme-packs/makima/theme.json`
- Create: `theme-packs/faye/theme.json`
- Move: `themes/makima.css` to `theme-packs/makima/theme.css`
- Move: `themes/faye.css` to `theme-packs/faye/theme.css`
- Move: runtime hero and preview assets into the matching `theme-packs/*/`
- Modify: `src/themes.mjs`

- [ ] **Step 1: Write failing manifest and discovery tests**

Create tests that construct fixture packs under `mkdtemp()` and assert this public API:

```js
const store = new ThemeStore({ builtInRoot, userRoot, environment });
const themes = await store.list();
const theme = await store.resolve("moonlit-archive");

assert.equal(theme.schemaVersion, 1);
assert.equal(theme.styleId, "codex-skin-moonlit-archive");
assert.equal(theme.stateKey, "__CODEX_SKIN_MOONLIT_ARCHIVE_STATE__");
assert.equal(theme.cssVariablePrefix, "--cs-moonlit-archive-");
assert.equal(theme.source, "user");
assert.match(theme.previewPath, /preview\.png$/);
```

Also assert rejection of uppercase IDs, `..`, absolute paths, symlinks, duplicate IDs, unsupported schema, mismatched image headers, CSS above 1 MiB, and images above 20 MiB.

- [ ] **Step 2: Run the focused test and observe the missing-module failure**

```bash
node --test test/theme-store.test.mjs
```

Expected: FAIL because `src/theme-store.mjs` does not exist.

- [ ] **Step 3: Implement the minimal theme-pack contract**

Export these exact interfaces:

```js
export const THEME_SCHEMA_VERSION = 1;
export const DEFAULT_THEME_ID = "makima";
export const MAX_THEME_CSS_BYTES = 1024 * 1024;
export const MAX_THEME_IMAGE_BYTES = 20 * 1024 * 1024;

export function defaultUserThemesRoot(environment = process.env) {}
export function deriveThemeRuntimeFields(id) {}
export async function validateThemePack(themeDirectory, options = {}) {}

export class ThemeStore {
  constructor({ builtInRoot, userRoot, environment = process.env } = {}) {}
  async list() {}
  async resolve(id = DEFAULT_THEME_ID) {}
  async install(sourceDirectory, { replace = false, isRunning } = {}) {}
  async remove(id, { isRunning } = {}) {}
}
```

Use `lstat`, `realpath`, file-header sniffing, bounded `stat.size`, and canonical parent checks. Do not follow symlinks. For replacement, rename the existing pack to a sibling backup, rename the validated temporary copy into place, and restore the backup on any error.

- [ ] **Step 4: Migrate built-in themes mechanically**

Use tracked `git mv` operations for CSS and binary assets. Create manifests with IDs `makima` and `faye`. Update their CSS custom-property prefixes mechanically from `--mk-`/`--fy-` to `--cs-makima-`/`--cs-faye-` so prefixes are derived rather than privileged exceptions.

- [ ] **Step 5: Keep a compatibility façade in `src/themes.mjs`**

Export:

```js
export { DEFAULT_THEME_ID, ThemeStore, deriveThemeRuntimeFields } from "./theme-store.mjs";
export function createThemeStore(options = {}) {
  return new ThemeStore(options);
}
```

Remove the static `THEMES` object after all callers have moved to `ThemeStore`.

- [ ] **Step 6: Run focused and full theme tests**

```bash
node --test test/theme-store.test.mjs test/theme.test.mjs
npm test
```

Expected: all theme-store edge cases and migrated built-in theme assertions pass.

- [ ] **Step 7: Commit**

```bash
git add src/themes.mjs src/theme-store.mjs test/theme-store.test.mjs \
  test/theme.test.mjs theme-packs themes assets
git commit -m "feat: add dynamic theme pack store"
```

### Task 3: Add theme management commands to the CLI

**Files:**
- Create: `test/theme-cli.test.mjs`
- Modify: `bin/codex-skin.mjs`
- Modify: `scripts/runtime-probe.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing black-box CLI tests**

Spawn the CLI with a temporary `HOME` and `CODEX_SKIN_STUDIO_HOME`. Cover:

```text
themes list --json
themes validate <fixture> --json
themes install <fixture> --json
themes install <fixture> --replace --json
themes remove <id> --json
```

Assert JSON includes `schemaVersion`, `id`, `displayName`, `source`, `previewPath`, and `installedPath`. Assert `uninstall` does not delete an installed pack and `themes remove` refuses an active theme.

- [ ] **Step 2: Run the test and observe the unknown-command failure**

```bash
node --test test/theme-cli.test.mjs
```

Expected: FAIL because `themes` subcommands are not implemented.

- [ ] **Step 3: Restructure CLI startup around async theme resolution**

Parse positional values separately from options:

```js
const parsed = parseArguments(process.argv.slice(2));
const store = createThemeStore({ projectRoot, environment: process.env });

if (parsed.command === "themes") {
  await themesCommand(parsed.positionals[0] || "list", parsed, store);
} else {
  theme = await store.resolve(parsed.options.theme);
  themePath = theme.cssPath;
  heroImagePath = theme.heroPath;
  paths = getRuntimePaths(process.env, { runtimeDirectory: theme.runtimeDirectory });
  await runThemeCommand(parsed.command);
}
```

Emit machine-readable JSON to stdout and operational errors to stderr with non-zero exit status.

- [ ] **Step 4: Update help and runtime probe**

Document arbitrary `<theme-id>` values and the five theme-management commands. Make `runtime-probe.mjs` await `store.resolve()`.

- [ ] **Step 5: Verify CLI behavior**

```bash
node --test test/theme-cli.test.mjs
node bin/codex-skin.mjs themes list --json
npm run check
npm test
```

Expected: built-in themes are listed and temporary custom packs survive separate CLI invocations.

- [ ] **Step 6: Commit**

```bash
git add bin/codex-skin.mjs scripts/runtime-probe.mjs package.json \
  test/theme-cli.test.mjs
git commit -m "feat: manage custom themes from the CLI"
```

### Task 4: Generalize image compilation, CSS safety, and runtime isolation

**Files:**
- Modify: `src/injector.mjs`
- Modify: `src/runtime.mjs`
- Modify: `test/injector.test.mjs`
- Modify: `test/runtime.test.mjs`
- Modify: `test/theme.test.mjs`

- [ ] **Step 1: Write failing dynamic-theme tests**

Add a fixture theme with ID `moonlit-archive`, PNG hero bytes, a derived CSS prefix, and minimal safe CSS. Assert:

```js
const compiled = await loadThemeCss(cssPath, { heroImagePath, theme });
assert.match(compiled, /data:image\/png;base64,/);
assert.doesNotThrow(() => validateSkinCss(css, { theme }));
assert.match(getRuntimePaths({}, { runtimeDirectory: theme.runtimeDirectory }).home,
  /Codex Skin Studio\/Runtime\/moonlit-archive$/);
```

Assert JPEG/WebP MIME recognition and rejection of SVG, malformed bytes, remote URLs, wrong root selectors, wrong custom-property prefixes, path or layout mutations, and cross-theme style IDs.

- [ ] **Step 2: Run the focused tests and confirm expected failures**

```bash
node --test test/injector.test.mjs test/runtime.test.mjs
```

Expected: PNG/JPEG compilation and dynamic root/prefix assertions fail against the hard-coded implementation.

- [ ] **Step 3: Implement MIME-safe compilation and generic validation**

Add:

```js
export function detectThemeImageMime(bytes) {
  if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  throw new Error("Unsupported theme image format");
}
```

Compile the data URI with the detected MIME. Keep Makima-only diff shadow enhancements behind `theme.id === "makima"`; custom themes receive an empty shadow override rather than unsafe guessed CSS.

- [ ] **Step 4: Generalize runtime ownership markers**

Rename the marker to `.codex-skin-studio-owned` and use stable value `codex-skin-studio:v1\n`. Derive each runtime directory from the validated theme ID. Preserve explicit `CODEX_SKIN_HOME` and `CODEX_SKIN_PROFILE_DIR` test overrides.

- [ ] **Step 5: Run all safety tests**

```bash
node --test test/injector.test.mjs test/runtime.test.mjs test/theme.test.mjs
npm run verify
```

Expected: all existing non-modification, typography, layout, pointer-event, lifecycle, and dynamic-theme tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/injector.mjs src/runtime.mjs test/injector.test.mjs \
  test/runtime.test.mjs test/theme.test.mjs theme-packs
git commit -m "feat: validate dynamic theme runtime assets"
```

### Task 5: Make the Swift app discover themes dynamically and rebrand it

**Files:**
- Create: `macos/CodexPro/CodexTheme.swift`
- Create: `macos/Tests/main.swift`
- Create: `scripts/test-swift-theme-model.zsh`
- Rename: `scripts/build-codex-pro.zsh` to `scripts/build-app.zsh`
- Modify: `macos/CodexPro/CodexRuntime.swift`
- Modify: `macos/CodexPro/CodexProModel.swift`
- Modify: `macos/CodexPro/CodexProView.swift`
- Modify: `macos/CodexPro/Info.plist`
- Modify: `package.json`

- [ ] **Step 1: Write a failing Swift contract executable**

The executable decodes three arbitrary themes from CLI JSON and asserts:

```swift
let themes = try JSONDecoder().decode([CodexTheme].self, from: payload)
precondition(themes.map(\.id) == ["makima", "faye", "moonlit-archive"])
precondition(themes[2].name == "Moonlit Archive")
precondition(themes[2].previewPath.hasSuffix("preview.png"))
```

- [ ] **Step 2: Run it and observe the enum/initializer failure**

```bash
zsh scripts/test-swift-theme-model.zsh
```

Expected: FAIL because `CodexTheme` is still a two-case enum.

- [ ] **Step 3: Implement a Codable theme value model**

Define fields matching CLI JSON:

```swift
struct CodexTheme: Identifiable, Hashable, Codable {
    let id: String
    let displayName: String
    let eyebrow: String
    let summary: String
    let appearance: String
    let source: String
    let previewPath: String
    var name: String { displayName }
}
```

Add `CodexRuntimeClient.listThemes()` and replace `CodexTheme.allCases`/enum dictionaries with a published `[CodexTheme]` and `[String: CodexRuntimeStatus]`. Preserve selection while refreshing when the selected ID remains installed.

- [ ] **Step 4: Load previews from validated local paths**

Replace bundle-name lookup with `NSImage(contentsOfFile: theme.previewPath)`. A missing preview shows the current neutral placeholder and diagnostic text; it does not crash or delete the pack.

- [ ] **Step 5: Rebrand build and bundle metadata**

Use:

```text
CFBundleDisplayName = Codex Skin Studio
CFBundleName = Codex Skin Studio
CFBundleIdentifier = com.ssyamv.codexskinstudio
output = dist/Codex Skin Studio.app
```

Make the build script recursively copy `theme-packs/`, then copy the host-architecture Node 22 executable. Update `npm run build:app` and README paths.

- [ ] **Step 6: Verify model and app builds**

```bash
zsh scripts/test-swift-theme-model.zsh
npm run build:app
codesign --verify --deep --strict "dist/Codex Skin Studio.app"
file "dist/Codex Skin Studio.app/Contents/MacOS/CodexSkinStudio"
```

Expected: model assertions pass, app builds for the host architecture, and ad-hoc signature verification succeeds.

- [ ] **Step 7: Commit**

```bash
git add macos scripts/build-app.zsh scripts/test-swift-theme-model.zsh \
  package.json README.md
git commit -m "feat: discover themes in Codex Skin Studio"
```

### Task 6: Create the Skill with deterministic theme generation

**Files:**
- Create: `test/skill-contract.test.mjs`
- Create via `init_skill.py`: `.agents/skills/customize-codex-theme/`
- Create: `.agents/skills/customize-codex-theme/scripts/create-theme-pack.mjs`
- Create: `.agents/skills/customize-codex-theme/references/theme-contract.md`
- Modify: `.agents/skills/customize-codex-theme/SKILL.md`
- Modify: `.agents/skills/customize-codex-theme/agents/openai.yaml`

- [ ] **Step 1: Write failing Skill acceptance tests before creating the Skill**

Assert the absent Skill fails these concrete scenarios:

- original background generation requires `imagegen`;
- visual edits to an existing background require `imagegen`;
- an existing image used unchanged is copied without fake regeneration;
- ordinary Codex running allows offline install but blocks automatic launch;
- App install never uses `sudo`, `xattr -d`, `spctl --master-disable`, or writes `~/.codex`;
- success requires `themes validate`, `themes install`, `doctor`, and `verify` evidence;
- failure includes stop, restore, and remove commands.

Also test the generator CLI contract with a temporary config and 1×1 PNG fixture.

- [ ] **Step 2: Run the tests and observe the missing-Skill failure**

```bash
node --test test/skill-contract.test.mjs
```

Expected: FAIL because `.agents/skills/customize-codex-theme` does not exist.

- [ ] **Step 3: Initialize the Skill with the official scaffold**

```bash
python3 /Users/chenqi/.codex/skills/.system/skill-creator/scripts/init_skill.py \
  customize-codex-theme \
  --path .agents/skills \
  --resources scripts,references \
  --interface 'display_name=Customize Codex Theme' \
  --interface 'short_description=Generate and install safe custom Codex themes' \
  --interface 'default_prompt=Use $customize-codex-theme to create and install a custom Codex theme from my visual description.'
```

Expected: scaffold contains `SKILL.md` and `agents/openai.yaml` with no extra Skill README.

- [ ] **Step 4: Implement `create-theme-pack.mjs`**

Accept:

```text
--config <json> --hero <png|jpg|webp> --output <directory>
```

Require `id`, `displayName`, `eyebrow`, `summary`, `appearance`, and six CSS colors. Validate colors as `#RRGGBB` or `rgb()/rgba()` with numeric bounds. Copy the image without pixel modification, create preview from the same validated bytes, write schema-1 JSON, and emit minimal safe CSS rooted at `html[data-codex-skin="<id>"]` with exactly one `__CODEX_SKIN_HERO_IMAGE__` placeholder.

- [ ] **Step 5: Write concise Skill instructions and heavy reference**

The frontmatter must be exactly two fields:

```yaml
---
name: customize-codex-theme
description: Use when a macOS Codex Desktop user wants to create, generate, edit, install, switch, validate, recover, or remove a custom visual theme or background.
---
```

Keep `SKILL.md` imperative and under 500 lines. Put manifest schema, config fields, paths, CLI contracts, security boundaries, and recovery matrix in `references/theme-contract.md`.

- [ ] **Step 6: Run generator, contract, and official Skill validation**

```bash
node --test test/skill-contract.test.mjs
python3 /Users/chenqi/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  .agents/skills/customize-codex-theme
wc -l -w .agents/skills/customize-codex-theme/SKILL.md
```

Expected: tests pass, validator reports a valid Skill, and no placeholder files remain.

- [ ] **Step 7: Commit**

```bash
git add .agents/skills/customize-codex-theme test/skill-contract.test.mjs
git commit -m "feat: add custom Codex theme Skill"
```

### Task 7: Add architecture-aware App installation and rollback

**Files:**
- Create: `.agents/skills/customize-codex-theme/scripts/install-app.zsh`
- Create: `test/install-app.test.mjs`
- Modify: `.agents/skills/customize-codex-theme/SKILL.md`
- Modify: `.agents/skills/customize-codex-theme/references/theme-contract.md`

- [ ] **Step 1: Write failing installer tests**

Use a temporary local release directory and dependency shims. Test:

- `arm64` selects `Codex-Skin-Studio-<version>-macos-arm64.zip`;
- `x86_64` selects the `macos-x64` asset;
- checksum mismatch changes nothing;
- malformed ZIP and wrong Bundle ID change nothing;
- existing App is restored if post-install doctor fails;
- no command contains `sudo`, quarantine removal, or Gatekeeper disablement.

- [ ] **Step 2: Run and observe the missing-installer failure**

```bash
node --test test/install-app.test.mjs
```

Expected: FAIL because `install-app.zsh` does not exist.

- [ ] **Step 3: Implement installer inputs and safe defaults**

Support:

```text
--version <semver>
--source-dir <local-release-directory>
--install-root <directory>
--print-plan
```

Default to the latest stable `ssyamv/codex-skin` GitHub Release and `~/Applications`. Use `mktemp -d`, `curl --fail --location`, `/usr/bin/shasum -a 256 -c`, `/usr/bin/ditto`, `/usr/bin/codesign --verify --deep --strict`, exact Bundle ID validation, same-parent backup, and trap-based restoration.

- [ ] **Step 4: Verify local install and recovery**

Build the current host App, create a local ZIP and checksum, then run the installer into a temporary root. Corrupt the checksum and assert the installed App hash remains unchanged.

```bash
node --test test/install-app.test.mjs
```

Expected: all architecture, integrity, and rollback cases pass.

- [ ] **Step 5: Revalidate the Skill and commit**

```bash
python3 /Users/chenqi/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  .agents/skills/customize-codex-theme
git add .agents/skills/customize-codex-theme test/install-app.test.mjs
git commit -m "feat: install Codex Skin Studio from the Skill"
```

### Task 8: Add public repository metadata, CI, and Release packaging

**Files:**
- Create: `LICENSE`
- Create: `NOTICE`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Create: `scripts/package-release.zsh`
- Create: `test/release-package.test.mjs`
- Modify: `README.md`
- Modify: `package.json`

- [ ] **Step 1: Write failing release-package tests**

Assert a temporary packaging run creates exactly:

```text
Codex-Skin-Studio-1.7.0-macos-<arch>.zip
customize-codex-theme-1.7.0.zip
SHA256SUMS
```

Assert the Skill ZIP has top-level `customize-codex-theme/`, excludes `.DS_Store`, and every checksum verifies.

- [ ] **Step 2: Run and observe the missing-packager failure**

```bash
node --test test/release-package.test.mjs
```

Expected: FAIL because `scripts/package-release.zsh` does not exist.

- [ ] **Step 3: Implement package metadata and packager**

Set package name `codex-skin-studio`, version `1.7.0`, `private: false`, repository URL, MIT license metadata, and `files` entries for source packages. Add the full MIT license and a NOTICE stating non-official status and that visual assets are outside the MIT code grant unless their source states otherwise.

- [ ] **Step 4: Add CI and Release workflows**

CI runs `npm run verify`, Swift model test, App build, Skill validation, and release-package tests. Release uses a matrix:

```yaml
include:
  - runner: macos-15
    arch: arm64
  - runner: macos-15-intel
    arch: x64
```

On `v*`, build, ad-hoc sign, package, upload per-arch artifacts, combine `SHA256SUMS`, package the Skill once, and create a GitHub Release. Only run Developer ID/notarization steps when all documented secrets are present; otherwise label assets ad-hoc signed in release notes.

- [ ] **Step 5: Rewrite README around the public workflow**

Lead with non-official status and reversible safety model. Include source install, App build, Skill ZIP install, natural-language examples, dynamic theme CLI, recovery, supported architectures, ad-hoc signing limitation, and exact non-modification guarantees.

- [ ] **Step 6: Run packaging and repository scans**

```bash
npm run verify
npm run build:app
node --test test/release-package.test.mjs
rg -n --hidden -g '!.git' -g '!*.png' -g '!*.webp' \
  '(BEGIN [A-Z ]*PRIVATE KEY|github_pat_|ghp_|sk-[A-Za-z0-9]|password\s*=|token\s*=)' .
```

Expected: all checks pass and secret scan returns no credentials.

- [ ] **Step 7: Commit**

```bash
git add LICENSE NOTICE README.md package.json .github scripts/package-release.zsh \
  test/release-package.test.mjs
git commit -m "ci: package Codex Skin Studio releases"
```

### Task 9: Run the real Skill and end-to-end theme workflow

**Files:**
- Create through Skill: a temporary original theme pack outside the repository
- Create: `artifacts/runtime/custom-theme-e2e.png` only if it is the final public proof image
- Modify: Skill files only if the real run exposes a reproducible gap

- [ ] **Step 1: Load the image-generation Skill before generating artwork**

Read the current `imagegen` Skill completely and follow its output-path and provenance requirements.

- [ ] **Step 2: Generate an original non-character demo background**

Use `imagegen` for a wide macOS workspace background with a detailed focal area on the left and low-detail reading area on the right. Do not use PIL, SVG rewriting, or local drawing scripts.

- [ ] **Step 3: Exercise the distributable Skill path**

From a temporary Skill install and temporary `CODEX_SKIN_STUDIO_HOME`:

1. generate config;
2. run `create-theme-pack.mjs` with the image;
3. run `themes validate`;
4. run `themes install`;
5. confirm `themes list --json` and Swift model see the third theme;
6. run `doctor`;
7. if no ordinary Codex shares `~/.codex`, run `start`, runtime `verify`, snapshot, and `stop`;
8. replace, roll back, and remove the theme.

- [ ] **Step 4: Verify official Codex remains unchanged**

Capture the official executable and `app.asar` SHA-256 before and after the runtime test and compare exact values. Confirm no files under `~/.codex` were written by the theme installer.

- [ ] **Step 5: Re-run tests after any Skill correction and commit**

```bash
npm run verify
python3 /Users/chenqi/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  .agents/skills/customize-codex-theme
git add .agents/skills/customize-codex-theme test artifacts/runtime/custom-theme-e2e.png
git commit -m "test: verify custom theme end to end"
```

Skip the artifact path from staging if no final proof image is produced.

### Task 10: Publish, verify GitHub state, and release v1.7.0

**Files:**
- No new product files unless CI exposes a reproducible defect

- [ ] **Step 1: Perform the completion audit from the design**

Map every item in the design's “完成定义” to fresh evidence: local tests, Skill validation, App build, E2E logs, Git diff, secret scan, official bundle hashes, release package checksums, and architecture scope.

- [ ] **Step 2: Create the public GitHub repository and push branches**

```bash
gh repo create ssyamv/codex-skin --public --source=. --remote=origin
git push -u origin main
git push -u origin codex/custom-theme-skill
```

Expected: remote URLs resolve and both branch heads match local commits.

- [ ] **Step 3: Open and verify a Draft PR**

Create `[codex] publish Codex Skin Studio and custom theme Skill` with real Markdown describing architecture, safety, tests, App impact, signing limitation, and E2E evidence. Verify `base=main`, `head=codex/custom-theme-skill`, and all commits are in the diff.

- [ ] **Step 4: Wait for CI, then merge without force-push**

Use `gh pr checks --watch`; if all required checks pass, mark ready and merge. Fetch origin and verify:

```bash
git fetch origin
git merge-base --is-ancestor origin/codex/custom-theme-skill origin/main
```

Expected: exit 0.

- [ ] **Step 5: Tag and publish Release**

```bash
git tag -a v1.7.0 origin/main -m "Codex Skin Studio 1.7.0"
git push origin v1.7.0
```

Wait for the Release workflow, then download all assets into a temporary directory and run `shasum -a 256 -c SHA256SUMS`.

- [ ] **Step 6: Verify public consumer installation**

Download only `customize-codex-theme-1.7.0.zip`, extract it into a clean temporary `${CODEX_HOME}/skills`, confirm `quick_validate.py`, then execute its local-release install path against the published matching-architecture App asset.

- [ ] **Step 7: Mark the goal complete only after all evidence agrees**

Confirm public repository URL, PR, merge commit, tag, Release URL, Actions result, asset checksums, Skill ZIP structure, and the documented signing caveat. If any evidence is missing, keep the goal active and repair it.
