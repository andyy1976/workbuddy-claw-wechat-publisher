/**
 * 文章优化模块 - 与现有微信发布器插件集成
 * 支持内容优化、格式优化、SEO优化
 */

const https = require('https');

// ── AI 配置 ──────────────────────────────────────────────
// 可以从配置文件或环境变量读取
const aiConfig = {
    provider: process.env.AI_PROVIDER || 'deepseek', // deepseek / openai / wenxin
    apiKey: process.env.AI_API_KEY || 'sk-be1babe391c7428a80eca2b832c44cc2',
    baseUrl: process.env.AI_BASE_URL || 'https://api.deepseek.com',
    model: process.env.AI_MODEL || 'deepseek-coder'
};

// ── HTTP 请求函数 ────────────────────────────────────────
function httpPost(url, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const u = new URL(url);
        const req = https.request({
            hostname: u.hostname,
            port: 443,
            path: u.pathname + u.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                ...headers
            }
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try { resolve(JSON.parse(d)); } catch { resolve(d); }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// ── 调用 AI API ─────────────────────────────────────────
async function callAI(prompt, systemPrompt = '') {
    // 确保使用配置的API Key
    const apiKey = aiConfig.apiKey || 'sk-be1babe391c7428a80eca2b832c44cc2';
    
    if (!apiKey) {
        throw new Error('未配置 AI API Key，请设置 AI_API_KEY 环境变量');
    }

    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    let apiUrl, headers = { 'Authorization': `Bearer ${apiKey}` };

    switch (aiConfig.provider) {
        case 'deepseek':
            apiUrl = `${aiConfig.baseUrl || 'https://api.deepseek.com'}/v1/chat/completions`;
            break;
        case 'openai':
            apiUrl = 'https://api.openai.com/v1/chat/completions';
            break;
        case 'wenxin':
            apiUrl = 'https://api.wenxin.baidu.com/v1/chat/completions';
            headers = { 'Authorization': `Bearer ${aiConfig.apiKey}` };
            break;
        default:
            apiUrl = `${aiConfig.baseUrl}/v1/chat/completions`;
    }

    const model = aiConfig.model || (aiConfig.provider === 'deepseek' ? 'deepseek-coder' : 'gpt-3.5-turbo');

    const resp = await httpPost(apiUrl, {
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 4000
    }, headers);

    if (resp.choices && resp.choices[0]) {
        return resp.choices[0].message.content;
    } else if (resp.error) {
        throw new Error(`AI 调用失败: ${resp.error.message}`);
    } else {
        throw new Error(`AI 调用失败: ${JSON.stringify(resp)}`);
    }
}

// ── 内容质量评估 ─────────────────────────────────────────
async function evaluateContentQuality(content, title = '') {
    const prompt = `
请评估以下文章内容的质量，从1-10分打分（10分最高）：

文章标题：${title}

文章内容：
${content.substring(0, 2000)}${content.length > 2000 ? '...' : ''}

请按以下维度评估：
1. 可读性（1-10分）：语言是否流畅，是否容易理解
2. 信息密度（1-10分）：是否有足够的信息量，避免废话
3. 逻辑结构（1-10分）：文章结构是否清晰，是否有逻辑
4. 专业深度（1-10分）：内容是否有深度，是否有专业见解
5. 吸引力（1-10分）：是否吸引读者，是否有亮点

请以JSON格式输出结果：
{
  "readability": 分数,
  "information_density": 分数,
  "logical_structure": 分数,
  "professional_depth": 分数,
  "attractiveness": 分数,
  "overall_score": 平均分数,
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["待改进点1", "待改进点2"],
  "suggestions": ["改进建议1", "改进建议2"]
}
`;

    try {
        const result = await callAI(prompt, '你是一个专业的文章质量评估专家。');
        return JSON.parse(result);
    } catch (error) {
        console.error('AI质量评估失败:', error.message);
        // 返回默认评估结果
        return {
            readability: 6,
            information_density: 5,
            logical_structure: 6,
            professional_depth: 5,
            attractiveness: 5,
            overall_score: 5.4,
            strengths: ['内容完整', '主题明确'],
            weaknesses: ['可读性一般', '深度不足'],
            suggestions: ['增加案例说明', '优化段落结构']
        };
    }
}

// ── 内容优化 ────────────────────────────────────────────
async function optimizeContent(article, options = {}) {
    const { title = '', content = '', keywords = '' } = article;
    const targetPlatform = options.targetPlatform || 'wechat';

    const prompt = `
请优化以下文章内容，使其更适合在${targetPlatform}平台发布：

文章标题：${title}

关键词：${keywords}

原文内容：
${content.substring(0, 3000)}${content.length > 3000 ? '...' : ''}

优化要求：
1. **内容优化**：
   - 提升可读性，使语言更流畅自然
   - 增加信息密度，去除冗余内容
   - 增强逻辑性，使结构更清晰
   - 添加具体案例或数据支持

2. **格式优化**：
   - 优化段落结构，避免过长段落
   - 添加适当的标题层次（H2, H3）
   - 使用列表和重点突出关键信息
   - 优化开头和结尾，增强吸引力

3. **平台适配**：
   - ${targetPlatform === 'wechat' ? '适合微信公众号读者阅读习惯' : '适合文心公众号平台特点'}
   - 使用平台友好的表达方式
   - 考虑平台的内容长度限制

4. **SEO优化**：
   - 自然地融入关键词
   - 优化标题和摘要
   - 增加内部逻辑关联

请直接输出优化后的完整文章内容（保持Markdown格式），不要包含其他说明。
`;

    const systemPrompt = `你是一个专业的文章编辑和优化专家，擅长将普通文章优化为高质量内容。你特别擅长：
1. 提升文章的可读性和吸引力
2. 优化文章结构和逻辑
3. 增加内容的专业深度
4. 适应不同平台的发布要求`;

    try {
        const optimizedContent = await callAI(prompt, systemPrompt);
        
        // 评估优化后的质量
        const originalQuality = await evaluateContentQuality(content, title);
        const optimizedQuality = await evaluateContentQuality(optimizedContent, title);
        
        const improvementPercentage = Math.round(
            (optimizedQuality.overall_score - originalQuality.overall_score) / originalQuality.overall_score * 100
        );
        
        return {
            success: true,
            originalContent: content,
            optimizedContent: optimizedContent,
            originalTitle: title,
            optimizedTitle: title, // 可以在这里优化标题
            improvement: {
                percentage: Math.max(0, improvementPercentage),
                scores: {
                    original: originalQuality.overall_score,
                    optimized: optimizedQuality.overall_score,
                    details: {
                        readability: optimizedQuality.readability - originalQuality.readability,
                        information_density: optimizedQuality.information_density - originalQuality.information_density,
                        logical_structure: optimizedQuality.logical_structure - originalQuality.logical_structure,
                        professional_depth: optimizedQuality.professional_depth - originalQuality.professional_depth,
                        attractiveness: optimizedQuality.attractiveness - originalQuality.attractiveness
                    }
                }
            },
            suggestions: optimizedQuality.suggestions
        };
        
    } catch (error) {
        console.error('内容优化失败:', error.message);
        return {
            success: false,
            error: error.message,
            originalContent: content,
            optimizedContent: content // 失败时返回原文
        };
    }
}

// ── 格式优化 ────────────────────────────────────────────
async function optimizeFormat(article, options = {}) {
    const { content = '', title = '' } = article;
    const targetFormat = options.targetFormat || 'wechat';

    const formatTemplates = {
        wechat: {
            description: '微信公众号格式',
            requirements: [
                '段落简短，每段不超过3-4行',
                '使用###作为标题分隔',
                '重要内容加粗显示',
                '使用数字列表或项目符号',
                '开头有引人入胜的引子',
                '结尾有总结和互动提示'
            ]
        },
        wenxin: {
            description: '文心公众号格式',
            requirements: [
                '段落清晰，适合移动端阅读',
                '标题层次分明',
                '使用适当的空白和分隔',
                '重点内容突出显示',
                '语言风格亲切自然'
            ]
        },
        web: {
            description: '网页文章格式',
            requirements: [
                '使用HTML友好的标题结构',
                '段落之间有适当的间距',
                '使用列表和表格组织内容',
                '内链和外链优化',
                '适合SEO的段落长度'
            ]
        }
    };

    const template = formatTemplates[targetFormat] || formatTemplates.wechat;

    const prompt = `
请将以下文章内容优化为${template.description}：

文章标题：${title}

原文内容：
${content.substring(0, 2500)}${content.length > 2500 ? '...' : ''}

优化要求：
${template.requirements.map((req, i) => `${i+1}. ${req}`).join('\n')}

具体要求：
1. 保持原文的核心内容和意思不变
2. 只优化格式和表达方式
3. 使文章更适合在${template.description}平台发布
4. 输出优化后的完整内容

请直接输出优化后的内容，不要包含其他说明。
`;

    try {
        const optimizedContent = await callAI(prompt, '你是一个专业的文章格式优化专家，擅长根据不同平台的要求调整文章格式。');
        
        return {
            success: true,
            originalContent: content,
            optimizedContent: optimizedContent,
            formatType: targetFormat,
            changes: {
                paragraphCount: optimizedContent.split('\n\n').length,
                hasLists: /^[0-9•\-]/.test(optimizedContent),
                hasHeadings: optimizedContent.includes('###'),
                avgParagraphLength: Math.round(optimizedContent.length / (optimizedContent.split('\n\n').length || 1))
            }
        };
        
    } catch (error) {
        console.error('格式优化失败:', error.message);
        return {
            success: false,
            error: error.message,
            originalContent: content,
            optimizedContent: content
        };
    }
}

// ── SEO 优化 ────────────────────────────────────────────
async function optimizeSEO(article, options = {}) {
    const { title = '', content = '', keywords = '' } = article;
    const targetKeywords = options.keywords || keywords;

    const prompt = `
请对以下文章进行SEO优化：

文章标题：${title}

目标关键词：${targetKeywords}

原文内容：
${content.substring(0, 2000)}${content.length > 2000 ? '...' : ''}

SEO优化要求：
1. **标题优化**：
   - 标题中自然地包含主要关键词
   - 标题有吸引力，能引起点击
   - 长度适中（50-60个字符）

2. **内容优化**：
   - 在文章开头自然地引入关键词
   - 在正文中合理地分布关键词（密度2-3%）
   - 使用相关的长尾关键词
   - 优化段落结构，增加可读性

3. **元数据优化**：
   - 生成一个吸引人的摘要（150字以内）
   - 建议3-5个标签（Tags）
   - 优化URL结构建议

4. **内部链接**：
   - 建议可以内部链接的相关话题
   - 优化锚文本

请以JSON格式输出优化结果：
{
  "optimizedTitle": "优化后的标题",
  "optimizedContent": "优化后的内容",
  "summary": "文章摘要",
  "tags": ["标签1", "标签2", "标签3"],
  "keywordDensity": 关键词密度百分比,
  "suggestedUrl": "建议的URL",
  "internalLinks": [
    {"anchorText": "锚文本", "targetTopic": "目标话题"}
  ]
}
`;

    try {
        const result = await callAI(prompt, '你是一个专业的SEO优化专家，擅长提升文章在搜索引擎中的排名。');
        const seoData = JSON.parse(result);
        
        return {
            success: true,
            originalTitle: title,
            optimizedTitle: seoData.optimizedTitle || title,
            originalContent: content,
            optimizedContent: seoData.optimizedContent || content,
            seoData: {
                summary: seoData.summary,
                tags: seoData.tags || [],
                keywordDensity: seoData.keywordDensity || 0,
                suggestedUrl: seoData.suggestedUrl,
                internalLinks: seoData.internalLinks || []
            }
        };
        
    } catch (error) {
        console.error('SEO优化失败:', error.message);
        return {
            success: false,
            error: error.message,
            originalTitle: title,
            optimizedTitle: title,
            originalContent: content,
            optimizedContent: content
        };
    }
}

// ── 综合优化工作流 ──────────────────────────────────────
async function optimizeArticle(article, options = {}) {
    const optimizationTypes = options.types || ['content', 'format', 'seo'];
    const targetPlatform = options.targetPlatform || 'wechat';
    
    console.log(`🤖 开始优化文章: ${article.title || '无标题文章'}`);
    console.log(`📊 优化类型: ${optimizationTypes.join(', ')}`);
    console.log(`🎯 目标平台: ${targetPlatform}`);
    
    let result = {
        originalArticle: article,
        optimizations: {},
        overallImprovement: 0,
        success: true
    };
    
    let currentContent = article.content || '';
    let currentTitle = article.title || '';
    
    // 按顺序执行优化
    for (const type of optimizationTypes) {
        console.log(`🔄 执行 ${type} 优化...`);
        
        try {
            let optimizationResult;
            
            switch (type) {
                case 'content':
                    optimizationResult = await optimizeContent(
                        { ...article, content: currentContent, title: currentTitle },
                        { targetPlatform }
                    );
                    if (optimizationResult.success) {
                        currentContent = optimizationResult.optimizedContent;
                        currentTitle = optimizationResult.optimizedTitle || currentTitle;
                    }
                    break;
                    
                case 'format':
                    optimizationResult = await optimizeFormat(
                        { ...article, content: currentContent, title: currentTitle },
                        { targetFormat: targetPlatform }
                    );
                    if (optimizationResult.success) {
                        currentContent = optimizationResult.optimizedContent;
                    }
                    break;
                    
                case 'seo':
                    optimizationResult = await optimizeSEO(
                        { ...article, content: currentContent, title: currentTitle, keywords: article.keywords || '' },
                        { keywords: article.keywords || '' }
                    );
                    if (optimizationResult.success) {
                        currentContent = optimizationResult.optimizedContent;
                        currentTitle = optimizationResult.optimizedTitle;
                    }
                    break;
                    
                default:
                    console.warn(`⚠️  未知的优化类型: ${type}`);
                    continue;
            }
            
            result.optimizations[type] = optimizationResult;
            
            if (!optimizationResult.success) {
                console.warn(`⚠️  ${type} 优化失败: ${optimizationResult.error}`);
            } else {
                console.log(`✅ ${type} 优化完成`);
            }
            
        } catch (error) {
            console.error(`❌ ${type} 优化异常:`, error.message);
            result.optimizations[type] = {
                success: false,
                error: error.message
            };
        }
    }
    
    // 计算总体改进
    if (result.optimizations.content && result.optimizations.content.success) {
        result.overallImprovement = result.optimizations.content.improvement?.percentage || 0;
    }
    
    // 最终优化结果
    result.optimizedArticle = {
        ...article,
        title: currentTitle,
        content: currentContent,
        lastOptimized: new Date().toISOString()
    };
    
    console.log(`🎉 文章优化完成，总体改进: ${result.overallImprovement}%`);
    
    return result;
}

// ── 批量优化 ────────────────────────────────────────────
async function optimizeArticlesBatch(articles, options = {}) {
    console.log(`📦 开始批量优化 ${articles.length} 篇文章`);
    
    const results = [];
    const batchSize = options.batchSize || 3;
    const delayBetweenBatches = options.delayBetweenBatches || 1000; // 1秒
    
    for (let i = 0; i < articles.length; i += batchSize) {
        const batch = articles.slice(i, i + batchSize);
        console.log(`🔄 处理批次 ${Math.floor(i/batchSize) + 1} (${batch.length}篇)`);
        
        const batchPromises = batch.map(async (article, index) => {
            try {
                console.log(`  ${i + index + 1}/${articles.length}: ${article.title?.substring(0, 30)}...`);
                const result = await optimizeArticle(article, options);
                return result;
            } catch (error) {
                console.error(`  ❌ 文章 ${i + index + 1} 优化失败:`, error.message);
                return {
                    success: false,
                    originalArticle: article,
                    error: error.message
                };
            }
        });
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // 批次间延迟，避免API限制
        if (i + batchSize < articles.length) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
    }
    
    // 统计结果
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const totalImprovement = successful.reduce((sum, r) => sum + (r.overallImprovement || 0), 0);
    const avgImprovement = successful.length > 0 ? totalImprovement / successful.length : 0;
    
    console.log(`📊 批量优化完成:`);
    console.log(`   ✅ 成功: ${successful.length} 篇`);
    console.log(`   ❌ 失败: ${failed.length} 篇`);
    console.log(`   📈 平均改进: ${avgImprovement.toFixed(1)}%`);
    
    return {
        success: true,
        results: results,
        statistics: {
            total: articles.length,
            successful: successful.length,
            failed: failed.length,
            avgImprovement: avgImprovement,
            totalImprovement: totalImprovement
        }
    };
}

// ── 导出模块 ──────────────────────────────────────────────
module.exports = {
    // 基础函数
    evaluateContentQuality,
    optimizeContent,
    optimizeFormat,
    optimizeSEO,
    
    // 工作流函数
    optimizeArticle,
    optimizeArticlesBatch,
    
    // 配置
    setAIConfig: (config) => {
        Object.assign(aiConfig, config);
    },
    
    // 工具函数
    callAI
};