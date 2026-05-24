---
name: wb-xhs-images
description: "小红书卡片图生成技能。将文章内容拆分为1-10张精美卡片图，12种视觉风格×8种布局。用于小红书、微信图文等社交平台。"
version: 1.0.0
---

# WB XHS Images - 小红书卡片图生成器

将长文拆分为小红书风格的卡片图系列，每张图信息密度适中、视觉统一。

## 用法

```bash
# 自动选择风格和布局
node skills/wb-xhs-images/scripts/generate-cards.js article.md

# 指定风格
node skills/wb-xhs-images/scripts/generate-cards.js article.md --style notion

# 指定布局
node skills/wb-xhs-images/scripts/generate-cards.js article.md --layout list

# 组合风格+布局
node skills/wb-xhs-images/scripts/generate-cards.js article.md --style notion --layout list

# 快速模式（跳过确认）
node skills/wb-xhs-images/scripts/generate-cards.js article.md --yes
```

## 风格 (12种)

| 风格 | 描述 |
|------|------|
| cute（默认） | 可爱卡通风，圆润元素 |
| fresh | 清新简约，浅色系 |
| warm | 温暖柔和，暖色调 |
| bold | 大胆撞色，高对比 |
| minimal | 极简留白，黑白灰 |
| retro | 复古怀旧，纸质纹理 |
| pop | 波普艺术，鲜艳色彩 |
| notion | Notion 风，黑白灰简洁 |
| chalkboard | 黑板风，粉笔手绘 |
| study-notes | 学习笔记，手写感 |
| screen-print | 丝网印刷，鲜明色块 |
| sketch-notes | 涂鸦笔记，随性线条 |

## 布局 (8种)

| 布局 | 密度 | 适合场景 |
|------|------|---------|
| sparse | 1-2点 | 封面、金句 |
| balanced | 3-4点 | 常规内容 |
| dense | 5-8点 | 知识卡片、速查表 |
| list | 4-7条 | 清单、排名 |
| comparison | 两面 | 对比、优缺点 |
| flow | 3-6步 | 流程、时间线 |
| grid | 多主题 | 多主题概览 |
| quote | 1句 | 名言、核心观点 |

## 依赖

- 图片生成：调用 `wb-image-gen` 技能
- LLM：调用 WorkBuddy AI 服务拆分内容
