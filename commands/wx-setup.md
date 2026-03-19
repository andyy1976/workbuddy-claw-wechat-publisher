---
name: wx-setup
description: 引导用户初始化微信公众号配置，设置 AppID、AppSecret、关键词白名单和发布策略
---

# 微信公众号发布器初始化向导

请引导用户完成以下配置，并将结果写入 `${CODEBUDDY_PLUGIN_ROOT}/config/user-config.json`。

## 初始化步骤

### 第一步：检查现有配置

读取 `${CODEBUDDY_PLUGIN_ROOT}/config/user-config.json`：
- 如果存在，展示当前配置并询问用户是否要修改哪些部分
- 如果不存在，进入全新初始化流程

### 第二步：收集公众号信息

询问用户提供以下信息：

1. **AppID**（必填）：在微信公众平台 → 设置与开发 → 基本配置 → 开发者ID 中找到，格式以 `wx` 开头
2. **AppSecret**（必填）：同页面，32位密钥，若忘记可重置
3. **封面图 MediaID**（必填）：在公众平台 → 素材管理 上传图片后获得
4. **作者名**（可选，默认 `WorkBuddy`）：最多8个字

### 第三步：配置关键词

询问用户的内容定位关键词：

- **主关键词**（每匹配一个加10分）：如 人工智能、机器人、大模型
- **次关键词**（每匹配一个加5分）：如 互联网、通信、5G  
- **排除关键词**（命中则过滤）：如 明星、娱乐、八卦

提示：关键词决定了每天推送的文章方向，建议主关键词不超过10个，聚焦核心领域。

### 第四步：配置发布策略

- **每日定时发布时间**（默认 `07:00`）：推荐早上6-8点，抢占用户早读时段
- **最低热度阈值**（默认 5万）：低于此热度的热点会被忽略
- **文章字数**（默认 1200-2000字）
- **文章风格**：深度分析型 / 新闻解读型 / 观点评论型 / 科普趣味型

### 第五步：写入配置文件

将以上信息按照如下格式写入 `${CODEBUDDY_PLUGIN_ROOT}/config/user-config.json`：

```json
{
  "wechat": {
    "appId": "<用户输入>",
    "appSecret": "<用户输入>",
    "thumbMediaId": "<用户输入>",
    "author": "<用户输入>"
  },
  "keywords": {
    "primary": ["<关键词1>", "<关键词2>"],
    "secondary": ["<关键词1>"],
    "exclude": ["<排除词1>"]
  },
  "publish": {
    "targetTime": "07:00",
    "minHeat": 50000,
    "contentStyle": "深度分析型",
    "minWords": 1200,
    "maxWords": 2000
  }
}
```

### 第六步：验证配置

调用 `node ${CODEBUDDY_PLUGIN_ROOT}/scripts/engine.js --validate` 验证 AppID/AppSecret 是否能正常获取 Access Token：
- ✅ 验证成功：提示"配置完成，运行 /wx-publish 开始发布第一篇文章"
- ❌ 验证失败：提示具体错误，引导用户检查 AppID/AppSecret 是否正确
