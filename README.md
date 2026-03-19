# WorkBuddy 微信公众号发布器

> 每日热点抓取 + 关键词过滤 + AI文章生成 + 一键发布草稿箱

---

## 这是什么？

一个可以帮你**自动生产微信公众号文章**的 CodeBuddy 插件。

你只需要告诉它你关注哪些领域（关键词白名单），它每天帮你：

1. 自动抓取微博/百度热搜
2. 按你的关键词过滤，找最匹配的热点
3. 生成一篇1500字左右的高质量文章
4. 直接发布到你的公众号草稿箱

**适合谁用？**

- 公众号运营者：每天省去选题和初稿时间
- 企业新媒体团队：统一风格，批量生产
- 个人创作者：追热点不再手忙脚乱

---

## 快速开始

### 1. 安装插件

```bash
/plugin marketplace add workbuddy/wechat-publisher-marketplace
/plugin install wechat-publisher
```

### 2. 初始化配置

```
/wx-setup
```

按提示填入：
- 微信公众号 AppID 和 AppSecret（在公众平台 → 设置 → 基本配置中找）
- 封面图素材 MediaID（在公众平台 → 素材管理上传图片获得）
- 你关注的关键词（如：人工智能、机器人、大模型）

### 3. 开始发布

```
/wx-publish
```

搞定！系统自动抓取热点、生成文章、发到草稿箱。

---

## 命令一览

| 命令 | 说明 |
|------|------|
| `/wx-setup` | 初始化/修改配置 |
| `/wx-publish` | 自动发布一篇热点文章 |
| `/wx-hotspot` | 查看今日热点排行 |
| `/wx-diary` | 发布自定义文章/日记 |

---

## 配置文件

安装后，配置保存在插件目录的 `config/user-config.json`：

```json
{
  "wechat": {
    "appId": "wx...",
    "appSecret": "...",
    "thumbMediaId": "...",
    "author": "你的名字"
  },
  "keywords": {
    "primary":   ["人工智能", "AI", "机器人"],
    "secondary": ["互联网", "通信", "5G"],
    "exclude":   ["明星", "娱乐", "八卦"]
  },
  "publish": {
    "targetTime":    "07:00",
    "minHeat":       50000,
    "contentStyle":  "深度分析型"
  }
}
```

**关键词评分规则：**
- 命中 `primary` 关键词：+10分/词
- 命中 `secondary` 关键词：+5分/词
- 命中 `exclude` 关键词：直接过滤

每次发布选取得分最高的热点。

---

## 文章风格

支持4种文章风格（在配置中设置 `contentStyle`）：

| 风格 | 说明 | 适合账号 |
|------|------|---------|
| 深度分析型 | 拆解背后逻辑，有观点有态度 | 科技/商业号 |
| 新闻解读型 | 快速跟进，追求时效 | 资讯号 |
| 观点评论型 | 强烈立场，引发讨论 | 评论号 |
| 科普趣味型 | 轻松易读，降低门槛 | 泛科普号 |

---

## 高级用法

### 发布自定义文章

```
/wx-diary 我的文章标题

文章正文（支持Markdown格式）...
```

### 仅查看热点不发布

```
/wx-hotspot
```

### 直接运行脚本

```bash
# 发布热点文章
node ${CODEBUDDY_PLUGIN_ROOT}/scripts/engine.js

# 仅查看热点
node ${CODEBUDDY_PLUGIN_ROOT}/scripts/engine.js --hotspot

# 验证公众号配置
node ${CODEBUDDY_PLUGIN_ROOT}/scripts/engine.js --validate
```

---

## 常见问题

**Q：AppID 和 AppSecret 在哪里找？**

A：登录[微信公众平台](https://mp.weixin.qq.com) → 设置与开发 → 基本配置 → 开发者ID

**Q：封面图素材ID怎么获取？**

A：公众平台 → 素材管理 → 图片 → 上传图片后，点击图片可以看到 MediaID

**Q：文章发布后在哪里看？**

A：微信公众平台 → 草稿箱，检查无误后手动发布

**Q：关键词没有匹配怎么办？**

A：系统会列出当天所有热点供你手动选择，或者降低 `minHeat` 阈值

---

## 许可证

MIT License - 可自由使用、修改、分发

---

*WorkBuddy 微信公众号发布器 v1.0.0*
