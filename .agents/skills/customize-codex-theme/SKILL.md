---
name: customize-codex-theme
description: Use when a macOS Codex Desktop user wants to create, generate, edit, install, switch, validate, recover, or remove a custom visual theme or background.
---

# Customize Codex Theme

Create a schema-1 theme pack, install it into Codex Skin Studio, and prove the result without modifying the signed Codex app or its normal profile.

## Required tools and reference

- Read [references/theme-contract.md](references/theme-contract.md) before creating a config, installing the App, replacing a theme, or recovering a failed run.
- Use `imagegen` whenever the user asks to generate, regenerate, replace, or visually modify a theme background. Do not synthesize or edit that image with drawing scripts, PIL, SVG rewriting, or ad hoc image code.
- If the user supplies an existing PNG, JPEG, or WebP and wants it used unchanged, do not fake a regeneration. Pass the original file to the pack generator; it copies the validated bytes unchanged.

## Workflow

1. Confirm macOS, the desired visual direction, theme name, light/dark appearance, and whether the background is new, edited, or unchanged.
2. Locate the runtime CLI inside an installed `Codex Skin Studio.app`. If absent, run `scripts/install-app.zsh` using its safe defaults or explicit release inputs.
3. Produce the background through `imagegen` when creation or visual editing is requested. Preserve an unchanged user image exactly.
4. Create a JSON config with the six required colors documented in the reference. Use a lowercase kebab-case ID that will remain stable across replacements.
5. Run:

   ```bash
   node scripts/create-theme-pack.mjs --config CONFIG.json --hero IMAGE --output PACK_DIR
   RUNTIME_NODE RUNTIME_CLI themes validate PACK_DIR --json
   RUNTIME_NODE RUNTIME_CLI themes install PACK_DIR --json
   ```

   Add `--replace` only after validation when the same user theme ID is already installed.

6. Check for an ordinary Codex process before launch. If Codex is running, offline installation with `themes install` is allowed, but do not automatically start or launch the themed runtime. Ask the user to exit ordinary Codex first.
7. When launch is safe, run `start`, then require JSON evidence from both `doctor` and `verify`. Capture a runtime snapshot when practical and visually inspect it.
8. Report the installed theme ID, App path, pack path, command evidence, and whether launch was completed or intentionally deferred.

## Safety and recovery

- Never edit `Codex.app`, `app.asar`, the normal Chromium profile, or `~/.codex`.
- App installation must not use `sudo`, `xattr -d`, `spctl --master-disable`, or any Gatekeeper-disabling command.
- Do not terminate ordinary Codex. `stop` may target only the selected isolated theme runtime.
- On failure, stop the selected runtime, restore the previous App or theme backup, re-run validation, and use `themes remove THEME_ID` only for the exact user theme requested.
- Never claim success from file creation alone. Success requires recorded `themes validate`, `themes install`, `doctor`, and `verify` evidence; if launch is deferred, say that `doctor` and `verify` remain pending.
