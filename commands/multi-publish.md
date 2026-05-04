---
name: multi-publish
description: 一键发布内容至微信公众号、小红书、抖音、智能体探索社区
---

# 多平台一键发布命令

## 功能
支持同时或选择性发布内容到4大平台：
1. **微信公众号**：保留原有发布能力，支持图文/素材上传
2. **小红书**：图文笔记/短视频发布，自动添加话题标签
3. **抖音**：短视频发布，支持挂载产品链接/POI地址
4. **智能体探索社区**：技术向内容发布，支持案例/教程格式

## 前置条件
1. 已在`config/user-config.json`配置各平台认证信息：
   ```json
   {
     "publishPlatforms": {
       "wechat": { "appId": "xxx", "appSecret": "xxx" },
       "xiaohongshu": { "cookie": "xxx", "token": "xxx" },
       "douyin": { "clientKey": "xxx", "clientSecret": "xxx" },
       "agentCommunity": { "apiUrl": "https://your-community.com/api", "token": "xxx" }
     }
   }
   ```
2. 已完成内容创作（执行`content-create`命令）或已有现成内容
3. 各平台API文档已提供（用于对接发布接口）

## 执行流程
```mermaid
graph LR
A[选择发布平台] --> B[检查登录状态]
B --> C[加载内容素材]
C --> D[适配平台格式]
D --> E[预填发布表单]
E --> F[等待用户确认发布]
F --> G[生成发布报告]
```

### 小红书专项流程（参考郭震实测案例）
1. **环境准备**：
   - 加载Chrome扩展：`D:\.qclaw\workspace\wechat-publisher-plugin\extension`（需从xiaohongshu-skills提取扩展目录）
   - 检查Playwright依赖：`npm list playwright`（已内置在package.json）
2. **登录检查**：
   - 执行`node scripts/check-xiaohongshu-login.js`生成二维码
   - 用户扫码后自动保存登录态到`config/xiaohongshu-cookies.json`
3. **内容预填**：
   - 导航到小红书发布页：`https://creator.xiaohongshu.com/publish/publish`
   - 修复页面元素问题：跳过透明度<0.1、z-index<0、移出视口（x<0或y<0）的“上传图文”Tab
   - 自动填写：标题、正文、话题标签、封面图（从`output/content/`读取）
   - 默认设置为「仅自己可见」（测试用）
4. **等待确认**：
   - 预填完成后暂停，提示用户「请检查内容，点击发布按钮完成」
   - 可选：截图保存到`output/publish-screenshots/`

## 平台适配规则
| 平台 | 内容类型 | 格式要求 | 特殊参数 |
|------|----------|----------|----------|
| 微信公众号 | 图文/素材 | HTML/图片 | 封面图、摘要、原文链接 |
| 小红书 | 图文笔记/短视频 | JPG/PNG/MP4 | 话题标签、@提及、地理位置 | 需加载Chrome扩展、跳过透明Tab、仅自己可见测试 |
| 抖音 | 短视频 | MP4(9:16) | 挂载链接、POI、挑战赛 |
| 智能体社区 | 技术文章/案例 | Markdown/HTML | 分类标签、案例参数 |

## 发布报告示例
`output/publish-reports/report_20260429.md`：
```markdown
# 发布报告 2026-04-29 15:30

## 发布内容：智能工业传感器ISC-2000宣传套餐
- 文章：《工业级精度，这款传感器如何帮工厂降本30%？》
- 视频：《60秒看懂智能传感器工作原理》
- BOM清单：BOM_ISC-2000_20260429.xlsx

## 发布结果
| 平台 | 状态 | 链接 | 备注 |
|------|------|------|------|
| 微信公众号 | ✅成功 | https://mp.weixin.qq.com/s/xxx | 阅读量预计500+ |
| 小红书 | ✅成功 | https://www.xiaohongshu.com/explore/xxx | 话题#工业传感器 已添加 |
| 抖音 | ⏳审核中 | - | 视频已上传，等待平台审核 |
| 智能体社区 | ✅成功 | https://agent-community.com/post/xxx | 技术标签已打标 |

## 待办
- 抖音审核通过后截图留存
- 3天后统计各平台数据反馈
```

## 待用户提供
1. **各平台接口信息**：
   - 小红书：Chrome扩展目录（或cookie/token）、发布页最新结构说明
   - 抖音：视频上传API、挂载参数说明
   - 智能体社区：发布接口、内容分类规范
2. **平台账号认证信息**：用于配置`user-config.json`
3. **发布偏好设置**：默认发布平台、内容同步规则、失败重试策略

## 已集成修复逻辑（参考郭震案例）
- 小红书「上传图文」Tab点击修复：过滤透明度<0.1、z-index<0、视口外元素
- Chrome扩展登录态保留：避免重复扫码
- 预填后暂停确认：防止误发布
