import { watch as watchDirectory } from "node:fs";
import path from "node:path";

export class ThemeCssHotReloader {
  #applyCss;
  #compileCss;
  #cssFileName;
  #cssPath;
  #debounceMs;
  #onError;
  #onReload;
  #reloadPromise = Promise.resolve();
  #stopped = false;
  #timer = null;
  #watch;
  #watcher = null;

  constructor({
    cssPath,
    compileCss,
    applyCss,
    onReload,
    onError,
    debounceMs = 120,
    watch = watchDirectory,
  }) {
    this.#cssPath = path.resolve(cssPath);
    this.#cssFileName = path.basename(this.#cssPath);
    this.#compileCss = compileCss;
    this.#applyCss = applyCss;
    this.#onReload = onReload ?? (() => {});
    this.#onError = onError ?? (() => {});
    this.#debounceMs = debounceMs;
    this.#watch = watch;
  }

  start() {
    if (this.#watcher) return;
    this.#stopped = false;
    this.#watcher = this.#watch(
      path.dirname(this.#cssPath),
      { encoding: "utf8", persistent: true },
      (_eventType, fileName) => {
        if (fileName !== null && String(fileName) !== this.#cssFileName) return;
        this.#scheduleReload();
      },
    );
    this.#watcher.on?.("error", (error) => void this.#reportError(error));
  }

  async stop() {
    this.#stopped = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#watcher?.close();
    this.#watcher = null;
    await this.#reloadPromise;
  }

  #scheduleReload() {
    if (this.#stopped) return;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#reloadPromise = this.#reloadPromise.then(() => this.#reload());
    }, this.#debounceMs);
  }

  async #reload() {
    if (this.#stopped) return;
    try {
      const css = await this.#compileCss();
      if (this.#stopped) return;
      const result = await this.#applyCss(css);
      await this.#onReload({ cssPath: this.#cssPath, result });
    } catch (error) {
      await this.#reportError(error);
    }
  }

  async #reportError(error) {
    try {
      await this.#onError(error instanceof Error ? error : new Error(String(error)));
    } catch {
      // A logger failure must not stop future reload attempts.
    }
  }
}
