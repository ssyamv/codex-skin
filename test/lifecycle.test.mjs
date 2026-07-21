import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ensureRuntimeHome,
  getRuntimePaths,
  writeState,
} from "../src/runtime.mjs";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = path.join(projectRoot, "bin", "codex-skin.mjs");

test("status 在 daemon 消失后报告 degraded 且保留状态", async (context) => {
  const container = await mkdtemp(path.join(os.tmpdir(), "codex-skin-status-"));
  const runtimeHome = path.join(container, "runtime");
  context.after(() => rm(container, { recursive: true, force: true }));
  const profileDir = path.join(runtimeHome, "Profile");
  const stateFile = path.join(runtimeHome, "state.json");
  const state = {
    schemaVersion: 1,
    theme: "makima",
    daemonPid: 999_999_999,
    appPid: 999_999_998,
    port: 65_534,
    profileDir,
  };
  const runtimePaths = getRuntimePaths({
    CODEX_SKIN_HOME: runtimeHome,
    CODEX_SKIN_PROFILE_DIR: profileDir,
  });
  await ensureRuntimeHome(runtimePaths);
  await writeState(runtimePaths, state);

  const result = spawnSync(process.execPath, [cli, "status", "--json"], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_SKIN_HOME: runtimeHome,
      CODEX_SKIN_PROFILE_DIR: profileDir,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "degraded");
  assert.match(output.reasons.join(" "), /守护进程未运行/);
  assert.deepEqual(JSON.parse(await readFile(stateFile, "utf8")), state);
});

test("stop 不读取或删除无所有权标记的 state.json", async (context) => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), "codex-skin-unowned-stop-"));
  context.after(() => rm(runtimeHome, { recursive: true, force: true }));
  const profileDir = path.join(runtimeHome, "Profile");
  const stateFile = path.join(runtimeHome, "state.json");
  const original = `${JSON.stringify({ theme: "makima", daemonPid: 123 })}\n`;
  await writeFile(stateFile, original, { mode: 0o600 });

  const result = spawnSync(process.execPath, [cli, "stop"], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_SKIN_HOME: runtimeHome,
      CODEX_SKIN_PROFILE_DIR: profileDir,
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /没有皮肤所有权标记/);
  assert.equal(await readFile(stateFile, "utf8"), original);
});

test("生命周期命令拒绝 HOME 作为皮肤 profile", async (context) => {
  const container = await mkdtemp(path.join(os.tmpdir(), "codex-skin-unsafe-"));
  const runtimeHome = path.join(container, "runtime");
  context.after(() => rm(container, { recursive: true, force: true }));
  await ensureRuntimeHome(getRuntimePaths({ CODEX_SKIN_HOME: runtimeHome }));
  const result = spawnSync(process.execPath, [cli, "status", "--json"], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_SKIN_HOME: runtimeHome,
      CODEX_SKIN_PROFILE_DIR: os.homedir(),
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /拒绝把宽泛目录或官方 Codex profile/);
});

test("生命周期命令拒绝 HOME 作为皮肤运行目录", () => {
  const result = spawnSync(process.execPath, [cli, "status", "--json"], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_SKIN_HOME: os.homedir(),
      CODEX_SKIN_PROFILE_DIR: path.join(os.homedir(), "Codex Makima Profile"),
    },
  });

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /拒绝访问没有皮肤所有权标记|拒绝把宽泛目录或官方 Codex profile/,
  );
});

test("生命周期命令拒绝把皮肤运行目录放进任意 app 包", async (context) => {
  const container = await mkdtemp(path.join(os.tmpdir(), "codex-skin-app-guard-"));
  context.after(() => rm(container, { recursive: true, force: true }));
  const runtimeHome = path.join(
    container,
    "Fake.app",
    "Contents",
    "Resources",
    "Codex Makima Runtime",
  );
  const result = spawnSync(process.execPath, [cli, "status", "--json"], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_SKIN_HOME: runtimeHome,
      CODEX_SKIN_PROFILE_DIR: path.join(runtimeHome, "Profile"),
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /不能位于应用包/);
  await assert.rejects(access(runtimeHome), { code: "ENOENT" });
});

test("生命周期命令拒绝把皮肤运行目录放进默认 ~/.codex", async () => {
  const runtimeHome = path.join(
    os.homedir(),
    ".codex",
    `Codex-Makima-Audit-${process.pid}-${Date.now()}`,
  );
  const result = spawnSync(process.execPath, [cli, "status", "--json"], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_SKIN_HOME: runtimeHome,
      CODEX_SKIN_PROFILE_DIR: path.join(runtimeHome, "Profile"),
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /~\/\.codex/);
  await assert.rejects(access(runtimeHome), { code: "ENOENT" });
});

test("生命周期命令拒绝皮肤目录与当前 CODEX_HOME 重叠", async (context) => {
  const container = await mkdtemp(path.join(os.tmpdir(), "codex-skin-home-guard-"));
  context.after(() => rm(container, { recursive: true, force: true }));
  const codexHome = path.join(container, "codex-home");
  const runtimeHome = path.join(codexHome, "skin-runtime");
  const result = spawnSync(process.execPath, [cli, "status", "--json"], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      CODEX_SKIN_HOME: runtimeHome,
      CODEX_SKIN_PROFILE_DIR: path.join(runtimeHome, "Profile"),
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /当前 CODEX_HOME/);
  await assert.rejects(access(runtimeHome), { code: "ENOENT" });
});

test("doctor 人类可读输出只报告静态主视觉", () => {
  const result = spawnSync(process.execPath, [cli, "doctor"], {
    cwd: projectRoot,
    encoding: "utf8",
    env: process.env,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /undefined bytes|侧栏素材/);
  assert.doesNotMatch(result.stdout, /动态主视觉|静态回退/);
  assert.match(result.stdout, /静态主视觉：\d+ bytes/);
  assert.match(result.stdout, /编译后 CSS：\d+ bytes/);
});

test("Faye doctor 编译独立主题与主视觉", () => {
  const result = spawnSync(process.execPath, [cli, "doctor", "--theme", "faye", "--json"], {
    cwd: projectRoot,
    encoding: "utf8",
    env: process.env,
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.theme.id, "faye");
  assert.equal(output.theme.name, "Faye");
  assert.match(output.theme.css, /themes\/faye\.css$/);
  assert.match(output.theme.heroArt, /assets\/faye-hero-left\.webp$/);
  assert.ok(output.theme.compiledCssBytes > output.theme.cssBytes);
});
