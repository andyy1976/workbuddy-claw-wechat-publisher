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

---
# 微信公众号发布错误日志

## 2026-05-12 08:30

### 错误1: DeepSeek API密钥无效
- **详情**: `Authentication Fails, Your api key: ****4cc2 is invalid`
- **影响**: 无法调用deepseek服务

### 错误2: Astron服务过期
- **详情**: `AppIdNoAuthError: Expired`
- **位置**: astron-code-latest
- **原因**: 服务已过期

### 错误3: 所有Anonymous模型不可用
- **详情**: `请求的模型不存在或暂不可用`
- **影响**: 所有备用模型均无法使用

### 发布结果
- **微信草稿箱**: ❌ 发布失败
- **原因**: 所有AI提供商均不可用
- **状态**: 需要修复AI服务配置后重试

### 修复建议
1. 检查并更新deepseek API密钥
2. 续费astron服务
3. 检查所有anonymous模型的配置

---

## 2026-05-13 08:30

### 错误1: DeepSeek API密钥无效（连续第2天）
- **详情**: `Authentication Fails, Your api key: ****4cc2 is invalid`
- **影响**: 无法调用deepseek服务

### 错误2: Astron服务过期（连续第2天）
- **详情**: `AppIdNoAuthError: Expired`
- **备注**: 标题生成成功，但文章生成时失败

### 错误3: 所有Anonymous模型不可用（连续第2天）
- **详情**: `请求的模型不存在或暂不可用`
- **影响**: 7个备用模型均无法使用

### 发布结果
- **微信草稿箱**: ❌ 发布失败
- **话题**: GPT-6发布：OpenAI的又一次飞跃（热度6万）
- **标题**: 万亿参数、200万上下文：GPT-6这次到底藏了什么惊天秘密？（标题生成成功）
- **状态**: 连续第2天失败

### 修复建议（紧急）
1. 更新 .env 文件中的 DEEPSEEK_API_KEY
2. 续费 astron-code-latest 服务
3. 删除或更新不可用的anonymous模型配置

