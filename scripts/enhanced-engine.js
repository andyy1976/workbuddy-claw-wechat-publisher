#!/usr/bin/env node
/**
 * WorkBuddy 微信公众号发布器 - 增强版引擎 v6.0
 * 
 * v6 核心升级：话题知识库 RAG 架构
 * 1. TF-IDF + 余弦相似度语义搜索
 * 2. 7天内话题不重复（历史去重）
 * 3. 热度衰减 + 时效加分
 * 4. HN 信号融合搜索
 * 5. DeepSeek 深度写作 + 卡兹克风格
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

// ── 基础路径 ──────────────────────────────────────────────
const BASE_DIR = path.resolve(__dirname, '..');

// ── 加载配置 ──────────────────────────────────────────────
const configPath = path.join(BASE_DIR, 'config', 'user-config.json');
let config;
try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
    console.error('❌ 找不到配置文件');
    process.exit(1);
}
const { wechat, keywords, ai } = config;

// ── RAG 模块 ─────────────────────────────────────────────
const { searchTopics, recordUsage } = require('./topic-rag');
const { checkContent, generateFixReport } = require('./content-safety');
const { saveArticle } = require('./cms-database.cjs');

// ── 常量 ──────────────────────────────────────────────────
const AI_API_KEY = ai.apiKey || 'sk-be1babe391c7428a80eca2b832c44cc2';
const AI_BASE_URL = ai.baseUrl || 'https://api.deepseek.com';
const AI_MODEL = 'deepseek-v4-flash';

// ── AI 多模型配置（从配置文件读取）──────────────────────────
const AI_PROVIDERS_CONFIG_PATH = path.join(BASE_DIR, 'config', 'ai-providers.json');

function loadAIProviders() {
    try {
        const configContent = fs.readFileSync(AI_PROVIDERS_CONFIG_PATH, 'utf8');
        const config = JSON.parse(configContent);
        
        // 替换环境变量
        const providers = config.providers
            .filter(p => p.enabled !== false)
            .map(p => ({
                ...p,
                apiKey: p.apiKey.replace(/\$\{([^}]+)\}/g, (_, varName) => process.env[varName] || '')
            }))
            .sort((a, b) => (a.priority || 99) - (b.priority || 99));
        
        console.log(`📦 加载 AI 提供者: ${providers.map(p => p.name).join(', ')}`);
        return providers;
    } catch (e) {
        console.error('❌ 无法加载 ai-providers.json，使用默认配置');
        return [{
            name: 'deepseek',
            baseUrl: 'https://api.deepseek.com',
            apiKey: AI_API_KEY,
            models: ['deepseek-v4-flash']
        }];
    }
}

const AI_PROVIDERS = loadAIProviders();
let currentProviderIndex = 0;

// ── 网络请求（只访问确认可用的域名）────────────────────────
function httpGet(url, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : require('http');
        const req = lib.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; WorkBuddy/6.0)',
                'Accept': 'application/json, text/*',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout
        }, res => {
            if ([301, 302, 303].includes(res.statusCode) && res.headers.location) {
                return httpGet(res.headers.location, timeout).then(resolve).catch(reject);
            }
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try { resolve(JSON.parse(d)); }
                catch { reject(new Error('JSON解析失败')); }
            });
        });
        req.on('error', () => reject(new Error('NETWORK_TIMEOUT')));
        req.on('timeout', () => { req.destroy(); reject(new Error('NETWORK_TIMEOUT')); });
    });
}

// ── AI 调用（多模型容错） ──────────────────────────────────
async function callAI(prompt, systemPrompt = '', maxTokens = 6000, temperature = 0.7) {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    for (let i = 0; i < AI_PROVIDERS.length; i++) {
        const providerIndex = (currentProviderIndex + i) % AI_PROVIDERS.length;
        const provider = AI_PROVIDERS[providerIndex];

        if (!provider.apiKey || provider.apiKey === '') continue;

        console.log(`🤖 尝试 ${provider.name} (${provider.models[0]})...`);

        try {
            // 构建请求头（支持自定义 headers）
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

                if (errorMsg.includes('balance') || errorMsg.includes('insufficient') || errorMsg.includes('欠费') || errorMsg.includes('quota') || errorMsg.includes('limit')) {
                    console.log(`💰 ${provider.name} 余额不足，尝试下一个模型...`);
                    continue;
                }

                if (resp.status >= 500) {
                    console.log(`⚠️  ${provider.name} 服务端错误，尝试下一个...`);
                    continue;
                }

                throw new Error(`AI 错误 (${provider.name}): ${errorMsg}`);
            }

            throw new Error(`AI 异常 (${provider.name}): ${JSON.stringify(data)}`);

        } catch (e) {
            console.log(`⚠️  ${provider.name} 调用失败：${e.message}`);
            if (i === AI_PROVIDERS.length - 1) throw e;
        }
    }
}
// ── 获取 HN 信号 ─────────────────────────────────────────
async function fetchHNSignals() {
    const queries = [
        { q: 'AI OR artificial intelligence OR LLM OR GPT', tag: 'story' },
        { q: 'robotics OR humanoid robot', tag: 'story' },
        { q: 'open source AI OR DeepSeek OR Mistral OR Llama', tag: 'story' }
    ];

    const signals = [];
    for (const q of queries) {
        try {
            const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q.q)}&tags=${q.tag}&hitsPerPage=5`;
            const resp = await httpGet(url, 10000);
            if (resp.hits) {
                for (const item of resp.hits.slice(0, 3)) {
                    signals.push({
                        topic: item.title || '',
                        heat: (item.points || 0) * 100 + 5000,
                        source: 'HN',
                        commentCount: item.num_comments || 0
                    });
                }
            }
        } catch (e) { /* 静默 */ }
    }
    return signals;
}

// ── RAG 话题选择（核心）──────────────────────────────────
async function selectBestTopic() {
    console.log('\n📡 正在分析热点...\n');

    // 1. 获取 HN 信号
    const hnSignals = await fetchHNSignals();
    const hnCount = hnSignals.length;
    console.log(`   🌐 HN信号: ${hnCount} 条\n`);

    // 2. 构建搜索查询
    const { primary = [], secondary = [] } = keywords;
    const queryKeywords = [...primary, ...secondary].slice(0, 8);

    console.log(`   🔑 关键词: ${primary.slice(0, 3).join(', ')}\n`);

    // 3. RAG 语义搜索
    const results = searchTopics(queryKeywords, hnSignals, 5);

    if (results.length === 0) {
        console.error('❌ 话题库为空或搜索失败');
        process.exit(1);
    }

    // 4. 展示 TOP5 候选
    console.log(`\n📊 话题知识库 TOP5（RAG 语义搜索）\n`);
    console.log('─'.repeat(52));
    results.forEach((t, i) => {
        const tag = i === 0 ? ' ✅' : '  ';
        const recent = t.isRecent ? ' ♻️' : '';
        const ragBadge = `RAG:${t.ragScore} 热:${(t.adjustedHeat / 10000).toFixed(0)}万`;
        console.log(`${tag} 排名${i + 1} | ${ragBadge}${recent}`);
        console.log(`   📌 ${t.topic}`);
        console.log(`   🏷️  ${(t.tags || []).join(', ')} | ${t.category}`);
        console.log('');
    });
    console.log('─'.repeat(52));

    // 5. 选最佳
    const best = results[0];
    console.log(`✅ 选用: ${best.topic}`);
    console.log(`   热度: ${(best.adjustedHeat / 10000).toFixed(0)}万 | 分类: ${best.category} | RAG评分: ${best.ragScore}\n`);

    return best;
}

// ── 生成标题 ──────────────────────────────────────────────
async function generateTitle(topicInfo) {
    const prompt = `根据以下AI话题，生成3个微信公众号爆款标题（中文）：

话题：${topicInfo.topic}
描述：${topicInfo.description || ''}
关键事实：${(topicInfo.keyPoints || []).map(p => '• ' + p).join('\n')}
热度：约${Math.floor(topicInfo.heat / 10000)}万人在关注

要求：
1. 第一条：悬念式+数字式，制造好奇心
2. 第二条：情绪共鸣式，触动读者痛点或爽点
3. 第三条：洞察式，揭示深层本质

格式：每行一个标题，不要编号，不要引号，纯中文，直接输出正文。`;

    try {
        const result = await callAI(prompt, '', 250);
        const titles = result.split('\n').filter(t => t.trim().length > 5).slice(0, 3);
        if (titles.length > 0) {
            return titles[Math.floor(Math.random() * titles.length)].replace(/^[\d\.\)\s]+/, '').trim();
        }
    } catch (e) {
        console.log(`   ⚠️  标题生成失败`);
    }
    return `${topicInfo.topic}：这件事正在悄悄改变一切`;
}

// ── 写作提示词 ───────────────────────────────────────────
function buildWritingPrompt(topicInfo) {
    const heat = Math.floor(topicInfo.heat / 10000);

    return `# 写作任务

## 话题
${topicInfo.topic}

## 背景信息
${topicInfo.description || '（请根据话题自行研究和推理）'}

## 关键事实
${(topicInfo.keyPoints || []).map(p => '• ' + p).join('\n')}

## 热度
约${heat}万人在关注

---

# 卡兹克风格深度长文写作

你是在为「数字生命卡兹克」公众号写一篇让人一口气读完、读完还想转发的文章。目标读者：对中国AI发展感兴趣的普通人，有一定认知但不是专家。

## 开头（前300字是生死线）
开头必须用**叙事启动**或**荒诞事实**或**热点破题**，让读者前3行就停不下来。

禁止的开头模式：
- "随着AI技术的快速发展..." ❌
- "在当今时代..." ❌
- "首先我们来了解一下..." ❌
- "近年来，人工智能..." ❌

好的开头示范：讲一个具体的人/公司/场景的故事；或直接抛出让人"？？？"的真实数据；或说"这件事刷屏了，但问题没那么简单"。

## 正文
**知识是聊着聊着顺手掏出来的，不是写报告。**

每个观点要：
- 有具体细节（谁、做了什么、多少数量）
- 有对比参照（和之前/竞品/国外比怎样）
- 有背后原因（为什么发生）
- 有个人视角（这件事对普通读者意味着什么）

技术内容翻译成人话：不说"5-6万亿参数"，说"大到可以一次读完一整本《战争与和平》还有余"。

要有判断力："坦率讲，我觉得……""但我更关注的是……"

## 结尾
解决两个问题：这件事对读者意味着什么？读者现在能做什么？最后一句要有分量。

## 格式禁令
- 不准用小标题
- 不准用冒号（:）、破折号（——）、双引号（""）
- 不准用"说白了""本质上""换句话说""首先其次最后""综上所述"
- 不准大量加粗
- 段落要短，用逗号制造口语停顿感

## 字数
**4000-5500字。** 不要少于4000字。

## 固定结尾（必须附在文末，仅输出一次）
在文章正文结束后，用分割线 --- 分隔，然后写以下固定结尾：

以上，既然看到这里了，如果觉得不错，随手点个赞、在看、转发三连吧，如果想第一时间收到推送，也可以给我个星标⭐～

谢谢你看我的文章，下次再见。

注意：结尾只能出现一次，不要重复。
直接输出文章正文，不要输出任何说明或元数据。
`;
}

// ── AI 写作 ──────────────────────────────────────────────
async function writeArticle(topicInfo) {
    const systemPrompt = `你是卡兹克，公众号「数字生命卡兹克」的作者，写公众号深度长文。

写作定位：有见识的普通人在认真聊一件打动他的事。
- 讲人话、有温度、有洞见、不端着
- 敢下判断，有明确好恶，不和稀泥
- 知识是聊着顺手掏出来的，不是列知识点
- 结尾要有分量，不能虎头蛇尾
- 严格遵守格式禁令

你是AI和科技领域的深度观察者，关注：大模型、AI编程工具、具身智能、中美AI竞争、科技创业。
写文章的出发点永远是：这件事对普通读者意味着什么，能帮他们做什么决策。`;

    const prompt = buildWritingPrompt(topicInfo);

    console.log('🤖 AI 正在撰写深度文章...\n');
    const content = await callAI(prompt, systemPrompt, 6000, 0.7);
    console.log(`✅ 文章生成完成 (${content.length} 字)\n`);
    return content;
}

// ── Markdown → 微信HTML ─────────────────────────────────
function dedupTail(text) {
    // 去除AI可能生成的重复固定结尾（结尾特征：包含"以上，既然看到这里了"）
    const tailMarker = '以上，既然看到这里了';
    const firstIdx = text.lastIndexOf(tailMarker);
    const secondIdx = text.indexOf(tailMarker);
    if (firstIdx !== secondIdx && firstIdx > secondIdx) {
        // 出现两次以上，只保留第一次出现的完整结尾段
        return text.substring(0, firstIdx).trimEnd();
    }
    return text;
}

function mdToHtml(md) {
    md = dedupTail(md);
    let html = `<section style="font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;max-width:680px;margin:0 auto;color:#1e293b;padding:20px;">`;

    const lines = md
        .replace(/^#+\s+/gm, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`{3,}[\s\S]*?`{3,}/g, '')
        .replace(/`(.+?)`/g, '$1')
        .replace(/\[(.+?)\]\(.+?\)/g, '$1')
        .replace(/^>\s+/gm, '')
        .split('\n');

    let i = 0;
    while (i < lines.length) {
        const line = lines[i].trim();
        if (!line || line.match(/^[-*_]{3,}$/)) { i++; continue; }

        if (line === '---') {
            html += '<p style="margin:24px 0;border-top:1px solid #e5e7eb;"></p>';
            i++; continue;
        }

        if (line.length < 40 && !line.includes('，') && (line.includes('。') || line.includes('！') || line.includes('？'))) {
            html += `<p style="font-size:16px;line-height:1.9;color:#111;margin:16px 0;font-weight:600;">${line}</p>`;
            i++; continue;
        }

        if (line.match(/^\d+[\.、]\s/) || line.match(/^[-●]\s/)) {
            let items = '';
            while (i < lines.length && (lines[i].trim().match(/^\d+[\.、]\s/) || lines[i].trim().match(/^[-●]\s/))) {
                const item = lines[i].trim().replace(/^\d+[\.、]\s/, '').replace(/^[-●]\s/, '');
                items += `<li style="font-size:15px;line-height:1.9;color:#374151;margin:8px 0 8px 20px;">${item}</li>`;
                i++;
            }
            html += `<ul style="padding-left:0;margin:12px 0;">${items}</ul>`;
            continue;
        }

        html += `<p style="font-size:15px;line-height:1.9;color:#374151;margin:12px 0;text-indent:2em;">${line}</p>`;
        i++;
    }

    // 结尾由 AI 在正文中生成，此处不再重复追加
    html += '</section>';

    return html;
}

// ── 发布微信 ──────────────────────────────────────────────
async function publishWechat(title, digest, contentHtml) {
    const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${wechat.appId}&secret=${wechat.appSecret}`;
    let token;
    try {
        const tResp = await httpGet(tokenUrl, 10000);
        if (!tResp.access_token) throw new Error(JSON.stringify(tResp));
        token = tResp.access_token;
    } catch (e) {
        throw new Error('微信Token获取失败: ' + e.message);
    }

    const pubUrl = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`;
    const body = JSON.stringify({
        articles: [{
            title,
            author: wechat.author || '超云艾艾',
            digest: digest.slice(0, 120),
            content: contentHtml,
            thumb_media_id: wechat.thumbMediaId,
            show_cover_pic: 1,
            need_open_comment: 1,
            only_fans_can_comment: 0
        }]
    });

    const resp = await fetch(pubUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    return await resp.json();
}

// ── 上传图片到微信（永久素材）───────────────────────────────
async function uploadWechatImage(filePath, type = 'image') {
    const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${wechat.appId}&secret=${wechat.appSecret}`;
    let token;
    try {
        const tResp = await httpGet(tokenUrl, 10000);
        if (!tResp.access_token) throw new Error(JSON.stringify(tResp));
        token = tResp.access_token;
    } catch (e) {
        throw new Error('微信Token获取失败: ' + e.message);
    }

    // 使用 axios 上传
    const axios = require('axios');
    const FormData = require('form-data');
    const form = new FormData();
    form.append('media', fs.createReadStream(filePath), path.basename(filePath));

    const uploadUrl = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${token}&type=${type}`;
    
    try {
        const resp = await axios.post(uploadUrl, form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        console.log('   微信上传响应:', JSON.stringify(resp.data));
        return resp.data;
    } catch (e) {
        console.log('   微信上传错误:', e.message);
        throw e;
    }
}

// ── 发布微信（带自定义缩略图）──────────────────────────────
async function publishWechatWithThumb(title, digest, contentHtml, thumbMediaId) {
    const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${wechat.appId}&secret=${wechat.appSecret}`;
    let token;
    try {
        const tResp = await httpGet(tokenUrl, 10000);
        if (!tResp.access_token) throw new Error(JSON.stringify(tResp));
        token = tResp.access_token;
    } catch (e) {
        throw new Error('微信Token获取失败: ' + e.message);
    }

    const pubUrl = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`;
    const body = JSON.stringify({
        articles: [{
            title,
            author: wechat.author || '超云艾艾',
            digest: digest.slice(0, 120),
            content: contentHtml,
            thumb_media_id: thumbMediaId,
            show_cover_pic: 1,
            need_open_comment: 1,
            only_fans_can_comment: 0
        }]
    });

    const resp = await fetch(pubUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    return await resp.json();
}

// ── 日志 ──────────────────────────────────────────────────
function saveLog(title, topicId, topic, category, status, words) {
    const logDir = path.join(BASE_DIR, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'enhanced-publish.log');
    const entry = `[${new Date().toLocaleString('zh-CN')}] [${status}] | ${words}字 | [${category}] ${title} | 话题ID:${topicId}\n`;
    fs.appendFileSync(logFile, entry, 'utf8');
}

// ── 主流程 ────────────────────────────────────────────────
async function main() {
    console.log('\n' + '═'.repeat(52));
    console.log('  WorkBuddy 微信公众号发布器 v6.0');
    console.log('  话题知识库 RAG + 深度写作 + 卡兹克风格');
    console.log('═'.repeat(52) + '\n');

    // 1. RAG 话题选择
    const topic = await selectBestTopic();

    // 2. 生成标题
    console.log('✍️  生成标题...\n');
    const title = await generateTitle(topic);
    console.log(`📝 标题: ${title}\n`);

    // 3. 深度写作
    const article = await writeArticle(topic);

    // 4. 内容安全检查
    console.log('🔍 内容安全检查...');
    const safety = checkContent(title, article);
    const safetyReport = generateFixReport(safety);
    console.log(safetyReport);
    
    // 严重违规 → 不发布
    if (safety.level === 'block') {
        console.log('\n🚫 内容存在高风险，暂停发布。请修改后重新运行。\n');
        saveLog(title, topic.id, topic.topic, topic.category, 'BLOCKED', article.length);
        process.exit(1);
    }
    
    if (safety.level === 'error') {
        console.log('\n⚠️  内容存在风险，建议修复后再发布。如需强制发布请手动处理。\n');
    }
    
    // 5. 格式转换
    console.log('📄 转换格式...');
    const contentHtml = mdToHtml(article);
    
    // 生成 AI 摘要（200字内）
    console.log('\n📝 生成摘要...');
    const enhancer = require('./article-enhancer');
    const digest = await enhancer.generateSummary(title, article);
    console.log(`✅ 摘要: ${digest.substring(0, 60)}...`);
    
    // 匹配缩略图
    const thumbnail = await enhancer.matchThumbnail(title, digest);
    const thumbnailPath = path.join(BASE_DIR, 'output', `thumb_${Date.now()}.jpg`);
    let thumbMediaId = wechat.thumbMediaId; // 默认使用配置的缩略图
    let finalContentHtml = contentHtml;
    let useCustomThumb = false;
    
    if (thumbnail.url) {
        try {
            await enhancer.downloadImage(thumbnail.url, thumbnailPath);
            console.log(`📷 缩略图已保存: ${thumbnailPath}`);
            
            // 上传缩略图到微信
            console.log('📤 上传缩略图到微信...');
            const uploadedThumb = await uploadWechatImage(thumbnailPath, 'thumb');
            if (uploadedThumb.media_id) {
                thumbMediaId = uploadedThumb.media_id;
                useCustomThumb = true;
                console.log(`✅ 缩略图已上传: ${thumbMediaId}`);
                
                // 将图片插入到文章开头
                const imgHtml = `<p style="text-align:center;margin:0 0 20px 0;"><img src="${thumbnail.url}" style="max-width:100%;height:auto;border-radius:8px;" alt="${title}"></p>`;
                finalContentHtml = imgHtml + contentHtml;
            } else {
                console.log('⚠️ 缩略图上传失败，使用默认封面');
            }
        } catch (e) {
            console.log('⚠️ 缩略图处理失败:', e.message);
        }
    }

    // 6. 发布微信
    console.log('\n📤 发布到微信公众号草稿箱...\n');
    try {
        let resp;
        if (useCustomThumb) {
            resp = await publishWechatWithThumb(title, digest, finalContentHtml, thumbMediaId);
        } else {
            resp = await publishWechat(title, digest, finalContentHtml);
        }
        const mediaId = resp.media_id || resp.draft_id;

        if (mediaId || resp.errcode === 0) {
            // 记录话题使用历史
            recordUsage(topic.id, title);

            console.log('═'.repeat(52));
            console.log('  ✅ 发布成功！');
            console.log('═'.repeat(52));
            console.log(`📝 标题: ${title}`);
            console.log(`📊 字数: ${article.length}`);
            console.log(`🏷️  分类: ${topic.category}`);
            console.log(`🔢 话题ID: ${topic.id}`);
            console.log(`📄 MediaID: ${mediaId || '已入库'}`);
            console.log(`🔗 https://mp.weixin.qq.com 草稿箱查看`);
            
            // 写入 CMS 数据库
            console.log('\n📦 写入 CMS 数据库...');
            try {
                const cmsResult = await saveArticle({
                    title: title,
                    content: article,
                    keywords: topic.tags || [topic.category],
                    description: digest,
                    author: 'WorkBuddy'
                });
                if (cmsResult.success) {
                    console.log(`   ✅ CMS 文章已入库 (ID: ${cmsResult.aid})`);
                } else {
                    console.log(`   ⚠️  CMS 写入失败: ${cmsResult.error}`);
                }
            } catch(cmsErr) {
                console.log(`   ⚠️  CMS 异常: ${cmsErr.message}`);
            }
            
            console.log('');
            saveLog(title, topic.id, topic.topic, topic.category, 'SUCCESS', article.length);
            
            // ── 多平台发布 ──────────────────────────────────────
            console.log('\n' + '═'.repeat(52));
            console.log('  🚀 启动多平台发布...');
            console.log('═'.repeat(52) + '\n');
            
            try {
                // 动态导入多平台发布器
                const multiPlatform = require('./video-platforms/multi-platform-publisher');
                
                const articleData = {
                    title: title,
                    content: article,
                    summary: digest,
                    topic: topic
                };
                
                // 检查是否启用多平台发布
                const enableMultiPlatform = process.env.ENABLE_MULTI_PLATFORM === 'true';
                
                if (enableMultiPlatform) {
                    await multiPlatform.publishToAllPlatforms(articleData, {
                        publishReddit: true,
                        publishDouyin: false,  // 需要扫码登录，默认关闭
                        publishYouTube: false, // 需要配置 API，默认关闭
                        generateVideo: true,
                        generateManhua: true,
                        generateAIVideo: false // AI 视频生成较慢，默认关闭
                    });
                } else {
                    console.log('⚠️  多平台发布未启用（设置 ENABLE_MULTI_PLATFORM=true 启用）');
                }
            } catch (mpErr) {
                console.log(`⚠️  多平台发布异常: ${mpErr.message}`);
            }
            
            console.error('❌ 发布失败:', JSON.stringify(resp));
            saveLog(title, topic.id, topic.topic, topic.category, 'FAIL', article.length);
        }
    } catch (e) {
        console.error('❌ 发布异常:', e.message);
        saveLog(title, topic.id, topic.topic, topic.category, 'ERROR', article.length);
    }
}

main().catch(e => {
    console.error('\n❌ 发生错误:', e.message);
    saveLog('ERROR', 'N/A', e.message, 'N/A', 'ERROR', 0);
    process.exit(1);
});
