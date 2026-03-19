---
name: wx-publish
description: 抓取今日热点，按关键词过滤后生成高质量文章，一键发布到微信公众号草稿箱
---

# 微信公众号热点文章发布

请按照以下步骤完成一次热点文章的生成与发布：

## 执行步骤

1. **读取配置**：读取 `${CODEBUDDY_PLUGIN_ROOT}/config/user-config.json`，获取 AppID、AppSecret、关键词白名单等配置。如果文件不存在，提示用户先运行 `/wx-setup` 完成初始化。

2. **抓取热点**：调用 `${CODEBUDDY_PLUGIN_ROOT}/scripts/fetch-hotspot.js`，从微博热搜、百度热搜抓取当天热点列表。

3. **关键词过滤**：将热点列表与配置中的 `keywords.primary`（权重10分/词）和 `keywords.secondary`（权重5分/词）做匹配，过滤掉 `keywords.exclude` 中的词，按总分从高到低排序，选取得分最高的一条。

4. **生成文章**：根据选中热点，调用 `${CODEBUDDY_PLUGIN_ROOT}/scripts/engine.js`，使用配置中的 `publish.contentStyle`（默认"深度分析型"）生成约1500字的高质量文章，包含：
   - 情绪钩子式开头（高亮引用块）
   - 至少3个带序号的二级标题
   - 数据或对比内容段落
   - 信息提示框（橙色背景）
   - 行动建议框（蓝绿渐变背景）
   - 有力的结尾金句

5. **发布到草稿箱**：调用微信草稿接口 `https://api.weixin.qq.com/cgi-bin/draft/add`，将文章发布。

6. **输出结果**：打印文章标题、选题来源、热度、Media ID，并提示前往 https://mp.weixin.qq.com 草稿箱查看。

## 注意事项

- 若未找到匹配关键词的热点，输出候选列表请用户手动选择
- 作者名最多8个汉字，超出自动截断
- 发布失败时输出完整错误信息，不要静默失败
