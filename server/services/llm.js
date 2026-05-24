/**
 * LLM 服务 - 统一大模型调用层
 *
 * 支持多模型配置(DeepSeek / OpenAI / Claude / 文心一言 / 通义千问 / 等)
 * 自动去AI味处理
 * 自动故障切换
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs');
const promptBuilder = require('./prompt-builder');
const { prePublishCheck } = require('./pre-publish-check');

// ── 模型配置加载 ─────────────────────────────
function loadModels() {
    try {
        const configPath = path.join(__dirname, '..', 'config', 'models.json');
        if (fs.existsSync(configPath)) {
            const models = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            console.log(`[LLM] 已加载 ${Object.keys(models).length} 个模型配置`);
            return models;
        }
    } catch (e) {
        console.log('[LLM] 模型配置加载失败,使用默认配置:', e.message);
    }

    // 默认配置:DeepSeek
    return {
        deepseek: {
            name: 'DeepSeek',
            url: process.env.AI_BASE_URL || 'https://api.deepseek.com/v1/chat/completions',
            key: process.env.AI_API_KEY || '',
            model: process.env.AI_MODEL || 'deepseek-chat',
            enabled: true,
            priority: 1
        }
    };
}

let MODELS = loadModels();

// 重新加载模型配置(供 /api/models 路由调用)
function reloadModels() {
    MODELS = loadModels();
    return MODELS;
}

// 获取启用的模型列表(按优先级排序)
function getEnabledModels() {
    return Object.keys(MODELS)
        .filter(key => MODELS[key].enabled)
        .sort((a, b) => (MODELS[a].priority || 999) - (MODELS[b].priority || 999));
}

// ── 调用 LLM ─────────────────────────────────────
async function callLLM(messages, options = {}) {
    const { model, temperature = 0.7, maxTokens = 2000, provider } = options;

    // 如果指定了 provider,使用指定的模型
    if (provider && MODELS[provider]) {
        console.log(`[LLM] 使用指定模型: ${provider}`);
        return await _callModel(provider, MODELS[provider], messages, { model, temperature, maxTokens });
    }

    // 否则按优先级尝试所有启用的模型
    const enabledProviders = getEnabledModels();
    if (enabledProviders.length === 0) {
        throw new Error('没有启用的模型配置');
    }

    let lastError;
    for (const providerName of enabledProviders) {
        try {
            console.log(`[LLM] 尝试模型: ${providerName}`);
            const result = await _callModel(providerName, MODELS[providerName], messages, { model, temperature, maxTokens });
            console.log(`[LLM] ${providerName} 调用成功`);
            return result;
        } catch (e) {
            console.log(`[LLM] ${providerName} 调用失败:`, e.message);
            lastError = e;
        }
    }

    throw lastError || new Error('所有模型调用失败');
}

// 调用指定模型
async function _callModel(providerName, providerConfig, messages, { model, temperature, maxTokens }) {
    const { url, key, model: defaultModel } = providerConfig;

    if (!key) {
        throw new Error(`${providerName} API Key 未配置`);
    }

    const res = await axios.post(url, {
        model: model || defaultModel,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        },
        timeout: 60000
    });

    return res.data.choices[0].message.content;
}

// ── 企业内容生成(去AI味核心) ────────────────────
const ANTI_AI_SYSTEM = `你是一位资深企业内容总监,拥有10年B2B内容营销经验。

## 你的核心能力
- 将枯燥的产品技术参数转化为有商业价值的内容
- 消除一切"AI生成"的痕迹(避免:首先/其次/总之/值得注意的是/综上所述/在此基础之上)
- 用行业人话写技术文章,而非教科书式的罗列
- 每段都有具体案例或数据支撑,绝不说空话

## 写作禁忌(违反任何一条都不可接受)
❌ "首先...其次...最后..."(典型的AI三段论)
❌ "值得注意的是"
❌ "综上所述"
❌ "在此基础之上"
❌ "随着...的不断发展"
❌ "在...背景下"
❌ "众所周知"
❌ "不言而喻"
❌ "具有重要意义"
❌ "不仅...而且..."(连续出现超过1次)
❌ 任何形式的"总而言之"
❌ 列表后紧跟一句空洞的总结
❌ 每段开头都是主语+动词的八股句式

## 写作要求
✅ 用具体企业场景和数据开头("某汽车零部件厂上线MES后,产能提升了23%")
✅ 观点先行,论据紧随(先说结论,再给证据)
✅ 用类比和比喻解释复杂概念
✅ 适当口语化,像资深工程师在茶歇时跟你聊(非书面公文)
✅ 关键数据用加粗突出
✅ 每段控制在3-5行,短句为主
✅ 结尾要有行动号召或观点回扣`;

/**
 * 企业内容生成
 * @param {Object} params
 * @param {string} params.topic - 内容主题
 * @param {string} params.style - 风格: khazix|professional|casual|technical
 * @param {string} params.platform - 目标平台: wechat|xiaohongshu|douyin|cms
 * @param {Object} params.productData - 产品数据(BOM/工艺/质量)
 * @param {string} params.context - 额外上下文
 * @param {number} params.wordCount - 目标字数
 */
async function generateEnterpriseContent(params) {
    const { topic, style = 'professional', platform = 'wechat', productData, context, wordCount = 2000 } = params;

    // 风格提示词
    const stylePrompts = {
        khazix: `\n\n【卡兹克风格要求】
- 第一人称视角,像科技圈的野区猎手
- 短句+反问句为主,制造节奏感
- 善用类比:"XX就像XX一样"
- 敢于表达观点,不圆滑
- 偶尔冒出行业黑话增加专业感
- 参考风格:36氪快讯的深度版 + 半佛仙人的口语化`,

        professional: `\n\n【专业风格要求】
- 行业白皮书面貌
- 数据和案例密集
- 逻辑链条清晰
- 适合技术决策层阅读
- 参考风格:麦肯锡报告 + 36氪深度`,

        casual: `\n\n【轻松风格要求】
- 像同事在茶水间聊天
- 适当幽默,会自嘲
- 用"我们团队踩过的坑"这类表达
- 适合公众号长文
- 参考风格:极客时间 + 刘润5分钟商学院`,

        technical: `\n\n【硬核技术风格要求】
- 架构图/流程图描述为主
- 代码片段/配置示例
- 原理级解析,不废话
- 适合技术博客/CSDN
- 参考风格:美团技术博客 + 阿里技术`
    };

    // 平台适配
    const platformPrompts = {
        wechat: `目标平台:微信公众号\n- 字数:${wordCount}字左右\n- 结构:开头钩子+3-4个核心段落+结尾行动号召\n- 转发钩子:每300字左右插入一个可截图分享的金句\n- 排版:段落间空行,重点加粗`,
        xiaohongshu: `目标平台:小红书\n- 字数:500-800字\n- 结构:标题党+emoji密集+分点罗列\n- 语气:姐妹感、亲和力\n- 结尾:引导点赞收藏`,
        douyin: `目标平台:抖音文案\n- 字数:200-500字\n- 结构:3秒钩子+核心信息+引导互动\n- 适合口播,口语化`,
        cms: `目标平台:企业官网CMS\n- 字数:${wordCount}字左右\n- 结构:标准产品页\n- 语气:正式、可信\n- 包含产品参数/特性/应用场景`
    };

    // 构建消息
    const productContext = productData
        ? `\n\n【企业产品数据(内容素材来源)】\n${JSON.stringify(productData, null, 2)}\n\n请从以上产品数据中提取关键信息,转化为有商业价值的内容。注意:\n- 不要直接罗列参数,要讲"为什么这个参数重要"\n- BOM数据可以转化为"核心供应链优势"的内容\n- 工艺数据可以转化为"品质保障"的证明\n- 质量数据可以转化为"可靠性背书"`
        : '';

    const messages = [
        { role: 'system', content: ANTI_AI_SYSTEM + (stylePrompts[style] || '') + '\n' + (platformPrompts[platform] || '') },
        { role: 'user', content: `请围绕以下主题撰写一篇内容:\n\n【主题】${topic}\n${productContext}\n${context ? '【补充信息】' + context : ''}` }
    ];

    return await callLLM(messages, { temperature: style === 'khazix' ? 0.85 : 0.7, maxTokens: Math.ceil(wordCount * 1.5) });
}

/**
 * 内容去AI味优化(方法论增强版)
 */
async function deAIify(content, intensity = 'medium') {
    const intensityMap = {
        light: '轻度优化:保留原意,只修正明显的AI痕迹',
        medium: '中度优化:重构AI味的句子结构,增加具体案例,去除套话',
        heavy: '重度优化:完全重写,用人类写作风格,增加个人观点和行业洞察'
    };

    // ── 方法论增强:使用 prompt-builder 构建提示词 ─────────────────────
    const messages = promptBuilder.buildMessages({
        topic: '去AI味优化',
        content: content,
        intensity: intensity,
        style: 'khazix',  // 去AI味默认用卡兹克风格
        wordCount: content.length
    });

    // 在用户消息前增加优化强度说明
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'user') {
        lastMessage.content = intensityMap[intensity] + '\n\n请优化以下内容,去除所有AI痕迹:\n\n---\n' + content + '\n---\n\n请直接输出优化后的内容,不要加任何说明。';
    }

    const optimized = await callLLM(messages, { temperature: 0.6 });
    
    // ── 发布前正则兜底检查 ─────────────────────────────────────
    const checkResult = prePublishCheck(optimized, { topic: '' });
    
    // ✅ 返回优化结果和检查结果
    console.log('[deAIify] 检查结果:', JSON.stringify(checkResult));
    
    return {
      optimized,
      methodologyCheck: {
        passed: checkResult.pass,
        errors: checkResult.errors,
        warnings: checkResult.warnings
      }
    };
}

/**
 * 标题生成
 */
async function generateTitles(content, platform = 'wechat', count = 5) {
    const messages = [
        { role: 'system', content: '你是一位爆款标题专家,擅长为B2B科技内容起标题。' },
        { role: 'user', content: `基于以下内容,生成${count}个适合${platform}平台的标题。\n要求:\n- 有信息量,不标题党\n- 包含数字或具体场景\n- 避免AI常见的"深度解析""全面解读"等套话\n- 长度15-30字\n\n内容摘要:\n${content.substring(0, 500)}\n\n请直接输出标题列表,每行一个,编号:` }
    ];

    return await callLLM(messages, { temperature: 0.9 });
}

/**
 * 对话回复生成
 * @param {Object} params
 * @param {string} params.message - 当前用户消息
 * @param {string} params.context - 历史对话上下文(文本格式)
 * @param {string} params.systemPrompt - 系统提示词
 */
async function generateChatResponse(params) {
    const { message, context, systemPrompt } = params;

    // 构建 messages 数组
    const messages = [];

    // 1. 系统提示词
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    } else {
        messages.push({ role: 'system', content: ANTI_AI_SYSTEM + '\n\n你是一个友好的对话助手,可以回答问题、生成内容、提供建议。' });
    }

    // 2. 历史上下文(如果有)
    if (context) {
        messages.push({ role: 'user', content: `历史对话:\n${context}` });
        messages.push({ role: 'assistant', content: '好的,我了解了之前的对话内容。' });
    }

    // 3. 当前用户消息
    messages.push({ role: 'user', content: message });

    // 调用 LLM
    return await callLLM(messages, { temperature: 0.7, maxTokens: 2000 });
}

module.exports = {
    callLLM,
    generateEnterpriseContent,
    deAIify,
    generateTitles,
    generateChatResponse,
    ANTI_AI_SYSTEM,
    reloadModels,
    getEnabledModels
};
