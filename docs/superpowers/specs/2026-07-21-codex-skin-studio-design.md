# Codex Skin Studio 与自定义主题 Skill 设计

日期：2026-07-21

## 目标

把当前 macOS Codex 外置主题运行时发布到公开 GitHub 仓库，并将“由 GPT 生成自定义主题与背景、安装 App、安装主题、验证和恢复”的完整能力封装为可独立分发的 Codex Skill。

最终交付必须让新用户只安装一个 Skill，随后用自然语言描述主题，即可在不修改官方 Codex 应用包、代码签名、`app.asar` 或 `~/.codex` 数据的前提下完成：

1. 安装或更新 Codex Skin Studio；
2. 生成背景图与主题包；
3. 安全校验并安装主题；
4. 启动、诊断并验证主题；
5. 停止主题、删除自定义主题或恢复先前版本。

第一版只支持 macOS 14 及以上版本的 Codex Desktop。

## 已验证的现状

- 当前 Node CLI 已具备独立 Chromium profile、回环 CDP、官方签名校验、注入撤销、状态隔离和安全 CSS 校验。
- Makima 与 Faye 在 `src/themes.mjs` 和 Swift `CodexTheme` 枚举中硬编码，第三套主题无法在不改源码的情况下被发现。
- 当前 App 和内置 Node 都是 arm64，App 只有 ad-hoc 签名，不能当成已公证的通用 Mac 分发包。
- Git 仓库尚无正式提交和远端，`ssyamv/codex-skin` 仓库名当前可用。
- 当前运行素材约 13 MB；构建产物与调试截图不应进入源码提交。

## 方案选择

采用“动态主题包 + App 运行时 + Skill 编排”方案。

不采用以下替代方案：

- Skill 修改 App 源码并为每个主题重新构建：会让升级、回滚和多人分发依赖源码补丁。
- 在线生成服务：需要额外的服务端、鉴权、存储和运营边界，不是本次目标的必要条件。

## 产品命名与仓库

- GitHub 仓库：`https://github.com/ssyamv/codex-skin`
- 用户可见 App 名称：`Codex Skin Studio`
- CLI 名称：`codex-skin`
- Skill 名称：`customize-codex-theme`
- 首个包含动态主题能力的版本：`1.7.0`
- 源代码采用 MIT License。仓库中的示例插画和其他视觉素材不由 MIT 自动授权，必须在 `NOTICE` 中单独声明其来源与使用边界。

App 和文档必须明确说明这是非官方工具，与 OpenAI 无隶属或背书关系。

## 系统架构

系统由四个边界明确的组件组成。

### 1. 主题包

每个主题是一个自包含目录：

```text
<theme-id>/
├── theme.json
├── theme.css
├── hero.png | hero.jpg | hero.webp
└── preview.png | preview.jpg | preview.webp
```

`theme.json` 使用版本化契约：

```json
{
  "schemaVersion": 1,
  "id": "moonlit-archive",
  "displayName": "Moonlit Archive",
  "eyebrow": "A QUIET NIGHT WORKSPACE",
  "summary": "深蓝、月光与低对比纸张构成的夜间工作台。",
  "appearance": "dark",
  "cssFile": "theme.css",
  "heroFile": "hero.png",
  "previewFile": "preview.png"
}
```

约束如下：

- `id` 只允许小写字母、数字和单连字符，长度 3–48，不允许与内置主题重名。
- 所有资源路径必须是包内相对文件名；拒绝绝对路径、`..`、符号链接和逃逸后的真实路径。
- CSS 最大 1 MiB；背景和预览分别最大 20 MiB。
- 图片 MIME 类型按文件头识别，不信任扩展名；运行时支持 PNG、JPEG 和 WebP。
- `styleId`、状态键、运行目录、profile 目录和 CSS 变量前缀全部由安全的 `id` 派生，不接受清单自定义。
- 安装前继续执行现有 CSS 安全校验，拒绝字体、布局、交互、持续动画、远程 URL、脚本与非主题根选择器。

内置主题迁移到同一主题包契约。源码中的内置包位于 `theme-packs/<id>/`；安装后的用户主题位于：

```text
~/Library/Application Support/Codex Skin Studio/Themes/<id>/
```

内置 ID 与用户 ID 不允许覆盖。重新安装同一用户主题必须显式使用 `--replace`。

### 2. Node 运行时与 CLI

`src/themes.mjs` 从静态对象改为主题仓库接口，负责：

- 读取和验证清单；
- 合并内置主题与用户主题；
- 返回稳定、可序列化的主题描述；
- 为每个主题派生隔离的运行路径；
- 拒绝重复、损坏或越界主题包。

新增 CLI：

```text
codex-skin themes list [--json]
codex-skin themes validate <theme-dir> [--json]
codex-skin themes install <theme-dir> [--replace] [--json]
codex-skin themes remove <theme-id> [--json]
```

现有 `start/status/doctor/verify/snapshot/stop/uninstall --theme <id>` 接受动态主题 ID。

安装流程使用同一文件系统内的临时目录完成完整校验，再原子重命名到目标目录。`--replace` 先把旧主题移动到备份路径；新主题安装失败时恢复旧主题，成功后才删除备份。正在运行的主题不能被替换或删除。

`uninstall` 仍只清理主题运行状态和日志；`themes remove` 才删除已安装的用户主题。两个命令不混用，避免误删。

### 3. macOS App

Swift 的 `CodexTheme` 从枚举改为 `Identifiable + Hashable + Codable` 的数据结构。App 启动和刷新时调用：

```text
codex-skin themes list --json
```

App 根据返回数据动态显示内置和用户主题，预览从经过验证的绝对本地路径加载。主题列表为空、单个主题损坏或 CLI 返回旧 schema 时，App 显示可诊断错误，不崩溃也不自动删除文件。

App 保留当前启动、停止、切换、修复和诊断行为。切换主题时仍先安全停止当前主题，确认撤销完成后再启动目标主题。

外部名称、Bundle Display Name 和文档统一为 `Codex Skin Studio`。内部 Swift 文件名和类型可逐步迁移，但不能在用户界面继续显示 `Codex Pro`。

### 4. `customize-codex-theme` Skill

Skill 的仓库源位于：

```text
.agents/skills/customize-codex-theme/
├── SKILL.md
├── agents/openai.yaml
├── scripts/install-app.zsh
├── scripts/create-theme-pack.mjs
└── references/theme-contract.md
```

GitHub Release 将该目录打包成顶层目录为 `customize-codex-theme/` 的 ZIP。用户把它复制到 `${CODEX_HOME:-$HOME/.codex}/skills` 并重启 Codex 后即可使用。

Skill 的执行顺序固定为：

1. 检查 macOS 版本、CPU 架构、Codex Desktop 和现有 Codex Skin Studio。
2. 询问主题名称、明暗模式、核心色彩、氛围、背景主体和留白方向；已有图片时确认是使用、编辑还是重新生成。
3. 生成或视觉修改背景时必须调用 `imagegen`，不得用 PIL、SVG、Canvas 或临时绘图脚本伪造背景。
4. 把用户确认的视觉意图写入生成配置；确定性脚本据此生成清单和受约束 CSS。
5. 调用 App CLI 执行 `themes validate` 和 `themes install`。
6. 执行 `doctor`；在没有普通 Codex 共享同一 `~/.codex` 的前提下启动主题并执行 `verify`。
7. 输出安装位置、主题 ID、验证结果、停止、恢复和删除命令。

Skill 不直接写 `~/.codex` 配置，不修改官方应用，不关闭普通 Codex，也不绕过 Gatekeeper。若普通 Codex 正在运行，Skill 完成主题安装和离线验证后明确提示用户正常退出，再继续启动验证。

`create-theme-pack.mjs` 只负责确定性文件生成和静态校验，不负责图像生成。它接收 JSON 配置和现有图像路径，输出完整主题包，从而将 GPT 的审美判断与安装安全边界分离。

## App 自动安装与更新

`install-app.zsh` 执行以下流程：

1. 只接受 `arm64` 和 `x86_64`。
2. 从 GitHub Release API 获取明确版本或最新稳定版。
3. 下载与架构匹配的 App ZIP 和 `SHA256SUMS`。
4. 校验 SHA-256、ZIP 结构、Bundle ID 和 `codesign --verify --deep --strict`。
5. 安装到 `~/Applications/Codex Skin Studio.app`；覆盖前停止由该 App 管理的主题并保留旧 App 备份。
6. 新 App 自检失败时恢复旧 App。

脚本不得使用 `sudo`，不得安装到 `/Applications`，不得清除 quarantine 属性，也不得修改系统 Gatekeeper 设置。

未配置 Developer ID 和 notarization 时，Release 明确标记为 ad-hoc signed。若 macOS 阻止启动，Skill 优先使用仓库源码在本机按当前架构构建；本机构建要求 Xcode Command Line Tools 和 Node.js 22。缺少前置条件时停止并给出准确安装要求，不伪称安装完成。

## 构建与 GitHub Release

GitHub Actions 包含两个职责：

- 持续集成：在推送和 PR 上执行语法检查、Node 测试、Skill 校验、Swift 构建和安装脚本的无网络测试。
- Release：在 `v*` tag 上分别使用 arm64 macOS runner 与 Intel macOS runner 构建 App，输出两个架构包、Skill ZIP、源码归档和 `SHA256SUMS`。

Release 资产命名稳定：

```text
Codex-Skin-Studio-1.7.0-macos-arm64.zip
Codex-Skin-Studio-1.7.0-macos-x64.zip
customize-codex-theme-1.7.0.zip
SHA256SUMS
```

签名分两级：

- 默认：ad-hoc 签名，构建和校验可复现，文档明确限制。
- 可选正式发布：当仓库配置 Apple Developer ID、notary profile 和必要 secrets 后，对两个架构产物签名、公证并 staple；工作流没有这些 secrets 时不得显示“已公证”。

## 数据流

一次完整请求的数据流如下：

```text
用户描述视觉意图
  -> Skill 整理生成配置
  -> imagegen 生成背景
  -> create-theme-pack.mjs 生成主题包
  -> CLI validate
  -> CLI 原子 install
  -> App 动态发现主题
  -> CLI doctor/start/verify
  -> Skill 返回证据与恢复命令
```

图像生成失败不会创建半成品主题。主题校验失败不会更改已安装主题。启动或运行验证失败会停止新主题，但保留已安装文件供诊断；替换安装失败会恢复旧主题。

## 安全与隐私边界

- 继续只连接 `127.0.0.1` CDP，并验证 target URL、profile 和 browser UUID。
- 继续验证官方 Codex 签名与关键文件哈希，不修改官方 bundle。
- 主题 CSS 不允许网络 URL；运行时只内嵌本地、已验证图片。
- 主题包安装拒绝符号链接、路径逃逸、重复 ID 和超限文件。
- GitHub Actions、Skill 和安装脚本不得收集 prompt、图片或本地路径遥测。
- 发布前扫描仓库中的 token、私钥、个人日志、调试 profile 和构建产物。
- 删除和覆盖只允许精确的 App、主题或运行目录，且必须验证所有权标记。

## 测试与验收

### 自动化测试

Node 测试覆盖：

- 合法主题包发现、排序和 JSON 输出；
- 非法 ID、schema、MIME、路径逃逸、符号链接、重复 ID 和文件大小限制；
- CSS 安全规则对动态根选择器生效；
- 安装、拒绝覆盖、原子替换、失败恢复和删除；
- 动态主题的运行目录、状态键和 profile 相互隔离；
- 现有 Makima/Faye 的启动、撤销和安全测试继续通过。

脚本测试覆盖：

- 架构选择、Release 资产名、SHA-256 失败、ZIP 越界和备份恢复；
- 临时 HOME 下的无权限、无网络和缺依赖错误；
- Skill 包不含 `.DS_Store`、源码构建产物或个人路径。

构建检查覆盖：

- Swift App 在 arm64 和 Intel runner 均能编译；
- App 能解析动态主题列表并显示任意第三套 fixture 主题；
- Release ZIP 解压后通过 codesign、Bundle ID 和 CLI doctor 检查。

### 真实端到端验收

发布前使用一个非内置主题做完整演练：

1. 从只包含 Skill ZIP 的干净临时 Codex Skill 目录开始；
2. 通过自然语言要求生成一套原创主题并实际调用 `imagegen`；
3. 由 Skill 安装 App 和主题；
4. 确认 App 中出现该主题和预览；
5. 执行 `doctor`、`start`、运行时 `verify`、`stop`；
6. 确认官方 Codex 可执行文件和 `app.asar` 哈希未变化；
7. 替换主题后验证回滚，再删除自定义主题；
8. 在另一临时 HOME 中重跑安装，证明流程不依赖开发机绝对路径。

若无法获得 Intel 实机，Intel 侧只声明 GitHub runner 构建和离线校验通过，不声称已做 Intel 图形界面实机验证。

## Git 与发布策略

1. 设计规格单独提交。
2. 在 `codex/custom-theme-skill` 分支实现和验证。
3. 创建公开仓库 `ssyamv/codex-skin`，以 `main` 为默认分支。
4. 推送实现分支并创建 Draft PR，PR 中记录测试、真实端到端结果和未公证限制。
5. PR 合并后创建 `v1.7.0` tag 和 GitHub Release。
6. Release 资产与远端 tag、commit SHA、Actions 结果和下载校验和全部一致后，才将“已发布”视为完成。

## 完成定义

只有下列证据全部存在时，本目标才算完成：

- 公开 GitHub 仓库可访问，默认分支包含 App、动态主题契约、Skill、测试、License、NOTICE 和发布说明；
- App 可发现并运行非内置主题，现有两套主题不回归；
- Skill 通过官方 `quick_validate.py`，且在干净临时环境完成生成、安装、验证与恢复演练；
- arm64/x64 Release 资产和 Skill ZIP 可下载且校验和正确；
- GitHub Actions 通过，PR/commit/tag/Release 的 ancestry 和版本一致；
- 文档没有把 ad-hoc 签名描述成 Developer ID 签名或已公证；
- 官方 Codex 应用包、签名、`app.asar` 和用户 `~/.codex` 数据未被修改。
