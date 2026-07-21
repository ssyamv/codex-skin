#!/usr/bin/env node

import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const REQUIRED_TEXT_FIELDS = ["displayName", "eyebrow", "summary"];
const REQUIRED_COLORS = ["surface", "text", "muted", "accent", "border", "code"];
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

function fail(message) {
  console.error(`create-theme-pack: ${message}`);
  process.exitCode = 1;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!["--config", "--hero", "--output"].includes(option)) {
      throw new Error(`unknown option: ${option}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
    options[option.slice(2)] = value;
    index += 1;
  }
  for (const required of ["config", "hero", "output"]) {
    if (!options[required]) throw new Error(`--${required} is required`);
  }
  return options;
}

function requireText(config, field) {
  if (typeof config[field] !== "string" || !config[field].trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return config[field].trim();
}

function validateColor(value, name) {
  if (typeof value !== "string") throw new Error(`colors.${name} must be a CSS color`);
  const color = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  const match = color.match(/^(rgb|rgba)\(\s*([^)]*)\s*\)$/i);
  if (!match) throw new Error(`colors.${name} must use #RRGGBB, rgb(), or rgba()`);

  const functionName = match[1].toLowerCase();
  let channels;
  let alpha;
  if (match[2].includes(",")) {
    const components = match[2].split(",").map((part) => part.trim());
    const expected = functionName === "rgba" ? 4 : 3;
    if (components.length !== expected) throw new Error(`colors.${name} has invalid channels`);
    channels = components.slice(0, 3);
    alpha = components[3];
  } else {
    const [channelText, alphaText, extra] = match[2].split("/").map((part) => part.trim());
    if (extra !== undefined) throw new Error(`colors.${name} has invalid alpha syntax`);
    channels = channelText.split(/\s+/);
    alpha = alphaText;
    if (functionName === "rgba" && alpha === undefined) {
      throw new Error(`colors.${name} requires an alpha channel`);
    }
  }
  if (channels.length !== 3 || channels.some((channel) => {
    if (!/^\d+(?:\.\d+)?$/.test(channel)) return true;
    const number = Number(channel);
    return number < 0 || number > 255;
  })) throw new Error(`colors.${name} RGB channels must be between 0 and 255`);
  if (alpha !== undefined) {
    if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(alpha) || Number(alpha) > 1) {
      throw new Error(`colors.${name} alpha must be between 0 and 1`);
    }
  } else if (functionName === "rgba") {
    throw new Error(`colors.${name} requires an alpha channel`);
  }
  return color;
}

function detectImage(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  )) return { extension: "png", mime: "image/png" };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: "jpg", mime: "image/jpeg" };
  }
  if (bytes.length >= 12
      && bytes.subarray(0, 4).toString("ascii") === "RIFF"
      && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return { extension: "webp", mime: "image/webp" };
  }
  throw new Error("hero bytes must identify PNG, JPEG, or WebP");
}

function createCss(config, colors) {
  const prefix = `--cs-${config.id}-`;
  return `html[data-codex-skin="${config.id}"] {
  color-scheme: ${config.appearance} !important;
  ${prefix}surface: ${colors.surface};
  ${prefix}text: ${colors.text};
  ${prefix}muted: ${colors.muted};
  ${prefix}accent: ${colors.accent};
  ${prefix}border: ${colors.border};
  ${prefix}code: ${colors.code};
  ${prefix}hero: url("__CODEX_SKIN_HERO_IMAGE__");

  --codex-base-accent: var(${prefix}accent) !important;
  --codex-base-ink: var(${prefix}text) !important;
  --codex-base-surface: var(${prefix}surface) !important;
  --color-background-surface: var(${prefix}surface) !important;
  --color-background-panel: var(${prefix}surface) !important;
  --color-background-editor-opaque: var(${prefix}code) !important;
  --color-background-control: var(${prefix}code) !important;
  --color-text-foreground: var(${prefix}text) !important;
  --color-text-foreground-secondary: var(${prefix}muted) !important;
  --color-text-accent: var(${prefix}accent) !important;
  --color-border: var(${prefix}border) !important;
  --color-border-focus: var(${prefix}accent) !important;
  --color-token-side-bar-background: var(${prefix}surface) !important;
  --color-token-editor-background: var(${prefix}code) !important;
  --color-token-editor-foreground: var(${prefix}text) !important;
  --color-token-link: var(${prefix}accent) !important;

  color: var(${prefix}text) !important;
  background-color: var(${prefix}surface) !important;
  background-image: linear-gradient(var(${prefix}surface), transparent), var(${prefix}hero) !important;
}
`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const configPath = path.resolve(options.config);
  const heroPath = path.resolve(options.hero);
  const outputPath = path.resolve(options.output);
  const config = JSON.parse(await readFile(configPath, "utf8"));

  if (typeof config.id !== "string"
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.id)
      || config.id.length < 3
      || config.id.length > 48) {
    throw new Error("id must be 3-48 lowercase kebab-case characters");
  }
  for (const field of REQUIRED_TEXT_FIELDS) requireText(config, field);
  if (!["light", "dark"].includes(config.appearance)) {
    throw new Error("appearance must be light or dark");
  }
  if (!config.colors || typeof config.colors !== "object" || Array.isArray(config.colors)) {
    throw new Error("colors must be an object");
  }
  const colors = Object.fromEntries(
    REQUIRED_COLORS.map((name) => [name, validateColor(config.colors[name], name)]),
  );

  const heroStat = await stat(heroPath);
  if (!heroStat.isFile() || heroStat.size > MAX_IMAGE_BYTES) {
    throw new Error("hero must be a regular file no larger than 20 MiB");
  }
  const imageBytes = await readFile(heroPath);
  const image = detectImage(imageBytes);
  await mkdir(outputPath, { mode: 0o700 });

  const heroFile = `hero.${image.extension}`;
  const previewFile = `preview.${image.extension}`;
  const manifest = {
    schemaVersion: 1,
    id: config.id,
    displayName: requireText(config, "displayName"),
    eyebrow: requireText(config, "eyebrow"),
    summary: requireText(config, "summary"),
    appearance: config.appearance,
    cssFile: "theme.css",
    heroFile,
    previewFile,
  };
  await Promise.all([
    writeFile(path.join(outputPath, "theme.json"), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(path.join(outputPath, "theme.css"), createCss(config, colors)),
    copyFile(heroPath, path.join(outputPath, heroFile)),
    copyFile(heroPath, path.join(outputPath, previewFile)),
  ]);
  console.log(JSON.stringify({ outputPath, manifest, imageMime: image.mime }, null, 2));
}

main().catch((error) => fail(error.message));
