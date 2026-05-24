# WorkBuddy WeChat Publisher - 架构说明

**最后更新**: 2026-05-24  
**维护者**: AI Assistant (超云艾艾)

---

## ⚠️ 核心原则（避免重复犯错）

**正确的引擎是 `scripts/enhanced-engine.js`**，不是 `server/routes/*.js`！

- `enhanced-engine.js` = CLI 脚本（真正的内容生成 + 发布引擎）
- `server/` = HTTP API（仅给 Web UI 用，不是核心逻辑）
- 如果你在调试"为什么微信发布失败"，**先看 `enhanced-engine.js` 的 `publishWechat()` 和 `uploadWechatImage()` 函数**

---

## 项目结构

```
workbuddy-claw-wechat-publisher/
├── config/
│   └── user-config.json        # ⚠️ 核心配置文件（微信 API key、thumbMediaId 等）
├── scripts/
│   ├── enhanced-engine.js      # ✅ 核心引擎（CLI 脚本，有 main() 函数）
│   ├── article-enhancer.js     # 图片搜索、下载、摘要生成
│   ├── topic-rag.js           # 话题知识库 RAG 搜索
│   ├── content-safety.js      # 内容安全检查
│   └── cms-database.cjs       # CMS 数据库操作
├── server/                     # ⚠️ HTTP API（Web UI 用，不是核心引擎）
│   ├── index.js               # HTTP 服务器入口
│   ├── routes/                # API 路由（可能被误认为是核心逻辑）
│   └── public/                # Web UI 前端页面
├── data/                       # 话题知识库 JSON
├── output/                     # 输出目录（图片、日志等）
├── run-engine.bat             # ✅ 正确启动方式（CLI）
└── .env                       # 环境变量（部分配置可能从这里读）
```

---

## 正确运行方式

### ✅ 正确：`run-engine.bat` 或 `go.bat`
```bash
# 方式1: 双击 run-engine.bat
# 方式2: 命令行
cd D:\scsaicms\workbuddy-claw-wechat-publisher
node scripts/enhanced-engine.js
```

**执行流程**:
1. `selectBestTopic()` - RAG 话题选择
2. `generateTitle()` - AI 生成标题
3. `writeArticle()` - AI 深度写作
4. `checkContent()` - 内容安全检查
5. `mdToHtml()` - Markdown → 微信 HTML
6. `matchThumbnail()` - 从 Pexels/Pixabay 搜索缩略图
7. `uploadWechatImage()` - **上传缩略图到微信**（获取 `media_id`）
8. `publishWechatWithThumb()` - 发布到微信草稿箱
9. `saveArticle()` - 写入 CMS 数据库

### ❌ 错误：调试 `server/routes/publish.js`
- 这是 HTTP API，给 Web UI 调用的
- **不是**命令行直接运行的引擎
- 如果你在调试"微信发布失败"，看这里只会浪费时间

---

## 缩略图生成流程（完整）

**每次运行 `enhanced-engine.js` 都会重新生成缩略图**：

1. `matchThumbnail(title, digest)`
   - 调用 `generateImageKeywords()` 生成英文关键词
   - 调用 `searchStockImage(keyword, { source: 'pexels' })` 从 **Pexels** 搜索
   - 如果 Pexels 失败，降级到 **Pixabay**
   - 返回 `images[0]`（包含 `url`, `source`, `photographer`）

2. `downloadImage(thumbnail.url, thumbnailPath)`
   - 下载图片到本地 `output/thumb_xxx.jpg`

3. `uploadWechatImage(thumbnailPath, 'thumb')`
   - 上传到微信素材库
   - **返回新的 `media_id`**（每次都不同！）

4. `publishWechatWithThumb(title, digest, contentHtml, thumbMediaId)`
   - 用**新的 `media_id`** 发布到微信草稿箱

**降级方案**（如果上述任何一步失败）:
- 使用 `config/user-config.json` 里的 `wechat.thumbMediaId`（默认缩略图）
- ⚠️ **这个默认 `thumbMediaId` 可能已过期！**

---

## 配置文件说明

### `config/user-config.json`（主要配置）
```json
{
  "wechat": {
    "appId": "wxbe7fd856ee4ae690",
    "appSecret": "ec65f0021eed492b6bac0670c63d67d2",
    "thumbMediaId": "fOSSI4rB_2kncg_EYxVB_3HgoVsm5uB1xT8Rd7553eHblT_oGvhZFjixaikeBYvg",
    "author": "超云艾艾"
  },
  "ai": {
    "apiKey": "sk-be1babe391c7428a80eca2b832c44cc2",
    "baseUrl": "https://api.deepseek.com",
    "models": ["deepseek-v4-flash"]
  },
  "database": { ... }
}
```

### `.env`（环境变量，部分配置可能从这里读）
```bash
# Pexels/Pixabay API Key（用于搜索缩略图）
PEXELS_API_KEY=...
PIXABAY_API_KEY=...

# 微信配置（可能被 user-config.json 覆盖）
WECHAT_APPID=...
WECHAT_SECRET=...
WECHAT_THUMB_MEDIA_ID=...
```

⚠️ **优先级**: `user-config.json` > `.env`

---

## 常见错误（避免重复犯）

### ❌ 错误1: 调试 `server/routes/publish.js` 来解决微信发布问题
**正确做法**: 调试 `scripts/enhanced-engine.js` 的 `publishWechat()` 函数

### ❌ 错误2: 以为 `thumbMediaId` 是固定的，一直纠结配置文件
**正确做法**: 每次运行都会重新生成缩略图，`thumbMediaId` 只是降级方案

### ❌ 错误3: 没仔细读代码就瞎调试
**正确做法**: 先读 `enhanced-engine.js` 的 `main()` 函数，搞清楚完整流程

---

## 技术栈

- **Runtime**: Node.js v22.21.1
- **AI**: DeepSeek API (deepseek-v4-flash)
- **数据库**: MySQL 8.0 (eastaiai)
- **微信 API**: 微信公众号草稿箱接口
- **图片来源**: Pexels API / Pixabay API
- **HTTP 服务器**: Express.js (仅给 Web UI 用)

---

## 待优化

1. **缩略图上传失败处理** - 如果 `uploadWechatImage()` 失败，应该终止发布而不是用无效的 `thumbMediaId`
2. **Pexels API 降级** - 如果 Pexels 失败，自动切换到 Pixabay
3. **错误日志** - 上传失败时，详细记录错误信息（现在是 `console.log('   微信上传错误:', e.message)`）
4. **配置文件统一** - 现在配置分散在 `user-config.json` 和 `.env`，容易搞混

---

## 联系方式

如果你发现文档有误，或者又有人（包括 AI）在重复犯错，请联系：

**超云艾艾**  
WeChat: eastaiai  
Email: [待补充]

---

**最后提醒**: 如果你在调试"为什么微信发布失败"，**先看 `scripts/enhanced-engine.js`**，别再看 `server/routes/*.js` 了！
