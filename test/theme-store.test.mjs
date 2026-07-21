import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_THEME_ID,
  ThemeStore,
  defaultUserThemesRoot,
  deriveThemeRuntimeFields,
  validateThemePack,
} from "../src/theme-store.mjs";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function makeWorkspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-theme-store-test-"));
  const builtInRoot = path.join(root, "builtins");
  const userRoot = path.join(root, "user-themes");
  await mkdir(builtInRoot, { recursive: true });
  await mkdir(userRoot, { recursive: true });
  return { root, builtInRoot, userRoot };
}

async function writePack(parent, {
  id = "moonlit-archive",
  displayName = "Moonlit Archive",
  schemaVersion = 1,
  cssFile = "theme.css",
  heroFile = "hero.png",
  previewFile = "preview.png",
  appearance = "dark",
  css = null,
  hero = PNG_1X1,
  preview = PNG_1X1,
} = {}) {
  const directory = path.join(parent, id.replaceAll("/", "_"));
  await mkdir(directory, { recursive: true });
  const prefix = `--cs-${id}-`;
  const rootSelector = `html[data-codex-skin="${id}"]`;
  await writeFile(path.join(directory, "theme.json"), `${JSON.stringify({
    schemaVersion,
    id,
    displayName,
    eyebrow: "A QUIET NIGHT WORKSPACE",
    summary: "A low-detail moonlit reading surface.",
    appearance,
    cssFile,
    heroFile,
    previewFile,
  }, null, 2)}\n`);
  await writeFile(
    path.join(directory, "theme.css"),
    css ?? `${rootSelector} { ${prefix}ink: #e7ecf4; color: var(${prefix}ink); background-image: url("__CODEX_SKIN_HERO_IMAGE__"); }\n`,
  );
  await writeFile(path.join(directory, "hero.png"), hero);
  await writeFile(path.join(directory, "preview.png"), preview);
  return directory;
}

test("主题仓库合并内置与用户主题并派生隔离运行字段", async () => {
  const { builtInRoot, userRoot } = await makeWorkspace();
  await writePack(builtInRoot, {
    id: "makima",
    displayName: "Makima",
    appearance: "light",
  });
  await writePack(builtInRoot, { id: "faye", displayName: "Faye" });
  await writePack(userRoot);

  const store = new ThemeStore({ builtInRoot, userRoot });
  const themes = await store.list();
  const theme = await store.resolve("MOONLIT-ARCHIVE");

  assert.equal(DEFAULT_THEME_ID, "makima");
  assert.deepEqual(themes.map(({ id }) => id), ["makima", "faye", "moonlit-archive"]);
  assert.equal(theme.schemaVersion, 1);
  assert.equal(theme.styleId, "codex-skin-moonlit-archive");
  assert.equal(theme.stateKey, "__CODEX_SKIN_MOONLIT_ARCHIVE_STATE__");
  assert.equal(theme.cssVariablePrefix, "--cs-moonlit-archive-");
  assert.equal(theme.runtimeDirectory, "Codex Skin Studio/Runtime/moonlit-archive");
  assert.equal(theme.source, "user");
  assert.match(theme.previewPath, /preview\.png$/);
  assert.equal((await store.resolve()).id, "makima");
});

test("默认用户主题路径不进入 ~/.codex 且支持测试覆盖", () => {
  assert.equal(
    defaultUserThemesRoot({ HOME: "/tmp/alice" }),
    "/tmp/alice/Library/Application Support/Codex Skin Studio/Themes",
  );
  assert.equal(
    defaultUserThemesRoot({
      HOME: "/tmp/alice",
      CODEX_SKIN_STUDIO_HOME: "/tmp/studio",
    }),
    "/tmp/studio/Themes",
  );
});

test("主题清单拒绝 ID、schema、资源路径和图片格式越界", async () => {
  const { root } = await makeWorkspace();
  const invalidId = await writePack(root, { id: "Bad_ID" });
  await assert.rejects(validateThemePack(invalidId), /主题 ID/);

  const invalidSchema = await writePack(root, {
    id: "future-schema",
    schemaVersion: 2,
  });
  await assert.rejects(validateThemePack(invalidSchema), /schemaVersion/);

  const escaped = await writePack(root, { id: "escaped-path" });
  const escapedManifestPath = path.join(escaped, "theme.json");
  const escapedManifest = JSON.parse(await readFile(escapedManifestPath, "utf8"));
  escapedManifest.cssFile = "../outside.css";
  await writeFile(escapedManifestPath, JSON.stringify(escapedManifest));
  await assert.rejects(validateThemePack(escaped), /资源路径/);

  const badImage = await writePack(root, {
    id: "bad-image",
    hero: Buffer.from("not-an-image"),
  });
  await assert.rejects(validateThemePack(badImage), /PNG、JPEG 或 WebP/);
});

test("主题包拒绝资源符号链接和重复 ID", async () => {
  const { root, builtInRoot, userRoot } = await makeWorkspace();
  const linked = await writePack(root, { id: "linked-image" });
  const external = path.join(root, "external.png");
  await writeFile(external, PNG_1X1);
  await writeFile(path.join(linked, "hero.png"), PNG_1X1);
  await symlink(external, path.join(linked, "linked.png"));
  const manifestPath = path.join(linked, "theme.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.heroFile = "linked.png";
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(validateThemePack(linked), /符号链接/);

  await writePack(builtInRoot, { id: "makima" });
  await writePack(userRoot, { id: "makima", displayName: "Override" });
  await assert.rejects(new ThemeStore({ builtInRoot, userRoot }).list(), /重复主题 ID/);
});

test("安装、显式替换和删除使用用户主题目录且保护运行中主题", async () => {
  const { root, builtInRoot, userRoot } = await makeWorkspace();
  await writePack(builtInRoot, { id: "makima" });
  const source = await writePack(path.join(root, "sources"));
  const store = new ThemeStore({ builtInRoot, userRoot });

  const installed = await store.install(source);
  assert.equal(installed.id, "moonlit-archive");
  assert.equal(installed.source, "user");
  await assert.rejects(store.install(source), /已经安装/);

  const replacementSource = await writePack(path.join(root, "replacement"), {
    displayName: "Moonlit Archive II",
  });
  const replacement = await store.install(replacementSource, { replace: true });
  assert.equal(replacement.displayName, "Moonlit Archive II");

  await assert.rejects(
    store.remove("moonlit-archive", { isRunning: async () => true }),
    /正在运行/,
  );
  assert.equal(await store.remove("moonlit-archive"), true);
  await assert.rejects(store.resolve("moonlit-archive"), /未知主题/);
  await assert.rejects(store.remove("makima"), /内置主题/);
});

test("派生字段只接受规范化 ID", () => {
  assert.deepEqual(deriveThemeRuntimeFields("quiet-night"), {
    styleId: "codex-skin-quiet-night",
    stateKey: "__CODEX_SKIN_QUIET_NIGHT_STATE__",
    cssVariablePrefix: "--cs-quiet-night-",
    runtimeDirectory: "Codex Skin Studio/Runtime/quiet-night",
    snapshotFile: "quiet-night-runtime.png",
  });
  assert.throws(() => deriveThemeRuntimeFields("../night"), /主题 ID/);
});
