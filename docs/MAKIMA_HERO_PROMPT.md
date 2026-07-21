# 玛奇玛横版主视觉生成记录

## 生成方式

- 工具：Codex 内置 `imagegen`
- 模式：编辑现有角色主视觉
- 角色参考：`assets/makima-hero-left-source.png`
- 构图参考：D 版“鼠尾草契约档案室”界面效果稿
- 当前成品母版：`assets/makima-hero-sage-source.png`

## 最终提示词

```text
Preserve the existing Makima identity, face, restrained forward-facing pose, red braided hair,
gold concentric-ring eyes, white shirt and black tie. Keep her on the left third of the 1672x941
desktop canvas and preserve clear facial anatomy.

Replace the former near-black chains, sparks and red haze with a pale warm linen-paper archive:
muted sage botanical linework, aged-copper concentric contract rings and subtle drafting marks.
Let the illustration continue beneath the left sidebar and into the conversation area. Reserve
the center-right and rightmost area as quiet low-detail negative space so dark UI text remains
readable through translucent cards. Use soft daylight, cream, pale sage, dusty rose, aged copper
and charcoal ink. No interface, cards, text, logo, watermark, extra characters, neon colors or
animated elements.
```

## 运行素材

- `assets/makima-hero-sage.webp`：q90 静态 WebP，也是当前唯一运行时主视觉。
- `assets/makima-hero-left.webp`：旧版暗色主视觉，保留用于回溯但不再加载。
- 早期 animated WebP 实验稿不再由 CSS 编译或运行时加载。

角色、构图与画面内容来自内置 `imagegen` 生成的母版。
