# 每日公众号发布错误日志

## 2026-05-05 09:15

**错误类型**: AI 写作引擎错误

**具体错误**:
- AI话题选择：成功（RAG评分0.85，话题：Claude Code崛起：取代Cursor成为程序员新宠，AI编程进入新纪元）
- 标题生成：失败（⚠️ 标题生成失败，但回退标题正常）
- AI写作：失败
- 错误信息：`AI错误: Insufficient Balance`

**原因分析**: AI API余额不足，无法调用写作服务

**状态**: 发布中断，未完成

---
# 微信公众号发布错误日志

## 2026-05-08 08:30

### 错误1: DeepSeek 余额不足
- **详情**: `Insufficient Balance`
- **影响**: 标题生成和摘要生成均回退到 astron 模型
- **状态**: 自动回退成功，不影响发布

### 错误2: 多平台发布失败
- **详情**: `Cannot find module 'yargs/yargs'`
- **位置**: `D:\.qclaw\workspace\wechat-publisher-plugin\scripts\video-platforms\multi-platform-publisher.js`
- **原因**: yargs 依赖缺失
- **影响**: 多平台分发未能执行
- **修复建议**: 在项目根目录执行 `npm install yargs`

### 发布结果
- **微信草稿箱**: ✅ 发布成功
- **多平台分发**: ❌ 失败
- **文章标题**: 从软件到智能体：AI 进化的终极真相，不是替代而是成为你的超级合伙人
- **字数**: 5839
- **分类**: 行业趋势
- **MediaID**: fOSSI4rB_2kncg_EYxVB_2iuKkJHG0IZcQXjUMFNhvo5N4Ew2pUdnkKY3Ki-I3W-
