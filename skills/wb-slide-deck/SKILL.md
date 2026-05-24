---
name: wb-slide-deck
description: "PPT 生成技能。从 Markdown 文章一键生成专业 PPT，支持大纲预览、17种风格预设、多后端图片生成。输出 .pptx + .pdf。"
version: 1.0.0
---

# WB Slide Deck - PPT 生成器

从 Markdown/文本内容生成专业 PPT 课件。借鉴 baoyu-slide-deck 的设计理念：**用于阅读和分享，而非现场演示**。

## 流程

```
内容输入 → 大纲生成(--outline-only 可预览) → 确认 → 逐页生成图片 → 合并为 PPTX/PDF
```

## 用法

```bash
# 从 Markdown 文件生成
node skills/wb-slide-deck/scripts/generate.js article.md

# 指定风格和页数
node skills/wb-slide-deck/scripts/generate.js article.md --style corporate --slides 12

# 先看大纲（不生成图片）
node skills/wb-slide-deck/scripts/generate.js article.md --outline-only

# 指定语言
node skills/wb-slide-deck/scripts/generate.js article.md --lang zh

# 重新生成某一页
node skills/wb-slide-deck/scripts/generate.js article.md --regenerate 3,5,8
```

## 参数

| 参数 | 说明 |
|------|------|
| `<input>` | 输入文件（Markdown/文本）或直接文本 |
| `--style <name>` | 风格预设（见下方） |
| `--audience <type>` | 受众：beginners/intermediate/experts/executives/general |
| `--lang <code>` | 语言：zh/en/ja |
| `--slides <n>` | 目标页数（8-25，默认 12） |
| `--outline-only` | 只生成大纲，不生成图片 |
| `--prompts-only` | 生成大纲+Prompt，不生成图片 |
| `--images-only` | 跳过大纲，用已有 Prompt 生成图片 |
| `--regenerate <n>` | 重新生成指定页面：3 或 2,5,8 |

## 风格预设

4 维组合：Texture × Mood × Typography × Density

| 预设 | 维度组合 | 适合场景 |
|------|---------|---------|
| `blueprint`（默认）| grid + cool + technical + balanced | 架构、系统设计 |
| `chalkboard` | organic + warm + handwritten + balanced | 教育、教程 |
| `corporate` | clean + professional + geometric + balanced | 投资者演示、商务提案 |
| `minimal` | clean + neutral + geometric + minimal | 高管简报 |
| `notion` | clean + neutral + geometric + dense | 产品演示、SaaS |
| `bold-editorial` | clean + vibrant + editorial + balanced | 产品发布、Keynote |
| `dark-atmospheric` | clean + dark + editorial + balanced | 游戏、娱乐 |
| `sketch-notes` | organic + warm + handwritten + balanced | 学习笔记 |
| `watercolor` | organic + warm + humanist + minimal | 生活方式、健康 |
| `scientific` | clean + cool + technical + dense | 学术、科研 |
| `pixel-art` | pixel + vibrant + technical + balanced | 游戏、开发者 |
| `vintage` | paper + warm + editorial + balanced | 历史、文化 |

## 依赖

- **图片生成**：调用 `wb-image-gen` 技能
- **PPTX 合并**：使用 `pptxgenjs` npm 包
- **LLM**：调用 WorkBuddy 的 AI 服务生成大纲
