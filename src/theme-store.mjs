import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const THEME_SCHEMA_VERSION = 1;
export const DEFAULT_THEME_ID = "makima";
export const MAX_THEME_CSS_BYTES = 1024 * 1024;
export const MAX_THEME_IMAGE_BYTES = 20 * 1024 * 1024;

const THEME_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MODULE_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_BUILT_IN_ROOT = path.join(MODULE_ROOT, "theme-packs");
const REQUIRED_TEXT_FIELDS = ["displayName", "eyebrow", "summary"];

export function defaultUserThemesRoot(environment = process.env) {
  const studioHome = environment.CODEX_SKIN_STUDIO_HOME || path.join(
    environment.HOME || os.homedir(),
    "Library",
    "Application Support",
    "Codex Skin Studio",
  );
  return path.join(studioHome, "Themes");
}

export function deriveThemeRuntimeFields(id) {
  assertThemeId(id);
  return {
    styleId: `codex-skin-${id}`,
    stateKey: `__CODEX_SKIN_${id.replaceAll("-", "_").toUpperCase()}_STATE__`,
    cssVariablePrefix: `--cs-${id}-`,
    runtimeDirectory: `Codex Skin Studio/Runtime/${id}`,
    snapshotFile: `${id}-runtime.png`,
  };
}

export async function validateThemePack(themeDirectory, { source = "user" } = {}) {
  const packPath = path.resolve(String(themeDirectory));
  const packStat = await lstat(packPath).catch((error) => {
    if (error.code === "ENOENT") throw new Error(`主题包不存在：${packPath}`);
    throw error;
  });
  if (packStat.isSymbolicLink()) throw new Error(`主题包不能是符号链接：${packPath}`);
  if (!packStat.isDirectory()) throw new Error(`主题包必须是目录：${packPath}`);

  const manifestPath = path.join(packPath, "theme.json");
  await assertRegularFileInsidePack(packPath, manifestPath, "theme.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`无法读取主题 theme.json：${error.message}`);
  }
  if (manifest.schemaVersion !== THEME_SCHEMA_VERSION) {
    throw new Error(
      `不支持的主题 schemaVersion：${manifest.schemaVersion ?? "缺失"}；期望 ${THEME_SCHEMA_VERSION}`,
    );
  }
  assertThemeId(manifest.id);
  for (const field of REQUIRED_TEXT_FIELDS) {
    if (typeof manifest[field] !== "string" || manifest[field].trim().length === 0) {
      throw new Error(`主题字段 ${field} 必须是非空字符串`);
    }
  }
  if (!['light', 'dark'].includes(manifest.appearance)) {
    throw new Error("主题字段 appearance 必须是 light 或 dark");
  }

  const cssFile = assertResourceName(manifest.cssFile, "cssFile");
  const heroFile = assertResourceName(manifest.heroFile, "heroFile");
  const previewFile = assertResourceName(manifest.previewFile, "previewFile");
  const cssPath = path.join(packPath, cssFile);
  const heroPath = path.join(packPath, heroFile);
  const previewPath = path.join(packPath, previewFile);
  await assertRegularFileInsidePack(packPath, cssPath, cssFile);
  await assertRegularFileInsidePack(packPath, heroPath, heroFile);
  await assertRegularFileInsidePack(packPath, previewPath, previewFile);
  await assertMaximumSize(cssPath, MAX_THEME_CSS_BYTES, "主题 CSS");
  await assertMaximumSize(heroPath, MAX_THEME_IMAGE_BYTES, "主题背景");
  await assertMaximumSize(previewPath, MAX_THEME_IMAGE_BYTES, "主题预览");
  await assertSupportedImage(heroPath, "主题背景");
  await assertSupportedImage(previewPath, "主题预览");

  const css = await readFile(cssPath, "utf8");
  const placeholderCount = css.split("__CODEX_SKIN_HERO_IMAGE__").length - 1;
  if (placeholderCount !== 1) {
    throw new Error("主题 CSS 必须且只能包含一个 __CODEX_SKIN_HERO_IMAGE__ 占位符");
  }

  return Object.freeze({
    schemaVersion: manifest.schemaVersion,
    id: manifest.id,
    displayName: manifest.displayName.trim(),
    eyebrow: manifest.eyebrow.trim(),
    summary: manifest.summary.trim(),
    appearance: manifest.appearance,
    cssFile,
    heroFile,
    previewFile,
    cssPath,
    heroPath,
    previewPath,
    packPath,
    installedPath: packPath,
    source,
    ...deriveThemeRuntimeFields(manifest.id),
  });
}

export class ThemeStore {
  constructor({
    builtInRoot = DEFAULT_BUILT_IN_ROOT,
    userRoot,
    environment = process.env,
  } = {}) {
    this.builtInRoot = path.resolve(builtInRoot);
    this.userRoot = path.resolve(userRoot || defaultUserThemesRoot(environment));
  }

  async list() {
    const [builtIns, users] = await Promise.all([
      this.#readRoot(this.builtInRoot, "builtin"),
      this.#readRoot(this.userRoot, "user"),
    ]);
    const seen = new Map();
    for (const theme of [...builtIns, ...users]) {
      if (seen.has(theme.id)) {
        throw new Error(
          `重复主题 ID：${theme.id}（${seen.get(theme.id).packPath} 与 ${theme.packPath}）`,
        );
      }
      seen.set(theme.id, theme);
    }
    const builtInOrder = new Map([[DEFAULT_THEME_ID, 0], ["faye", 1]]);
    return [...builtIns].sort((left, right) =>
      (builtInOrder.get(left.id) ?? 100) - (builtInOrder.get(right.id) ?? 100)
      || left.id.localeCompare(right.id),
    ).concat([...users].sort((left, right) => left.id.localeCompare(right.id)));
  }

  async resolve(id = DEFAULT_THEME_ID) {
    const normalizedId = String(id ?? DEFAULT_THEME_ID).toLowerCase();
    assertThemeId(normalizedId);
    const theme = (await this.list()).find((candidate) => candidate.id === normalizedId);
    if (!theme) {
      const available = (await this.list()).map(({ id: themeId }) => themeId).join(", ");
      throw new Error(`未知主题：${id}；可用主题：${available || "无"}`);
    }
    return theme;
  }

  async install(sourceDirectory, { replace = false, isRunning = async () => false } = {}) {
    const sourceTheme = await validateThemePack(sourceDirectory, { source: "user" });
    const builtIn = (await this.#readRoot(this.builtInRoot, "builtin"))
      .find(({ id }) => id === sourceTheme.id);
    if (builtIn) throw new Error(`不能覆盖内置主题：${sourceTheme.id}`);
    if (await isRunning(sourceTheme.id)) {
      throw new Error(`主题 ${sourceTheme.id} 正在运行，不能安装或替换`);
    }

    await mkdir(this.userRoot, { recursive: true, mode: 0o700 });
    const target = path.join(this.userRoot, sourceTheme.id);
    const existing = await lstat(target).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (existing && !replace) throw new Error(`主题 ${sourceTheme.id} 已经安装；使用 --replace 替换`);
    if (existing?.isSymbolicLink() || (existing && !existing.isDirectory())) {
      throw new Error(`拒绝替换非主题目录：${target}`);
    }

    const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const temporary = path.join(this.userRoot, `.${sourceTheme.id}.install-${nonce}`);
    const backup = path.join(this.userRoot, `.${sourceTheme.id}.backup-${nonce}`);
    let backupCreated = false;
    try {
      await mkdir(temporary, { mode: 0o700 });
      await Promise.all([
        copyFile(path.join(sourceTheme.packPath, "theme.json"), path.join(temporary, "theme.json")),
        copyFile(sourceTheme.cssPath, path.join(temporary, sourceTheme.cssFile)),
        copyFile(sourceTheme.heroPath, path.join(temporary, sourceTheme.heroFile)),
        sourceTheme.previewPath === sourceTheme.heroPath
          ? Promise.resolve()
          : copyFile(sourceTheme.previewPath, path.join(temporary, sourceTheme.previewFile)),
      ]);
      if (sourceTheme.previewPath === sourceTheme.heroPath
          && sourceTheme.previewFile !== sourceTheme.heroFile) {
        await copyFile(sourceTheme.heroPath, path.join(temporary, sourceTheme.previewFile));
      }
      await validateThemePack(temporary, { source: "user" });
      if (existing) {
        await rename(target, backup);
        backupCreated = true;
      }
      await rename(temporary, target);
      if (backupCreated) await rm(backup, { recursive: true });
      return validateThemePack(target, { source: "user" });
    } catch (error) {
      await rm(temporary, { recursive: true, force: true }).catch(() => {});
      if (backupCreated) {
        const targetAfterFailure = await lstat(target).catch(() => null);
        if (targetAfterFailure) await rm(target, { recursive: true, force: true });
        await rename(backup, target).catch((restoreError) => {
          error.message += `；恢复旧主题失败：${restoreError.message}`;
        });
      }
      throw error;
    }
  }

  async remove(id, { isRunning = async () => false } = {}) {
    const normalizedId = String(id).toLowerCase();
    assertThemeId(normalizedId);
    if ((await this.#readRoot(this.builtInRoot, "builtin")).some((theme) => theme.id === normalizedId)) {
      throw new Error(`不能删除内置主题：${normalizedId}`);
    }
    if (await isRunning(normalizedId)) throw new Error(`主题 ${normalizedId} 正在运行，不能删除`);
    const target = path.join(this.userRoot, normalizedId);
    const existing = await lstat(target).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!existing) return false;
    if (existing.isSymbolicLink() || !existing.isDirectory()) {
      throw new Error(`拒绝删除非主题目录：${target}`);
    }
    const validated = await validateThemePack(target, { source: "user" });
    if (validated.id !== normalizedId || validated.packPath !== target) {
      throw new Error(`主题目录与 ID 不匹配：${target}`);
    }
    await rm(target, { recursive: true });
    return true;
  }

  async #readRoot(root, source) {
    const entries = await readdir(root, { withFileTypes: true }).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    const themes = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isSymbolicLink()) throw new Error(`主题目录不能是符号链接：${path.join(root, entry.name)}`);
      if (!entry.isDirectory()) continue;
      themes.push(await validateThemePack(path.join(root, entry.name), { source }));
    }
    return themes;
  }
}

function assertThemeId(id) {
  if (typeof id !== "string" || id.length < 3 || id.length > 48 || !THEME_ID_PATTERN.test(id)) {
    throw new Error(`主题 ID 无效：${id}`);
  }
}

function assertResourceName(value, field) {
  if (typeof value !== "string"
      || value.length === 0
      || value !== path.basename(value)
      || value === "."
      || value === ".."
      || path.isAbsolute(value)) {
    throw new Error(`主题资源路径 ${field} 无效：${value}`);
  }
  return value;
}

async function assertRegularFileInsidePack(packPath, filePath, label) {
  const fileStat = await lstat(filePath).catch((error) => {
    if (error.code === "ENOENT") throw new Error(`主题资源不存在：${label}`);
    throw error;
  });
  if (fileStat.isSymbolicLink()) throw new Error(`主题资源不能是符号链接：${label}`);
  if (!fileStat.isFile()) throw new Error(`主题资源必须是普通文件：${label}`);
  const [realPack, realFile] = await Promise.all([realpath(packPath), realpath(filePath)]);
  if (path.dirname(realFile) !== realPack) throw new Error(`主题资源路径逃逸：${label}`);
}

async function assertMaximumSize(filePath, maximum, label) {
  const size = (await stat(filePath)).size;
  if (size > maximum) throw new Error(`${label} 超过大小限制：${size} > ${maximum}`);
}

async function assertSupportedImage(filePath, label) {
  const bytes = (await readFile(filePath)).subarray(0, 16);
  const isPng = bytes.length >= 8
    && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const isWebp = bytes.toString("ascii", 0, 4) === "RIFF"
    && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!isPng && !isJpeg && !isWebp) {
    throw new Error(`${label} 必须是 PNG、JPEG 或 WebP`);
  }
}
