const themeDefinitions = {
  makima: {
    id: "makima",
    displayName: "玛奇玛",
    runtimeDirectory: "Codex Makima Skin",
    styleId: "codex-skin-makima",
    stateKey: "__CODEX_MAKIMA_STATE__",
    cssVariablePrefix: "--mk-",
    cssFile: "makima.css",
    heroFile: "makima-hero-sage.webp",
    snapshotFile: "makima-runtime.png",
  },
  faye: {
    id: "faye",
    displayName: "Faye",
    runtimeDirectory: "Codex Faye Skin",
    styleId: "codex-skin-faye",
    stateKey: "__CODEX_FAYE_STATE__",
    cssVariablePrefix: "--fy-",
    cssFile: "faye.css",
    heroFile: "faye-hero-left.webp",
    snapshotFile: "faye-runtime.png",
  },
};

export const THEMES = Object.freeze(
  Object.fromEntries(
    Object.entries(themeDefinitions).map(([id, theme]) => [id, Object.freeze(theme)]),
  ),
);

export const DEFAULT_THEME = THEMES.makima;

export function resolveTheme(themeId = DEFAULT_THEME.id) {
  const theme = THEMES[String(themeId).toLowerCase()];
  if (!theme) {
    throw new Error(
      `未知主题：${themeId}；可用主题：${Object.keys(THEMES).join(", ")}`,
    );
  }
  return theme;
}
