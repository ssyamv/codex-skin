import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_THEME_ID,
  ThemeStore,
  deriveThemeRuntimeFields,
} from "./theme-store.mjs";

export { DEFAULT_THEME_ID, ThemeStore, deriveThemeRuntimeFields } from "./theme-store.mjs";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const BUILT_IN_THEME_ROOT = path.join(projectRoot, "theme-packs");

function loadBuiltInTheme(id) {
  const packPath = path.join(BUILT_IN_THEME_ROOT, id);
  const manifest = JSON.parse(readFileSync(path.join(packPath, "theme.json"), "utf8"));
  if (manifest.id !== id) throw new Error(`内置主题目录与 ID 不匹配：${id}`);
  return Object.freeze({
    ...manifest,
    source: "builtin",
    packPath,
    installedPath: packPath,
    cssPath: path.join(packPath, manifest.cssFile),
    heroPath: path.join(packPath, manifest.heroFile),
    previewPath: path.join(packPath, manifest.previewFile),
    ...deriveThemeRuntimeFields(id),
  });
}

export const THEMES = Object.freeze({
  makima: loadBuiltInTheme("makima"),
  faye: loadBuiltInTheme("faye"),
});

export const DEFAULT_THEME = THEMES[DEFAULT_THEME_ID];

// Synchronous built-in compatibility for existing injector callers. The CLI
// uses ThemeStore for built-in and installed custom themes.
export function resolveTheme(themeId = DEFAULT_THEME_ID) {
  const normalizedId = String(themeId).toLowerCase();
  const theme = THEMES[normalizedId];
  if (!theme) {
    throw new Error(`未知主题：${themeId}；可用主题：${Object.keys(THEMES).join(", ")}`);
  }
  return theme;
}

export function createThemeStore(options = {}) {
  return new ThemeStore({ builtInRoot: BUILT_IN_THEME_ROOT, ...options });
}
