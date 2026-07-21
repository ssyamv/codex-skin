import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const skillRoot = path.join(
  projectRoot,
  ".agents",
  "skills",
  "customize-codex-theme",
);
const generator = path.join(skillRoot, "scripts", "create-theme-pack.mjs");
const cli = path.join(projectRoot, "bin", "codex-skin.mjs");
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("Skill 固化生图、安装、验证与恢复边界", async () => {
  const [skill, reference] = await Promise.all([
    readFile(path.join(skillRoot, "SKILL.md"), "utf8"),
    readFile(path.join(skillRoot, "references", "theme-contract.md"), "utf8"),
  ]);
  const instructions = `${skill}\n${reference}`;

  assert.match(instructions, /(?:生成|generate).*background.*imagegen|imagegen.*(?:生成|generate).*background/is);
  assert.match(instructions, /(?:修改|modify|edit).*background.*imagegen|imagegen.*(?:修改|modify|edit).*background/is);
  assert.match(instructions, /原样|不变|unchanged/i);
  assert.match(instructions, /复制.*图片|copy.*image/is);
  assert.match(instructions, /Codex.*(?:运行|running).*(?:离线安装|offline installation|themes install)/is);
  assert.match(instructions, /(?:不要|禁止|不得|do not).*(?:自动启动|automatically start|launch)/is);
  assert.match(instructions, /(?:禁止|不得|must not).{0,30}sudo/is);
  assert.match(instructions, /(?:禁止|不得|must not).{0,50}xattr -d/is);
  assert.match(instructions, /(?:禁止|不得|must not).{0,50}spctl --master-disable/is);
  assert.match(instructions, /(?:禁止|不得|never).{0,50}~\/\.codex/is);
  for (const evidence of ["themes validate", "themes install", "doctor", "verify"]) {
    assert.match(instructions, new RegExp(evidence));
  }
  for (const recovery of ["stop", "restore", "themes remove"]) {
    assert.match(instructions, new RegExp(recovery));
  }

  const scriptFiles = await readdir(path.join(skillRoot, "scripts"));
  for (const file of scriptFiles) {
    const source = await readFile(path.join(skillRoot, "scripts", file), "utf8");
    assert.doesNotMatch(source, /\bsudo\b|xattr\s+-d|spctl\s+--master-disable/);
  }
});

test("主题包生成器原样复制图片并产出可安装的 schema-1 主题", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-skill-contract-"));
  const hero = path.join(root, "source.png");
  const config = path.join(root, "config.json");
  const output = path.join(root, "quiet-orbit");
  await mkdir(root, { recursive: true });
  await writeFile(hero, PNG_1X1);
  await writeFile(config, `${JSON.stringify({
    id: "quiet-orbit",
    displayName: "Quiet Orbit",
    eyebrow: "A CALM ORBITAL WORKSPACE",
    summary: "A dark, low-detail workspace with a quiet blue horizon.",
    appearance: "dark",
    colors: {
      surface: "#10141D",
      text: "#E8EEF8",
      muted: "rgba(232, 238, 248, 0.62)",
      accent: "rgb(99, 153, 255)",
      border: "rgba(130, 166, 220, 0.28)",
      code: "#171D29",
    },
  }, null, 2)}\n`);

  const generated = spawnSync(
    process.execPath,
    [generator, "--config", config, "--hero", hero, "--output", output],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const manifest = JSON.parse(await readFile(path.join(output, "theme.json"), "utf8"));
  assert.deepEqual(manifest, {
    schemaVersion: 1,
    id: "quiet-orbit",
    displayName: "Quiet Orbit",
    eyebrow: "A CALM ORBITAL WORKSPACE",
    summary: "A dark, low-detail workspace with a quiet blue horizon.",
    appearance: "dark",
    cssFile: "theme.css",
    heroFile: "hero.png",
    previewFile: "preview.png",
  });
  assert.deepEqual(await readFile(path.join(output, "hero.png")), PNG_1X1);
  assert.deepEqual(await readFile(path.join(output, "preview.png")), PNG_1X1);

  const css = await readFile(path.join(output, "theme.css"), "utf8");
  assert.match(css, /^html\[data-codex-skin="quiet-orbit"\]/);
  assert.equal(css.split("__CODEX_SKIN_HERO_IMAGE__").length - 1, 1);

  const validated = spawnSync(
    process.execPath,
    [cli, "themes", "validate", output, "--json"],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.equal(validated.status, 0, validated.stderr || validated.stdout);
  assert.equal(JSON.parse(validated.stdout).id, "quiet-orbit");
});
