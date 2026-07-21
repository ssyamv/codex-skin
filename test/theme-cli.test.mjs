import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveCodexApp } from "../src/runtime.mjs";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = path.join(projectRoot, "bin", "codex-skin.mjs");
const installedCodexApp = await resolveCodexApp().catch(() => null);
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function makeContext() {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-theme-cli-test-"));
  const home = path.join(root, "home");
  const studioHome = path.join(root, "studio");
  await mkdir(home, { recursive: true });
  await mkdir(studioHome, { recursive: true });
  return {
    root,
    env: {
      ...process.env,
      HOME: home,
      CODEX_SKIN_STUDIO_HOME: studioHome,
      ...(installedCodexApp ? { CODEX_APP_PATH: installedCodexApp.appPath } : {}),
    },
  };
}

async function writePack(root, displayName = "Moonlit Archive") {
  const directory = path.join(root, "moonlit-archive-source");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "theme.json"), `${JSON.stringify({
    schemaVersion: 1,
    id: "moonlit-archive",
    displayName,
    eyebrow: "A QUIET NIGHT WORKSPACE",
    summary: "A low-detail moonlit reading surface.",
    appearance: "dark",
    cssFile: "theme.css",
    heroFile: "hero.png",
    previewFile: "preview.png",
  }, null, 2)}\n`);
  await writeFile(
    path.join(directory, "theme.css"),
    'html[data-codex-skin="moonlit-archive"] { '
      + '--cs-moonlit-archive-ink: #e7ecf4; '
      + 'color: var(--cs-moonlit-archive-ink); '
      + 'background-image: url("__CODEX_SKIN_HERO_IMAGE__"); }\n',
  );
  await writeFile(path.join(directory, "hero.png"), PNG_1X1);
  await writeFile(path.join(directory, "preview.png"), PNG_1X1);
  return directory;
}

function run(args, env) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: projectRoot,
    env,
    encoding: "utf8",
  });
}

function parseSuccess(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test("themes list 和 validate 输出 Swift 可消费的主题 JSON", async () => {
  const { root, env } = await makeContext();
  const pack = await writePack(root);

  const initial = parseSuccess(run(["themes", "list", "--json"], env));
  assert.deepEqual(initial.map(({ id }) => id), ["makima", "faye"]);
  for (const theme of initial) {
    assert.equal(theme.schemaVersion, 1);
    assert.equal(typeof theme.displayName, "string");
    assert.equal(theme.source, "builtin");
    assert.equal(path.isAbsolute(theme.previewPath), true);
    assert.equal(path.isAbsolute(theme.installedPath), true);
  }

  const validated = parseSuccess(run(["themes", "validate", pack, "--json"], env));
  assert.equal(validated.id, "moonlit-archive");
  assert.equal(validated.source, "candidate");
  assert.equal(validated.styleId, "codex-skin-moonlit-archive");
});

test("themes install、replace 和 remove 保持职责分离", async () => {
  const { root, env } = await makeContext();
  const pack = await writePack(root);

  const installed = parseSuccess(run(["themes", "install", pack, "--json"], env));
  assert.equal(installed.id, "moonlit-archive");
  assert.equal(installed.source, "user");

  const duplicate = run(["themes", "install", pack, "--json"], env);
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /已经安装/);

  await writePack(root, "Moonlit Archive II");
  const replaced = parseSuccess(
    run(["themes", "install", pack, "--replace", "--json"], env),
  );
  assert.equal(replaced.displayName, "Moonlit Archive II");

  const list = parseSuccess(run(["themes", "list", "--json"], env));
  assert.deepEqual(list.map(({ id }) => id), ["makima", "faye", "moonlit-archive"]);

  const removed = parseSuccess(
    run(["themes", "remove", "moonlit-archive", "--json"], env),
  );
  assert.deepEqual(removed, { id: "moonlit-archive", removed: true });
  const finalThemes = parseSuccess(run(["themes", "list", "--json"], env));
  assert.deepEqual(finalThemes.map(({ id }) => id), ["makima", "faye"]);
});

test("uninstall 只清理运行时并保留主题包", {
  skip: installedCodexApp ? false : "需要已安装的官方 Codex Desktop",
}, async () => {
  const { root, env } = await makeContext();
  const pack = await writePack(root);
  parseSuccess(run(["themes", "install", pack, "--json"], env));

  const uninstall = run(["uninstall", "--theme", "moonlit-archive", "--json"], env);
  assert.equal(uninstall.status, 0, uninstall.stderr);
  const afterUninstall = parseSuccess(run(["themes", "list", "--json"], env));
  assert.ok(afterUninstall.some(({ id }) => id === "moonlit-archive"));
});

test("themes 命令拒绝缺失位置参数和内置主题删除", async () => {
  const { env } = await makeContext();
  const missing = run(["themes", "validate", "--json"], env);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /主题包目录/);

  const builtIn = run(["themes", "remove", "makima", "--json"], env);
  assert.notEqual(builtIn.status, 0);
  assert.match(builtIn.stderr, /内置主题/);
});
