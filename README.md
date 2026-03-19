# WorkBuddy 微信公众号发布器

> 每日热点抓取 + 关键词过滤 + AI文章生成 + 一键发布草稿箱

---

## 这是什么？

一个可以帮你**自动生产微信公众号文章**的工具。

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

## 安装方式

> ⚠️ **前置要求**：请确保已安装 [Node.js](https://nodejs.org/) (v14+) 和 [Git](https://git-scm.com/)

---

### 方式一：NPM 安装（推荐 ⭐）

适合：想要快速使用、熟悉 npm 的用户

```bash
# 1. 全局安装
npm install -g workbuddy-claw-wechat-publisher

# 2. 验证安装
wechat-publisher --help

# 3. 初始化配置（首次使用）
wechat-publisher --setup
```

**或者本地安装：**

```bash
# 1. 安装到当前项目
npm install workbuddy-claw-wechat-publisher

# 2. 使用 npx 运行
npx wechat-publisher --help

# 3. 或添加脚本到 package.json
```

---

### 方式二：OpenClaw CLI 安装

适合：使用 OpenClaw 平台的用户

```bash
# 方式 A：从 npm 直接安装
openclaw plugins install workbuddy-claw-wechat-publisher

# 方式 B：本地 tarball 安装
npm run pack  # 生成 workbuddy-claw-wechat-publisher-1.1.0.tgz
openclaw plugins install ./workbuddy-claw-wechat-publisher-1.1.0.tgz

# 方式 C：源码安装
git clone https://github.com/andyy1976/workbuddy-claw-wechat-publisher.git
cd workbuddy-claw-wechat-publisher
npm install
npm link  # 链接到全局
```

---

### 方式三：CodeBuddy/WorkBuddy 插件市场

适合：使用 CodeBuddy/WorkBuddy IDE 的用户

```bash
# 1. 添加插件市场（如果还没添加）
/plugin marketplace add andyy1976/workbuddy-claw-wechat-publisher

# 2. 安装插件
/plugin install wechat-publisher@andyy1976/workbuddy-claw-wechat-publisher

# 3. 在 IDE 侧边栏找到插件并使用
```

---

### 方式四：手动安装（压缩包）

适合：网络受限或离线环境

```bash
# 1. 下载插件
git clone https://github.com/andyy1976/workbuddy-claw-wechat-publisher.git

# 2. 进入目录
cd workbuddy-claw-wechat-publisher

# 3. 安装依赖
npm install

# 4. 链接使用
npm link
```

---

## 安装后验证

无论使用哪种方式安装，运行以下命令验证是否成功：

```bash
# 查看版本和帮助
wechat-publisher --help

# 或使用 npx（如果没全局链接）
npx wechat-publisher --help
```

正常情况下会看到：

```
微信公众号智能发布器 v1.1.0

用法: wechat-publisher [选项]

选项:
  --hotspot, -h     查看今日热点
  --publish, -p     抓取热点并生成文章
  --diary <file>   发布自定义文章
  --setup          初始化配置
  --validate       验证配置
  --help           显示帮助
```

---

## 常见问题

### Q1: 安装后命令找不到？

```bash
# Windows PowerShell
refreshenv  # 刷新环境变量

# 或重新打开终端
```

### Q2: 报错 "Module not found"？

```bash
# 确保已安装依赖
npm install
```

### Q3: 如何更新到最新版本？

```bash
# NPM 方式
npm update -g workbuddy-claw-wechat-publisher

# 源码方式
git pull origin main
npm update
```

### Q4: 配置文件在哪里？

首次运行 `--setup` 后，配置文件会创建在：
- `config/user-config.json`（本地安装）
- 插件目录下的 `config/user-config.json`

---

## 快速开始

### 1. 初始化配置

```bash
# 方式一：命令行
node index.js --setup

# 方式二：复制配置模板
cp config/example-config.json config/user-config.json
# 然后编辑 user-config.json 填入你的公众号信息
```

**配置说明：**

```json
{
  "wechat": {
    "appId": "你的AppID",
    "appSecret": "你的AppSecret",
    "thumbMediaID": "封面图MediaID",
    "author": "作者名"
  },
  "keywords": {
    "primary": ["人工智能", "机器人", "大模型", "特斯拉"],
    "secondary": ["互联网", "通信", "5G"],
    "exclude": ["明星", "娱乐", "八卦"]
  },
  "publish": {
    "targetTime": "07:00",
    "minHeat": 50000
  }
}
```

### 2. 查看热点

```bash
node index.js --hotspot
```

### 3. 发布文章

```bash
node index.js --publish
```

### 4. 发布自定义文章

```bash
node index.js --diary "文章标题" "文章正文"
```

---

## 命令一览

| 命令 | 说明 |
|------|------|
| `--hotspot` | 查看今日热点 |
| `--publish` | 抓热点→写文章→发布 |
| `--validate` | 验证公众号配置 |
| `--diary "标题" "正文"` | 发布自定义文章 |
| `--setup` | 初始化配置 |

---

## 配置说明

### 关键词设置

- **primary**（主关键词）：每匹配一个 +10 分
- **secondary**（次关键词）：每匹配一个 +5 分
- **exclude**（排除词）：命中直接过滤

### 微信公众号准备

1. 登录 https://mp.weixin.qq.com
2. 前往「设置与开发 → 基本配置」
3. 获取 AppID 和 AppSecret
4. 前往「素材管理」上传封面图，获取 MediaID

---

## 更新日志

### v1.1.0 (2026-03-19)
- 支持 npm 包格式发布
- 兼容 OpenClaw CLI
- 增加插件宣传语功能

### v1.0.0 (2026-03-17)
- 初始版本
- 热点抓取 + 关键词过滤 + AI写作

---

## License

MIT

---

## 作者

- GitHub: [@andyy1976](https://github.com/andyy1976)
- 插件市场: [workbuddy-claw-wechat-publisher](https://github.com/andyy1976/workbuddy-claw-wechat-publisher)
