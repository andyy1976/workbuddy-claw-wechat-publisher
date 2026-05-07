# 内容数字员工平台 v5.0 设计方案

## 产品定位
**面向个人/企业的通用数字内容管理平台** — 集成 3 年自媒体经验，AI 驱动的内容生产系统

## 核心架构（参考 AIHOT）

```
┌─────────────────────────────────────────────────────────────┐
│                    内容数字员工平台                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ 信源管理    │───▶│ AI 处理中心 │───▶│ 内容输出    │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│        │                   │                   │            │
│        ▼                   ▼                   ▼            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ T1 官方源   │    │ 预筛 AI相关性│    │ 精选推荐    │     │
│  │ T1.5 官方社媒│   │ 多维评分    │    │ 日报生成    │     │
│  │ T2 KOL/媒体 │    │ 事件聚类    │    │ 多平台发布  │     │
│  │ T3 行业垂直 │    │ 翻译+摘要   │    │ CMS 集成    │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 一、信源管理系统

### 1.1 信源分层（借鉴 AIHOT）

| 层级 | 说明 | 示例 | 权重 |
|------|------|------|------|
| **T1** | 官方一手信息 | OpenAI Blog、Anthropic Blog、华为公告、宇树官网 | 1.5x |
| **T1.5** | 官方社媒账号 | OpenAI Twitter、小米微博、特斯拉 X | 1.2x |
| **T2** | KOL/专业媒体 | 36氪、机器之心、量子位、科技博主 | 1.0x |
| **T3** | 垂直行业源 | 具身智能社群、汽车之家、CSDN | 0.8x |

### 1.2 已接入信源

- ✅ 微博热搜（T2）
- ✅ 知乎热榜（T2）
- ✅ Reddit 热点（T2-T3）
- ✅ 宇树具身智能社群（T3）
- 🔲 OpenAI Blog（T1）
- 🔲 Anthropic Blog（T1）
- 🔲 Hugging Face（T1.5）
- 🔲 36氪/机器之心（T2）
- 🔲 Product Hunt（T2）

### 1.3 信源配置文件

```json
{
  "sources": [
    {
      "id": "openai-blog",
      "name": "OpenAI Blog",
      "tier": 1,
      "type": "rss",
      "url": "https://openai.com/blog/rss.xml",
      "category": ["AI", "LLM"],
      "enabled": true
    },
    {
      "id": "weibo-hot",
      "name": "微博热搜",
      "tier": 2,
      "type": "api",
      "url": "https://weibo.com/ajax/side/hotSearch",
      "category": ["综合", "社会"],
      "enabled": true
    }
  ]
}
```

## 二、AI 处理中心

### 2.1 处理流程（参考 AIHOT 11 版迭代经验）

```
原始信息 ──▶ 预筛（AI相关性） ──▶ 多维评分 ──▶ 权重计算 ──▶ 精选判断
    │              │                  │              │            │
    │              ▼                  ▼              ▼            ▼
    │         DeepSeek V3         DeepSeek V4    代码公式      阈值过滤
    │         （低成本预筛）        （五维评分）    （可控可调）   （分类阈值）
    │
    └──▶ 翻译+摘要 ──▶ 事件聚类 ──▶ 入库
```

### 2.2 多维评分体系

**五维评分（大模型负责，200行 Prompt）：**

| 维度 | 说明 | 权重 |
|------|------|------|
| **新颖性** | 是否最新发布/首次报道 | 20% |
| **重要性** | 影响范围、行业影响 | 25% |
| **相关性** | 与目标领域的相关度 | 20% |
| **可读性** | 内容质量、信息密度 | 15% |
| **传播性** | 话题性、讨论潜力 | 20% |

**最终权重计算（代码负责，可量化调参）：**

```javascript
finalScore = (
  baseScore * tierWeight *      // 信源权重
  noveltyScore * 0.20 +         // 新颖性
  importanceScore * 0.25 +      // 重要性
  relevanceScore * 0.20 +       // 相关性
  readabilityScore * 0.15 +     // 可读性
  viralScore * 0.20             // 传播性
) * categoryMultiplier          // 分类系数
```

### 2.3 事件聚类系统

**问题**：同一事件被多源报道 → 精选页重复

**解决方案**：
1. Embedding 语义相似度计算
2. 时间窗口聚合（24小时内）
3. 权威源优先原则：官网 > 官推 > KOL > 媒体

```javascript
// 事件簇结构
{
  "clusterId": "evt_20260507_gpt55",
  "mainItem": "OpenAI Blog 发布",  // 最权威源
  "relatedItems": [
    "36氪报道",
    "机器之心解读",
    "奥特曼推文"
  ],
  "category": "模型发布",
  "score": 89
}
```

### 2.4 预筛策略（成本优化）

```javascript
// 第一阶段：规则预筛（免费）
if (isSpam(item) || isDuplicate(item) || isIrrelevantCategory(item)) {
  return; // 直接丢弃
}

// 第二阶段：AI 预筛（低成本模型）
const isAIRelated = await preScreenWithAI(item); // DeepSeek V3
if (!isAIRelated) {
  store(item); // 落库但不评分
  return;
}

// 第三阶段：深度评分（高智力模型）
const scores = await scoreWithAI(item); // DeepSeek V4 Pro
```

## 三、内容输出系统

### 3.1 精选推荐

- 按分类阈值过滤（不同分类不同阈值）
- 实时更新时间线
- 支持用户自定义兴趣标签

### 3.2 AI 日报

- 每日 8:00 自动生成
- 五大版块：模型发布、产品更新、行业动态、论文研究、观点技巧
- 已处理数据直接聚合，无需二次 AI 调用

### 3.3 多平台发布

| 平台 | 内容类型 | 发布方式 |
|------|---------|---------|
| 微信公众号 | 长图文 | Playwright 自动化 |
| 小红书 | 图文笔记 | API / 自动化 |
| 抖音 | 短视频 | API / 自动化 |
| CMS | 企业官网 | 数据库直写 |
| PLM | 产品文档 | API 集成 |

## 四、数据存储

### 4.1 核心表结构

```sql
-- 信源表
CREATE TABLE sources (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(100),
  tier TINYINT,
  type ENUM('rss', 'api', 'html', 'twitter'),
  url VARCHAR(500),
  category JSON,
  enabled BOOLEAN DEFAULT TRUE,
  last_fetch DATETIME
);

-- 内容表
CREATE TABLE contents (
  id VARCHAR(32) PRIMARY KEY,
  source_id VARCHAR(32),
  title VARCHAR(500),
  summary TEXT,
  original_url VARCHAR(500),
  publish_time DATETIME,
  fetch_time DATETIME,
  
  -- AI 处理结果
  is_ai_related BOOLEAN,
  scores JSON,          -- 五维评分
  final_score DECIMAL(5,2),
  is_featured BOOLEAN,  -- 是否精选
  cluster_id VARCHAR(32),
  
  -- 分类标签
  category VARCHAR(50),
  tags JSON,
  
  INDEX idx_score (final_score DESC),
  INDEX idx_featured (is_featured, publish_time DESC)
);

-- 事件簇表
CREATE TABLE event_clusters (
  cluster_id VARCHAR(32) PRIMARY KEY,
  main_content_id VARCHAR(32),
  category VARCHAR(50),
  score DECIMAL(5,2),
  created_at DATETIME
);
```

## 五、API 接口

### 5.1 核心接口

```
GET  /api/featured          # 精选内容列表
GET  /api/daily             # 今日日报
GET  /api/trending          # 趋势话题
POST /api/sources           # 添加信源
GET  /api/sources           # 信源列表
POST /api/score             # 手动评分
GET  /api/search?q=xxx      # 内容搜索
```

### 5.2 Webhook

```
POST /webhook/new-featured  # 新精选通知
POST /webhook/daily-ready   # 日报生成完成
```

## 六、技术栈

| 模块 | 技术选型 |
|------|---------|
| 采集层 | Node.js + Cheerio + Playwright |
| AI 层 | DeepSeek V3（预筛）+ V4 Pro（评分）|
| 向量化 | OpenAI Embedding / 本地模型 |
| 存储 | MySQL + Redis（缓存）|
| API | Express / Fastify |
| 定时 | node-cron |
| 前端 | Vue 3 + Tailwind CSS |

## 七、开发计划

### Phase 1：核心框架（1周）
- [ ] 信源配置系统
- [ ] 采集调度器
- [ ] AI 评分模块
- [ ] 数据库表结构

### Phase 2：AI 处理（1周）
- [ ] 预筛 Prompt 设计
- [ ] 五维评分 Prompt
- [ ] 事件聚类算法
- [ ] 日报生成器

### Phase 3：输出层（1周）
- [ ] 精选 API
- [ ] 日报 API
- [ ] Web 管理界面
- [ ] Webhook 通知

### Phase 4：集成与优化（1周）
- [ ] CMS 集成
- [ ] PLM 数据对接
- [ ] 性能优化
- [ ] 监控告警

## 八、成本估算

**AI 调用成本（每日 500 条）：**
- 预筛：500 × 0.5K tokens × ¥0.001/K = ¥0.25
- 评分：250 × 2K tokens × ¥0.01/K = ¥5.00
- 翻译摘要：250 × 1K tokens × ¥0.01/K = ¥2.50
- **日成本：¥8 / 天 ≈ ¥240 / 月**

**优化方案：**
1. 本地模型预筛（免费）
2. 批量处理减少调用次数
3. 缓存相似内容评分

---

**核心理念**：
> 用代码管控，让 AI 做它最擅长的事（理解语义），其余全部用明确公式计算。  
> 可控、可调、可量化、可回测。
