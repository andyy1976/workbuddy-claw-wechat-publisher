# 微信公众号每日发布错误日志 - 2026-05-06

## 主发布状态
✅ 微信公众号草稿箱发布成功
- 标题：万人疯抢！2026 是 AI 智能体元年，还是你被时代抛弃的倒计时？
- 字数：5351
- MediaID：fOSSI4rB_2kncg_EYxVB_4cJW_rmV6vYJwhI4HdyKXROhQXCkGIJatxz3f5urs8S
- CMS入库ID：1864
- 安全分：97/100

## 多平台发布错误
❌ 多平台发布失败
- 错误原因：Cannot find module 'yargs/yargs'
- 错误堆栈：
  Require stack:
  - D:\.qclaw\workspace\wechat-publisher-plugin\scripts\video-platforms\multi-platform-publisher.js
  - D:\.qclaw\workspace\wechat-publisher-plugin\scripts\enhanced-engine.js
- 影响范围：仅多平台同步发布失败，主公众号草稿箱发布不受影响
- 修复建议：在video-platforms目录下安装yargs依赖：`cd D:\.qclaw\workspace\wechat-publisher-plugin\scripts\video-platforms && npm install yargs`