import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const builder = path.join(projectRoot, "scripts", "build-app.zsh");

async function createOtoolFixture(dependencies) {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-build-app-"));
  const node = path.join(root, "node fixture");
  const otool = path.join(root, "otool fixture");
  await writeFile(node, "fixture\n");
  await chmod(node, 0o755);
  await writeFile(
    otool,
    `#!/bin/zsh\nprint -r -- "$1:"\n${dependencies.map((dependency) => `print -r -- $'\\t${dependency} (compatibility version 1.0.0, current version 1.0.0)'`).join("\n")}\n`,
  );
  await chmod(otool, 0o755);
  return { node, otool };
}

function checkNodeRuntime({ node, otool }) {
  return spawnSync("/bin/zsh", [builder, "--check-node-runtime", node], {
    cwd: projectRoot,
    env: { ...process.env, CODEX_SKIN_OTOOL: otool },
    encoding: "utf8",
  });
}

test("构建前检查接受仅链接 macOS 系统动态库的 Node", async (context) => {
  const fixture = await createOtoolFixture([
    "/usr/lib/libSystem.B.dylib",
    "/System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation",
  ]);
  context.after(() => rm(path.dirname(fixture.node), { recursive: true, force: true }));
  const result = checkNodeRuntime(fixture);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /动态库依赖检查通过/);
});

test("构建前检查拒绝 Homebrew 动态库依赖", async (context) => {
  const fixture = await createOtoolFixture([
    "/usr/lib/libSystem.B.dylib",
    "/opt/homebrew/opt/libuv/lib/libuv.1.dylib",
  ]);
  context.after(() => rm(path.dirname(fixture.node), { recursive: true, force: true }));
  const result = checkNodeRuntime(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /拒绝打包依赖非系统动态库的 Node\.js/);
  assert.match(result.stderr, /\/opt\/homebrew\/opt\/libuv\/lib\/libuv\.1\.dylib/);
});
