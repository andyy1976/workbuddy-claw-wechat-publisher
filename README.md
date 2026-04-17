# WorkBuddy 微信公众号发布器 v3.0

> 热点采集 → 卡兹克风格AI写作 → 格式优化 → 自动生成封面配图 → 一键发布草稿箱

**完整整合增强版发布系统**：
- 原生支持热点抓取（微博/知乎/B站/小红书）
- 集成「数字生命卡兹克」独家写作风格，产出像真人一样有温度有洞见的公众号长文
- 增强版支持：自动分类标签、内容质量优化、自动生成封面图和内容配图、SEO优化
- 全流程自动化：从markdown直接发布到公众号草稿箱

---

## 这是什么？

一个可以帮你**自动生产微信公众号文章**的工具，集成了数字生命卡兹克独家写作风格。

你只需要告诉它你关注哪些领域（关键词白名单），它每天帮你：

1. 自动抓取微博/知乎/B站/小红书热点
2. 按你的关键词过滤，找最匹配的热点
3. 用卡兹克风格生成一篇3000-5000字的高质量深度文章
4. 直接发布到你的公众号草稿箱

**卡兹克风格特点**：「有见识的普通人在认真聊一件打动他的事」，讲人话、有温度、有洞见、不端着，完全摆脱AI味儿。

**增强版发布特点**：从你写好的markdown文件一键发布，自动帮你生成封面、配图、优化格式、上传素材，完全不需要手动操作。

**适合谁用？**

- 公众号运营者：每天省去选题和排版时间
- 企业新媒体团队：统一风格，批量生产
- 个人创作者/成长日记：追热点或日更，自动化解放双手

---

## 安装方式

> ⚠️ **前置要求**：请确保已安装 [Node.js](https://nodejs.org/) (v14+) 和 Python 3 + pip

---

### 方式一：NPM 安装（推荐 ⭐）

适合：想要快速使用、熟悉 npm 的用户

```bash
# 1. 全局安装
npm install -g workbuddy-claw-wechat-publisher

# 2. 验证安装
wechat-publisher --help

# 3. 安装Python依赖（增强版需要）
cd $(npm root -g)/workbuddy-claw-wechat-publisher
pip install -r requirements.txt

# 4. 初始化配置（首次使用）
wechat-publisher --setup
```

**或者本地安装：**

```bash
# 1. 安装到当前项目
npm install workbuddy-claw-wechat-publisher

# 2. 安装Python依赖
pip install -r node_modules/workbuddy-claw-wechat-publisher/requirements.txt

# 3. 使用 npx 运行
npx wechat-publisher --help
```

---

### 方式二：OpenClaw CLI 安装

适合：使用 OpenClaw 平台的用户

```bash
# 方式 A：从 npm 直接安装
openclaw plugins install workbuddy-claw-wechat-publisher

# 方式 B：本地打包安装
npm run pack  # 生成 workbuddy-claw-wechat-publisher-3.0.0.tgz
openclaw plugins install ./workbuddy-claw-wechat-publisher-3.0.0.tgz

# 方式 C：源码安装
git clone https://github.com/andyy1976/workbuddy-claw-wechat-publisher.git
cd workbuddy-claw-wechat-publisher
npm install
pip install -r requirements.txt
npm link  # 链接到全局
```

---

### 方式三：手动安装（压缩包）

适合：网络受限或离线环境

```bash
# 1. 下载源码
git clone https://github.com/andyy1976/workbuddy-claw-wechat-publisher.git

# 2. 进入目录
cd workbuddy-claw-wechat-publisher

# 3. 安装依赖
npm install
pip install -r requirements.txt

# 4. 链接使用
npm link
```

---

## 安装后验证

无论使用哪种方式安装，运行以下命令验证是否成功：

```bash
# 查看版本和帮助
wechat-publisher --help

# 或使用 node（未link时）
node index.js --help
```

正常情况下会看到：

```
📡 WorkBuddy 微信发布器 v3.0 (Khazix Writer Integrated + 增强发布)

用法:
  node index.js --hotspot        查看今日热点
  node index.js --publish        抓热点→卡兹克风格写文章→发布
  node index.js --validate       验证公众号配置
  node index.js --diary "标题" "正文"  发布自定义文章
  node index.js --enhanced <file> [title]  使用增强版系统发布markdown文件（自动生成封面+配图）

或安装为全局命令: npm link
```

---

## 快速开始

### 1. 初始化配置

```bash
# 命令行初始化
node index.js --setup

# 或手动复制配置模板
cp config/example-config.json config/user-config.json
# 然后编辑 user-config.json 填入你的公众号信息
```

**配置说明：**

```json
{
  "wechat": {
    "appId": "你的AppID",
    "appSecret": "你的AppSecret",
    "thumbMediaID": "默认封面图MediaID",
    "author": "作者名"
  },
  "keywords": {
    "primary": ["人工智能", "机器人", "大模型", "特斯拉", "数字化", "龙虾"],
    "secondary": ["互联网", "通信", "5G", "创业", "转型"],
    "exclude": ["明星", "娱乐", "八卦"]
  },
  "publish": {
    "targetTime": "07:00",
    "minHeat": 50000
  },
  "ai": {
    "provider": "deepseek",
    "model": "deepseek-coder",
    "apiKey": "your-api-key"
  }
}
```

### 2. 查看今日热点

```bash
node index.js --hotspot
```

### 3. 自动抓热点写文章发布（卡兹克风格）

```bash
node index.js --publish
```

### 4. 增强发布 - 发布你写好的markdown文章（自动生成封面+配图）

```bash
# 自动从markdown提取标题（# 开头）
node index.js --enhanced publications/超云艾艾成长日记-Day17.md

# 或手动指定标题
node index.js --enhanced article.md "我的文章标题"
```

---

## 功能对比

| 功能 | 自动热点发布 | 增强markdown发布 |
|------|-------------|-----------------|
| 热点抓取 | ✅ 自动 | ❌ 手动写好 |
| 卡兹克AI写作 | ✅ 自动 | - 已写好 |
| 关键词提取 | ✅ 自动 | ✅ 自动 |
| 自动分类 | ✅ 自动 | ✅ 自动 |
| 内容质量优化 | ✅ 自动 | ✅ 自动 |
| 生成封面图 | ✅ 自动 | ✅ 自动 |
| 生成内容配图 | ❌ | ✅ 自动 |
| 上传图片素材 | ✅ 自动 | ✅ 自动 |
| 发布到草稿箱 | ✅ 自动 | ✅ 自动 |

**增强发布适合**：成长日记、专栏、读书笔记、原创文章，你只需要写好markdown，剩下的全自动化。

**自动发布适合**：热点追踪、每日新闻、行业资讯，全自动从热点到文章。

---

## 命令一览

| 命令 | 说明 |
|------|------|
| `--hotspot` | 查看今日热点 |
| `--publish` | 抓热点→卡兹克风格写文章→发布 |
| `--enhanced <file> [title]` | 增强发布：markdown文件→自动生成封面配图→发布 |
| `--validate` | 验证公众号配置 |
| `--diary "标题" "正文"` | 发布自定义文章 |
| `--setup` | 初始化配置 |
| `--help` | 显示帮助 |

---

## 增强发布工作流程

当你运行 `--enhanced article.md` 时，系统会自动：

1. 📂 **读取文章** - 从markdown文件读取内容，自动提取标题
2. 🔍 **提取关键词** - 根据内容统计关键词频率
3. 🏷️ **生成分类** - 自动匹配技术/产品/运营/商业/职场/生活分类
4. ✨ **优化内容** - 修复标点格式、长段落自动分段、统一引号
5. 🖼️ **生成封面** - 根据标题自动生成PNG格式渐变封面
6. 🎨 **生成配图** - 从关键段落生成3张内容配图
7. 🔍 **SEO元数据** - 生成优化标题和摘要
8. 📝 **Markdown转HTML** - 适配微信公众号显示格式
9. 📤 **上传图片** - 封面和配图全部上传到公众号素材库
10. 🖼️ **插入图片** - 在H2标题后自动插入配图
11. 🚀 **发布草稿箱** - 发布到公众号草稿箱
12. 📝 **记录日志** - 保存发布信息和日志

全程不需要任何手动操作！

---

## 关键词设置

- **primary**（主关键词）：每匹配一个 +10 分
- **secondary**（次关键词）：每匹配一个 +5 分
- **exclude**（排除词）：命中直接过滤

### 微信公众号准备

1. 登录 https://mp.weixin.qq.com
2. 前往「设置与开发 → 基本配置」
3. 获取 AppID 和 AppSecret
4. 前往「素材管理」上传默认封面图，获取 MediaID

---

## 更新日志

### v3.0.0 (2026-04-10)
- ✨ 完整整合增强版发布系统：自动生成封面图 + 内容配图，全流程一步到位
- 🔄 增强发布支持直接发布markdown文件，自动提取关键词、分类、生成SEO元数据
- 🎯 完整保留卡兹克独家写作风格，严格遵循所有写作规则
- 📦 模块化架构：JavaScript引擎 + Python增强发布，可分可合
- 🚀 支持五种使用模式：热点自动发布、增强发布markdown、查看热点、验证配置、发布自定义文章

### v2.0.0 (2026-04-10)
- ✨ 完整集成数字生命卡兹克（khazix-writer）独家写作风格
- 🎯 严格遵循卡兹克所有写作规则，产出完全摆脱AI味儿的真人风格文章
- 🔄 内置四层自检体系，确保风格一致性
- 📝 支持从热点到深度长文全自动化生产
- 🦞 增加龙虾产业数字化场景关联建议

### v1.1.0 (2026-03-19)
- 支持 npm 包格式发布
- 兼容 OpenClaw CLI
- 增加插件宣传语功能

### v1.0.0 (2026-03-17)
- 初始版本
- 热点抓取 + 关键词过滤 + AI写作

---

## 常见问题

**Q1: 增强发布需要安装什么Python依赖？**
```bash
pip install requests Pillow
# 或
pip install -r requirements.txt
```

**Q2: 安装后命令找不到？**
```bash
# Windows PowerShell
refreshenv  # 刷新环境变量

# 或重新打开终端
```

**Q3: 报错 "Module not found"？**
```bash
# 确保已安装Node依赖
npm install
```

**Q4: 如何更新到最新版本？**
```bash
# NPM 方式
npm update -g workbuddy-claw-wechat-publisher

# 源码方式
git pull origin main
npm update
```

**Q5: 配置文件在哪里？**
首次运行 `--setup` 后，配置文件会创建在：
- `config/user-config.json`（本地安装）
- 插件目录下的 `config/user-config.json`

---

## License

MIT

---

## 作者

- GitHub: [@andyy1976](https://github.com/andyy1976)
- 插件市场: [workbuddy-claw-wechat-publisher](https://github.com/andyy1976/workbuddy-claw-wechat-publisher)
