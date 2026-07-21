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
const themePath = path.join(root, "themes", "makima.css");
const heroImagePath = path.join(root, "assets", "makima-hero-sage.webp");
const fayeThemePath = path.join(root, "themes", "faye.css");
const fayeHeroImagePath = path.join(root, "assets", "faye-hero-left.webp");

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
    /\[data-turn-key\]\s*>\s*div\s*>\s*div\s*>\s*\.text-token-text-secondary\s*>\s*button\[aria-expanded\]\s+\.text-token-conversation-body\s*\{[^}]*color:\s*var\(--mk-ink-900\)[^}]*-webkit-text-fill-color:\s*var\(--mk-ink-900\)/s,
  );
});

test("玛奇玛回合处理耗时使用独立浅色背景", async () => {
  const css = await readFile(themePath, "utf8");
  assert.match(
    css,
    /\[data-turn-key\]\s*>\s*div\s*>\s*div\s*>\s*\.text-token-text-secondary\s*>\s*button\[aria-expanded\]\s*\{[^}]*background:\s*rgb\(247 245 239 \/ 94%\)[^}]*border-radius:\s*6px[^}]*0 0 0 4px rgb\(247 245 239 \/ 82%\)[^}]*0 4px 14px rgb\(70 60 48 \/ 9%\)/s,
  );
});

test("玛奇玛运行摘要禁用 shimmer 颜色过渡", async () => {
  const css = await readFile(themePath, "utf8");
  assert.match(
    css,
    /\[data-local-conversation-item-target-ids\]\s+\.loading-shimmer-pure-text\s*\{[^}]*color:\s*var\(--mk-ink-900\)[^}]*-webkit-text-fill-color:\s*var\(--mk-ink-900\)[^}]*transition:\s*none/s,
  );
});

test("玛奇玛运行摘要使用高不透明度浅色背景", async () => {
  const css = await readFile(themePath, "utf8");
  assert.match(
    css,
    /\[data-local-conversation-item-target-ids\]:has\(\.loading-shimmer-pure-text\)\s*>\s*div\s*>\s*div\s*>\s*\.group\\\/activity-header\s*\{[^}]*rgb\(247 245 239 \/ 96%\)[^}]*rgb\(232 235 226 \/ 94%\)[^}]*border-radius:\s*999px[^}]*0 4px 14px rgb\(70 60 48 \/ 9%\)/s,
  );
});

test("玛奇玛静态主题保留字体并覆盖完整 Codex 表面", async () => {
  const css = await readFile(themePath, "utf8");
  assert.equal(css.split(HERO_IMAGE_PLACEHOLDER).length - 1, 1);
  assert.doesNotMatch(css, /--mk-hero-art-(?:motion|still|active)/);
  assert.match(css, /color-scheme:\s*light/);
  assert.match(css, /--mk-glass-sidebar:\s*rgb\(247 245 239 \/ 46%\)/);
  assert.match(css, /--mk-glass-reading:\s*rgb\(247 245 239 \/ 56%\)/);
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
  const cssWithoutNavigationRailBackdrop = css.replace(
    /html\[data-codex-skin="makima"\]\s+div:has\(> nav \[data-thread-user-message-navigation-rail-list\]\)::before\s*\{[^}]*\}/gs,
    "",
  );
  assert.doesNotMatch(
    cssWithoutNavigationRailBackdrop,
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
    ["--color-token-conversation-header", "var(--mk-iris-300)"],
    ["--color-token-conversation-body", "var(--mk-ivory-300)"],
    ["--color-token-conversation-summary-leading", "var(--mk-iris-300)"],
    ["--color-token-conversation-summary-trailing", "var(--mk-ivory-500)"],
  ]) {
    assert.match(css, new RegExp(`${token}:\\s*${value.replace(/[()]/g, "\\$&")}`));
  }
  assert.match(
    css,
    /\[data-local-conversation-item-target-ids\]\s+\.loading-shimmer-pure-text\s*\{[^}]*color:\s*var\(--mk-ink-900\)[^}]*-webkit-text-fill-color:\s*var\(--mk-ink-900\)[^}]*background-image:\s*none/s,
  );
  assert.match(
    css,
    /\[data-local-conversation-item-target-ids\]:has\(\.loading-shimmer-pure-text\)\s*\{[^}]*background:\s*transparent[^}]*box-shadow:\s*none/s,
  );
  assert.match(
    css,
    /\[data-local-conversation-item-target-ids\]:has\(\.loading-shimmer-pure-text\)\s*>\s*div\s*>\s*div\s*>\s*\.group\\\/activity-header\s*\{[^}]*color:\s*var\(--mk-ink-900\)[^}]*rgb\(247 245 239 \/ 96%\)[^}]*rgb\(232 235 226 \/ 94%\)[^}]*border-radius:\s*999px[^}]*0 4px 14px rgb\(70 60 48 \/ 9%\)[^}]*transition:\s*none/s,
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
    /\[role="tab"\]\[aria-selected="true"\][^{]*\{[^}]*color:\s*#5f2030[^}]*-webkit-text-fill-color:\s*#5f2030[^}]*-webkit-text-stroke:\s*0\.25px[^}]*text-shadow:\s*none/s,
  );
  assert.match(
    css,
    /\[role="tab"\]\[aria-selected="true"\]\s+svg\s*\{[^}]*color:\s*var\(--mk-blood-600\)/s,
  );
  assert.match(
    css,
    /\[data-app-shell-tab-close-button\][^{]*\{[^}]*color:\s*var\(--mk-ivory-500\)[^}]*background:\s*transparent[^}]*box-shadow:\s*none/s,
  );
  assert.match(
    css,
    /\[data-app-shell-tab-controller\]:has\([^)]*aria-selected="true"[^)]*\)[^{]*\{[^}]*background:\s*rgb\(255 251 246 \/ 98%\)[^}]*border-radius:\s*6px 6px 0 0/s,
  );
  assert.match(
    css,
    /header\.app-header-tint\[data-app-shell-header-edge-scroll\][^{]*\{[^}]*background:[^}]*linear-gradient\(\s*180deg[^}]*rgb\(232 235 226 \/ 14%\) 100%/s,
  );
  assert.doesNotMatch(
    css,
    /\[data-app-shell-header-edge-scroll\][^{]*\{[^}]*inset 0 -1px/s,
  );
  assert.match(
    css,
    /\[data-app-action-sidebar-thread-active="true"\]\s*\{[^}]*background:\s*linear-gradient\([^}]*rgb\(216 221 210 \/ 94%\)[^}]*rgb\(247 245 239 \/ 82%\)[^}]*inset 2px 0 var\(--mk-copper-500\)[^}]*inset 0 0 0 1px rgb\(135 107 62 \/ 30%\)/s,
  );
  assert.doesNotMatch(
    css,
    /\[data-app-action-sidebar-thread-active="true"\]\s*\{[^}]*radial-gradient/s,
  );
  assert.doesNotMatch(
    css,
    /\[data-app-action-sidebar-thread-active="true"\]\s*\{[^}]*box-shadow:[^}]*var\(--mk-blood-/s,
  );
  assert.doesNotMatch(
    css,
    /:hover[^{]*\{[^}]*box-shadow:[^}]*inset\s+2px\s+0/s,
  );
  assert.match(
    css,
    /\[data-app-action-sidebar-thread-active="true"\]\s+svg\.icon-xs\.shrink-0\s*\{[^}]*color:\s*var\(--mk-blood-600\)/s,
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
    /\[data-codex-composer-root\](?::focus-within)?[^{}]*\.composer-surface-chrome\s*\{[^}]*(?:rgb\(161 51 67|inset|var\(--mk-edge-focus\))/s,
  );
  assert.match(
    css,
    /\[data-codex-composer\]\s*\{[^}]*caret-color:\s*var\(--mk-copper-500\)/s,
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
    /\[role="menu"\]\[data-state="open"\]\s+\[role="menuitem"\]:focus[^{]*,[^{]*\[role="menu"\]\[data-state="open"\]\s+\[role="menuitem"\]:focus-visible\s*\{[^}]*background:\s*rgb\(244 239 232 \/ 94%\)[^}]*outline-color:\s*var\(--mk-copper-500\)/s,
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
  assert.match(css, /--mk-control-hover:\s*rgb\(232 235 226 \/ 88%\)/);
  assert.match(
    css,
    /\[data-codex-intelligence-trigger\][^{]*\{[^}]*inset 2px 0 var\(--mk-copper-500\)/s,
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
    /\[data-user-message-bubble\]\s*\{[^}]*linear-gradient\(135deg,\s*rgb\(232 235 226 \/ 90%\),\s*rgb\(247 245 239 \/ 80%\)\)[^}]*border-color:\s*rgb\(135 107 62 \/ 24%\)/s,
  );
  assert.doesNotMatch(
    css,
    /\[data-user-message-bubble\][^{]*\{[^}]*rgb\(245 226 228/s,
  );
  assert.match(
    css,
    /\[data-wide-markdown-block\]:not\(:has\(img\)\):not\(:has\(\[data-markdown-image-preview-trigger\]\)\)/,
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
    /@media \(forced-colors: active\)[\s\S]*--mk-hero-art:\s*none/,
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
  assert.doesNotMatch(css, /data-codex-skin="makima"|--mk-/);
  assert.doesNotMatch(css, /([;{]|^)\s*font(?:-family|-size)?\s*:/im);
  assert.doesNotMatch(css, /\b(?:width|height|padding|margin)\s*:/i);

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
    /@media \(forced-colors: active\)[\s\S]*--fy-hero-art:\s*none/,
  );
  assert.ok(Buffer.byteLength(compiled) < 500_000);
});
