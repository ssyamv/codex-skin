import { readFile } from "node:fs/promises";

import { CdpClient, listCdpTargets } from "./cdp.mjs";
import { DEFAULT_THEME } from "./themes.mjs";

export const STYLE_ID = DEFAULT_THEME.styleId;
export const HERO_IMAGE_PLACEHOLDER = "__CODEX_SKIN_HERO_IMAGE__";
export const DIFF_SHADOW_STYLE_SUFFIX = "-diffs-shadow";
export const HEADER_OPAQUE_END_VAR = "--mk-header-opaque-end";
// Kept as a stable public alias for existing callers and tests.
export const IMAGE_PLACEHOLDER = HERO_IMAGE_PLACEHOLDER;

const DIFF_SHADOW_CSS = Object.freeze({
  makima: `:host {
  color-scheme: light !important;
  color: #3b302c !important;
  background-color: #f3ede5 !important;
  --diffs-fg: #3b302c !important;
  --diffs-bg: #f3ede5 !important;
  --diffs-dark: #3b302c !important;
  --diffs-light: #3b302c !important;
  --diffs-addition-color: #397348 !important;
  --diffs-deletion-color: #b33d45 !important;
  --diffs-modified-color: #7b5517 !important;
  --diffs-editor-selection-bg: rgb(161 51 67 / 20%) !important;
  --diffs-editor-line-highlight-bg: rgb(141 100 30 / 9%) !important;
}

[data-file],
[data-code],
[data-content],
[data-line] {
  color: #3b302c !important;
  background-color: #f3ede5 !important;
}

[data-gutter] {
  color: #79675f !important;
  background-color: #ece3d9 !important;
  box-shadow: inset -1px 0 rgb(122 91 50 / 12%) !important;
}

[data-line-number-content] {
  color: #79675f !important;
}

[data-line] span[style*="#D20F39" i] { color: #b33d45 !important; }
[data-line] span[style*="#4C4F69" i] { color: #3b302c !important; }
[data-line] span[style*="#40A02B" i] { color: #397348 !important; }
[data-line] span[style*="#1E66F5" i] { color: #356b8a !important; }
[data-line] span[style*="#7C7F93" i] { color: #79675f !important; }
[data-line] span[style*="#7287FD" i] { color: #7a568f !important; }
[data-line] span[style*="#FE640B" i] { color: #8d641e !important; }
[data-line] span[style*="#179299" i] { color: #36726f !important; }
[data-line] span[style*="#04A5E5" i] { color: #356b8a !important; }`,
});

export function getDiffShadowCss(theme = DEFAULT_THEME) {
  return DIFF_SHADOW_CSS[theme.id] || "";
}

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "textarea",
  "select",
  "summary",
  '[role="button"]',
  '[role="link"]',
  '[contenteditable="true"]',
  "[tabindex]",
].join(",");
const TYPOGRAPHY_SELECTORS = {
  root: "html",
  body: "body",
  control: "button, input, textarea, select",
  composer: "[data-codex-composer]",
  code: "pre, code, .monaco-editor",
};
const LAYOUT_SELECTORS = {
  root: "html",
  body: "body",
  sidebar: ".app-shell-left-panel",
  main: '[data-app-shell-content], [data-app-shell-main-content-layout], .main-surface',
  composer: "[data-codex-composer-root]",
};

export async function loadThemeCss(
  stylePath,
  { heroImagePath, theme = DEFAULT_THEME },
) {
  const [template, heroImage] = await Promise.all([
    readFile(stylePath, "utf8"),
    readFile(heroImagePath),
  ]);
  validateSkinCss(template, { theme });
  if (template.split(HERO_IMAGE_PLACEHOLDER).length !== 2) {
    throw new Error(
      `${theme.displayName} CSS must include ${HERO_IMAGE_PLACEHOLDER} exactly once`,
    );
  }
  return template.replace(
    HERO_IMAGE_PLACEHOLDER,
    `data:image/webp;base64,${heroImage.toString("base64")}`,
  );
}

export function loadMakimaTheme(stylePath, options) {
  return loadThemeCss(stylePath, { ...options, theme: DEFAULT_THEME });
}

export function validateSkinCss(css, { theme = DEFAULT_THEME } = {}) {
  const rootSelector = `html[data-codex-skin="${theme.id}"]`;
  const decorationSelector = `${rootSelector} .app-shell-left-panel::before`;
  const navigationRailBackdropSelector = `${rootSelector} div:has(> nav [data-thread-user-message-navigation-rail-list])::before`;
  const navigationRailSelector = `${rootSelector} nav:has([data-thread-user-message-navigation-rail-list])`;
  const activityHeaderSelector = `${rootSelector} [data-local-conversation-item-target-ids] .group\\/activity-header`;
  const shimmerDecorationSelector = `${rootSelector} [data-local-conversation-item-target-ids] .loading-shimmer-pure-text [aria-hidden="true"]`;
  const responseAnnotationSelector = `${rootSelector} [data-response-annotation-conversation]`;
  const finalAssistantFallbackSelector = `${rootSelector} [data-local-conversation-final-assistant]:not(:has([data-response-annotation-conversation]))`;
  const responseImageWideBlockSelector = `${responseAnnotationSelector} [data-wide-markdown-block][data-wide-markdown-block-kind="image"]`;
  const summaryItemSelector = `${rootSelector} [data-pip-obstacle="thread-summary-panel"] [data-slot="thread-summary-panel-item-button"]`;
  const intelligenceTriggerSelector = `${rootSelector} [data-codex-intelligence-trigger]`;
  const errorPrefix = `Unsafe ${theme.displayName} CSS`;
  const forbiddenPatterns = [
    [/([;{]|^)\s*font(?:-family|-size)?\s*:/im, "font declarations"],
    [/([;{]|^)\s*line-height\s*:/im, "line-height declarations"],
    [/([;{]|^)\s*letter-spacing\s*:/im, "letter-spacing declarations"],
    [/([;{]|^)\s*--(?:vscode-)?(?:editor-)?(?:font|line-height)[\w-]*\s*:/im, "font variables"],
    [/@(?:import|font-face|property)\b/i, "external or custom CSS registrations"],
  ];
  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(css)) throw new Error(`${errorPrefix}: ${label} are not allowed`);
  }

  const layoutProperties = new Set([
    "all",
    "animation",
    "animation-delay",
    "animation-direction",
    "animation-duration",
    "animation-fill-mode",
    "animation-iteration-count",
    "animation-name",
    "animation-play-state",
    "animation-timing-function",
    "align-content",
    "align-items",
    "align-self",
    "appearance",
    "aspect-ratio",
    "backface-visibility",
    "background-attachment",
    "block-size",
    "border",
    "border-block",
    "border-block-end",
    "border-block-start",
    "border-block-width",
    "border-bottom",
    "border-bottom-width",
    "border-inline",
    "border-inline-end",
    "border-inline-start",
    "border-inline-width",
    "border-left",
    "border-left-width",
    "border-right",
    "border-right-width",
    "border-top",
    "border-top-width",
    "border-width",
    "box-sizing",
    "break-after",
    "break-before",
    "break-inside",
    "caption-side",
    "clear",
    "clip",
    "clip-path",
    "column-count",
    "column-gap",
    "column-width",
    "columns",
    "contain",
    "contain-intrinsic-block-size",
    "contain-intrinsic-height",
    "contain-intrinsic-inline-size",
    "contain-intrinsic-size",
    "contain-intrinsic-width",
    "content-visibility",
    "counter-increment",
    "counter-reset",
    "counter-set",
    "cursor",
    "direction",
    "display",
    "filter",
    "flex",
    "flex-basis",
    "flex-direction",
    "flex-flow",
    "flex-grow",
    "flex-shrink",
    "flex-wrap",
    "float",
    "gap",
    "grid",
    "grid-area",
    "grid-auto-columns",
    "grid-auto-flow",
    "grid-auto-rows",
    "grid-column",
    "grid-column-end",
    "grid-column-start",
    "grid-row",
    "grid-row-end",
    "grid-row-start",
    "grid-template",
    "grid-template-areas",
    "grid-template-columns",
    "grid-template-rows",
    "height",
    "hyphens",
    "inline-size",
    "inset-block",
    "inset-block-end",
    "inset-block-start",
    "inset-inline",
    "inset-inline-end",
    "inset-inline-start",
    "isolation",
    "justify-content",
    "justify-items",
    "justify-self",
    "list-style",
    "list-style-image",
    "list-style-position",
    "list-style-type",
    "margin",
    "margin-block",
    "margin-block-end",
    "margin-block-start",
    "margin-bottom",
    "margin-inline",
    "margin-inline-end",
    "margin-inline-start",
    "margin-left",
    "margin-right",
    "margin-top",
    "mask",
    "mask-image",
    "max-block-size",
    "max-height",
    "max-inline-size",
    "max-width",
    "min-block-size",
    "min-height",
    "min-inline-size",
    "min-width",
    "mix-blend-mode",
    "object-fit",
    "object-position",
    "offset",
    "offset-anchor",
    "offset-distance",
    "offset-path",
    "offset-position",
    "offset-rotate",
    "order",
    "overflow",
    "overflow-anchor",
    "overflow-clip-margin",
    "overflow-wrap",
    "overflow-x",
    "overflow-y",
    "padding",
    "padding-block",
    "padding-block-end",
    "padding-block-start",
    "padding-bottom",
    "padding-inline",
    "padding-inline-end",
    "padding-inline-start",
    "padding-left",
    "padding-right",
    "padding-top",
    "perspective",
    "perspective-origin",
    "place-content",
    "place-items",
    "place-self",
    "quotes",
    "resize",
    "rotate",
    "row-gap",
    "scale",
    "scroll-behavior",
    "scroll-margin",
    "scroll-padding",
    "scroll-snap-align",
    "scroll-snap-stop",
    "scroll-snap-type",
    "shape-outside",
    "table-layout",
    "text-indent",
    "text-overflow",
    "touch-action",
    "transform",
    "transform-origin",
    "transition-delay",
    "transition-duration",
    "transition-property",
    "transition-timing-function",
    "translate",
    "unicode-bidi",
    "vertical-align",
    "visibility",
    "white-space",
    "width",
    "will-change",
    "word-break",
    "word-spacing",
    "writing-mode",
    "zoom",
    "-webkit-app-region",
    "-webkit-line-clamp",
    "-webkit-mask",
    "-webkit-mask-image",
    "-webkit-text-size-adjust",
    "-webkit-user-drag",
    "-webkit-user-select",
    "top",
    "right",
    "bottom",
    "left",
    "z-index",
  ]);
  const decorationOnly = new Map([
    ["content", new Set(['""', "none"])],
    ["position", "absolute"],
    ["inset", "0"],
    ["opacity", "0.42"],
    ["pointer-events", "none"],
    ["user-select", "none"],
  ]);
  const navigationRailDecorationOnly = new Map([
    ["content", new Set(['""', "none"])],
    ["position", "absolute"],
    ["inset", "0 auto 0 0"],
    ["pointer-events", "none"],
  ]);
  const decorationRules = new Map([
    [decorationSelector, decorationOnly],
    [navigationRailBackdropSelector, navigationRailDecorationOnly],
  ]);
  const layoutExceptions = new Map([
    ["background-attachment", new Map([
      [navigationRailBackdropSelector, "fixed"],
    ])],
    ["padding-left", new Map([
      [activityHeaderSelector, "10px"],
      [responseAnnotationSelector, "10px"],
      [finalAssistantFallbackSelector, "10px"],
      [summaryItemSelector, "8px"],
      [intelligenceTriggerSelector, "10px"],
    ])],
    ["padding-right", new Map([
      [activityHeaderSelector, "10px"],
      [responseAnnotationSelector, "10px"],
      [finalAssistantFallbackSelector, "10px"],
      [summaryItemSelector, "8px"],
      [intelligenceTriggerSelector, "10px"],
    ])],
    ["padding-top", new Map([
      [responseAnnotationSelector, "8px"],
      [finalAssistantFallbackSelector, "8px"],
      [activityHeaderSelector, "4px"],
    ])],
    ["padding-bottom", new Map([
      [responseAnnotationSelector, "8px"],
      [finalAssistantFallbackSelector, "8px"],
      [activityHeaderSelector, "4px"],
    ])],
    ["margin-right", new Map([[intelligenceTriggerSelector, "6px"]])],
    ["visibility", new Map([[shimmerDecorationSelector, "hidden"]])],
    ["width", new Map([[navigationRailBackdropSelector, "24px"]])],
    ["z-index", new Map([
      [navigationRailBackdropSelector, "20"],
      [navigationRailSelector, "30"],
    ])],
  ]);
  const safeTransitionProperties = new Set([
    "background-color",
    "border-color",
    "box-shadow",
    "color",
  ]);
  const safeCodexCustomProperties = new Set([
    "--codex-base-accent",
    "--codex-base-contrast",
    "--codex-base-ink",
    "--codex-base-surface",
    "--codex-diffs-addition-hover",
    "--codex-diffs-addition-number",
    "--codex-diffs-context-number",
    "--codex-diffs-context-surface",
    "--codex-diffs-deletion-hover",
    "--codex-diffs-deletion-number",
    "--codex-diffs-header-surface",
    "--codex-diffs-hover-surface",
    "--codex-diffs-placeholder-base",
    "--codex-diffs-placeholder-highlight",
    "--codex-diffs-separator-surface",
    "--codex-diffs-surface",
    "--codex-diffs-surface-override",
  ]);
  const safeLayoutCustomProperties = new Map([
    ["--wide-block-width", new Map([
      [responseImageWideBlockSelector, "100%"],
    ])],
  ]);
  for (const rule of parseCssRules(css)) {
    const unscopedSelector = rule.selector
      .split(",")
      .map((selector) => selector.trim())
      .find((selector) => !selector.startsWith(rootSelector));
    if (unscopedSelector) {
      throw new Error(
        `${errorPrefix}: selector must be scoped under ${rootSelector}: ${unscopedSelector}`,
      );
    }
    for (const { property, value } of rule.declarations) {
      if (layoutProperties.has(property)) {
        const allowedValue = layoutExceptions.get(property)?.get(rule.selector);
        if (allowedValue !== value) {
          throw new Error(`${errorPrefix}: ${property} can change Codex layout or visibility`);
        }
        continue;
      }
      if (
        property.startsWith("--")
        && !property.startsWith(theme.cssVariablePrefix)
        && !property.startsWith("--color-")
        && !safeCodexCustomProperties.has(property)
      ) {
        const allowedValue = safeLayoutCustomProperties.get(property)?.get(rule.selector);
        if (allowedValue === value) continue;
        throw new Error(`${errorPrefix}: custom property ${property} is not color-only`);
      }
      if (property === "transition") {
        if (value === "none") continue;
        const transitionParts = value
          .replace(/cubic-bezier\([^)]*\)/gi, "ease")
          .split(",")
          .map((part) => part.trim().split(/\s+/, 1)[0]);
        const unsafeTransition = transitionParts.find(
          (transitionProperty) => !safeTransitionProperties.has(transitionProperty),
        );
        if (unsafeTransition) {
          throw new Error(
            `${errorPrefix}: transition cannot animate ${unsafeTransition}`,
          );
        }
      }
      if (
        ["color", "fill", "stroke"].includes(property)
        && /\btransparent\b/i.test(value)
      ) {
        throw new Error(`${errorPrefix}: ${property} cannot hide content`);
      }
      if (property.startsWith("outline") && /^(?:0|none)(?:\s|$)/i.test(value)) {
        throw new Error(`${errorPrefix}: focus outlines cannot be removed`);
      }
      if (!decorationOnly.has(property)) continue;
      const expected = decorationRules.get(rule.selector)?.get(property);
      if (expected === undefined) {
        throw new Error(
          `${errorPrefix}: ${property} is limited to ${[...decorationRules.keys()].join(" or ")}`,
        );
      }
      const valid = expected instanceof Set ? expected.has(value) : value === expected;
      if (!valid) {
        throw new Error(
          `${errorPrefix}: ${property} has an invalid decoration value`,
        );
      }
    }
  }

  if (!css.includes(rootSelector)) {
    throw new Error(`${errorPrefix}: every visual rule must be scoped under ${rootSelector}`);
  }
}

function parseCssRules(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].replace(/\s+/g, " ").trim(),
    declarations: [...match[2].matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;}]+)/g)].map(
      (declaration) => ({
        property: declaration[1].toLowerCase(),
        value: declaration[2].replace(/\s*!important\s*$/i, "").trim(),
      }),
    ),
  }));
}

export function buildApplyScript(css, theme = DEFAULT_THEME) {
  return `(() => {
    const ID = ${JSON.stringify(theme.styleId)};
    const KEY = ${JSON.stringify(theme.stateKey)};
    const SHADOW_ID = ${JSON.stringify(`${theme.styleId}${DIFF_SHADOW_STYLE_SUFFIX}`)};
    const SHADOW_CSS = ${JSON.stringify(getDiffShadowCss(theme))};
    const HEADER_END_VAR = ${JSON.stringify(theme.id === "makima" ? HEADER_OPAQUE_END_VAR : "")};
    const SELECTOR = ${JSON.stringify(INTERACTIVE_SELECTOR)};
    const CSS = ${JSON.stringify(css)};
    const previous = globalThis[KEY];
    if (previous) {
      previous.cancelled = true;
      previous.shadowObserver?.disconnect();
      previous.rightPanelObserver?.disconnect();
      if (previous.listener) {
        document.removeEventListener("DOMContentLoaded", previous.listener);
      }
    }
    const state = {
      applied: false,
      pending: false,
      cancelled: false,
      generation: (previous?.generation || 0) + 1,
      listener: null,
    };
    Object.defineProperty(state, "shadowObserver", {
      value: null,
      writable: true,
      enumerable: false,
    });
    Object.defineProperty(state, "rightPanelObserver", {
      value: null,
      writable: true,
      enumerable: false,
    });
    Object.defineProperty(state, "rightPanelNode", {
      value: null,
      writable: true,
      enumerable: false,
    });
    globalThis[KEY] = state;
    const syncDiffShadows = () => {
      if (!SHADOW_CSS || state.cancelled || globalThis[KEY] !== state) return 0;
      let count = 0;
      for (const host of document.querySelectorAll("diffs-container")) {
        const shadowRoot = host.shadowRoot;
        if (!shadowRoot) continue;
        let shadowStyle = shadowRoot.getElementById?.(SHADOW_ID)
          || shadowRoot.querySelector("#" + SHADOW_ID);
        if (!shadowStyle) {
          shadowStyle = document.createElement("style");
          shadowStyle.id = SHADOW_ID;
          shadowStyle.dataset.codexSkinOwned = "true";
          shadowRoot.appendChild(shadowStyle);
        }
        if (shadowStyle.textContent !== SHADOW_CSS) shadowStyle.textContent = SHADOW_CSS;
        count += 1;
      }
      return count;
    };
    const syncHeaderOpaqueEnd = () => {
      if (!HEADER_END_VAR || state.cancelled || globalThis[KEY] !== state) return null;
      const root = document.documentElement;
      if (!root) return null;
      const panel = document.querySelector(
        'aside[data-app-shell-focus-area="right-panel"]',
      );
      if (state.rightPanelNode !== panel) {
        state.rightPanelObserver?.disconnect();
        state.rightPanelNode = panel;
        state.rightPanelObserver?.observe(root);
        if (panel) state.rightPanelObserver?.observe(panel);
      }
      const left = panel
        ? Math.max(0, Math.min(globalThis.innerWidth, panel.getBoundingClientRect().left))
        : globalThis.innerWidth;
      const value = Math.round(left * 100) / 100 + "px";
      if (root.style.getPropertyValue(HEADER_END_VAR) !== value) {
        root.style.setProperty(HEADER_END_VAR, value);
      }
      state.headerOpaqueEnd = value;
      return value;
    };
    const syncRuntimeSurfaces = () => {
      syncDiffShadows();
      syncHeaderOpaqueEnd();
    };
    const apply = () => {
      if (state.cancelled || globalThis[KEY] !== state) {
        return { applied: false, cancelled: true, generation: state.generation };
      }
      state.listener = null;
      const root = document.documentElement;
      if (!root) {
        state.pending = true;
        return { applied: false, pending: true, generation: state.generation };
      }
      const rootStyle = getComputedStyle(root);
      const beforeFont = rootStyle.getPropertyValue("--vscode-font-family").trim()
        || getComputedStyle(document.body || root).fontFamily;
      const beforeCount = document.querySelectorAll(SELECTOR).length;
      let style = document.getElementById(ID);
      if (!style) {
        style = document.createElement("style");
        style.id = ID;
        style.dataset.codexSkinOwned = "true";
        (document.head || root).appendChild(style);
      }
      if (style.textContent !== CSS) style.textContent = CSS;
      root.dataset.codexSkin = ${JSON.stringify(theme.id)};
      const shadowStyleCount = syncDiffShadows();
      if (HEADER_END_VAR && typeof ResizeObserver !== "undefined") {
        state.rightPanelObserver = new ResizeObserver(syncHeaderOpaqueEnd);
      }
      const headerOpaqueEnd = syncHeaderOpaqueEnd();
      if (SHADOW_CSS && typeof MutationObserver !== "undefined") {
        state.shadowObserver = new MutationObserver(syncRuntimeSurfaces);
        state.shadowObserver.observe(root, { childList: true, subtree: true });
      }
      const afterFont = getComputedStyle(root)
        .getPropertyValue("--vscode-font-family").trim()
        || getComputedStyle(document.body || root).fontFamily;
      return Object.assign(state, {
        applied: true,
        pending: false,
      version: "1.6.2",
        appliedAt: new Date().toISOString(),
        fontFamilyBefore: beforeFont,
        fontFamilyAfter: afterFont,
        interactiveCountBefore: beforeCount,
        interactiveCountAfter: document.querySelectorAll(SELECTOR).length,
        shadowStyleCount,
        headerOpaqueEnd,
      });
    };
    if (document.readyState === "loading") {
      state.pending = true;
      state.listener = apply;
      document.addEventListener("DOMContentLoaded", apply, { once: true });
      return { applied: false, pending: true, generation: state.generation };
    }
    return apply();
  })()`;
}

export function buildRemoveScript(theme = DEFAULT_THEME) {
  return `(() => {
    const KEY = ${JSON.stringify(theme.stateKey)};
    const SHADOW_ID = ${JSON.stringify(`${theme.styleId}${DIFF_SHADOW_STYLE_SUFFIX}`)};
    const HEADER_END_VAR = ${JSON.stringify(theme.id === "makima" ? HEADER_OPAQUE_END_VAR : "")};
    const state = globalThis[KEY];
    if (state) {
      state.cancelled = true;
      state.shadowObserver?.disconnect();
      state.rightPanelObserver?.disconnect();
      if (state.listener) {
        document.removeEventListener("DOMContentLoaded", state.listener);
      }
    }
    document.getElementById(${JSON.stringify(theme.styleId)})?.remove();
    for (const host of document.querySelectorAll("diffs-container")) {
      const shadowRoot = host.shadowRoot;
      shadowRoot?.getElementById?.(SHADOW_ID)?.remove();
      shadowRoot?.querySelector("#" + SHADOW_ID)?.remove();
    }
    const root = document.documentElement;
    if (HEADER_END_VAR) root?.style?.removeProperty(HEADER_END_VAR);
    if (root?.dataset.codexSkin === ${JSON.stringify(theme.id)}) delete root.dataset.codexSkin;
    delete globalThis[KEY];
    return {
      removed: !document.getElementById(${JSON.stringify(theme.styleId)}),
      markerRemoved: root?.dataset.codexSkin !== ${JSON.stringify(theme.id)},
    };
  })()`;
}

export function buildHealthScript(theme = DEFAULT_THEME) {
  return `(() => {
    const root = document.documentElement;
    const state = globalThis[${JSON.stringify(theme.stateKey)}] || null;
    const SHADOW_ID = ${JSON.stringify(`${theme.styleId}${DIFF_SHADOW_STYLE_SUFFIX}`)};
    const shadowHosts = [...document.querySelectorAll("diffs-container")]
      .filter((host) => host.shadowRoot);
    const shadowStyleCount = shadowHosts.reduce(
      (count, host) => count + Number(Boolean(host.shadowRoot.getElementById?.(SHADOW_ID)
        || host.shadowRoot.querySelector("#" + SHADOW_ID))),
      0,
    );
    const currentFont = root
      ? getComputedStyle(root).getPropertyValue("--vscode-font-family").trim()
        || getComputedStyle(document.body || root).fontFamily
      : null;
    return {
      applied: Boolean(
        root?.dataset.codexSkin === ${JSON.stringify(theme.id)}
        && document.getElementById(${JSON.stringify(theme.styleId)})
      ),
      marker: root?.dataset.codexSkin || null,
      styleCount: document.querySelectorAll(${JSON.stringify(`#${theme.styleId}`)}).length,
      shadowHostCount: shadowHosts.length,
      shadowStyleCount,
      unthemedShadowCount: shadowHosts.length - shadowStyleCount,
      state,
      currentFont,
      interactiveCount: document.querySelectorAll(${JSON.stringify(INTERACTIVE_SELECTOR)}).length,
    };
  })()`;
}

function inspectPageImpact({ skin, interactiveSelector, typographySelectors, layoutSelectors }) {
  const root = document.documentElement;
  if (!root) throw new Error("Codex document has no root element");
  const select = (selector) => selector === "html" ? root : document.querySelector(selector);
  const typographyOf = (node) => {
    if (!node) return null;
    const style = getComputedStyle(node);
    return {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
    };
  };
  const layoutOf = (node) => {
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      rect: {
        x: rect.x,
        y: rect.y,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
      overflow: {
        x: style.overflowX,
        y: style.overflowY,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
      },
    };
  };
  const snapshot = () => {
    const rootStyle = getComputedStyle(root);
    return {
      fontVariables: {
        uiFamily: rootStyle.getPropertyValue("--vscode-font-family").trim(),
        codeFamily: rootStyle.getPropertyValue("--vscode-editor-font-family").trim(),
        uiSize: rootStyle.getPropertyValue("--vscode-font-size").trim(),
        codeSize: rootStyle.getPropertyValue("--vscode-editor-font-size").trim(),
        codeLineHeight: rootStyle.getPropertyValue("--vscode-editor-line-height").trim(),
      },
      typography: Object.fromEntries(
        Object.entries(typographySelectors).map(([name, selector]) => [
          name,
          typographyOf(select(selector)),
        ]),
      ),
      interactive: [...document.querySelectorAll(interactiveSelector)].map((node, index) => {
        const style = getComputedStyle(node);
        return {
          index,
          tagName: node.tagName || null,
          id: node.id || null,
          role: node.getAttribute?.("role") || null,
          disabled: Boolean(node.disabled),
          ariaDisabled: node.getAttribute?.("aria-disabled") || null,
          readOnly: Boolean(node.readOnly),
          contentEditable: node.getAttribute?.("contenteditable") || null,
          tabIndex: node.tabIndex,
          display: style.display,
          visibility: style.visibility,
          pointerEvents: style.pointerEvents,
        };
      }),
      layout: Object.fromEntries(
        Object.entries(layoutSelectors).map(([name, selector]) => [name, layoutOf(select(selector))]),
      ),
      viewport: {
        width: globalThis.innerWidth,
        height: globalThis.innerHeight,
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        scrollHeight: root.scrollHeight,
        clientHeight: root.clientHeight,
      },
      composer: (() => {
        const composer = document.querySelector("[data-codex-composer]");
        if (!composer) return null;
        const style = getComputedStyle(composer);
        return {
          isContentEditable: composer.isContentEditable,
          contentEditable: composer.getAttribute("contenteditable"),
          pointerEvents: style.pointerEvents,
          display: style.display,
          visibility: style.visibility,
        };
      })(),
    };
  };
  const hadSkin = root.hasAttribute("data-codex-skin");
  const originalSkin = root.getAttribute("data-codex-skin");
  let before;
  let after;
  try {
    root.removeAttribute("data-codex-skin");
    before = snapshot();
    root.setAttribute("data-codex-skin", skin);
    after = snapshot();
  } finally {
    if (hadSkin) root.setAttribute("data-codex-skin", originalSkin);
    else root.removeAttribute("data-codex-skin");
  }
  return {
    originalSkin,
    restoredSkin: root.getAttribute("data-codex-skin"),
    disabled: before,
    enabled: after,
    before,
    after,
  };
}

export function buildImpactScript(theme = DEFAULT_THEME) {
  return `(${inspectPageImpact.toString()})(${JSON.stringify({
    skin: theme.id,
    interactiveSelector: INTERACTIVE_SELECTOR,
    typographySelectors: TYPOGRAPHY_SELECTORS,
    layoutSelectors: LAYOUT_SELECTORS,
  })})`;
}

async function evaluate(client, expression) {
  const result = await client.call("Runtime.evaluate", {
    expression,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description
        || result.exceptionDetails.text
        || "Codex page evaluation failed",
    );
  }
  return result.result?.value;
}

async function createSession(target, css, theme) {
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  let identifier = null;
  let applyScript = null;
  try {
    await Promise.all([client.call("Runtime.enable"), client.call("Page.enable")]);
    applyScript = buildApplyScript(css, theme);
    ({ identifier } = await client.call("Page.addScriptToEvaluateOnNewDocument", {
      source: applyScript,
    }));
    await evaluate(client, applyScript);
    return { target, client, applyScript, identifier, theme };
  } catch (error) {
    if (identifier) {
      await client.call("Page.removeScriptToEvaluateOnNewDocument", {
        identifier,
      }).catch(() => {});
    }
    await evaluate(client, buildRemoveScript(theme)).catch(() => {});
    client.close();
    throw error;
  }
}

async function removeSession(session) {
  if (session.client.closed) return;
  const failures = [];
  try {
    await session.client.call("Page.removeScriptToEvaluateOnNewDocument", {
      identifier: session.identifier,
    });
  } catch (error) {
    failures.push(error);
  }
  try {
    await evaluate(session.client, buildRemoveScript(session.theme));
  } catch (error) {
    failures.push(error);
  } finally {
    session.client.close();
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "Codex theme session cleanup was incomplete");
  }
}

export async function removeThemeFromPort(port, theme = DEFAULT_THEME) {
  const targets = await listCdpTargets(port).catch(() => []);
  return Promise.allSettled(targets.map(async (target) => {
    const client = await CdpClient.connect(target.webSocketDebuggerUrl);
    try {
      return await evaluate(client, buildRemoveScript(theme));
    } finally {
      client.close();
    }
  }));
}

export async function inspectThemeOnPort(port, theme = DEFAULT_THEME) {
  return Promise.all((await listCdpTargets(port)).map(async (target) => {
    const client = await CdpClient.connect(target.webSocketDebuggerUrl);
    try {
      return {
        targetId: target.id,
        title: target.title,
        url: target.url,
        health: await evaluate(client, buildHealthScript(theme)),
      };
    } finally {
      client.close();
    }
  }));
}

export async function inspectImpactOnPort(port, theme = DEFAULT_THEME) {
  const script = buildImpactScript(theme);
  return Promise.all((await listCdpTargets(port)).map(async (target) => {
    const client = await CdpClient.connect(target.webSocketDebuggerUrl);
    try {
      return {
        targetId: target.id,
        title: target.title,
        url: target.url,
        impact: await evaluate(client, script),
      };
    } finally {
      client.close();
    }
  }));
}

export class ThemeMonitor {
  #port;
  #css;
  #theme;
  #onReport;
  #pollMs;
  #healthMs;
  #sessions = new Map();
  #timer = null;
  #running = false;
  #lastHealth = 0;
  #tickPromise = null;

  constructor({
    port,
    css,
    theme = DEFAULT_THEME,
    onReport,
    pollMs = 1_000,
    healthMs = 5_000,
  }) {
    this.#port = port;
    this.#css = css;
    this.#theme = theme;
    this.#onReport = onReport ?? (() => {});
    this.#pollMs = pollMs;
    this.#healthMs = healthMs;
  }

  async start() {
    if (this.#running) return;
    this.#running = true;
    await this.#runTick();
    this.#timer = setInterval(() => void this.#runTick(), this.#pollMs);
  }

  async stop() {
    if (!this.#running && !this.#tickPromise) return;
    this.#running = false;
    clearInterval(this.#timer);
    await this.#tickPromise?.catch(() => {});
    const cleanupResults = await Promise.allSettled(
      [...this.#sessions.values()].map(removeSession),
    );
    this.#sessions.clear();
    await removeThemeFromPort(this.#port, this.#theme).catch(() => {});
    const failures = cleanupResults
      .filter(({ status }) => status === "rejected")
      .map(({ reason }) => reason);
    if (failures.length > 0) {
      throw new AggregateError(failures, "One or more theme sessions failed to clean up");
    }
  }

  async #runTick() {
    if (!this.#running) return;
    if (this.#tickPromise) return this.#tickPromise;
    const task = this.#tick();
    this.#tickPromise = task;
    try {
      await task;
    } finally {
      if (this.#tickPromise === task) this.#tickPromise = null;
    }
  }

  async #tick() {
    try {
      const targets = await listCdpTargets(this.#port);
      const targetIds = new Set(targets.map((target) => target.id));
      for (const [id, session] of this.#sessions) {
        if (!targetIds.has(id) || session.client.closed) {
          session.client.close();
          this.#sessions.delete(id);
        }
      }
      for (const target of targets) {
        if (!this.#sessions.has(target.id)) {
          this.#sessions.set(
            target.id,
            await createSession(target, this.#css, this.#theme),
          );
        }
      }

      const validations = [];
      if (Date.now() - this.#lastHealth >= this.#healthMs) {
        this.#lastHealth = Date.now();
        for (const session of this.#sessions.values()) {
          let health = await evaluate(
            session.client,
            buildHealthScript(this.#theme),
          );
          const fontChanged = health.state
            && health.state.fontFamilyAfter !== health.currentFont;
          if (
            !health.applied
            || health.styleCount !== 1
            || health.unthemedShadowCount > 0
            || fontChanged
          ) {
            await evaluate(session.client, session.applyScript);
            health = await evaluate(
              session.client,
              buildHealthScript(this.#theme),
            );
          }
          validations.push({ targetId: session.target.id, health });
        }
      }
      this.#report({
        connected: true,
        error: null,
        targetCount: targets.length,
        validations,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      this.#report({
        connected: false,
        error: error.message,
        targetCount: this.#sessions.size,
        validations: [],
        updatedAt: new Date().toISOString(),
      });
    }
  }

  #report(report) {
    try {
      this.#onReport(report);
    } catch {
      // Monitoring must never terminate because a report consumer failed.
    }
  }
}

// Stable public names used by the CLI and tests.
export const assertThemeSafety = validateSkinCss;
export const buildImpactInspectionScript = buildImpactScript;
