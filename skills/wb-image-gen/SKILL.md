---
name: wb-image-gen
description: "AI 图片生成技能。支持 DashScope(通义万象)、火山方舟(Seedream/豆包)、OpenAI、Google Gemini。一条命令生成图片，支持风格预设、宽高比、参考图、批量生成。用于封面图、文章配图、PPT页面图、小红书卡片等场景。"
version: 1.0.0
---

# WB Image Gen - AI 图片生成

统一图片生成入口，支持多个国内外 AI 图片服务。

## 后端优先级

自动检测可用 API Key，按以下优先级选择：

1. **DashScope**（阿里通义万象）— `DASHSCOPE_API_KEY`
   - 模型：qwen-image-2.0-pro, qwen-image-2.1, wanx-v1
   - 优势：国内服务、免费额度大、中文 Prompt 友好
2. **火山方舟 Seedream**（豆包）— `ARK_API_KEY`
   - 模型：seedream-4.0, seedream-3.0
   - 优势：字节系、中文场景优化
3. **OpenAI** — `OPENAI_API_KEY`
   - 模型：gpt-image-1, dall-e-3
   - 优势：质量高
4. **Google Gemini** — `GOOGLE_API_KEY`
   - 模型：gemini-2.0-flash-exp-image-generation
   - 优势：多模态

## 用法

```bash
# 基本用法
node skills/wb-image-gen/scripts/generate.js --prompt "一只可爱的猫" --image output.png

# 指定后端和模型
node skills/wb-image-gen/scripts/generate.js --prompt "科技感封面" --image cover.png --provider dashscope --model qwen-image-2.0-pro

# 指定宽高比
node skills/wb-image-gen/scripts/generate.js --prompt "AI架构图" --image arch.png --ar 16:9

# 风格预设
node skills/wb-image-gen/scripts/generate.js --prompt "数字员工平台" --image hero.png --style notion

# 参考图
node skills/wb-image-gen/scripts/generate.js --prompt "改为蓝色调" --image out.png --ref source.png

# 批量生成
node skills/wb-image-gen/scripts/generate.js --batchfile batch.json --jobs 4
```

## 参数

| 参数 | 说明 |
|------|------|
| `--prompt <text>` | Prompt 文本 |
| `--image <path>` | 输出图片路径 |
| `--provider <name>` | 强制指定后端：dashscope/seedream/openai/google |
| `--model <id>` | 模型 ID |
| `--ar <ratio>` | 宽高比：1:1, 16:9, 9:16, 4:3, 3:4 |
| `--size <WxH>` | 明确尺寸，如 1024x1024 |
| `--quality <level>` | 质量：normal/2k（默认 2k） |
| `--style <name>` | 风格预设（见下方） |
| `--ref <files...>` | 参考图片 |
| `--batchfile <path>` | 批量生成 JSON 文件 |
| `--jobs <count>` | 并行数（默认 4） |

## 风格预设

| 预设 | 适合场景 | Prompt 增强 |
|------|---------|------------|
| notion | 简洁黑白灰、产品文档 | "minimalist black and white, clean geometric, Notion-style" |
| corporate | 商务、投资者演示 | "professional corporate, clean lines, blue tones" |
| bold-editorial | 产品发布、关键演讲 | "bold editorial, high contrast, magazine cover style" |
| chalkboard | 教育、教程 | "chalkboard style, hand-drawn chalk on black board" |
| watercolor | 生活方式、健康 | "soft watercolor illustration, pastel, dreamy" |
| cyberpunk | 科技、游戏 | "cyberpunk neon glow, dark futuristic, holographic" |
| cute | 儿童内容、萌系 | "kawaii cute, big eyes, pastel colors, chibi style" |
| technical-schematic | 技术架构、工程 | "blueprint technical schematic, isometric 3D, engineering diagram" |
| corporate-memphis | 企业插画 | "flat vector corporate memphis style, vibrant fills, geometric people" |
| pixel-art | 游戏、开发者 | "8-bit pixel art, retro gaming, nostalgic" |
| sketch-notes | 学习笔记、教育 | "sketch notes, hand-drawn, marker pen, notebook style" |
| minimal | 极简、高管汇报 | "ultra minimal, lots of white space, single focal point" |

## 环境变量

```
DASHSCOPE_API_KEY=sk-xxx        # 阿里通义万象
ARK_API_KEY=xxx                 # 火山方舟（豆包）
OPENAI_API_KEY=sk-xxx           # OpenAI
GOOGLE_API_KEY=xxx              # Google Gemini
```

配置文件优先级：CLI 参数 > .env > ~/.workbuddy/.env

## API 调用示例

### DashScope（通义万象）
```javascript
POST https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis
Headers: Authorization: Bearer ${DASHSCOPE_API_KEY}, Content-Type: application/json
Body: { model: "qwen-image-2.0-pro", input: { prompt: "..." }, parameters: { size: "1024*1024", n: 1 } }
```

### 火山方舟（Seedream）
```javascript
POST https://ark.cn-beijing.volces.com/api/v3/images/generations
Headers: Authorization: Bearer ${ARK_API_KEY}, Content-Type: application/json
Body: { model: "seedream-4.0", prompt: "...", size: "1024x1024" }
```

### OpenAI
```javascript
POST https://api.openai.com/v1/images/generations
Headers: Authorization: Bearer ${OPENAI_API_KEY}, Content-Type: application/json
Body: { model: "gpt-image-1", prompt: "...", size: "1024x1024", quality: "high" }
```

## 错误处理

- API Key 缺失 → 提示配置方法
- 超时（30s）→ 自动重试 1 次
- 额度不足 → 自动切换到下一个可用后端
- 内容审核拒绝 → 返回错误信息，建议修改 Prompt
