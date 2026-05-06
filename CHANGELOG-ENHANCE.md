# 2026-05-06 文章增强功能上线

## 目标
为 wechat-publisher-plugin 增加三个功能：
1. 生成 200 字内 AI 摘要
2. 匹配缩略图（Pexels/Pixabay 搜索）
3. 小红书风格改写 + 发布

## 完成内容

### 1. 配置文件独立化
- 创建 `config/ai-providers.json`，支持多模型配置
- 不依赖 OpenClaw 代理，独立运行
- 支持环境变量替换 `${VAR_NAME}`

### 2. 多模型容错机制
- DeepSeek → 讯飞 Astron → 匿名模型链式降级
- 余额不足/限流自动切换
- 已验证：DeepSeek 余额不足时自动切换到 Astron 成功

### 3. 文章增强模块 (`article-enhancer.js`)
- `generateSummary(title, content)` - AI 生成 200 字摘要
- `matchThumbnail(title, summary)` - 从 Pexels/Pixabay 搜索配图
- `downloadImage(url, savePath)` - 下载图片到本地
- `rewriteForXiaohongshu(title, content, summary)` - 改写为小红书风格

### 4. 小红书发布脚本 (`publish-xiaohongshu-enhanced.js`)
- 自动改写文章为小红书风格（emoji、话题标签、互动引导）
- 自动匹配封面图
- Playwright 自动化发布到草稿箱
- 支持扫码登录、cookies 持久化

## 测试结果

**微信公众号发布**（2026-05-06 01:10）：
- ✅ AI 摘要生成成功
- ✅ 缩略图匹配成功（降级使用默认图）
- ✅ 文章发布成功（6378 字，CMS ID: 1856）
- ✅ 多模型容错生效（DeepSeek → Astron）

## 待配置

1. **Pexels API Key**：用于搜索真实配图
   - 添加到 `.env`: `PEXELS_API_KEY=your_key`
   - 免费申请：https://www.pexels.com/api/

2. **Pixabay API Key**：备用图库
   - 当前使用默认 Key，建议替换为自己的

## 文件变更

```
新增：
- config/ai-providers.json (多模型配置)
- scripts/article-enhancer.js (增强模块)
- scripts/publish-xiaohongshu-enhanced.js (小红书发布)

修改：
- scripts/enhanced-engine.js (集成摘要+缩略图)
```

## 下一步

1. 配置 Pexels API Key
2. 测试小红书发布功能
3. 优化图片搜索关键词生成
