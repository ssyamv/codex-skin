# Codex 外置运行时主题

这是一个 macOS Codex Desktop 外置运行时皮肤，内置玛奇玛与 Faye 两套独立主题；
不传 `--theme` 时仍默认使用玛奇玛。它不修改
`/Applications/ChatGPT.app`、`app.asar`、代码签名、Codex 源文件或官方
Chromium profile；关闭皮肤后不会在页面中留下样式或主题标记。工具本身也不直接
编辑 `~/.codex`，该目录仍只由官方 Codex 按原有方式使用。

![玛奇玛鼠尾草契约档案室主题实机效果](artifacts/runtime/makima-sage-final.png)

Faye 主题采用人物左置、右侧近黑留白的 **Bebop After Midnight** 方向，并覆盖侧栏、
消息、Thinking、工具调用、计划、Composer、代码、终端、Diff、审批和浮层。完整规则见
[Faye 视觉规范](docs/FAYE_THEME_SPEC.md)。

## 视觉设计

- 玛奇玛位于左侧主区，脸部避开侧边栏边缘；整窗使用浅亚麻纸、鼠尾草与旧铜圆环。
- 背景连续穿过半透明侧边栏和对话区；右侧低细节留白保证阅读，代码与 Diff 单独保持高不透明度。
- 主视觉只使用一张静态 WebP，不播放动画，也不编译或加载动态素材。
- 强制颜色模式下完全移除插画；系统“减少动态效果”仍会关闭界面颜色过渡。
- 标题栏、侧栏、首页建议卡、对话、Composer、审批、代码、终端、Diff 和浮层使用
  统一的浅亚麻纸面、鼠尾草悬停、低饱和酒红选中态和旧铜图标边界。
- 成功、错误、Diff 增删和终端 ANSI 色仍保持独立语义，不被统一染成主题红。
- Diff 预览使用不透明的浅绿、浅红行底，正文继续使用高对比深暖棕。
- Thinking、工具调用、命令详情、文件活动、计划步骤和命令状态使用深金与酒红提示、
  浅米灰详情面；原有展开、停止、审批和状态语义保持不变。
- 不声明字体族、字号、行高或字距；继续使用你当前的 Codex 字体设置。

完整视觉规则见 [视觉规范](docs/MAKIMA_THEME_SPEC.md)，早期设计稿见
[概念稿](makima-codex-ui-concept-v1.png)，主视觉提示词见
[生成记录](docs/MAKIMA_HERO_PROMPT.md)。视觉层次参考了
[HeiGe Codex Skin Studio](https://github.com/HeiGeAi/heige-codex-skin-studio)，但没有
复制其角色素材、主题中心、Logo 替换或宠物功能。

## 使用

### Codex Pro.app（推荐）

双击 [`dist/Codex Pro.app`](dist/Codex%20Pro.app) 即可打开原生主题控制台。应用提供：

- 玛奇玛、Faye 主题预览与选择；
- 当前主题、Codex 版本、守护进程和本机端口状态；
- 一键启动、停止、切换，以及异常实例修复；
- 内置诊断结果查看与复制；
- 无终端窗口运行。

应用包内置 Node.js 22 运行时，不依赖 Finder 启动时的 `PATH`。本地重新构建：

```bash
npm run build:app
```

输出位于 `dist/Codex Pro.app`。当前构建使用本机 ad-hoc 签名，适合本机使用；如需分发给其他
Mac，仍需使用 Apple Developer ID 签名并完成 notarization。

### 命令行与兼容启动器

直接运行命令行或使用 `.command` 启动器时，要求 Node.js 22 或更高版本。

先正常退出所有普通 Codex 窗口，再双击 `Codex Makima.command` 或
`Codex Faye.command`。启动器不会代为
退出或终止普通 Codex；如果发现仍有进程使用同一 `~/.codex`，会安全拒绝启动。
通过检查后，它会使用对应的独立 Chromium profile 打开官方 Codex：

```text
~/Library/Application Support/Codex Makima Skin/Profile
~/Library/Application Support/Codex Faye Skin/Profile
```

也可以在终端运行：

```bash
./codex-skin start
./codex-skin start --theme faye
./codex-skin status
./codex-skin status --theme faye
./codex-skin verify
./codex-skin verify --theme faye
./codex-skin stop
./codex-skin stop --theme faye
```

两套主题使用不同运行目录和 Chromium profile。现有玛奇玛目录仍为
`~/Library/Application Support/Codex Makima Skin`；Faye 使用
`~/Library/Application Support/Codex Faye Skin`。启动、停止或卸载一个主题不会读取
或清理另一个主题的状态。

`stop` 会先撤销所选主题的新文档脚本、样式节点和主题标记，再关闭对应 Codex 窗口及
本机调试端口；它只匹配主题自己的专用 profile，不会终止普通 Codex。玛奇玛可双击
`Stop Codex Skin.command`，Faye 可双击 `Stop Codex Faye.command`。下次需要普通
界面时，直接正常启动 Codex 即可。

清理状态与日志：

```bash
./codex-skin uninstall
```

为避免误删登录数据，`uninstall` 会保留独立 profile；如不再需要，可在所有皮肤
Codex 窗口退出后手动删除上面的 profile 目录。

## 工作原理与安全边界

1. 启动器先校验官方应用 Bundle ID 和 Apple 代码签名。
2. 确认没有其他 Codex 共享目标 `CODEX_HOME`，再使用独立 Chromium profile、
   随机调试端口和 `127.0.0.1` 回环地址启动官方可执行文件。
3. 只接受 URL 为 `app://-/index.html`、端口匹配且路径为
   `/devtools/page/...` 的页面 target；关闭窗口前还会复核 profile 中记录的
   browser UUID，陈旧或被其他程序复用的端口不会收到 `Browser.close`。
4. 每个页面只注入当前主题自己的样式节点（`#codex-skin-makima` 或
   `#codex-skin-faye`）；唯一静态主视觉以内嵌 WebP
   data URI 加载，不依赖 `file://` 或网络资源。
5. 守护进程处理页面重载与新窗口；停止时撤销新文档脚本、样式节点和根标记。

运行目录必须是专用窄目录，并带有工具自己的所有权标记；`uninstall` 在标记缺失或
不匹配时会拒绝删除状态、日志，避免误删用户目录中的同名文件。

主题安全检查会拒绝：

- 字体、字号、行高、字距和 Codex 字体变量覆盖；
- `display`、`visibility`、尺寸、间距、overflow、flex/grid、定位和层级变更；
- border 宽度、持续 CSS animation、transform、隐藏焦点和任意布局变量；
- 除唯一装饰层 `pointer-events: none` 之外的指针事件覆盖。

主题不移动、不替换、不隐藏业务 DOM，也不注册点击、输入、滚动或键盘处理器。
CDP 本身具备较高权限，因此端口只绑定本机；不要改成 `0.0.0.0`，也不要让不可信
程序访问该端口。

## 验证

```bash
npm run verify
./codex-skin doctor --json
./codex-skin doctor --theme faye --json
./codex-skin verify --json
./codex-skin verify --theme faye --json
node scripts/runtime-probe.mjs <CDP端口> --theme faye
./codex-skin snapshot --output ./artifacts/runtime/makima-runtime-left-static.png
```

`doctor` 会实际编译 CSS 和唯一静态主视觉，并校验签名与应用哈希。运行中的
`verify` 还检查：

- 每页只有一个主题样式；
- 启用前后字体族、字号、行高与字距一致；
- 启用前后交互元素状态、属性、可见性与指针事件一致；
- 启用前后主区域布局、滚动尺寸和 Composer 可编辑状态一致；
- 官方可执行文件和 `app.asar` 哈希未变化。

## 文件结构

```text
assets/makima-hero-sage-source.png  鼠尾草契约档案室主视觉母版
assets/makima-hero-sage.webp        玛奇玛唯一运行时静态主视觉
assets/makima-hero-left-source.png  旧版暗色主视觉母版（保留，不加载）
assets/makima-hero-left.webp        旧版暗色运行素材（保留，不加载）
assets/faye-hero-left-source.png    Faye 左侧构图主视觉母版
assets/faye-hero-left.webp          Faye 运行时静态主视觉
themes/makima.css                   玛奇玛 token 与组件样式
themes/faye.css                     Faye token 与完整组件样式
src/themes.mjs                      主题注册、独立样式 ID 与运行目录
src/cdp.mjs                      仅回环地址的 CDP 客户端与 target 校验
src/injector.mjs                 单静态素材编译、注入、撤销与安全检查
src/runtime.mjs                  应用发现、专用 profile、签名、哈希与状态
bin/codex-skin.mjs               命令行入口
scripts/runtime-probe.mjs        字体、交互和布局只读探针
test/                            自动化安全测试
```

当前已在 Codex Desktop `26.715.52143` 上实机验证。Codex 更新后，语义色
token 通常仍可工作；若局部 DOM 选择器变化，相关装饰会降级失效，不会改变应用功能。
