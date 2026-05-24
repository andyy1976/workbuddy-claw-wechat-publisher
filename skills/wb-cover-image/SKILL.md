---
name: wb-cover-image
description: "封面图生成技能。5维参数系统：Type × Palette × Rendering × Text × Mood，77种组合。用于文章封面、PPT封面、社交媒体封面。"
version: 1.0.0
---

# WB Cover Image - 封面图生成器

5维组合系统，一条命令生成专业封面图。

## 用法

```bash
# 自动选择维度
node skills/wb-cover-image/scripts/generate-cover.js article.md

# 指定维度
node skills/wb-cover-image/scripts/generate-cover.js article.md --type conceptual --palette cool --rendering digital

# 快速模式
node skills/wb-cover-image/scripts/generate-cover.js article.md --quick

# 无标题纯视觉
node skills/wb-cover-image/scripts/generate-cover.js article.md --no-title
```

## 5维系统

| 维度 | 选项 |
|------|------|
| Type | hero, conceptual, typography, metaphor, scene, minimal |
| Palette | warm, elegant, cool, dark, earth, vivid, pastel, mono, retro, duotone, macaron |
| Rendering | flat-vector, hand-drawn, painterly, digital, pixel, chalk, screen-print |
| Text | none, title-only（默认）, title-subtitle, text-rich |
| Mood | subtle, balanced（默认）, bold |

## 依赖
- wb-image-gen
