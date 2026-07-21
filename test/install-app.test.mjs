import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const installer = path.join(
  projectRoot,
  ".agents",
  "skills",
  "customize-codex-theme",
  "scripts",
  "install-app.zsh",
);
const version = "1.7.0";
const appName = "Codex Skin Studio.app";
const expectedBundleId = "com.ssyamv.codexskinstudio";

async function createSignedApp(parent, {
  marker,
  bundleId = expectedBundleId,
  doctorExit = 0,
} = {}) {
  const app = path.join(parent, appName);
  const contents = path.join(app, "Contents");
  const macOS = path.join(contents, "MacOS");
  const runtime = path.join(contents, "Resources", "runtime");
  await mkdir(macOS, { recursive: true });
  await mkdir(path.join(runtime, "bin"), { recursive: true });
  await writeFile(path.join(contents, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${bundleId}</string>
<key>CFBundleExecutable</key><string>CodexSkinStudio</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>\n`);
  await writeFile(path.join(macOS, "CodexSkinStudio"), "#!/bin/sh\nexit 0\n");
  await writeFile(
    path.join(runtime, "node"),
    `#!/bin/sh\necho '{"doctor":"${marker}"}'\nexit ${doctorExit}\n`,
  );
  await writeFile(path.join(runtime, "bin", "codex-skin.mjs"), "// installer fixture\n");
  await writeFile(path.join(contents, "marker.txt"), `${marker}\n`);
  await chmod(path.join(macOS, "CodexSkinStudio"), 0o755);
  await chmod(path.join(runtime, "node"), 0o755);
  const signed = spawnSync(
    "/usr/bin/codesign",
    ["--force", "--deep", "--sign", "-", app],
    { encoding: "utf8" },
  );
  assert.equal(signed.status, 0, signed.stderr);
  return app;
}

async function zipAsset(releaseRoot, arch, options) {
  const buildRoot = await mkdtemp(path.join(os.tmpdir(), `codex-installer-${arch}-`));
  const assetName = `Codex-Skin-Studio-${version}-macos-${arch}.zip`;
  const assetPath = path.join(releaseRoot, assetName);
  if (options.malformed) {
    await writeFile(assetPath, "not a zip archive\n");
  } else {
    const app = await createSignedApp(buildRoot, options);
    const zipped = spawnSync(
      "/usr/bin/ditto",
      ["-c", "-k", "--sequesterRsrc", "--keepParent", app, assetPath],
      { encoding: "utf8" },
    );
    assert.equal(zipped.status, 0, zipped.stderr);
  }
  const bytes = await readFile(assetPath);
  return {
    assetName,
    checksum: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function createRelease(assets) {
  const releaseRoot = await mkdtemp(path.join(os.tmpdir(), "codex-local-release-"));
  const entries = [];
  for (const [arch, options] of Object.entries(assets)) {
    entries.push(await zipAsset(releaseRoot, arch, options));
  }
  await writeFile(
    path.join(releaseRoot, "SHA256SUMS"),
    entries.map(({ checksum, assetName }) => `${checksum}  ${assetName}`).join("\n") + "\n",
  );
  return releaseRoot;
}

async function createInstallRoot(existingOptions) {
  const installRoot = await mkdtemp(path.join(os.tmpdir(), "codex-install-root-"));
  if (existingOptions) {
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "codex-existing-app-"));
    const existing = await createSignedApp(sourceRoot, existingOptions);
    await cp(existing, path.join(installRoot, appName), { recursive: true });
  }
  return installRoot;
}

function runInstaller({ releaseRoot, installRoot, arch = "arm64", extra = [] }) {
  return spawnSync(
    "/bin/zsh",
    [
      installer,
      "--version", version,
      "--source-dir", releaseRoot,
      "--install-root", installRoot,
      ...extra,
    ],
    {
      cwd: projectRoot,
      env: { ...process.env, CODEX_SKIN_INSTALL_ARCH: arch },
      encoding: "utf8",
    },
  );
}

async function installedMarker(installRoot) {
  return readFile(path.join(installRoot, appName, "Contents", "marker.txt"), "utf8");
}

test("arm64 与 x86_64 选择对应 Release 资产", async () => {
  const releaseRoot = await createRelease({
    arm64: { marker: "arm-build" },
    x64: { marker: "intel-build" },
  });
  for (const [arch, marker] of [["arm64", "arm-build\n"], ["x86_64", "intel-build\n"]]) {
    const installRoot = await createInstallRoot();
    const result = runInstaller({ releaseRoot, installRoot, arch });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(await installedMarker(installRoot), marker);
  }
});

test("checksum 不匹配时不改变已有 App", async () => {
  const releaseRoot = await createRelease({ arm64: { marker: "new" } });
  await writeFile(path.join(releaseRoot, "SHA256SUMS"), `${"0".repeat(64)}  Codex-Skin-Studio-${version}-macos-arm64.zip\n`);
  const installRoot = await createInstallRoot({ marker: "old" });
  const result = runInstaller({ releaseRoot, installRoot });
  assert.notEqual(result.status, 0);
  assert.equal(await installedMarker(installRoot), "old\n");
});

test("损坏 ZIP 与错误 Bundle ID 都不改变已有 App", async () => {
  for (const assetOptions of [
    { marker: "broken", malformed: true },
    { marker: "wrong-id", bundleId: "example.invalid.app" },
  ]) {
    const releaseRoot = await createRelease({ arm64: assetOptions });
    const installRoot = await createInstallRoot({ marker: "old" });
    const result = runInstaller({ releaseRoot, installRoot });
    assert.notEqual(result.status, 0);
    assert.equal(await installedMarker(installRoot), "old\n");
  }
});

test("安装后 doctor 失败会恢复旧 App", async () => {
  const releaseRoot = await createRelease({
    arm64: { marker: "failing-new", doctorExit: 23 },
  });
  const installRoot = await createInstallRoot({ marker: "healthy-old" });
  const result = runInstaller({ releaseRoot, installRoot });
  assert.notEqual(result.status, 0);
  assert.equal(await installedMarker(installRoot), "healthy-old\n");
});

test("安装器计划可审计且不包含提权或 Gatekeeper 绕过", async () => {
  const source = await readFile(installer, "utf8");
  assert.doesNotMatch(source, /\bsudo\b|xattr\s+-d|spctl\s+--master-disable/);

  const releaseRoot = await createRelease({ arm64: { marker: "planned" } });
  const installRoot = await createInstallRoot();
  const result = runInstaller({
    releaseRoot,
    installRoot,
    extra: ["--print-plan"],
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /macos-arm64\.zip/);
  await assert.rejects(installedMarker(installRoot), /ENOENT/);
});
