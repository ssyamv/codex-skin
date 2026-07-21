#!/usr/bin/env node

import { CdpClient, listCdpTargets } from "../src/cdp.mjs";
import { resolveTheme } from "../src/themes.mjs";

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(
    "用法：node scripts/runtime-probe.mjs <CDP port> [--theme makima|faye]",
  );
}
const themeOptionIndex = process.argv.indexOf("--theme");
const theme = resolveTheme(
  themeOptionIndex === -1 ? undefined : process.argv[themeOptionIndex + 1],
);

const targets = await listCdpTargets(port);
const results = [];
for (const target of targets) {
  const connection = await CdpClient.connect(target.webSocketDebuggerUrl);
  const response = await connection.call("Runtime.evaluate", {
    expression: `(() => {
      const root = document.documentElement;
      const get = (selector) => document.querySelector(selector);
      const styleOf = (selector) => {
        const node = get(selector);
        if (!node) return null;
        const style = getComputedStyle(node);
        return {
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          letterSpacing: style.letterSpacing,
          pointerEvents: style.pointerEvents,
          visibility: style.visibility,
          display: style.display
        };
      };
      const composer = get("[data-codex-composer]");
      const interactiveSelector = [
        "button", "a[href]", "input", "textarea",
        "[contenteditable='true']", "[role='button']", "[tabindex]"
      ].join(",");
      const computed = getComputedStyle(root);
      return {
        targetId: ${JSON.stringify(target.id)},
        url: location.href,
        readyState: document.readyState,
        skin: root.dataset.codexSkin || null,
        skinEpoch: root.dataset.codexSkinEpoch || null,
        expectedSkin: ${JSON.stringify(theme.id)},
        styleCount: document.querySelectorAll("#" + ${JSON.stringify(theme.styleId)}).length,
        markers: {
          root: Boolean(get("#root")),
          sidebar: Boolean(get("aside.app-shell-left-panel")),
          main: Boolean(get("main.main-surface")),
          composer: Boolean(composer),
          terminal: Boolean(get("[data-codex-terminal]"))
        },
        typographyVariables: {
          uiFamily: computed.getPropertyValue("--vscode-font-family").trim(),
          codeFamily: computed.getPropertyValue("--vscode-editor-font-family").trim(),
          uiSize: computed.getPropertyValue("--vscode-font-size").trim(),
          codeSize: computed.getPropertyValue("--vscode-editor-font-size").trim()
        },
        samples: {
          body: styleOf("body"),
          button: styleOf("button"),
          composer: styleOf("[data-codex-composer]"),
          code: styleOf("code")
        },
        composerEditable: composer ? composer.isContentEditable : null,
        interactiveCount: document.querySelectorAll(interactiveSelector).length,
        horizontalOverflow: root.scrollWidth > root.clientWidth,
        viewport: {
          width: innerWidth,
          height: innerHeight,
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth
        }
      };
    })()`,
    returnByValue: true,
  });
  results.push(response.result?.value || null);
  connection.close();
}

console.log(JSON.stringify(results, null, 2));
