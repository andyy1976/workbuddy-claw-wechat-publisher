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
A[选择发布平台] --> B[加载内容素材]
B --> C[适配平台格式]
C --> D[调用平台API发布]
D --> E[生成发布报告]
```

## 平台适配规则
| 平台 | 内容类型 | 格式要求 | 特殊参数 |
|------|----------|----------|----------|
| 微信公众号 | 图文/素材 | HTML/图片 | 封面图、摘要、原文链接 |
| 小红书 | 图文笔记/短视频 | JPG/PNG/MP4 | 话题标签、@提及、地理位置 |
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
1. **各平台API文档**：
   - 小红书：发布接口、cookie/token获取方式
   - 抖音：视频上传API、挂载参数说明
   - 智能体社区：发布接口、内容分类规范
2. **平台账号认证信息**：用于配置`user-config.json`
3. **发布偏好设置**：默认发布平台、内容同步规则、失败重试策略
