import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";

import {
  DIFF_SHADOW_STYLE_SUFFIX,
  HEADER_OPAQUE_END_VAR,
  STYLE_ID,
  assertThemeSafety,
  buildApplyScript,
  buildImpactInspectionScript,
  buildRemoveScript,
  detectThemeImageMime,
  getDiffShadowCss,
  inspectImpactOnPort,
  loadThemeCss,
} from "../src/injector.mjs";
import { THEMES, deriveThemeRuntimeFields } from "../src/themes.mjs";

const SAFE_CSS = 'html[data-codex-skin="makima"] { color: #eee; }';
const SAFE_FAYE_CSS = 'html[data-codex-skin="faye"] { --cs-faye-ink: #080b0e; color: #eee; }';

test("动态主题按真实 PNG、JPEG 和 WebP MIME 编译背景", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "codex-theme-image-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const id = "moonlit-archive";
  const theme = {
    id,
    displayName: "Moonlit Archive",
    ...deriveThemeRuntimeFields(id),
  };
  const cssPath = path.join(directory, "theme.css");
  await writeFile(
    cssPath,
    `html[data-codex-skin="${id}"] { --cs-${id}-ink: #e7ecf4; color: var(--cs-${id}-ink); background-image: url("__CODEX_SKIN_HERO_IMAGE__"); }`,
  );
  const fixtures = [
    ["png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"],
    ["jpg", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), "image/jpeg"],
    ["webp", Buffer.from("RIFF0000WEBP", "ascii"), "image/webp"],
  ];
  for (const [extension, bytes, mime] of fixtures) {
    const imagePath = path.join(directory, `hero.${extension}`);
    await writeFile(imagePath, bytes);
    assert.equal(detectThemeImageMime(bytes), mime);
    assert.match(
      await loadThemeCss(cssPath, { heroImagePath: imagePath, theme }),
      new RegExp(`data:${mime.replace("/", "\\/")};base64,`),
    );
  }
  const unsupported = path.join(directory, "hero.svg");
  await writeFile(unsupported, "<svg></svg>");
  await assert.rejects(
    loadThemeCss(cssPath, { heroImagePath: unsupported, theme }),
    /PNG、JPEG 或 WebP/,
  );
});

test("apply/remove scripts use one stable style id", () => {
  assert.match(buildApplyScript(SAFE_CSS), new RegExp(STYLE_ID));
  assert.match(buildRemoveScript(), new RegExp(STYLE_ID));
  assert.doesNotMatch(buildApplyScript(SAFE_CSS), /\.click\(/);
});

test("玛奇玛代码预览使用可逆的 Shadow DOM 暖浅色样式", () => {
  const apply = buildApplyScript(SAFE_CSS);
  const remove = buildRemoveScript();
  const shadowCss = getDiffShadowCss();
  const shadowStyleId = `${STYLE_ID}${DIFF_SHADOW_STYLE_SUFFIX}`;

  for (const script of [apply, remove]) {
    assert.match(script, new RegExp(shadowStyleId));
    assert.match(script, /diffs-container/);
  }
  assert.match(apply, /MutationObserver/);
  assert.match(apply, /unthemedShadowCount|shadowStyleCount/);
  assert.match(remove, /shadowObserver\?\.disconnect/);
  assert.match(shadowCss, /color-scheme:\s*light/);
  assert.match(shadowCss, /--diffs-bg:\s*#f3ede5/);
  assert.match(shadowCss, /\[data-line-number-content\]/);
  assert.match(shadowCss, /#4C4F69[^}]*#3b302c/s);
  assert.doesNotMatch(shadowCss, /\b(?:font|width|height|padding|margin)\s*:/i);
});

test("玛奇玛标题栏遮罩跟随右侧面板且可逆清理", () => {
  const apply = buildApplyScript(SAFE_CSS);
  const remove = buildRemoveScript();

  assert.match(apply, new RegExp(HEADER_OPAQUE_END_VAR));
  assert.match(apply, /ResizeObserver/);
  assert.match(apply, /right-panel/);
  assert.match(apply, /rightPanelObserver\?\.disconnect/);
  assert.match(remove, /rightPanelObserver\?\.disconnect/);
  assert.match(remove, /style\?\.removeProperty\(HEADER_END_VAR\)/);
  assert.doesNotMatch(buildApplyScript(SAFE_FAYE_CSS, THEMES.faye), new RegExp(HEADER_OPAQUE_END_VAR));
});

test("theme-specific scripts keep Faye markers separate from Makima", () => {
  assert.doesNotThrow(() => assertThemeSafety(SAFE_FAYE_CSS, {
    theme: THEMES.faye,
  }));
  assert.throws(() => assertThemeSafety(SAFE_FAYE_CSS), /selector must be scoped/);

  const apply = buildApplyScript(SAFE_FAYE_CSS, THEMES.faye);
  const remove = buildRemoveScript(THEMES.faye);
  const impact = buildImpactInspectionScript(THEMES.faye);
  for (const script of [apply, remove]) {
    assert.match(script, /codex-skin-faye/);
    assert.match(script, /__CODEX_SKIN_FAYE_STATE__/);
  }
  assert.match(apply, /dataset\.codexSkin = "faye"/);
  assert.match(impact, /"skin":"faye"/);
  assert.doesNotMatch(apply, /codex-skin-makima|__CODEX_SKIN_MAKIMA_STATE__/);
});

test("CSS safety guard rejects layout, hiding, and input-blocking rules", () => {
  assert.doesNotThrow(() => assertThemeSafety(SAFE_CSS));
  assert.doesNotThrow(() => assertThemeSafety(
    'html[data-codex-skin="makima"] .app-shell-left-panel::before {'
      + " position: absolute; inset: 0; pointer-events: none; opacity: 0.42; }",
  ));
  assert.doesNotThrow(() => assertThemeSafety(
    'html[data-codex-skin="makima"] div:has(> nav '
      + '[data-thread-user-message-navigation-rail-list])::before {'
      + ' content: ""; position: absolute; inset: 0 auto 0 0; width: 24px;'
      + " z-index: 20; pointer-events: none; background-attachment: fixed; }"
      + ' html[data-codex-skin="makima"] nav:has('
      + '[data-thread-user-message-navigation-rail-list]) { z-index: 30; }',
  ));
  assert.doesNotThrow(() => assertThemeSafety(
    'html[data-codex-skin="makima"] button {'
      + " background-color: #210f10; border-color: #d8aa4f;"
      + " box-shadow: 0 0 0 1px #d8aa4f; color: #f2e9de;"
      + " transition: background-color 120ms ease, border-color 120ms ease;"
      + " --color-token-bg-primary: #100c0b; }",
  ));
  assert.doesNotThrow(() => assertThemeSafety(
    'html[data-codex-skin="makima"] [data-local-conversation-item-target-ids]'
      + " .group\\/activity-header { padding-left: 10px; padding-right: 10px;"
      + " padding-top: 4px; padding-bottom: 4px; }",
  ));
  assert.doesNotThrow(() => assertThemeSafety(
    'html[data-codex-skin="makima"] [data-local-conversation-item-target-ids]'
      + ' .loading-shimmer-pure-text [aria-hidden="true"] { visibility: hidden; }',
  ));
  assert.doesNotThrow(() => assertThemeSafety(
    'html[data-codex-skin="makima"] [data-response-annotation-conversation] {'
      + " padding-left: 10px; padding-right: 10px;"
      + " padding-top: 8px; padding-bottom: 8px; transition: none; }",
  ));
  assert.doesNotThrow(() => assertThemeSafety(
    'html[data-codex-skin="makima"] [data-local-conversation-final-assistant]'
      + ':not(:has([data-response-annotation-conversation])) {'
      + " padding-left: 10px; padding-right: 10px;"
      + " padding-top: 8px; padding-bottom: 8px; transition: none; }",
  ));
  assert.doesNotThrow(() => assertThemeSafety(
    'html[data-codex-skin="makima"] [data-response-annotation-conversation]'
      + ' [data-wide-markdown-block][data-wide-markdown-block-kind="image"] {'
      + " --wide-block-width: 100%; }",
  ));
  assert.doesNotThrow(() => assertThemeSafety(
    'html[data-codex-skin="makima"] [data-pip-obstacle="thread-summary-panel"]'
      + ' [data-slot="thread-summary-panel-item-button"] {'
      + " padding-left: 8px; padding-right: 8px; }",
  ));
  assert.doesNotThrow(() => assertThemeSafety(
    'html[data-codex-skin="makima"] [data-codex-intelligence-trigger] {'
      + " padding-left: 10px; padding-right: 10px; margin-right: 6px; }",
  ));
  const rejected = [
    ['html[data-codex-skin="makima"] { font-family: serif; }', /font declarations/],
    ['html[data-codex-skin="makima"] button { display: none; }', /display/],
    ['html[data-codex-skin="makima"] button { visibility: hidden; }', /visibility/],
    ['html[data-codex-skin="makima"] main { content-visibility: auto; }', /content-visibility/],
    ['html[data-codex-skin="makima"] main { z-index: 2; }', /z-index/],
    ['html[data-codex-skin="makima"] button { all: unset; }', /all/],
    ['html[data-codex-skin="makima"] button { opacity: 0; }', /opacity/],
    ['html[data-codex-skin="makima"] body { position: fixed; }', /position/],
    ['html[data-codex-skin="makima"] body { pointer-events: none; }', /pointer-events/],
    ['html[data-codex-skin="makima"] main { border: 1px solid red; }', /border/],
    ['html[data-codex-skin="makima"] main { flex: 1; }', /flex/],
    ['html[data-codex-skin="makima"] main { grid-template-columns: 1fr 1fr; }', /grid-template-columns/],
    ['html[data-codex-skin="makima"] main { gap: 8px; }', /gap/],
    ['html[data-codex-skin="makima"] main { padding-left: 10px; }', /padding-left/],
    ['html[data-codex-skin="makima"] main { padding-right: 10px; }', /padding-right/],
    ['html[data-codex-skin="makima"] main { padding-top: 8px; }', /padding-top/],
    ['html[data-codex-skin="makima"] main { padding-bottom: 8px; }', /padding-bottom/],
    ['html[data-codex-skin="makima"] main { margin-right: 6px; }', /margin-right/],
    ['html[data-codex-skin="makima"] [data-response-annotation-conversation] [data-wide-markdown-block][data-wide-markdown-block-kind="image"] { --wide-block-width: 120%; }', /custom property/],
    ['html[data-codex-skin="makima"] main { --wide-block-width: 100%; }', /custom property/],
    ['html[data-codex-skin="makima"] main { animation: pulse 1s infinite; }', /animation/],
    ['html[data-codex-skin="makima"] main { transition: all 1s; }', /transition cannot animate all/],
    ['html[data-codex-skin="makima"] main { --toolbar-height: 20px; }', /custom property/],
    ['html[data-codex-skin="makima"] main::before { content: ""; }', /content is limited/],
    ['html[data-codex-skin="makima"] button { outline: none; }', /focus outlines/],
    [SAFE_CSS + " body { color: red; }", /selector must be scoped/],
  ];
  for (const [css, expected] of rejected) {
    assert.throws(() => assertThemeSafety(css), expected);
  }
});

function makeImpactContext({ throwWhenEnabled = false } = {}) {
  const attributes = new Map([["data-codex-skin", "makima"]]);
  const makeNode = (tagName, id = "") => ({
    tagName,
    id,
    tabIndex: 0,
    scrollWidth: 640,
    clientWidth: 640,
    scrollHeight: 480,
    clientHeight: 480,
    getAttribute: (name) => name === "role" ? "button" : null,
    getBoundingClientRect: () => ({
      x: 0, y: 0, top: 0, left: 0, right: 640, bottom: 480, width: 640, height: 480,
    }),
  });
  const root = makeNode("HTML");
  root.hasAttribute = (name) => attributes.has(name);
  root.getAttribute = (name) => attributes.get(name) ?? null;
  root.setAttribute = (name, value) => attributes.set(name, value);
  root.removeAttribute = (name) => attributes.delete(name);
  root.scrollWidth = 1280;
  root.clientWidth = 1280;
  root.scrollHeight = 720;
  root.clientHeight = 720;
  const body = makeNode("BODY");
  const button = makeNode("BUTTON", "send");
  const sidebar = makeNode("ASIDE");
  const main = makeNode("MAIN");
  const composer = makeNode("DIV");
  composer.isContentEditable = true;
  const queries = new Map([
    ["html", root],
    ["body", body],
    ["button, input, textarea, select", button],
    ["[data-codex-composer]", composer],
    ["[data-codex-composer-root]", composer],
    [".app-shell-left-panel", sidebar],
    ['[data-app-shell-content], [data-app-shell-main-content-layout], .main-surface', main],
  ]);
  const document = {
    documentElement: root,
    body,
    querySelector: (selector) => queries.get(selector) ?? null,
    querySelectorAll: () => [button],
  };
  const getComputedStyle = () => {
    const enabled = root.getAttribute("data-codex-skin") === "makima";
    if (enabled && throwWhenEnabled) throw new Error("sample failed");
    return {
      fontFamily: enabled ? "Enabled UI" : "Original UI",
      fontSize: "14px",
      lineHeight: "20px",
      letterSpacing: "normal",
      display: "block",
      visibility: "visible",
      pointerEvents: "auto",
      overflowX: "hidden",
      overflowY: "auto",
      getPropertyValue: (name) => name.includes("editor") ? "Code Font" : "UI Font",
    };
  };
  return { context: { document, getComputedStyle, innerWidth: 1280, innerHeight: 720 }, root };
}

test("impact sampler compares disabled/enabled CSS and restores marker", () => {
  const { context, root } = makeImpactContext();
  const result = runInNewContext(buildImpactInspectionScript(), context);
  assert.equal(typeof inspectImpactOnPort, "function");
  assert.equal(result.disabled.typography.body.fontFamily, "Original UI");
  assert.equal(result.enabled.typography.body.fontFamily, "Enabled UI");
  assert.equal(result.enabled.layout.sidebar.rect.width, 640);
  assert.equal(result.restoredSkin, "makima");
  assert.equal(root.getAttribute("data-codex-skin"), "makima");
});

test("impact sampler restores marker after a sampling error", () => {
  const { context, root } = makeImpactContext({ throwWhenEnabled: true });
  assert.throws(() => runInNewContext(buildImpactInspectionScript(), context), /sample failed/);
  assert.equal(root.getAttribute("data-codex-skin"), "makima");
});

test("pending apply is cancelled by remove before DOMContentLoaded", () => {
  const listeners = new Set();
  const style = { id: "", dataset: {}, textContent: "", remove() {} };
  const root = { dataset: {}, appendChild() {} };
  const document = {
    readyState: "loading",
    documentElement: root,
    head: root,
    addEventListener: (_name, listener) => listeners.add(listener),
    removeEventListener: (_name, listener) => listeners.delete(listener),
    getElementById: () => null,
    createElement: () => style,
    querySelectorAll: () => [],
  };
  const context = { document, getComputedStyle: () => ({ getPropertyValue: () => "", fontFamily: "Original" }) };
  runInNewContext(buildApplyScript(SAFE_CSS), context);
  assert.equal(listeners.size, 1);
  const pending = [...listeners][0];
  runInNewContext(buildRemoveScript(), context);
  assert.equal(listeners.size, 0);
  const result = pending();
  assert.equal(result.cancelled, true);
  assert.equal(root.dataset.codexSkin, undefined);
});
