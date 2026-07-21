#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { CdpClient, fetchCdpJson, listCdpTargets } from "../src/cdp.mjs";
import {
  ThemeMonitor,
  inspectImpactOnPort,
  inspectThemeOnPort,
  loadThemeCss,
  removeThemeFromPort,
  validateSkinCss,
} from "../src/injector.mjs";
import {
  classifyCodexAppProcesses,
  cleanRuntimeArtifacts,
  ensureRuntimeHome,
  ensureSkinCodex,
  findThemeDaemonProcesses,
  fingerprintApp,
  getRuntimePaths,
  isProcessAlive,
  readState,
  removeState,
  resolveCodexApp,
  terminateProcessesGracefully,
  terminateSkinCodexInstance,
  verifyCodeSignature,
  writeState,
} from "../src/runtime.mjs";
import { validateThemePack } from "../src/theme-store.mjs";
import { createThemeStore } from "../src/themes.mjs";

const entrypoint = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const { command, options, positionals } = parseArguments(process.argv.slice(2));
const themeStore = createThemeStore({ environment: process.env });
let theme;
let themePath;
let heroImagePath;
let paths;

try {
  assertSupportedNode();
  if (command === "themes") {
    await themesCommand(positionals[0] || "list", positionals.slice(1));
  } else {
    theme = await themeStore.resolve(options.theme);
    themePath = theme.cssPath;
    heroImagePath = theme.heroPath;
    paths = getRuntimePaths(process.env, {
      runtimeDirectory: theme.runtimeDirectory,
    });
    if (command === "start") await startCommand();
  else if (command === "stop") await stopCommand();
  else if (command === "status") await statusCommand();
  else if (command === "doctor") await doctorCommand();
  else if (command === "verify") await verifyCommand();
  else if (command === "snapshot") await snapshotCommand();
  else if (command === "uninstall") await uninstallCommand();
  else if (command === "daemon") await daemonCommand();
  else if (["help", "--help", "-h"].includes(command)) printHelp();
  else throw new Error(`未知命令：${command}`);
  }
} catch (error) {
  console.error(`错误：${error.message}`);
  process.exitCode = error.exitCode || 1;
}

// Node's built-in WebSocket can retain a closing CDP handle after the daemon has
// fully removed its script/style and written its final state. The daemon is a
// dedicated subprocess, so exiting here prevents a harmless stale handle from
// making `stop` time out after cleanup has already completed.
if (command === "daemon") {
  process.exit(process.exitCode || 0);
}

async function startCommand() {
  const live = await getLiveState();
  if (live) {
    if (!live.port) {
      throw new Error(
        `检测到主题守护进程 ${live.daemonPid}，但无法确认其调试端口属于专用 profile；请先执行 stop 恢复。`,
      );
    }
    const targets = await inspectThemeOnPort(live.port, theme).catch(() => []);
    if (
      targets.length === 0 ||
      targets.some(({ health }) => !health.applied || health.styleCount !== 1)
    ) {
      throw new Error(
        `检测到主题守护进程 ${live.daemonPid}，但页面主题状态异常；请先执行 status 或 stop 恢复。`,
      );
    }
    console.log(
      `${theme.displayName} 主题已在运行：守护进程 ${live.daemonPid}，CDP ${live.port}`,
    );
    return;
  }

  const app = await resolveCodexApp(options.appPath);
  await verifyCodeSignature(app.appPath);
  const requestedProfileDir = await assertSafeSkinProfileDir(
    options.profile || paths.profileDir,
  );
  const classification = await classifyCodexAppProcesses(
    app,
    requestedProfileDir,
    { codexHome: desiredCodexHome() },
  );
  if (classification.otherSharedCodexHomeProcesses.length > 0) {
    const pids = classification.otherSharedCodexHomeProcesses
      .map(({ pid }) => pid)
      .join(", ");
    throw new Error(
      `检测到仍在使用同一 ~/.codex 的普通 Codex 主进程（PID ${pids}）。` +
      `请先正常退出这些 Codex，再启动 ${theme.displayName} 主题；本工具不会终止它们。`,
    );
  }
  const fingerprint = await fingerprintApp(app);
  let port;
  let appPid;
  let profileDir = requestedProfileDir;
  let reused = false;
  let instance = null;
  const runtimePaths = { ...paths, profileDir };
  instance = await ensureSkinCodex(app, runtimePaths, (message) =>
    console.log(message),
  );
  port = instance.port;
  appPid = instance.appPid;
  profileDir = instance.profileDir;
  reused = instance.reused;
  try {
    const targets = await waitForCodexTargets(port, 30000);
    if (targets.length === 0) {
      throw new Error("Codex 已连接，但没有发现有效主页面");
    }
    await launchDaemon({
      port,
      appPid,
      appPath: app.appPath,
      fingerprint,
      profileDir,
    });
  } catch (error) {
    const startupError = error instanceof Error ? error : new Error(String(error));
    if (instance?.ownedByCaller) {
      try {
        await terminateSkinCodexInstance(instance);
      } catch (cleanupError) {
        startupError.message += `；回收本次新建的 ${theme.displayName} Codex 时失败：${cleanupError.message}`;
      }
    }
    throw startupError;
  }
  console.log(
    reused
      ? `已连接现有的 ${theme.displayName} 皮肤实例。`
      : `已启动独立的 ${theme.displayName} 皮肤实例；原 Codex 实例和官方应用文件均未改动。`,
  );
}

async function launchDaemon({ port, appPid, appPath, fingerprint, profileDir }) {
  profileDir = await assertSafeSkinProfileDir(profileDir);
  await ensureRuntimeHome(paths);
  const existingDaemons = await findMatchingThemeDaemons(profileDir);
  if (existingDaemons.length > 0) {
    throw new Error(
      `该 ${theme.displayName} profile 已有主题守护进程：PID ${existingDaemons.map(({ pid }) => pid).join(", ")}`,
    );
  }
  await removeState(paths);
  const logHandle = await fs.open(paths.logFile, "a", 0o600);
  let child;
  try {
    child = spawn(
      process.execPath,
      [
        entrypoint,
        "daemon",
        "--theme",
        theme.id,
        "--port",
        String(port),
        ...(appPid ? ["--app-pid", String(appPid)] : []),
        "--app-path",
        appPath,
        "--fingerprint",
        Buffer.from(JSON.stringify(fingerprint), "utf8").toString("base64url"),
        "--profile",
        profileDir,
      ],
      {
        cwd: os.homedir(),
        detached: true,
        env: process.env,
        stdio: ["ignore", logHandle.fd, logHandle.fd],
      },
    );
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    child.unref();
  } finally {
    await logHandle.close();
  }

  try {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const state = await readState(paths);
      const daemons = await findMatchingThemeDaemons(profileDir, child.pid);
      if (
        state?.daemonPid === child.pid &&
        daemons.some(({ pid }) => pid === child.pid)
      ) {
        return;
      }
      if (!isProcessAlive(child.pid)) {
        throw new Error(`主题守护进程启动失败，请查看 ${paths.logFile}`);
      }
      await delay(100);
    }
    throw new Error(`等待主题守护进程就绪超时，请查看 ${paths.logFile}`);
  } catch (error) {
    const daemons = await findMatchingThemeDaemons(profileDir, child?.pid);
    if (child?.pid && daemons.some(({ pid }) => pid === child.pid)) {
      process.kill(child.pid, "SIGTERM");
      await waitForProcessesToExit([child.pid], 5000).catch(() => {});
    }
    await removeState(paths, child.pid);
    throw error;
  }
}

async function daemonCommand() {
  const port = requirePort(options.port);
  const profileDir = await assertSafeSkinProfileDir(
    options.profile || paths.profileDir,
  );
  const css = await loadThemeCss(themePath, {
    heroImagePath,
    theme,
  });
  const app = await resolveCodexApp(options.appPath);
  const fingerprint = options.fingerprint
    ? JSON.parse(Buffer.from(options.fingerprint, "base64url").toString("utf8"))
    : await fingerprintApp(app);
  const signature = await verifyCodeSignature(app.appPath);
  let latestReport = null;
  let resolveStop;
  const stopPromise = new Promise((resolve) => {
    resolveStop = resolve;
  });
  const stop = () => resolveStop();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  const monitor = new ThemeMonitor({
    port,
    css,
    theme,
    onReport: (report) => {
      latestReport = report;
    },
  });

  try {
    await monitor.start();
    await writeState(paths, {
      schemaVersion: 1,
      theme: theme.id,
      daemonPid: process.pid,
      appPid: options.appPid ? Number(options.appPid) : null,
      port,
      appPath: app.appPath,
      appVersion: app.version,
      appBuild: app.build,
      profileDir,
      appFingerprint: fingerprint,
      signature,
      startedAt: new Date().toISOString(),
      report: latestReport,
    });
    await appendLog(
      `守护进程启动，PID ${process.pid}，CDP ${port}，target ${latestReport?.targetCount ?? 0}`,
    );
    const appWatch = options.appPid ? setInterval(() => {
      if (!isProcessAlive(Number(options.appPid))) resolveStop();
    }, 2000) : null;
    await stopPromise;
    if (appWatch) clearInterval(appWatch);
  } finally {
    let cleanupError = null;
    try {
      await monitor.stop();
    } catch (error) {
      cleanupError = error;
      await appendLog(`主题清理不完整：${error.message}`);
    }
    if (!cleanupError) {
      await removeState(paths, process.pid);
      await appendLog("主题已清除，守护进程退出");
    }
    if (cleanupError) throw cleanupError;
  }
}

async function stopCommand() {
  const state = await readState(paths);
  const profileDir = await resolveStopProfileDir(state);
  const app = await resolveCodexApp(options.appPath || state?.appPath);
  const classification = await classifyCodexAppProcesses(app, profileDir);
  const profileProcesses = classification.profileProcesses.filter(
    ({ pid }) => isProcessAlive(pid),
  );
  const profilePids = profileProcesses.map(({ pid }) => pid);
  const daemons = await findMatchingThemeDaemons(profileDir, state?.daemonPid);

  if (!state && daemons.length === 0 && profilePids.length === 0) {
    console.log(`${theme.displayName} 主题当前未运行，也没有发现对应 Codex 实例。`);
    return;
  }

  await stopThemeDaemons(daemons);

  const endpoints = await discoverTrustedProfileEndpoints({
    profileDir,
    profileProcesses,
  });
  const ports = endpoints.map(({ port }) => port);
  await Promise.allSettled(
    ports.map((port) => removeThemeFromPort(port, theme)),
  );

  let browserCloseFailed = ports.length === 0 && profilePids.length > 0;
  for (const endpoint of endpoints) {
    try {
      await closeBrowserOnEndpoint(endpoint);
    } catch {
      browserCloseFailed = true;
    }
  }

  for (const port of ports) {
    if (!(await waitForDebugPortToDisappear(port, 8000))) {
      browserCloseFailed = true;
    }
  }
  if (profilePids.some(isProcessAlive)) browserCloseFailed = true;

  if (browserCloseFailed && profilePids.length > 0) {
    await terminateProcessesGracefully(profilePids);
  }

  const liveProfilePids = profilePids.filter(isProcessAlive);
  if (liveProfilePids.length > 0) {
    throw new Error(
      `${theme.displayName} Codex 主进程未退出：${liveProfilePids.join(", ")}；未删除状态，便于重试。`,
    );
  }
  const remainingPorts = [];
  for (const port of ports) {
    if (!(await waitForDebugPortToDisappear(port, 5000))) remainingPorts.push(port);
  }
  if (remainingPorts.length > 0) {
    throw new Error(
      `${theme.displayName} Codex 调试端口仍可访问：${remainingPorts.join(", ")}；未删除状态，便于重试。`,
    );
  }

  await removeState(paths);
  console.log(`${theme.displayName} 主题已移除，对应 Codex 已关闭；普通 Codex 未被终止或修改。`);
}

async function statusCommand() {
  const savedState = await readState(paths);
  const profileDir = await assertSafeSkinProfileDir(
    savedState?.profileDir || paths.profileDir,
  );
  const daemons = await findMatchingThemeDaemons(
    profileDir,
    savedState?.daemonPid,
  );
  let profileProcesses = [];
  try {
    const app = await resolveCodexApp(options.appPath || savedState?.appPath);
    profileProcesses = (
      await classifyCodexAppProcesses(app, profileDir)
    ).profileProcesses.filter(({ pid }) => isProcessAlive(pid));
  } catch {
    // State/daemon diagnostics remain useful even when the app cannot be resolved.
  }
  if (!savedState && daemons.length === 0 && profileProcesses.length === 0) {
    printResult({
      status: "stopped",
      theme: theme.id,
      themeName: theme.displayName,
    });
    return;
  }
  const daemon = selectDaemon(daemons, savedState?.daemonPid);
  const state = savedState || {
    daemonPid: daemon?.pid || null,
    appPid: daemon?.appPid || profileProcesses[0]?.pid || null,
    port: daemon?.port || null,
    profileDir,
  };
  const reasons = [];
  if (!savedState) reasons.push("运行状态文件缺失");
  if (!daemon) reasons.push("主题守护进程未运行");
  else if (savedState && daemon.pid !== savedState.daemonPid) {
    reasons.push(`已从 profile 恢复守护进程 PID ${daemon.pid}`);
  }
  const trustedEndpoints = await discoverTrustedProfileEndpoints({
    profileDir,
    profileProcesses,
  });
  const port = trustedEndpoints[0]?.port || null;
  let browser = null;
  let targets = [];
  if (!port) {
    reasons.push("缺少与专用 profile 匹配的可信 CDP 端口");
  } else {
    try {
      browser = await fetchCdpJson(port, "/json/version", { timeoutMs: 5000 });
      targets = await inspectThemeOnPort(port, theme);
      if (targets.length === 0) reasons.push("没有 Codex 页面 target");
      else if (targets.some(({ health }) => !health.applied || health.styleCount !== 1)) {
        reasons.push("部分页面的主题未正确应用");
      }
    } catch (error) {
      reasons.push(`CDP 不可用：${error.message}`);
    }
  }
  printResult({
    status: reasons.length === 0 ? "running" : "degraded",
    theme: theme.id,
    themeName: theme.displayName,
    reasons,
    daemonPid: daemon?.pid || state.daemonPid,
    appPid: state.appPid,
    port,
    profileDir,
    appVersion: state.appVersion,
    browser: browser?.Browser || null,
    targets,
  });
}

async function doctorCommand() {
  const result = await collectDoctor();
  printResult(result, () => {
    console.log(`主题：${result.theme.name} (${result.theme.id})`);
    console.log(`Node：${result.node}`);
    console.log(`Codex：${result.app.version} (${result.app.build})`);
    console.log(`Bundle：${result.app.appPath}`);
    console.log(`签名：有效（${result.signature.teamIdentifier || "Team ID 未报告"}）`);
    console.log(`app.asar SHA-256：${result.fingerprint.appAsarSha256}`);
    console.log(`主题 CSS：${result.theme.cssBytes} bytes`);
    console.log(`静态主视觉：${result.theme.heroArtBytes} bytes`);
    console.log(`编译后 CSS：${result.theme.compiledCssBytes} bytes`);
    console.log("主题安全规则：通过");
  });
}

async function verifyCommand() {
  const doctor = await collectDoctor();
  const savedState = await readState(paths);
  const liveState = await getLiveState();
  const checks = {
    signature: doctor.signature.valid,
    themeSafety: doctor.theme.safe,
    appBundleUnchanged: Boolean(
      savedState &&
      savedState.appFingerprint?.executableSha256 ===
        doctor.fingerprint.executableSha256 &&
        savedState.appFingerprint?.appAsarSha256 === doctor.fingerprint.appAsarSha256,
    ),
    runtime: false,
    oneStylePerPage: false,
    typographyPreserved: false,
    interactiveNodesPreserved: false,
    interactiveStylesAndAttributesPreserved: false,
    layoutAndScrollPreserved: false,
  };
  let targets = [];
  let impacts = [];
  let runtimeError = null;
  if (liveState?.port) {
    try {
      impacts = await inspectImpactOnPort(liveState.port, theme);
      targets = await inspectThemeOnPort(liveState.port, theme);
      const impactByTarget = new Map(
        impacts.map((item) => [item.targetId, item.impact]),
      );
      const sameTargetSet =
        targets.length > 0 &&
        targets.length === impacts.length &&
        targets.every(({ targetId }) => impactByTarget.has(targetId));
      checks.runtime =
        sameTargetSet &&
        targets.every(({ health }) => health.applied) &&
        impacts.every(({ impact }) =>
          impact.originalSkin === theme.id && impact.restoredSkin === theme.id);
      checks.oneStylePerPage =
        sameTargetSet && targets.every(({ health }) => health.styleCount === 1);
      checks.typographyPreserved =
        sameTargetSet && impacts.every(({ impact }) =>
          isDeepStrictEqual(impact.before.fontVariables, impact.after.fontVariables) &&
          isDeepStrictEqual(impact.before.typography, impact.after.typography));
      checks.interactiveNodesPreserved =
        sameTargetSet && impacts.every(({ impact }) =>
          isDeepStrictEqual(impact.before.interactive, impact.after.interactive) &&
          isDeepStrictEqual(impact.before.composer, impact.after.composer));
      checks.interactiveStylesAndAttributesPreserved =
        checks.interactiveNodesPreserved;
      checks.layoutAndScrollPreserved =
        sameTargetSet && impacts.every(({ impact }) =>
          isDeepStrictEqual(impact.before.layout, impact.after.layout) &&
          isDeepStrictEqual(impact.before.viewport, impact.after.viewport));
    } catch (error) {
      runtimeError = error.message;
    }
  }
  const result = {
    ok: Object.values(checks).every(Boolean),
    checks,
    targets,
    impacts,
    runtimeError,
  };
  printResult(result, () => {
    for (const [name, passed] of Object.entries(checks)) {
      console.log(`${passed ? "✓" : "✗"} ${name}`);
    }
  });
  if (!result.ok) process.exitCode = 1;
}

async function snapshotCommand() {
  const state = await getLiveState();
  if (!state) throw new Error("主题未运行，无法截图");
  const output = path.resolve(
    options.output || path.join(projectRoot, "artifacts", theme.snapshotFile),
  );
  const targets = await listCdpTargets(state.port);
  if (targets.length === 0) throw new Error("没有可截图的 Codex 页面");
  const client = await CdpClient.connect(targets[0].webSocketDebuggerUrl);
  try {
    await client.call("Page.enable");
    const capture = await client.call("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, Buffer.from(capture.data, "base64"));
  } finally {
    client.close();
  }
  console.log(output);
}

async function uninstallCommand() {
  await stopCommand();
  await cleanRuntimeArtifacts(paths);
  console.log("运行时状态与日志已清理；独立 profile 为避免误删登录数据而保留。");
}

async function themesCommand(action, args) {
  if (action === "list") {
    const themes = (await themeStore.list()).map(serializeTheme);
    if (options.json) console.log(JSON.stringify(themes, null, 2));
    else for (const item of themes) {
      console.log(`${item.id}\t${item.displayName}\t${item.source}`);
    }
    return;
  }

  if (action === "validate") {
    const directory = args[0];
    if (!directory) throw new Error("必须提供主题包目录");
    const candidate = await validateCandidateTheme(directory);
    printThemeOperation(candidate, `主题 ${candidate.id} 校验通过`);
    return;
  }

  if (action === "install") {
    const directory = args[0];
    if (!directory) throw new Error("必须提供主题包目录");
    await validateCandidateTheme(directory);
    const installed = await themeStore.install(directory, {
      replace: options.replace === true,
      isRunning: isInstalledThemeRunning,
    });
    printThemeOperation(installed, `已安装主题 ${installed.displayName} (${installed.id})`);
    return;
  }

  if (action === "remove") {
    const id = args[0];
    if (!id) throw new Error("必须提供主题 ID");
    const removed = await themeStore.remove(id, { isRunning: isInstalledThemeRunning });
    const result = { id: String(id).toLowerCase(), removed };
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(removed ? `已删除主题 ${result.id}` : `主题 ${result.id} 未安装`);
    return;
  }

  throw new Error(`未知 themes 子命令：${action}`);
}

async function validateCandidateTheme(directory) {
  const candidate = await validateThemePack(path.resolve(directory), { source: "candidate" });
  const css = await fs.readFile(candidate.cssPath, "utf8");
  validateSkinCss(css, { theme: candidate });
  return candidate;
}

async function isInstalledThemeRunning(id) {
  let candidate;
  try {
    candidate = await themeStore.resolve(id);
  } catch {
    return false;
  }
  const candidatePaths = getRuntimePaths(process.env, {
    runtimeDirectory: candidate.runtimeDirectory,
  });
  const state = await readState(candidatePaths);
  return Boolean(state?.daemonPid && isProcessAlive(state.daemonPid));
}

function serializeTheme(value) {
  return {
    schemaVersion: value.schemaVersion,
    id: value.id,
    displayName: value.displayName,
    eyebrow: value.eyebrow,
    summary: value.summary,
    appearance: value.appearance,
    source: value.source,
    previewPath: value.previewPath,
    installedPath: value.installedPath,
    styleId: value.styleId,
    runtimeDirectory: value.runtimeDirectory,
  };
}

function printThemeOperation(value, message) {
  if (options.json) console.log(JSON.stringify(serializeTheme(value), null, 2));
  else console.log(message);
}

async function collectDoctor() {
  const app = await resolveCodexApp();
  const signature = await verifyCodeSignature(app.appPath);
  const fingerprint = await fingerprintApp(app);
  const [css, heroArt, compiledCss] = await Promise.all([
    fs.readFile(themePath, "utf8"),
    fs.readFile(heroImagePath),
    loadThemeCss(themePath, { heroImagePath, theme }),
  ]);
  return {
    ok: true,
    node: process.version,
    app,
    signature,
    fingerprint,
    theme: {
      id: theme.id,
      name: theme.displayName,
      css: themePath,
      cssBytes: Buffer.byteLength(css),
      compiledCssBytes: Buffer.byteLength(compiledCss),
      heroArt: heroImagePath,
      heroArtBytes: heroArt.length,
      heroMode: "static",
      safe: true,
    },
  };
}

async function getLiveState() {
  const state = await readState(paths);
  const profileDir = await assertSafeSkinProfileDir(
    state?.profileDir || paths.profileDir,
  );
  const daemons = await findMatchingThemeDaemons(profileDir, state?.daemonPid);
  const daemon = selectDaemon(daemons, state?.daemonPid);
  if (!daemon) return null;
  let profileProcesses = [];
  try {
    const app = await resolveCodexApp(options.appPath || state?.appPath);
    profileProcesses = (
      await classifyCodexAppProcesses(app, profileDir)
    ).profileProcesses.filter(({ pid }) => isProcessAlive(pid));
  } catch {
    // A live daemon is still reported, but its port remains untrusted.
  }
  const endpoints = await discoverTrustedProfileEndpoints({
    profileDir,
    profileProcesses,
  });
  return {
    ...state,
    daemonPid: daemon.pid,
    appPid: state?.appPid || daemon.appPid || null,
    port: endpoints[0]?.port || null,
    profileDir,
    recovered: !state || daemon.pid !== state.daemonPid,
  };
}

async function appendLog(message) {
  await ensureRuntimeHome(paths);
  await fs.appendFile(
    paths.logFile,
    `${new Date().toISOString()} ${message}\n`,
    { mode: 0o600 },
  );
}

function printResult(result, humanPrinter = null) {
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else if (humanPrinter) humanPrinter();
  else if (result.status === "stopped") console.log("状态：未运行");
  else {
    console.log(
      result.status === "degraded"
        ? `状态：异常（${result.reasons.join("；")}）`
        : `状态：运行中（守护进程 ${result.daemonPid}）`,
    );
    console.log(
      `守护进程：${result.daemonPid || "未运行"}；Codex：PID ${result.appPid || "未知"}`,
    );
    if (result.themeName) {
      console.log(`主题：${result.themeName} (${result.theme})`);
    }
    console.log(
      `CDP：${result.port ? `127.0.0.1:${result.port}` : "未知"}，页面 ${result.targets.length}`,
    );
    if (result.browser) console.log(`Browser：${result.browser}`);
    console.log(`Profile：${result.profileDir || paths.profileDir}`);
    for (const target of result.targets) {
      console.log(
        `- ${target.targetId.slice(0, 8)}：主题 ${target.health.applied ? "已应用" : "未应用"}，样式节点 ${target.health.styleCount}`,
      );
    }
  }
}

function parseArguments(argv) {
  const [parsedCommand = "help", ...rest] = argv;
  const parsedOptions = {};
  const parsedPositionals = [];
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (!item.startsWith("--")) {
      parsedPositionals.push(item);
      continue;
    }
    const key = item
      .slice(2)
      .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) parsedOptions[key] = true;
    else {
      parsedOptions[key] = next;
      index += 1;
    }
  }
  return { command: parsedCommand, options: parsedOptions, positionals: parsedPositionals };
}

function requirePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("必须提供有效的 --port");
  }
  return port;
}

async function waitForCodexTargets(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const targets = await listCdpTargets(port, { timeoutMs: 2000 });
      if (targets.length > 0) return targets;
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(
    `等待 Codex 主页面超时${lastError ? `：${lastError.message}` : ""}`,
  );
}

function printHelp() {
  console.log(`Codex 外置运行时皮肤（默认：玛奇玛）

用法：
  ./codex-skin themes list [--json]
  ./codex-skin themes validate <主题包目录> [--json]
  ./codex-skin themes install <主题包目录> [--replace] [--json]
  ./codex-skin themes remove <主题 ID> [--json]
  ./codex-skin start [--theme <主题 ID>]
  ./codex-skin status [--theme <主题 ID>] [--json]
  ./codex-skin verify [--theme <主题 ID>] [--json]
  ./codex-skin doctor [--theme <主题 ID>] [--json]
  ./codex-skin snapshot [--theme <主题 ID>] [--output <png>]
  ./codex-skin stop [--theme <主题 ID>]
  ./codex-skin uninstall [--theme <主题 ID>]

start 前必须先正常退出所有普通 Codex；检测到共享 ~/.codex 的进程时会拒绝启动，绝不会代为终止。
每个主题使用独立 profile 启动官方 Codex；stop 只会移除所选主题并关闭对应 Codex，普通 Codex 和其他主题不受影响。
uninstall 清理本工具状态与日志并保留独立 profile；themes remove 才删除用户主题。
工具不会修改应用包、app.asar 或官方 Chromium profile，也不会直接编辑 ~/.codex。`);
}

function assertSupportedNode() {
  const major = Number(process.versions.node.split(".", 1)[0]);
  if (!Number.isInteger(major) || major < 22) {
    throw new Error(
      `需要 Node.js 22 或更高版本；当前为 ${process.version}。未执行任何操作。`,
    );
  }
}

async function canonicalPath(value) {
  const resolved = path.resolve(String(value));
  let cursor = resolved;
  const missingSegments = [];
  while (true) {
    try {
      const existingAncestor = await fs.realpath(cursor);
      return path.join(existingAncestor, ...missingSegments.reverse());
    } catch {
      const parent = path.dirname(cursor);
      if (parent === cursor) return resolved;
      missingSegments.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

async function assertSafeSkinProfileDir(profileDir) {
  if (typeof profileDir !== "string" || profileDir.trim() === "") {
    throw new Error(`${theme.displayName} profile 路径无效`);
  }
  const resolved = await canonicalPath(profileDir);
  const runtimeHome = await canonicalPath(paths.home);
  const filesystemRoot = await canonicalPath(path.parse(resolved).root);
  const userHome = await canonicalPath(os.homedir());
  const appSupport = await canonicalPath(
    path.join(os.homedir(), "Library", "Application Support"),
  );
  const officialProfile = await canonicalPath(path.join(appSupport, "Codex"));
  const defaultCodexHome = await canonicalPath(path.join(os.homedir(), ".codex"));
  const configuredCodexHome = await canonicalPath(desiredCodexHome());
  const codexDataHomes = [...new Set([defaultCodexHome, configuredCodexHome])];
  const insideRuntimeHome = isSameOrInside(resolved, runtimeHome) && resolved !== runtimeHome;
  const insideOfficialProfile = isSameOrInside(resolved, officialProfile);
  const runtimeOverlapsProtectedData = [officialProfile, ...codexDataHomes]
    .some((protectedPath) => pathsOverlap(runtimeHome, protectedPath));
  const profileOverlapsProtectedData = [officialProfile, ...codexDataHomes]
    .some((protectedPath) => pathsOverlap(resolved, protectedPath));
  const runtimeContainsBroadProtectedRoot = [appSupport, officialProfile, ...codexDataHomes]
    .some((protectedPath) => isSameOrInside(protectedPath, runtimeHome));
  const unsafeRuntimeHome =
    [filesystemRoot, userHome, appSupport, officialProfile].includes(runtimeHome) ||
    runtimeOverlapsProtectedData ||
    runtimeContainsBroadProtectedRoot ||
    containsAppBundleSegment(runtimeHome);

  if (
    unsafeRuntimeHome ||
    [filesystemRoot, userHome, appSupport, runtimeHome, officialProfile].includes(resolved) ||
    !insideRuntimeHome ||
    insideOfficialProfile ||
    profileOverlapsProtectedData ||
    containsAppBundleSegment(resolved)
  ) {
    throw new Error(
      `拒绝把宽泛目录或官方 Codex profile 当作 ${theme.displayName} profile；` +
      "皮肤运行目录和 profile 也不能位于应用包、~/.codex 或当前 CODEX_HOME 内，" +
      `且 profile 必须位于专用皮肤运行目录内：${resolved}`,
    );
  }
  return resolved;
}

function isSameOrInside(candidate, parent) {
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
}

function pathsOverlap(left, right) {
  return isSameOrInside(left, right) || isSameOrInside(right, left);
}

function containsAppBundleSegment(value) {
  return path.resolve(value).split(path.sep).some((segment) => /\.app$/i.test(segment));
}

function desiredCodexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

async function resolveStopProfileDir(state) {
  const candidate = state?.theme === theme.id && state.profileDir
    ? state.profileDir
    : paths.profileDir;
  return assertSafeSkinProfileDir(candidate);
}

async function findMatchingThemeDaemons(profileDir, preferredPid = null) {
  const matches = await findThemeDaemonProcesses(profileDir);
  const byPid = new Map(
    matches.filter(({ pid }) => isProcessAlive(pid)).map((item) => [item.pid, item]),
  );
  return [...byPid.values()];
}

function selectDaemon(daemons, preferredPid = null) {
  return daemons.find(({ pid }) => pid === Number(preferredPid)) || daemons[0] || null;
}

async function stopThemeDaemons(daemons) {
  const pids = [...new Set(daemons.map(({ pid }) => pid))].filter(isProcessAlive);
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  if (pids.length === 0) return;
  await waitForProcessesToExit(pids, 10000).catch(() => {
    throw new Error(
      `主题守护进程未按时退出：${pids.filter(isProcessAlive).join(", ")}；为避免误杀，没有使用 SIGKILL。`,
    );
  });
}

async function waitForProcessesToExit(pids, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pids.every((pid) => !isProcessAlive(pid))) return true;
    await delay(100);
  }
  throw new Error(`进程未在限定时间内退出：${pids.filter(isProcessAlive).join(", ")}`);
}

async function discoverTrustedProfileEndpoints({ profileDir, profileProcesses }) {
  if (profileProcesses.length !== 1) return [];
  let port;
  let browserPath;
  try {
    const [rawPort, rawBrowserPath] = (await fs.readFile(
      path.join(profileDir, "DevToolsActivePort"),
      "utf8",
    )).split(/\r?\n/);
    port = Number(rawPort);
    browserPath = rawBrowserPath?.trim();
  } catch {
    return [];
  }
  if (
    !Number.isInteger(port) ||
    port <= 0 ||
    port > 65535 ||
    !/^\/devtools\/browser\/[A-Za-z0-9-]+$/.test(browserPath || "")
  ) {
    return [];
  }
  try {
    const version = await fetchCdpJson(port, "/json/version", { timeoutMs: 2000 });
    const debuggerUrl = new URL(version.webSocketDebuggerUrl);
    const loopback = new Set(["127.0.0.1", "localhost", "::1"]);
    if (
      debuggerUrl.protocol !== "ws:" ||
      !loopback.has(debuggerUrl.hostname) ||
      Number(debuggerUrl.port) !== port ||
      debuggerUrl.pathname !== browserPath ||
      (await listCdpTargets(port, { timeoutMs: 2000 })).length === 0
    ) {
      return [];
    }
    return [{ port, browserPath }];
  } catch {
    return [];
  }
}

async function closeBrowserOnEndpoint({ port, browserPath }) {
  const version = await fetchCdpJson(port, "/json/version", { timeoutMs: 2000 });
  const debuggerUrl = new URL(version.webSocketDebuggerUrl);
  const loopback = new Set(["127.0.0.1", "localhost", "::1"]);
  if (
    debuggerUrl.protocol !== "ws:" ||
    !loopback.has(debuggerUrl.hostname) ||
    Number(debuggerUrl.port) !== port ||
    debuggerUrl.pathname !== browserPath ||
    (await listCdpTargets(port, { timeoutMs: 2000 })).length === 0
  ) {
    throw new Error(`CDP ${port} 不再属于该 ${theme.displayName} profile`);
  }
  const client = await CdpClient.connect(debuggerUrl.href);
  try {
    await client.call("Browser.close", {}, { timeoutMs: 5000 });
  } catch (error) {
    if (!(await waitForDebugPortToDisappear(port, 1500))) throw error;
  } finally {
    client.close();
  }
}

async function waitForDebugPortToDisappear(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let consecutiveFailures = 0;
  while (Date.now() < deadline) {
    try {
      await fetchCdpJson(port, "/json/version", { timeoutMs: 400 });
      consecutiveFailures = 0;
    } catch {
      consecutiveFailures += 1;
      if (consecutiveFailures >= 3) return true;
    }
    await delay(150);
  }
  return false;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
