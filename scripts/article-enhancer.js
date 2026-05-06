/**
 * 文章增强模块
 * 功能：生成摘要、匹配缩略图、小红书风格改写
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// 加载 AI 提供者配置
const BASE_DIR = path.join(__dirname, '..');
const AI_PROVIDERS_CONFIG_PATH = path.join(BASE_DIR, 'config', 'ai-providers.json');

function loadAIProviders() {
    try {
        const configContent = fs.readFileSync(AI_PROVIDERS_CONFIG_PATH, 'utf8');
        const config = JSON.parse(configContent);
        const providers = config.providers
            .filter(p => p.enabled !== false)
            .map(p => ({
                ...p,
                apiKey: p.apiKey.replace(/\$\{([^}]+)\}/g, (_, varName) => process.env[varName] || '')
            }))
            .sort((a, b) => (a.priority || 99) - (b.priority || 99));
        return providers;
    } catch (e) {
        console.error('❌ 无法加载 ai-providers.json');
        return [];
    }
}

const AI_PROVIDERS = loadAIProviders();
let currentProviderIndex = 0;

// AI 调用（多模型容错）
async function callAI(prompt, systemPrompt = '', maxTokens = 2000, temperature = 0.7) {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    for (let i = 0; i < AI_PROVIDERS.length; i++) {
        const providerIndex = (currentProviderIndex + i) % AI_PROVIDERS.length;
        const provider = AI_PROVIDERS[providerIndex];

        if (!provider.apiKey || provider.apiKey === '') continue;

        console.log(`🤖 尝试 ${provider.name} (${provider.models[0]})...`);

        try {
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${provider.apiKey}`
            };
            if (provider.headers) {
                Object.assign(headers, provider.headers);
            }

            const resp = await fetch(`${provider.baseUrl}/chat/completions`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: provider.models[0],
                    messages,
                    temperature,
                    max_tokens: maxTokens
                })
            });

            const data = await resp.json();

            if (data.choices && data.choices[0]) {
                console.log(`✅ ${provider.name} 成功`);
                currentProviderIndex = providerIndex;
                return data.choices[0].message.content;
            }

            if (data.error) {
                const errorMsg = data.error.message || 'Unknown error';
                console.log(`❌ ${provider.name} 失败：${errorMsg}`);
                if (errorMsg.includes('balance') || errorMsg.includes('insufficient') || errorMsg.includes('quota') || errorMsg.includes('limit')) {
                    continue;
                }
                throw new Error(`AI 错误 (${provider.name}): ${errorMsg}`);
            }
        } catch (e) {
            console.log(`⚠️  ${provider.name} 调用失败：${e.message}`);
            if (i === AI_PROVIDERS.length - 1) throw e;
        }
    }
}

// ── 生成摘要（200字内）──────────────────────────────────
async function generateSummary(title, content) {
    // 提取前 1500 字作为摘要依据
    const text = content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().substring(0, 1500);
    
    const prompt = `请为以下文章生成一段 150-200 字的摘要，要求：
1. 概括文章核心观点和关键信息
2. 语言简洁有力，有吸引力
3. 不要使用"本文"、"文章"等词
4. 直接输出摘要，不要任何前缀

标题：${title}

内容节选：
${text}`;

    try {
        const summary = await callAI(prompt, '', 300, 0.5);
        // 确保不超过 200 字
        return summary.trim().substring(0, 200);
    } catch (e) {
        console.log('⚠️ 摘要生成失败，使用默认');
        // 降级：直接截取前 180 字
        return text.substring(0, 180) + '...';
    }
}

// ── 从 Pixabay/Pexels 搜索图片 ──────────────────────────
async function searchStockImage(keyword, options = {}) {
    const { source = 'pexels', count = 5 } = options;
    
    // Pixabay API (免费，需要 API key)
    if (source === 'pixabay') {
        const PIXABAY_KEY = process.env.PIXABAY_API_KEY || '';
        if (!PIXABAY_KEY) {
            console.log('⚠️ 未配置 PIXABAY_API_KEY，跳过');
            return [];
        }
        
        try {
            const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(keyword)}&image_type=photo&per_page=${count}&min_width=1200&min_height=630`;
            const resp = await fetch(url);
            const data = await resp.json();
            
            if (data.hits && data.hits.length > 0) {
                return data.hits.map(hit => ({
                    url: hit.largeImageURL,
                    preview: hit.previewURL,
                    width: hit.imageWidth,
                    height: hit.imageHeight,
                    source: 'pixabay',
                    photographer: hit.user,
                    sourceUrl: hit.pageURL
                }));
            }
        } catch (e) {
            console.log('⚠️ Pixabay 搜索失败');
        }
    }
    
    // Pexels API (需要 API key)
    if (source === 'pexels') {
        const PEXELS_KEY = process.env.PEXELS_API_KEY || '';
        if (!PEXELS_KEY) {
            console.log('⚠️ 未配置 PEXELS_API_KEY，跳过');
            return [];
        }
        
        try {
            const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(keyword)}&per_page=${count}&orientation=landscape`;
            const resp = await fetch(url, {
                headers: { 'Authorization': PEXELS_KEY }
            });
            const data = await resp.json();
            
            if (data.photos && data.photos.length > 0) {
                return data.photos.map(photo => ({
                    url: photo.src.large,
                    preview: photo.src.tiny,
                    width: photo.width,
                    height: photo.height,
                    source: 'pexels',
                    photographer: photo.photographer,
                    sourceUrl: photo.url
                }));
            }
        } catch (e) {
            console.log('⚠️ Pexels 搜索失败');
        }
    }
    
    return [];
}

// ── AI 生成缩略图关键词 ──────────────────────────────────
async function generateImageKeywords(title, summary) {
    const prompt = `根据文章标题和摘要，生成 3-5 个适合搜索配图的英文关键词。

标题：${title}
摘要：${summary}

要求：
1. 关键词要具体、视觉化（如 "artificial intelligence", "robot", "coding"）
2. 避免抽象概念（如 "future", "change"）
3. 输出格式：逗号分隔的英文关键词，如 "AI, robot, technology"
4. 只输出关键词，不要其他内容`;

    try {
        const result = await callAI(prompt, '', 100, 0.3);
        return result.trim().split(/[,，]/).map(k => k.trim()).filter(k => k.length > 0);
    } catch (e) {
        console.log('⚠️ 关键词生成失败，使用默认');
        return ['technology', 'AI', 'innovation'];
    }
}

// ── 匹配缩略图 ──────────────────────────────────────────
async function matchThumbnail(title, summary, options = {}) {
    console.log('\n🖼️  匹配缩略图...\n');
    
    // 1. 生成搜索关键词
    const keywords = await generateImageKeywords(title, summary);
    console.log(`   🔑 搜索关键词: ${keywords.join(', ')}`);
    
    // 2. 从图库搜索
    const keyword = keywords[0];
    let images = await searchStockImage(keyword, { source: 'pexels', count: 5 });
    
    if (images.length === 0) {
        images = await searchStockImage(keyword, { source: 'pixabay', count: 5 });
    }
    
    if (images.length > 0) {
        console.log(`   ✅ 找到 ${images.length} 张配图`);
        console.log(`   📷 最佳匹配: ${images[0].source} - ${images[0].photographer}`);
        return images[0];
    }
    
    // 3. 降级：使用默认图片
    console.log('   ⚠️ 未找到合适配图，使用默认');
    return {
        url: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&h=630&fit=crop',
        preview: '',
        width: 1200,
        height: 630,
        source: 'default',
        photographer: 'Unsplash',
        sourceUrl: ''
    };
}

// ── 下载图片 ────────────────────────────────────────────
async function downloadImage(url, savePath) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(savePath);
        
        lib.get(url, (resp) => {
            resp.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve(savePath);
            });
        }).on('error', (e) => {
            fs.unlink(savePath, () => {});
            reject(e);
        });
    });
}

// ── 小红书风格改写 ──────────────────────────────────────
async function rewriteForXiaohongshu(title, content, summary) {
    console.log('\n📝 改写为小红书风格...\n');
    
    // 提取纯文本
    const text = content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    
    const prompt = `将以下文章改写为小红书风格图文笔记。

原标题：${title}
摘要：${summary}
原文内容：${text.substring(0, 3000)}

小红书风格要求：
1. 标题：10-20字，带emoji，吸睛（如"AI编程新纪元🚀 工具在进化，人在..."）
2. 正文：
   - 开头用emoji + 一句话吸引读者
   - 分段清晰，每段2-4句
   - 关键信息用emoji标记（✨ 💡 🔥 ⚡ 等）
   - 适当使用小红书黑话（绝绝子、yyds、冲鸭等，但不过度）
   - 结尾引导互动（"你用过哪个AI工具？评论区聊聊~"）
3. 话题标签：3-5个相关话题（#AI编程 #效率工具 等）
4. 字数控制在 500-800 字

输出格式：
【标题】
标题内容

【正文】
正文内容

【话题】
#话题1 #话题2 #话题3`;

    try {
        const result = await callAI(prompt, '', 1500, 0.7);
        
        // 解析结果
        const titleMatch = result.match(/【标题】\s*\n(.+?)\n/);
        const bodyMatch = result.match(/【正文】\s*\n([\s\S]+?)\n【话题】/);
        const tagsMatch = result.match(/【话题】\s*\n(.+)/);
        
        return {
            title: titleMatch ? titleMatch[1].trim() : title,
            body: bodyMatch ? bodyMatch[1].trim() : summary,
            tags: tagsMatch ? tagsMatch[1].match(/#[^\s#]+/g) || [] : []
        };
    } catch (e) {
        console.log('⚠️ 小红书改写失败，使用简化版');
        
        // 降级：简化处理
        return {
            title: title.substring(0, 18) + ' 🚀',
            body: summary + '\n\n' + text.substring(0, 500) + '...\n\n你有什么看法？评论区聊聊~',
            tags: ['#AI', '#科技', '#效率工具']
        };
    }
}

// ── 导出 ────────────────────────────────────────────────
module.exports = {
    generateSummary,
    matchThumbnail,
    downloadImage,
    rewriteForXiaohongshu,
    callAI
};
