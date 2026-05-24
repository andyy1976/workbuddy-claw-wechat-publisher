/**
 * 提示词构建器 - 方法论增强版
 * 
 * 将角度创新（陌生化）、时效性预防、人称规范嵌入每次生成
 * 同时整合 CMS/PLM 上下文作为动态输入
 */

const path = require('path');
const fs = require('fs');

// ── 加载方法论核心 System Prompt ────────────────────────────────────
let METHODOLOGY_CORE = '';

function loadMethodologyCore() {
    if (METHODOLOGY_CORE) return METHODOLOGY_CORE;
    const f = path.join(__dirname, '..', 'prompts', 'system', 'methodology-core.txt');
    if (fs.existsSync(f)) {
        METHODOLOGY_CORE = fs.readFileSync(f, 'utf8');
        console.log('[PromptBuilder] 方法论核心提示词已加载 (' + METHODOLOGY_CORE.length + ' bytes)');
    } else {
        METHODOLOGY_CORE = '';
        console.warn('[PromptBuilder] 方法论提示词文件不存在: ' + f);
    }
    return METHODOLOGY_CORE;
}

// 获取当前日期
function getCurrentDate() {
    return new Date().toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).replace(/\//g, '年').replace('/', '月').concat('日');
}

// ── 从 CMS 获取上下文 ─────────────────────────────────────────────
/**
 * 从 CMS 获取已发布文章的元数据（角度、风格）用于去重
 * @param {Object} cmsClient - CMS API 客户端（见 server/routes/cms.js）
 * @param {string} categoryId - 栏目ID（可选）
 * @returns {Promise<Object>}
 */
async function fetchCMSContext(cmsClient, categoryId) {
    try {
        const { data } = await cmsClient.get('/articles', {
            params: { limit: 20, status: 'published' }
        });
        const articles = Array.isArray(data) ? data : (data?.data || []);
        return {
            recentAngles: articles.map(a => ({
                title: a.title,
                category: a.category,
                publishedAt: a.publishedAt
            })),
            highPerformingStyles: articles
                .filter(a => (a.readCount || 0) > 1000)
                .map(a => a.style || 'professional')
                .slice(0, 5)
        };
    } catch (e) {
        console.warn('[PromptBuilder] 获取CMS上下文失败:', e.message);
        return { recentAngles: [], highPerformingStyles: [] };
    }
}

// ── 从 PLM 获取产品生命周期上下文 ─────────────────────────────────
/**
 * 从 PLM 获取产品生命周期状态和卖点数据
 * @param {Object} plmClient - PLM API 客户端
 * @param {string} productId - 产品ID
 * @returns {Promise<Object>}
 */
async function fetchPLMContext(plmClient, productId) {
    try {
        const [lifecycle, bom, quality] = await Promise.all([
            plmClient.get('/lifecycle/' + productId).catch(() => null),
            plmClient.get('/bom/' + productId).catch(() => null),
            plmClient.get('/quality/' + productId).catch(() => null)
        ]);
        return {
            lifecycleStage: lifecycle?.data?.stage || 'unknown',
            lifecycleHint: {
                'new': '新品上市期，应侧重"新鲜感"角度，强调首发优势和早期用户反馈',
                'growth': '成长期，应侧重"市场验证"角度，强调应用场景和客户案例',
                'mature': '成熟期，应侧重"深度复盘"角度，强调长期价值和稳定可靠',
                'decline': '衰退期，应侧重"替代升级"角度，引导用户关注新一代产品'
            }[lifecycle?.data?.stage] || '未知生命周期阶段',
            coreSellingPoints: bom?.data?.keyComponents || [],
            qualityMetrics: quality?.data?.metrics || []
        };
    } catch (e) {
        console.warn('[PromptBuilder] 获取PLM上下文失败:', e.message);
        return { lifecycleStage: 'unknown', lifecycleHint: '', coreSellingPoints: [], qualityMetrics: [] };
    }
}

// ── 构建 System Prompt ────────────────────────────────────────────
/**
 * 构建带有方法论三条铁律的 System Prompt
 * @param {Object} options
 * @param {string} options.style - 风格: khazix | professional | casual | technical
 * @param {string} options.platform - 平台: wechat | xiaohongshu | douyin | cms
 * @param {number} options.wordCount - 目标字数
 */
function buildSystemPrompt(options = {}) {
    const { style = 'professional', platform = 'wechat', wordCount = 2000 } = options;
    const methodologyCore = loadMethodologyCore();
    const currentDate = getCurrentDate();

    // 替换 {{current_date}} 占位符
    const systemPrompt = methodologyCore.replace(/\{\{current_date\}\}/g, currentDate);

    // 风格补充提示词
    const stylePrompts = {
        khazix: '\n\n【风格补充：卡兹克风格】\n- 第一人称视角，像科技圈的野区猎手\n- 短句+反问句为主，制造节奏感\n- 善用类比："XX就像XX一样"\n- 敢于表达观点，不圆滑\n- 参考风格：36氪快讯深度版 + 半佛仙人口语化',
        professional: '\n\n【风格补充：专业风格】\n- 行业白皮书面貌，数据和案例密集\n- 逻辑链条清晰，适合技术决策层阅读\n- 参考风格：麦肯锡报告 + 36氪深度',
        casual: '\n\n【风格补充：轻松风格】\n- 像同事在茶水间聊天，适当幽默，会自嘲\n- 用"我们团队踩过的坑"这类表达\n- 参考风格：极客时间 + 刘润5分钟商学院',
        technical: '\n\n【风格补充：硬核技术风格】\n- 架构图/流程图描述为主，代码片段/配置示例\n- 原理级解析，不废话\n- 参考风格：美团技术博客 + 阿里技术'
    };

    // 平台适配
    const platformPrompts = {
        wechat: '\n\n【平台补充：微信公众号】\n- 字数：' + wordCount + '字左右\n- 结构：开头钩子+3-4个核心段落+结尾行动号召\n- 转发钩子：每300字左右插入一个可截图分享的金句\n- 排版：段落间空行，重点加粗',
        xiaohongshu: '\n\n【平台补充：小红书】\n- 字数：500-800字\n- 结构：标题党+emoji密集+分点罗列\n- 语气：姐妹感、亲和力，结尾引导点赞收藏',
        douyin: '\n\n【平台补充：抖音文案】\n- 字数：200-500字\n- 结构：3秒钩子+核心信息+引导互动\n- 适合口播，口语化',
        cms: '\n\n【平台补充：企业官网CMS】\n- 字数：' + wordCount + '字左右\n- 结构：标准产品页，语气正式可信\n- 包含产品参数/特性/应用场景'
    };

    return systemPrompt
        + (stylePrompts[style] || stylePrompts.professional)
        + (platformPrompts[platform] || platformPrompts.wechat);
}

// ── 构建 User Prompt ──────────────────────────────────────────────
/**
 * 构建带有 CMS/PLM 上下文的 User Prompt
 * @param {Object} params
 * @param {string} params.topic - 选题/热点描述
 * @param {string} params.style - 风格
 * @param {string} params.platform - 平台
 * @param {number} params.wordCount - 目标字数
 * @param {Object} params.cmsContext - CMS 上下文
 * @param {Object} params.plmContext - PLM 上下文
 * @param {string} params.goodAngleHint - 知识库"好角度"参考（可选）
 */
function buildUserPrompt(params = {}) {
    const {
        topic,
        style = 'professional',
        platform = 'wechat',
        wordCount = 2000,
        cmsContext = {},
        plmContext = {},
        goodAngleHint = '',
        existingAngles = []
    } = params;

    let sections = [];

    // 任务声明
    sections.push('## 任务\n根据以下选题，按照系统提示中的三条铁律，生成一篇公众号文章。');

    // 选题信息
    sections.push('## 选题信息\n- **选题/热点描述**："' + topic + '"');

    // 目标和风格
    sections.push('\n- **目标平台**：' + platform + '\n- **文章风格**：' + style + '\n- **目标字数**：' + wordCount + '字左右');

    // 可选附加信息
    const optional = [];

    // CMS 上下文
    if (cmsContext.recentAngles && cmsContext.recentAngles.length > 0) {
        const titles = cmsContext.recentAngles.slice(0, 5).map(a => '  - ' + a.title).join('\n');
        optional.push('**同主题已发布过的内容（避免重复角度）**：\n' + titles);
    }
    if (cmsContext.highPerformingStyles && cmsContext.highPerformingStyles.length > 0) {
        optional.push('**高转阅比文章风格参考**：' + cmsContext.highPerformingStyles.join('、'));
    }

    // PLM 上下文
    if (plmContext.lifecycleHint) {
        optional.push('**产品生命周期提示**（' + plmContext.lifecycleStage + '）：' + plmContext.lifecycleHint);
    }
    if (plmContext.coreSellingPoints && plmContext.coreSellingPoints.length > 0) {
        optional.push('**产品核心卖点**：' + plmContext.coreSellingPoints.join('、'));
    }

    // 知识库好角度
    if (goodAngleHint) {
        optional.push('**知识库"好角度"参考**（可选择性使用）：' + goodAngleHint);
    }

    // 避开的角度
    if (existingAngles && existingAngles.length > 0) {
        optional.push('**本次应避开的角度**（历史效果递减）：' + existingAngles.join('、'));
    }

    if (optional.length > 0) {
        sections.push('\n## 可选附加信息（来自CMS/PLM）\n' + optional.map(s => '- ' + s).join('\n'));
    }

    // 格式要求
    sections.push('\n## 格式要求\n- 必须包含一个吸引人的开头（叙事钩子）\n- 必须包含小标题分段\n- 结尾必须有行动号召或升华\n- 如果涉及预测或趋势判断，请以"截至' + getCurrentDate() + '的观察"为前提');

    return sections.join('\n');
}

// ── 构建完整消息数组 ─────────────────────────────────────────────
/**
 * 构建完整的 LLM 消息数组（用于直接传入 callLLM）
 * @param {Object} params - 同 buildUserPrompt
 * @returns {Array<{role: string, content: string}>}
 */
function buildMessages(params) {
    const systemPrompt = buildSystemPrompt(params);
    const userPrompt = buildUserPrompt(params);
    return [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ];
}

// ── 从生成结果中提取并验证自检结果 ──────────────────────────────
/**
 * 从 LLM 输出中解析思维链自检结果
 * @param {string} content - LLM 原始输出
 * @returns {{ angle: string, passed: boolean, checks: Object }}
 */
function parseSelfCheck(content) {
    const checks = { time: false, angle: false, pronoun: false };
    const angleMatch = content.match(/角度自检通过[^\n]*新角度为[：:]([^\n]+)/i);
    const angle = angleMatch ? angleMatch[1].trim() : '';

    if (/时间自检通过/i.test(content)) checks.time = true;
    if (/角度自检通过/i.test(content)) checks.angle = true;
    if (/人称自检通过/i.test(content)) checks.pronoun = true;

    return { angle, passed: checks.time && checks.angle && checks.pronoun, checks };
}

module.exports = {
    loadMethodologyCore,
    buildSystemPrompt,
    buildUserPrompt,
    buildMessages,
    parseSelfCheck,
    getCurrentDate,
    fetchCMSContext,
    fetchPLMContext
};
