import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const packager = path.join(projectRoot, "scripts", "package-release.zsh");
const skillSource = path.join(
  projectRoot,
  ".agents",
  "skills",
  "customize-codex-theme",
);

async function createSignedApp(parent) {
  const app = path.join(parent, "Codex Skin Studio.app");
  const contents = path.join(app, "Contents");
  await mkdir(path.join(contents, "MacOS"), { recursive: true });
  await writeFile(path.join(contents, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.ssyamv.codexskinstudio</string>
<key>CFBundleExecutable</key><string>CodexSkinStudio</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>\n`);
  const executable = path.join(contents, "MacOS", "CodexSkinStudio");
  await writeFile(executable, "#!/bin/sh\nexit 0\n");
  await chmod(executable, 0o755);
  const signed = spawnSync(
    "/usr/bin/codesign",
    ["--force", "--deep", "--sign", "-", app],
    { encoding: "utf8" },
  );
  assert.equal(signed.status, 0, signed.stderr);
  return app;
}

test("Release 打包只产出架构 App、Skill 与可验证校验和", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-release-package-"));
  const app = await createSignedApp(root);
  const skill = path.join(root, "skill-source");
  const output = path.join(root, "release");
  await cp(skillSource, skill, { recursive: true });
  await writeFile(path.join(skill, ".DS_Store"), "must not ship");

  const result = spawnSync(
    "/bin/zsh",
    [
      packager,
      "--app", app,
      "--skill", skill,
      "--version", "1.7.0",
      "--arch", "arm64",
      "--output", output,
    ],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);

  assert.deepEqual((await readdir(output)).sort(), [
    "Codex-Skin-Studio-1.7.0-macos-arm64.zip",
    "SHA256SUMS",
    "customize-codex-theme-1.7.0.zip",
  ]);

  const skillZip = path.join(output, "customize-codex-theme-1.7.0.zip");
  const listing = spawnSync("/usr/bin/unzip", ["-Z1", skillZip], { encoding: "utf8" });
  assert.equal(listing.status, 0, listing.stderr);
  const entries = listing.stdout.trim().split("\n");
  assert.ok(entries.length > 3);
  assert.ok(entries.every((entry) => entry.startsWith("customize-codex-theme/")));
  assert.ok(entries.every((entry) => !entry.endsWith(".DS_Store")));

  const checksum = spawnSync(
    "/usr/bin/shasum",
    ["-a", "256", "-c", "SHA256SUMS"],
    { cwd: output, encoding: "utf8" },
  );
  assert.equal(checksum.status, 0, checksum.stderr || checksum.stdout);
  assert.match(checksum.stdout, /arm64\.zip: OK/);
  assert.match(checksum.stdout, /customize-codex-theme-1\.7\.0\.zip: OK/);
  assert.equal((await readFile(path.join(output, "SHA256SUMS"), "utf8")).trim().split("\n").length, 2);
});
