# 每日发布错误日志

## 2026-05-19 08:30

### 多平台发布模块错误

**错误信息：**
```
⚠️  多平台发布异常: Cannot find module 'yargs/yargs'
Require stack:
- D:\.qclaw\workspace\wechat-publisher-plugin\scripts\video-platforms\multi-platform-publisher.js
- D:\.qclaw\workspace\wechat-publisher-plugin\scripts\enhanced-engine.js
```

**影响范围：**
- 主任务（微信公众号发布）：✅ 成功
- 多平台发布（视频平台）：❌ 失败

**解决方案：**
需要安装缺少的依赖模块 `yargs`：
```bash
cd D:\.qclaw\workspace\wechat-publisher-plugin
npm install yargs
```

---

## 发布成功详情

**文章信息：**
- 标题：腾讯狂拿16项评测第一的本质：具身智能实现全链路一体化迈入实用阶段
- 字数：5864 字
- 分类：具身智能
- 话题ID：t009
- MediaID：fOSSI4rB_2kncg_EYxVB_5AJ9kVA27IjLG5tPdB9U1hpVqEU3KKLPnLYc5-ui0_y
- 内容安全分：100/100
- CMS入库ID：1841

**AI模型使用：**
- 摘要生成：volcengine-plan (ark-code-latest) - 成功
- 文章写作：volcengine-plan (ark-code-latest) - 成功
- deepseek：失败（API key 无效）

**缩略图：**
- 已匹配并上传成功
- MediaID：fOSSI4rB_2kncg_EYxVB_8fSSAjFNmRxWHvoMoobkg1uHM-DjkTNYd8t6qFBJVIv
