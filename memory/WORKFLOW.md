# WorkBuddy 微信公众号发布器 - 完整流程梳理

## 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   用户界面 (Web UI)                      │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐      │
│  │ 生成文章 │→ │ 去AI味道 │→ │  发布  │→ │ 统计   │      │
│  │generate │  │deaiify  │  │publish │  │ stats  │      │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘      │
│       │            │            │            │            │
│       └────────────┴─────┬──────┴────────────┘            │
│                          │                                │
│                    server/index.js (3456)                │
└──────────────────────────┼────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
   ┌───────────┐   ┌───────────┐   ┌───────────┐
   │ CMS数据库  │   │ 微信API   │   │内容发布记录│
   │(MySQL)   │   │          │   │(MySQL)    │
   └───────────┘   └───────────┘   └───────────┘
```

---

## 完整流程（9步）

### 第1步：话题设定 (RAG 知识库)
**入口**: `scripts/topic-rag.js`  
**输入**: `data/` 目录下的 JSON 话题库  
**逻辑**:
- TF-IDF + 余弦相似度语义搜索
- 7天内话题不重复（历史去重）
- 热度衰减 + 时效加分

**API**: `GET /api/content/topics`  
**Web页面**: `generate.html`

---

### 第2步：标题生成 (AI)
**入口**: `enhanced-engine.js` → `generateTitle(topic)`  
**模型**: DeepSeek (configurable)  
**逻辑**:
- 根据选定话题生成吸引人的标题
- 支持多模型fallback

**API**: `POST /api/content/title`  
**Web页面**: `generate.html`

---

### 第3步：内容生成 (AI 深度写作)
**入口**: `enhanced-engine.js` → `writeArticle(topic)`  
**模型**: DeepSeek v4 Flash  
**输出**: Markdown 格式文章

**API**: `POST /api/content/generate`  
**Web页面**: `generate.html`

---

### 第4步：去 AI 味道 (方法论)
**入口**: `server/routes/content.js` → `/api/deaiify`  
**核心**: 方法论三条铁律
1. **时间感知与真实** - 超30天事件需注明"截至X月"，禁止预测性语句
2. **角度陌生化** - 逆向思考/角色转换
3. **人称与叙事诚意** - 优先"你"作主语，禁止虚构经历

**依赖文件**:
- `prompts/system/methodology-core.txt`
- `services/prompt-builder.js`
- `services/pre-publish-check.js`

**API**: `POST /api/deaiify`  
**Web页面**: `deaiify.html`

---

### 第5步：内容安全检查
**入口**: `scripts/content-safety.js` → `checkContent(title, article)`  
**检查项**:
- 敏感词检测
- 违禁词检测
- 广告法合规

**返回**: `{ level: 'pass' | 'error' | 'block', issues: [] }`

---

### 第6步：格式排版 (Markdown → HTML)
**入口**: `enhanced-engine.js` → `mdToHtml(article)`  
**依赖**: `marked` 库  
**输出**: 微信友好的 HTML（带样式）

---

### 第7步：缩略图匹配与上传
**入口**: `scripts/article-enhancer.js` → `matchThumbnail(title, digest)`  
**流程**:
1. `generateImageKeywords()` - AI 生成英文关键词
2. `searchStockImage(keyword, { source: 'pexels' })` - 从 Pexels API 搜索
3. 降级到 Pixabay API
4. `downloadImage()` - 下载到本地
5. `uploadWechatImage()` - 上传到微信素材库，获取 `media_id`

**配置**: `config/user-config.json` (wechat.thumbMediaId 作为 fallback)

---

### 第8步：发布到微信草稿箱
**入口**: 
- CLI: `enhanced-engine.js` → `publishWechatWithThumb()`
- Web: `server/routes/publish.js` → `/api/publish`

**API**: 微信 `cgi-bin/draft/add`  
**返回**: `{ media_id, errcode }`

---

### 第9步：写入 CMS 数据库
**入口**: `scripts/cms-database.cjs` → `saveArticle()`  
**数据库**: `lvbo_article` 表  
**字段**: title, content, keywords, description, author, typeid 等

---

### 第10步：统计分析
**入口**: `server/routes/stats.js`  
**API**:
- `GET /api/stats/overview` - 统计数据
- `GET /api/stats/publish-logs` - 发布记录

**数据库**: `content_publish_log` 表  

**Web页面**: `stats.html`, `logs.html`

---

## 关键配置文件

### 1. `config/user-config.json`
```json
{
  "wechat": {
    "appId": "wxbe7fd856ee4ae690",
    "appSecret": "...",
    "thumbMediaId": "...",  // 默认缩略图
    "author": "超云艾艾"
  },
  "ai": {
    "apiKey": "sk-...",
    "baseUrl": "https://api.deepseek.com"
  }
}
```

### 2. `.env`
- PEXELS_API_KEY
- PIXABAY_API_KEY
- WECHAT_APPID/WECHAT_SECRET

---

## 运行方式

### CLI 方式（核心引擎）
```bash
cd D:\scsaicms\workbuddy-claw-wechat-publisher
node scripts\enhanced-engine.js
# 或双击 run-engine.bat
```

### Web UI 方式
```bash
cd D:\scsaicms\workbuddy-claw-wechat-publisher\server
node index.js
# 访问 http://localhost:3456
```

---

## 页面与功能对照

| 页面 | 功能 | 对应路由 |
|-----|------|--------|
| index.html | 首页/导航 | - |
| generate.html | 话题选择+生成 | /api/content/* |
| deaiify.html | 去AI味道 | /api/deaiify |
| publish.html | 发布到微信/CMS | /api/publish |
| cms.html | CMS栏目设置 | /api/cms/* |
| stats.html | 统计分析 | /api/stats/* |
| logs.html | 发布记录 | /api/stats/publish-logs |

---

## 数据流向图

```
话题库(RAG)
    ↓
生成标题 (AI)
    ↓
生成文章 (AI)
    ↓
去AI味道 (方法论)
    ↓
安全检查 (content-safety)
    ↓
Markdown→HTML (marked)
    ↓
缩略图匹配 (Pexels/Pixabay)
    ↓
上传微信 (media_id)
    ↓
发布微信草稿箱
    ↓
写入CMS数据库
    ↓
记录发布日志
    ↓
统计展示
```

## 已知问题/待完善

1. **缩略图media_id可能过期** - 需定期更新 `wechat.thumbMediaId`
2. **Python环境缺失** - 某些技能需要
3. **小红书等平台** - 待实现
4. **推送失败重试机制** - 待实现
5. **热点数据源** - 待填充

---

*最后更新: 2026-05-25*