import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import path from "node:path";
import test from "node:test";

import { ThemeCssHotReloader } from "../src/hot-reload.mjs";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function makeWatcherHarness() {
  const watcher = new EventEmitter();
  watcher.closed = false;
  watcher.close = () => {
    watcher.closed = true;
  };
  let notify;
  const watch = (directory, options, listener) => {
    assert.equal(directory, "/tmp/theme-pack");
    assert.equal(options.encoding, "utf8");
    notify = listener;
    return watcher;
  };
  return { watcher, watch, notify: (...args) => notify(...args) };
}

test("CSS 热重载去抖并忽略主题包内的无关文件", async () => {
  const harness = makeWatcherHarness();
  const compiled = [];
  const applied = [];
  const reloader = new ThemeCssHotReloader({
    cssPath: "/tmp/theme-pack/theme.css",
    compileCss: async () => {
      const css = `compiled-${compiled.length + 1}`;
      compiled.push(css);
      return css;
    },
    applyCss: async (css) => applied.push(css),
    debounceMs: 5,
    watch: harness.watch,
  });

  reloader.start();
  harness.notify("change", "preview.png");
  harness.notify("change", "theme.css");
  harness.notify("rename", "theme.css");
  await delay(30);

  assert.deepEqual(compiled, ["compiled-1"]);
  assert.deepEqual(applied, ["compiled-1"]);
  await reloader.stop();
  assert.equal(harness.watcher.closed, true);
});

test("CSS 热重载失败后保留监听并接受下一次有效保存", async () => {
  const harness = makeWatcherHarness();
  const errors = [];
  const applied = [];
  let invalid = true;
  const reloader = new ThemeCssHotReloader({
    cssPath: path.join("/tmp/theme-pack", "theme.css"),
    compileCss: async () => {
      if (invalid) throw new Error("Unsafe CSS");
      return "valid-css";
    },
    applyCss: async (css) => applied.push(css),
    onError: (error) => errors.push(error.message),
    debounceMs: 5,
    watch: harness.watch,
  });

  reloader.start();
  harness.notify("change", "theme.css");
  await delay(30);
  invalid = false;
  harness.notify("change", "theme.css");
  await delay(30);

  assert.deepEqual(errors, ["Unsafe CSS"]);
  assert.deepEqual(applied, ["valid-css"]);
  await reloader.stop();
});
