import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  HERO_IMAGE_PLACEHOLDER,
  assertThemeSafety,
  loadThemeCss,
} from "../src/injector.mjs";
import { DEFAULT_THEME, THEMES, resolveTheme } from "../src/themes.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const themePath = path.join(root, "theme-packs", "makima", "theme.css");
const heroImagePath = path.join(root, "theme-packs", "makima", "hero.webp");
const fayeThemePath = path.join(root, "theme-packs", "faye", "theme.css");
const fayeHeroImagePath = path.join(root, "theme-packs", "faye", "hero.webp");

test("主题注册表保持玛奇玛默认值并隔离 Faye 运行状态", () => {
  assert.equal(resolveTheme(), DEFAULT_THEME);
  assert.equal(resolveTheme("MAKIMA"), THEMES.makima);
  assert.equal(resolveTheme("FAYE"), THEMES.faye);
  assert.notEqual(THEMES.faye.styleId, THEMES.makima.styleId);
  assert.notEqual(THEMES.faye.stateKey, THEMES.makima.stateKey);
  assert.notEqual(THEMES.faye.runtimeDirectory, THEMES.makima.runtimeDirectory);
  assert.throws(() => resolveTheme("unknown"), /未知主题/);
});

test("玛奇玛回合处理耗时使用主文字色", async () => {
  const css = await readFile(themePath, "utf8");
  assert.match(
    css,
    /\[data-turn-key\]\s*>\s*div\s*>\s*div\s*>\s*\.text-token-text-secondary\s*>\s*button\[aria-expanded\]\s+\.text-token-conversation-body\s*\{[^}]*color:\s*var\(--cs-makima-ink-900\)[^}]*-webkit-text-fill-color:\s*var\(--cs-makima-ink-900\)/s,
  );
});

test("玛奇玛回合处理耗时使用独立浅色背景", async () => {
  const css = await readFile(themePath, "utf8");
  assert.match(
    css,
    /\[data-turn-key\]\s*>\s*div\s*>\s*div\s*>\s*\.text-token-text-secondary\s*>\s*button\[aria-expanded\]\s*\{[^}]*background:\s*rgb\(247 245 239 \/ 82%\)[^}]*border-radius:\s*6px[^}]*padding-left:\s*8px[^}]*padding-right:\s*8px[^}]*padding-top:\s*3px[^}]*padding-bottom:\s*3px[^}]*box-shadow:\s*none\s*!important/s,
  );
});

test("玛奇玛回合运行状态使用独立浅色背景", async () => {
  const css = await readFile(themePath, "utf8");
  assert.match(
    css,
    /\[data-turn-key\]\s+\.text-token-text-secondary:has\(>\s*\.text-token-conversation-body\)\s*>\s*\.text-token-conversation-body\s*\{[^}]*color:\s*var\(--cs-makima-ink-900\)[^}]*-webkit-text-fill-color:\s*var\(--cs-makima-ink-900\)[^}]*background:\s*rgb\(247 245 239 \/ 82%\)[^}]*border-radius:\s*6px[^}]*padding-left:\s*8px[^}]*padding-right:\s*8px[^}]*padding-top:\s*3px[^}]*padding-bottom:\s*3px[^}]*box-shadow:\s*none\s*!important/s,
  );
});

test("玛奇玛可交互元素使用 pointer 光标", async () => {
  const css = await readFile(themePath, "utf8");
  assert.match(
    css,
    /button:not\(:disabled\)[^{]*,[^{]*a\[href\][^{]*,[^{]*\[role="button"\]:not\(\[aria-disabled="true"\]\):not\(:disabled\)[^{]*,[^{]*\[role="link"\]:not\(\[aria-disabled="true"\]\)[^{]*,[^{]*summary\s*\{[^}]*cursor:\s*pointer\s*!important/s,
  );
});

test("玛奇玛运行摘要禁用 shimmer 颜色过渡", async () => {
  const css = await readFile(themePath, "utf8");
  assert.match(
    css,
    /\[data-local-conversation-item-target-ids\]\s+\.loading-shimmer-pure-text\s*\{[^}]*color:\s*var\(--cs-makima-ink-900\)[^}]*-webkit-text-fill-color:\s*var\(--cs-makima-ink-900\)[^}]*transition:\s*none/s,
  );
});

test("玛奇玛运行摘要使用均匀暖米白背景", async () => {
  const css = await readFile(themePath, "utf8");
  assert.match(
    css,
    /\[data-local-conversation-item-target-ids\]:has\(\.loading-shimmer-pure-text\)\s*>\s*div\s*>\s*div\s*>\s*\.group\\\/activity-header\s*\{[^}]*background:\s*rgb\(247 245 239 \/ 96%\)[^}]*border-radius:\s*999px[^}]*0 4px 14px rgb\(70 60 48 \/ 9%\)/s,
  );
  assert.doesNotMatch(
    css,
    /\[data-local-conversation-item-target-ids\]:has\(\.loading-shimmer-pure-text\)\s*>\s*div\s*>\s*div\s*>\s*\.group\\\/activity-header\s*\{[^}]*linear-gradient/s,
  );
});

test("玛奇玛侧栏更新按钮使用高对比强调色", async () => {
  const css = await readFile(themePath, "utf8");
  assert.match(
    css,
    /\.app-shell-left-panel\s+button\[class~="bg-token-charts-blue"\]\[aria-label\]\[title\]\s*\{[^}]*color:\s*var\(--color-text-on-accent\)[^}]*background:\s*var\(--color-background-button-primary\)[^}]*box-shadow:/s,
  );
  assert.match(
    css,
    /\.app-shell-left-panel\s+button\[class~="bg-token-charts-blue"\]\[aria-label\]\[title\]:(?:hover|focus-visible)[^{]*\{[^}]*color:\s*var\(--color-text-on-accent\)[^}]*background:\s*var\(--color-background-button-primary-hover\)/s,
  );
  assert.match(
    css,
    /\.app-shell-left-panel\s+button\[class~="bg-token-charts-blue"\]\[aria-label\]\[title\]\s+svg\s*\{[^}]*color:\s*var\(--color-text-on-accent\)/s,
  );
});

test("玛奇玛侧栏按钮悬停时不显示额外外框", async () => {
  const css = await readFile(themePath, "utf8");
  assert.match(
    css,
    /\.app-shell-left-panel\s+button:hover\s*,\s*html\[data-codex-skin="makima"\]\s+\.app-shell-left-panel\s+button\[data-state="open"\]\s*\{[^}]*background:\s*var\(--cs-makima-control-hover\)[^}]*box-shadow:\s*none\s*!important/s,
  );
});

test("玛奇玛 Chat Work 模式切换器使用统一米白与金棕选中态", async () => {
  const css = await readFile(themePath, "utf8");
  assert.match(
    css,
    /\[role="group"\]\[aria-label="Composer mode"\]\s*\{[^}]*rgb\(247 245 239 \/ 78%\)[^}]*rgb\(240 239 232 \/ 72%\)[^}]*inset 0 0 0 1px rgb\(135 107 62 \/ 14%\)/s,
  );
  assert.match(
    css,
    /\[role="group"\]\[aria-label="Composer mode"\]\s*>\s*button\[aria-pressed\]\s*\{[^}]*color:\s*var\(--cs-makima-ivory-300\)[^}]*background:\s*transparent[^}]*box-shadow:\s*none/s,
  );
  assert.match(
    css,
    /\[role="group"\]\[aria-label="Composer mode"\]\s*>\s*button\[aria-pressed="true"\]\s*\{[^}]*color:\s*var\(--cs-makima-ink-900\)[^}]*background:\s*transparent[^}]*border-color:\s*transparent[^}]*box-shadow:\s*none/s,
  );
  assert.match(
    css,
    /\[role="group"\]\[aria-label="Composer mode"\]\s*>\s*button\[aria-pressed="false"\]:hover\s*\{[^}]*background:\s*rgb\(255 251 246 \/ 68%\)[^}]*box-shadow:\s*none/s,
  );
  assert.doesNotMatch(
    css,
    /\[role="group"\]\[aria-label="Composer mode"\]\s*>\s*button\[aria-pressed="true"\]\s*\{[^}]*inset 0 -2px/s,
  );
});

test("玛奇玛首页建议卡片使用暖米白配色并保留垂直间距", async () => {
  const css = await readFile(themePath, "utf8");
  assert.match(
    css,
    /\[data-home-ambient-suggestions\]\s+button\[aria-labelledby\]\s*,\s*html\[data-codex-skin="makima"\]\s+\.group\\\/home-suggestion-list-item\s*\{[^}]*background:\s*rgb\(247 245 239 \/ 94%\)[^}]*border-color:\s*rgb\(135 107 62 \/ 16%\)[^}]*padding-left:\s*14px[^}]*padding-right:\s*14px/s,
  );
  assert.match(
    css,
    /\[data-home-ambient-suggestions\]\s+button\[aria-labelledby\]:hover\s*,\s*html\[data-codex-skin="makima"\]\s+\.group\\\/home-suggestion-list-item:hover\s*\{[^}]*background:\s*rgb\(255 251 246 \/ 98%\)[^}]*border-color:\s*rgb\(135 107 62 \/ 24%\)/s,
  );
  assert.match(
    css,
    /button\[aria-labelledby\]:not\(:last-child\)\s*,\s*html\[data-codex-skin="makima"\]\s+\.group\\\/home-suggestion-list-item:not\(:last-child\)\s*\{[^}]*margin-bottom:\s*8px/s,
  );
});

test("玛奇玛装饰态统一使用暖米白与金棕并保留语义红绿", async () => {
  const css = await readFile(themePath, "utf8");
  for (const declaration of [
    "--cs-makima-blood-700: #5f492b",
    "--cs-makima-blood-600: #6f5731",
    "--cs-makima-blood-500: #876b3e",
    "--cs-makima-blood-400: #9a7b48",
    "--cs-makima-sage-700: #555750",
    "--cs-makima-sage-500: #747269",
    "--cs-makima-sage-300: #ded8cf",
    "--cs-makima-sage-100: #f0ebe2",
    "--cs-makima-control-hover: rgb(244 239 232 / 90%)",
    "--cs-makima-control-pressed: rgb(135 107 62 / 13%)",
    "--cs-makima-edge-focus: rgb(135 107 62 / 52%)",
  ]) {
    assert.match(css, new RegExp(declaration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(
    css,
    /rgb\((?:161 51 67|127 52 66|118 37 54|104 42 55|95 32 48|232 235 226|216 221 210|89 100 87)\s*\//,
  );
  for (const semanticColor of [
    "--color-decoration-added: var(--cs-makima-green-400)",
    "--color-decoration-deleted: var(--cs-makima-red-400)",
    "--color-token-error-foreground: var(--cs-makima-red-400)",
    "--color-token-git-decoration-added-resource-foreground: var(--cs-makima-green-400)",
    "--color-token-git-decoration-deleted-resource-foreground: var(--cs-makima-red-400)",
    "--color-token-charts-green: var(--cs-makima-green-400)",
    "--color-token-charts-red: var(--cs-makima-red-400)",
  ]) {
    assert.match(css, new RegExp(semanticColor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("玛奇玛静态主题保留字体并覆盖完整 Codex 表面", async () => {
  const css = await readFile(themePath, "utf8");
  assert.equal(css.split(HERO_IMAGE_PLACEHOLDER).length - 1, 1);
  assert.doesNotMatch(css, /--cs-makima-hero-art-(?:motion|still|active)/);
  assert.match(css, /color-scheme:\s*light/);
  assert.match(css, /--cs-makima-glass-sidebar:\s*rgb\(247 245 239 \/ 46%\)/);
  assert.match(css, /--cs-makima-glass-reading:\s*rgb\(247 245 239 \/ 56%\)/);
  assert.doesNotMatch(css, /\.app-shell-left-panel\s*\{[^}]*blur\(/s);
  for (const token of [
    "--color-token-diff-surface",
    "--color-token-diff-editor-inserted-line-background",
    "--color-token-diff-editor-removed-line-background",
    "--color-token-diff-editor-removed-text-background",
    "--codex-diffs-surface",
    "--codex-diffs-context-surface",
  ]) {
    assert.match(css, new RegExp(`${token}:\\s*#[0-9a-f]{6}`, "i"));
  }
  assert.doesNotThrow(() => assertThemeSafety(css));
  assert.doesNotMatch(css, /([;{]|^)\s*font(?:-family|-size)?\s*:/im);
  const cssWithoutApprovedLayout = css
    .replace(
      /html\[data-codex-skin="makima"\]\s+div:has\(> nav \[data-thread-user-message-navigation-rail-list\]\)::before\s*\{[^}]*\}/gs,
      "",
    )
    .replace(/\s*padding-(?:left|right):\s*14px\s*!important;/g, "")
    .replace(/\s*margin-bottom:\s*8px\s*!important;/g, "");
  assert.doesNotMatch(
    cssWithoutApprovedLayout,
    /(?:^|[;{])\s*(?:width|height|padding|margin)\s*:/im,
  );

  for (const selector of [
    ".app-shell-left-panel",
    "[data-app-shell-aura-tab-strip]",
    "[data-app-shell-tab-controller]:has([role=\"tab\"][aria-selected=\"true\"])",
    "[data-app-shell-tab-close-button]",
    "[data-home-ambient-suggestions]",
    ".main-surface",
    ".composer-surface-chrome",
    "[data-response-annotation-conversation]",
    "[data-local-conversation-item-target-ids]",
    ".group\\/activity-header",
    ".loading-shimmer-pure-text",
    "[data-agent-activity-file-link]",
    "[data-nested-in-plan]",
    "[data-post-command-hook]",
    "[data-codex-terminal]",
    "[data-diff]",
    '[role="dialog"][data-state="open"]',
  ]) {
    assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const [token, value] of [
    ["--color-token-conversation-header", "var(--cs-makima-iris-300)"],
    ["--color-token-conversation-body", "var(--cs-makima-ivory-300)"],
    ["--color-token-conversation-summary-leading", "var(--cs-makima-iris-300)"],
    ["--color-token-conversation-summary-trailing", "var(--cs-makima-ivory-500)"],
  ]) {
    assert.match(css, new RegExp(`${token}:\\s*${value.replace(/[()]/g, "\\$&")}`));
  }
  assert.match(
    css,
    /\[data-local-conversation-item-target-ids\]\s+\.loading-shimmer-pure-text\s*\{[^}]*color:\s*var\(--cs-makima-ink-900\)[^}]*-webkit-text-fill-color:\s*var\(--cs-makima-ink-900\)[^}]*background-image:\s*none/s,
  );
  assert.match(
    css,
    /\[data-local-conversation-item-target-ids\]:has\(\.loading-shimmer-pure-text\)\s*\{[^}]*background:\s*transparent[^}]*box-shadow:\s*none/s,
  );
  assert.match(
    css,
    /\[data-local-conversation-item-target-ids\]:has\(\.loading-shimmer-pure-text\)\s*>\s*div\s*>\s*div\s*>\s*\.group\\\/activity-header\s*\{[^}]*color:\s*var\(--cs-makima-ink-900\)[^}]*background:\s*rgb\(247 245 239 \/ 96%\)[^}]*border-radius:\s*999px[^}]*0 4px 14px rgb\(70 60 48 \/ 9%\)[^}]*transition:\s*none/s,
  );
  assert.doesNotMatch(
    css,
    /\[data-local-conversation-item-target-ids\]:has\(\.loading-shimmer-pure-text\)\s+\.group\\\/activity-header/,
  );
  assert.match(
    css,
    /\.loading-shimmer-pure-text\s+\[aria-hidden="true"\]\s*\{[^}]*visibility:\s*hidden/s,
  );
  assert.doesNotMatch(css, /_cadencedShimmerActive_|background-position:\s*(?:-160|160)%/);
  assert.match(
    css,
    /\[data-local-conversation-item-target-ids\]\s*\{[^}]*box-shadow:\s*none/s,
  );
  assert.match(
    css,
    /\[data-agent-activity-file-link\]\s*\{[^}]*box-shadow:\s*none/s,
  );
  assert.match(
    css,
    /\[data-local-conversation-item-target-ids\]:has\(\.group\\\/activity-header\[aria-expanded="true"\]\)\s*\{[^}]*background:\s*transparent[^}]*box-shadow:\s*none/s,
  );
  assert.match(
    css,
    /\.vertical-scroll-fade-mask\s*\{[^}]*background:\s*rgb\(247 245 239 \/ 36%\)[^}]*border-radius:\s*10px[^}]*box-shadow:\s*none/s,
  );
  assert.match(
    css,
    /\.vertical-scroll-fade-mask\s+\.group\\\/activity-header\s*\{[^}]*background:\s*transparent[^}]*border-radius:\s*0[^}]*box-shadow:\s*none/s,
  );
  assert.match(
    css,
    /\.group\\\/activity-header\s*\{[^}]*padding-left:\s*10px[^}]*padding-right:\s*10px[^}]*padding-top:\s*4px[^}]*padding-bottom:\s*4px/s,
  );
  assert.match(
    css,
    /\[data-app-shell-tab-controller\]\s+\[role="tab"\][^{]*\{[^}]*color:\s*#20231f[^}]*-webkit-text-fill-color:\s*#20231f[^}]*-webkit-text-stroke:\s*0\.35px #20231f[^}]*text-shadow:\s*none/s,
  );
  assert.match(
    css,
    /\[data-app-shell-tab-controller\]\s+\[role="tab"\]\s+svg\s*\{[^}]*color:\s*var\(--cs-makima-blood-600\)/s,
  );
  assert.match(
    css,
    /\[data-app-shell-tab-close-button\][^{]*\{[^}]*opacity:\s*1[^}]*color:\s*var\(--cs-makima-blood-700\)[^}]*background:\s*transparent[^}]*box-shadow:\s*none/s,
  );
  assert.match(
    css,
    /\[data-app-shell-tab-controller\][^{]*\[role="tab"\]\s+\*\s*\{[^}]*opacity:\s*1/s,
  );
  assert.match(
    css,
    /\[data-app-shell-tab-strip-controller="right"\]\s+\[role="tab"\][^{]*\{[^}]*color:\s*var\(--cs-makima-ink-900\)[^}]*-webkit-text-fill-color:\s*var\(--cs-makima-ink-900\)[^}]*text-shadow:\s*none/s,
  );
  assert.match(
    css,
    /\[data-app-shell-tab-strip-controller="right"\]\s+>\s+div\s+>\s+button\s*\{[^}]*color:\s*var\(--cs-makima-blood-700\)[^}]*background:\s*transparent[^}]*box-shadow:\s*none/s,
  );
  assert.match(
    css,
    /\[data-app-shell-tab-controller\]:has\([^)]*aria-selected="true"[^)]*\)[^{]*\{[^}]*background:\s*#f7f5ef[^}]*border-radius:\s*6px 6px 0 0[^}]*inset 0 -2px var\(--cs-makima-copper-500\)/s,
  );
  assert.match(
    css,
    /\[role="tab"\]\[aria-selected="true"\][^{]*\{[^}]*color:\s*#20231f[^}]*-webkit-text-fill-color:\s*#20231f[^}]*-webkit-text-stroke:\s*0\.25px #20231f/s,
  );
  assert.match(
    css,
    /\[data-app-shell-tab-close-button\]\s+path[^}]*\{[^}]*fill:\s*var\(--cs-makima-blood-600\)[^}]*stroke:\s*var\(--cs-makima-blood-600\)/s,
  );
  assert.match(
    css,
    /header\.app-header-tint\[data-app-shell-header-edge-scroll\][^{]*\{[^}]*background:[^}]*linear-gradient\(\s*90deg[^}]*rgb\(247 245 239 \/ 97%\) 0 var\(--cs-makima-header-opaque-end\)[^}]*transparent var\(--cs-makima-header-opaque-end\) 100%/s,
  );
  assert.doesNotMatch(
    css,
    /\[data-app-shell-header-edge-scroll\][^{]*\{[^}]*inset 0 -1px/s,
  );
  assert.match(
    css,
    /\[data-app-action-sidebar-thread-active="true"\]\s*\{[^}]*background:\s*rgb\(247 245 239 \/ 92%\)[^}]*inset 0 0 0 1px rgb\(135 107 62 \/ 16%\)[^}]*0 6px 16px rgb\(70 60 48 \/ 7%\)/s,
  );
  assert.doesNotMatch(
    css,
    /\[data-app-action-sidebar-thread-active="true"\]\s*\{[^}]*(?:linear-gradient|radial-gradient|rgb\(216 221 210|inset 2px 0)/s,
  );
  assert.doesNotMatch(
    css,
    /\[data-app-action-sidebar-thread-active="true"\]\s*\{[^}]*box-shadow:[^}]*var\(--cs-makima-blood-/s,
  );
  assert.doesNotMatch(
    css,
    /:hover[^{]*\{[^}]*box-shadow:[^}]*inset\s+2px\s+0/s,
  );
  assert.match(
    css,
    /\[data-app-action-sidebar-thread-active="true"\]\s+svg\.icon-xs\.shrink-0\s*\{[^}]*color:\s*var\(--cs-makima-blood-600\)/s,
  );
  assert.match(
    css,
    /\[data-composer-utility-bar-scroll-area\][^{]*,[^{]*\[data-composer-attachments-row\]\s*\{[^}]*background:\s*transparent[^}]*box-shadow:\s*none/s,
  );
  assert.match(
    css,
    /\[data-codex-composer-root\]\s+\.composer-surface-chrome\s*\{[^}]*linear-gradient\(\s*135deg,\s*rgb\(252 249 243 \/ 94%\),\s*rgb\(244 239 232 \/ 92%\)[^}]*border-color:\s*transparent[^}]*box-shadow:\s*0 12px 34px rgb\(70 60 48 \/ 8%\)/s,
  );
  assert.match(
    css,
    /\[data-codex-composer-root\]:focus-within\s+\.composer-surface-chrome\s*\{[^}]*linear-gradient\(\s*135deg,\s*rgb\(255 252 247 \/ 97%\),\s*rgb\(245 240 233 \/ 95%\)[^}]*border-color:\s*transparent[^}]*box-shadow:\s*0 14px 38px rgb\(70 60 48 \/ 10%\)/s,
  );
  assert.doesNotMatch(
    css,
    /\[data-codex-composer-root\](?::focus-within)?[^{}]*\.composer-surface-chrome\s*\{[^}]*(?:rgb\(161 51 67|inset|var\(--cs-makima-edge-focus\))/s,
  );
  assert.match(
    css,
    /\[data-codex-composer\]\s*\{[^}]*caret-color:\s*var\(--cs-makima-copper-500\)/s,
  );
  assert.match(
    css,
    /\[data-composer-attachment-pill\]\s*\{[^}]*linear-gradient\(145deg, rgb\(252 249 243 \/ 88%\), rgb\(244 239 232 \/ 80%\)\)[^}]*border-color:\s*rgb\(135 107 62 \/ 22%\)/s,
  );
  assert.match(
    css,
    /\[role="dialog"\]\[data-state="open"\][^{]*,[^{]*\[role="menu"\]\[data-state="open"\][^{]*\{[^}]*linear-gradient\(\s*155deg,\s*rgb\(255 252 247 \/ 99%\),\s*rgb\(245 240 233 \/ 99%\)/s,
  );
  assert.doesNotMatch(
    css,
    /\[role="dialog"\]\[data-state="open"\][^{]*,[^{]*\[role="menu"\]\[data-state="open"\][^{]*\{[^}]*radial-gradient/s,
  );
  assert.match(
    css,
    /\[role="menu"\]\[data-state="open"\]\s+\[role="menuitem"\]:hover[^{]*,[^{]*\[role="menu"\]\[data-state="open"\]\s+\[role="menuitem"\]\[data-highlighted\][^{]*,[^{]*\[role="menu"\]\[data-state="open"\]\s+\[role="menuitem"\]:focus[^{]*,[^{]*\[role="menu"\]\[data-state="open"\]\s+\[role="menuitem"\]:focus-visible\s*\{[^}]*background:\s*rgb\(244 239 232 \/ 94%\)[^}]*outline-color:\s*var\(--cs-makima-copper-500\)[^}]*box-shadow:\s*none/s,
  );
  for (const selector of [
    ".app-shell-left-panel button svg",
    '[data-codex-intelligence-trigger]',
    '[data-composer-navigation-target][data-state="open"]',
    '[data-slot="thread-summary-panel-icon-button"]',
    '[data-slot="thread-summary-panel-item-button"]:hover',
    '[role="option"][aria-selected="true"]',
    "button:disabled svg",
  ]) {
    assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(css, /--cs-makima-control-hover:\s*rgb\(244 239 232 \/ 90%\)/);
  assert.match(
    css,
    /\[data-codex-intelligence-trigger\][^{]*\{[^}]*box-shadow:\s*inset 0 0 0 1px rgb\(135 107 62 \/ 10%\)/s,
  );
  assert.doesNotMatch(
    css,
    /\[data-codex-intelligence-trigger\][^{]*\{[^}]*inset 2px 0/s,
  );
  assert.match(
    css,
    /\[data-codex-intelligence-trigger\][^{]*\{[^}]*padding-left:\s*10px[^}]*padding-right:\s*10px[^}]*margin-right:\s*6px/s,
  );
  assert.match(
    css,
    /\[data-slot="thread-summary-panel-item-button"\][^{]*\{[^}]*padding-left:\s*8px[^}]*padding-right:\s*8px/s,
  );
  assert.match(
    css,
    /\[data-slot="thread-summary-panel-icon-button"\]\s*\{[^}]*background:\s*transparent[^}]*border-color:\s*transparent[^}]*border-radius:\s*8px[^}]*box-shadow:\s*none/s,
  );
  assert.match(
    css,
    /\[data-slot="thread-summary-panel-icon-button"\]\s+svg\s*\{[^}]*color:\s*var\(--cs-makima-copper-500\)/s,
  );
  assert.match(
    css,
    /\[data-slot="thread-summary-panel-item-button"\]:has\(\[data-slot="thread-summary-panel-item-avatar-group"\]\):hover[^{]*,[^{]*\[data-slot="thread-summary-panel-item-button"\]:has\(\[data-slot="thread-summary-panel-item-avatar-group"\]\):focus-visible\s*\{[^}]*background:\s*transparent[^}]*box-shadow:\s*none/s,
  );
  assert.match(
    css,
    /\[data-pip-obstacle="thread-summary-panel"\]\s+section\s*>\s*header\s*>\s*button\[aria-expanded\]\s*\{[^}]*color:\s*var\(--cs-makima-sage-700\)[^}]*border-radius:\s*6px/s,
  );
  assert.doesNotMatch(
    css,
    /\[data-pip-obstacle="thread-summary-panel"\]\s+button\[aria-expanded\]/,
  );
  assert.match(
    css,
    /\.app-shell-left-panel\s+button\[data-app-action-sidebar-section-toggle\]:hover\s*\{[^}]*background:\s*transparent[^}]*box-shadow:\s*none/s,
  );
  assert.match(
    css,
    /\[data-pip-obstacle="thread-summary-panel"\]\s*\{[^}]*background:\s*transparent[^}]*border-color:\s*transparent[^}]*box-shadow:\s*none[^}]*backdrop-filter:\s*none/s,
  );
  assert.match(
    css,
    /\[data-pip-obstacle="thread-summary-panel"\]\s*>\s*div\s*>\s*div\s*\{[^}]*linear-gradient\(\s*160deg,\s*rgb\(252 249 243 \/ 90%\),\s*rgb\(244 239 232 \/ 86%\)[^}]*border-color:\s*rgb\(135 107 62 \/ 18%\)[^}]*0 16px 42px rgb\(70 60 48 \/ 12%\)/s,
  );
  assert.match(
    css,
    /\[data-response-annotation-conversation\][^{]*,[^{]*\[data-local-conversation-final-assistant\]:not\(:has\([^)]*data-response-annotation-conversation[^)]*\)\)[^{]*\{[^}]*border-color:\s*transparent[^}]*box-shadow:\s*0 14px 38px/s,
  );
  assert.doesNotMatch(
    css,
    /\[data-response-annotation-conversation\][^{]*\{[^}]*0 0 0 8px/s,
  );
  assert.match(
    css,
    /\[data-response-annotation-conversation\]\s*\{[^}]*padding-left:\s*10px[^}]*padding-right:\s*10px[^}]*padding-top:\s*8px[^}]*padding-bottom:\s*8px[^}]*transition:\s*none/s,
  );
  assert.match(
    css,
    /\[data-local-conversation-final-assistant\]:not\(:has\(\[data-response-annotation-conversation\]\)\)\s*\{[^}]*padding-left:\s*10px[^}]*padding-right:\s*10px[^}]*padding-top:\s*8px[^}]*padding-bottom:\s*8px[^}]*transition:\s*none/s,
  );
  assert.match(
    css,
    /\[data-response-annotation-conversation\]\s+\[data-wide-markdown-block\]\[data-wide-markdown-block-kind="image"\]\s*\{[^}]*--wide-block-width:\s*100%/s,
  );
  assert.match(
    css,
    /\[data-response-annotation-conversation\]\s+\[data-wide-markdown-block\]\[data-wide-markdown-block-kind="mermaid"\]\s*\{[^}]*--wide-block-width:\s*100%/s,
  );
  assert.match(
    css,
    /\[data-user-message-bubble\]\s*\{[^}]*background:\s*rgb\(247 245 239 \/ 94%\)[^}]*border-color:\s*rgb\(135 107 62 \/ 24%\)/s,
  );
  assert.doesNotMatch(
    css,
    /\[data-user-message-bubble\][^{]*\{[^}]*(?:rgb\(232 235 226|rgb\(245 226 228|linear-gradient|radial-gradient)/s,
  );
  assert.match(
    css,
    /\[data-wide-markdown-block\]:not\(\[data-wide-markdown-block-kind="mermaid"\]\):not\(:has\(img\)\):not\(:has\(\[data-markdown-image-preview-trigger\]\)\)/,
  );
  assert.match(
    css,
    /\[data-wide-markdown-block\]:has\(img\)[^{]*,[^{]*\[data-wide-markdown-block\]:has\(\[data-markdown-image-preview-trigger\]\)[^{]*\{[^}]*background:\s*transparent[^}]*border-color:\s*transparent[^}]*box-shadow:\s*none/s,
  );
  assert.match(
    css,
    /scrollbar-color:\s*rgb\(122 91 50 \/ 24%\) transparent/,
  );
  assert.match(
    css,
    /::-webkit-scrollbar-track[^}]*,\s*html\[data-codex-skin="makima"\]\s+::-webkit-scrollbar-corner\s*\{[^}]*background-color:\s*transparent/s,
  );
  assert.doesNotMatch(
    css,
    /::-webkit-scrollbar-(?:track|corner)[^{]*\{[^}]*rgb\(238 230 220/s,
  );
  assert.match(
    css,
    /div:has\(> nav \[data-thread-user-message-navigation-rail-list\]\)::before\s*\{[^}]*width:\s*24px[^}]*pointer-events:\s*none[^}]*background-attachment:\s*fixed/s,
  );
  assert.match(
    css,
    /nav:has\(\[data-thread-user-message-navigation-rail-list\]\)\s*\{[^}]*z-index:\s*30/s,
  );
  assert.match(
    css,
    /@media \(forced-colors: active\)[\s\S]*div:has\(> nav \[data-thread-user-message-navigation-rail-list\]\)::before\s*\{\s*content:\s*none/s,
  );

  const pointerRules = [
    ...css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .matchAll(/([^{}]+)\{[^{}]*pointer-events\s*:\s*none/gi),
  ].map((match) => match[1].replace(/\s+/g, " ").trim());
  assert.deepEqual(pointerRules, [
    'html[data-codex-skin="makima"] .app-shell-left-panel::before',
    'html[data-codex-skin="makima"] div:has(> nav [data-thread-user-message-navigation-rail-list])::before',
  ]);
});

test("主题只编译一个静态主视觉并保留强制颜色回退", async () => {
  const [still, compiled] = await Promise.all([
    readFile(heroImagePath),
    loadThemeCss(themePath, { heroImagePath }),
  ]);

  assert.equal(still.indexOf(Buffer.from("ANIM")), -1);
  assert.doesNotMatch(compiled, new RegExp(HERO_IMAGE_PLACEHOLDER));
  assert.equal((compiled.match(/data:image\/webp;base64,/g) || []).length, 1);
  assert.match(
    compiled,
    /@media \(forced-colors: active\)[\s\S]*--cs-makima-hero-art:\s*none/,
  );
  assert.match(
    compiled,
    /@media \(forced-colors: active\)[\s\S]*\.app-shell-left-panel::before\s*\{\s*content:\s*none/,
  );
  assert.ok(Buffer.byteLength(compiled) < 500_000);
});

test("Faye 主题独立覆盖完整 Codex 表面和活动状态", async () => {
  const css = await readFile(fayeThemePath, "utf8");
  assert.equal(css.split(HERO_IMAGE_PLACEHOLDER).length - 1, 1);
  assert.doesNotThrow(() => assertThemeSafety(css, { theme: THEMES.faye }));
  assert.doesNotMatch(css, /data-codex-skin="makima"|--cs-makima-/);
  assert.doesNotMatch(css, /([;{]|^)\s*font(?:-family|-size)?\s*:/im);
  const cssWithoutApprovedWideBlockWidth = css.replace(
    /\s*--wide-block-width:\s*100%\s*!important;/g,
    "",
  );
  assert.doesNotMatch(
    cssWithoutApprovedWideBlockWidth,
    /\b(?:width|height|padding|margin)\s*:/i,
  );
  assert.match(
    css,
    /\[data-wide-markdown-block\]:not\(\[data-wide-markdown-block-kind="mermaid"\]\):not\(:has\(img\)\):not\(:has\(\[data-markdown-image-preview-trigger\]\)\)/,
  );
  assert.match(
    css,
    /\[data-response-annotation-conversation\]\s+\[data-wide-markdown-block\]\[data-wide-markdown-block-kind="mermaid"\]\s*\{[^}]*--wide-block-width:\s*100%/s,
  );

  for (const selector of [
    ".app-shell-left-panel",
    "[data-app-action-sidebar-thread-active=\"true\"]",
    ".main-surface",
    "[data-codex-composer-root]",
    "[data-codex-intelligence-trigger]",
    "[data-response-annotation-conversation]",
    "[data-user-message-bubble]",
    "[data-local-conversation-item-target-ids]",
    ".loading-shimmer-pure-text",
    "[data-nested-in-plan]",
    "[data-wide-markdown-block]",
    "[data-codex-terminal]",
    "[data-diff]",
    '[role="dialog"][data-state="open"]',
  ]) {
    assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Faye 主题编译自己的单张静态主视觉", async () => {
  const [hero, compiled] = await Promise.all([
    readFile(fayeHeroImagePath),
    loadThemeCss(fayeThemePath, {
      heroImagePath: fayeHeroImagePath,
      theme: THEMES.faye,
    }),
  ]);
  assert.equal(hero.indexOf(Buffer.from("ANIM")), -1);
  assert.equal((compiled.match(/data:image\/webp;base64,/g) || []).length, 1);
  assert.match(
    compiled,
    /@media \(forced-colors: active\)[\s\S]*--cs-faye-hero-art:\s*none/,
  );
  assert.ok(Buffer.byteLength(compiled) < 500_000);
});
