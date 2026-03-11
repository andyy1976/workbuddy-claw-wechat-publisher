# WorkBuddy Claw 实战教程

## 项目背景

本项目是基于 WorkBuddy Claw 打造的微信公众号自动化发布系统。

## 核心功能

- Markdown 转 HTML
- 自动封面生成（10种配色）
- 智能排版
- 响应式设计
- UTF-8 中文支持

## 快速开始

```bash
# 安装依赖
npm install

# 转换 Markdown
node src/markdown-to-wechat.js input.md output

# 生成封面
node src/generate_cover.js "标题" cover.png
```

## 技术栈

- Node.js
- Markdown-it
- Sharp
