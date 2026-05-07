/**
 * AI 处理中心 - 内容数字员工平台 v5.0
 * 
 * 功能：
 * 1. 预筛 AI 相关性（低成本模型）
 * 2. 五维评分（高智力模型）
 * 3. 事件聚类
 * 4. 翻译摘要
 */

const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── 配置 ───────────────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, 'sources-config.json');
let config = null;

function loadConfig() {
    if (!config) {
        config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
    return config;
}

// ── AI 模型配置 ─────────────────────────────────────────
const AI_CONFIG = {
    // 预筛模型（低成本）
    preScreen: {
        model: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com/v1/chat/completions',
        maxTokens: 100
    },
    // 评分模型（高智力）
    scoring: {
        model: 'deepseek-reasoner',
        baseUrl: 'https://api.deepseek.com/v1/chat/completions',
        maxTokens: 500
    }
};

// ── PowerShell HTTP POST ───────────────────────────────
function psPost(url, body, headers) {
    const psScript = path.join(os.tmpdir(), '_ai_post_' + process.pid + '.ps1');
    const psContent = [
        "$ProgressPreference='SilentlyContinue';",
        "$ErrorAction='Stop';",
        "$url=$args[0];",
        "$body=$args[1];",
        "$h=@{",
        "  'Content-Type'='application/json';",
        "  'Authorization'='Bearer ' + $env:DEEPSEEK_API_KEY;",
        "};",
        "try{",
        "  $r=Invoke-WebRequest -Uri $url -Method Post -Body $body -Headers $h -TimeoutSec 60 -UseBasicParsing;",
        "  $r.Content",
        "}catch{Write-Error $_.Exception.Message;exit 1}",
    ].join('\n');
    
    fs.writeFileSync(psScript, psContent, 'utf8');
    
    try {
        const result = execSync(
            `powershell -ExecutionPolicy Bypass -File "${psScript}" "${url}" '${JSON.stringify(body)}'`,
            { encoding: 'utf8', timeout: 90000, maxBuffer: 10 * 1024 * 1024 }
        );
        return JSON.parse(result);
    } finally {
        try { fs.unlinkSync(psScript); } catch (e) {}
    }
}

// ── HTTP POST（直连）───────────────────────────────────
function httpPost(url, body, headers) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const lib = u.protocol === 'https:' ? https : http;
        
        const req = lib.request({
            hostname: u.hostname,
            port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + u.search,
            method: 'POST',
            headers: Object.assign({
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(JSON.stringify(body))
            }, headers || {})
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch { resolve({ raw: data }); }
            });
        });
        
        req.on('error', reject);
        req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
        req.write(JSON.stringify(body));
        req.end();
    });
}

// ── 预筛：判断是否与 AI 相关 ────────────────────────────
async function preScreenAIRelated(title, summary) {
    const prompt = `判断以下内容是否与 AI（人工智能）、机器学习、深度学习、机器人、自动驾驶、大模型等相关。

标题：${title}
摘要：${(summary || '').substring(0, 200)}

只回答：是 或 否`;

    try {
        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            console.log('[WARN] No DEEPSEEK_API_KEY, skip pre-screen');
            return true; // 无 API Key 时默认通过
        }

        const body = {
            model: AI_CONFIG.preScreen.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 10,
            temperature: 0
        };

        const resp = await httpPost(AI_CONFIG.preScreen.baseUrl, body, {
            'Authorization': `Bearer ${apiKey}`
        });

        const answer = (resp.choices?.[0]?.message?.content || '').trim();
        return answer.includes('是');
    } catch (e) {
        console.log('[PreScreen Error]', e.message);
        return true; // 出错时默认通过
    }
}

// ── 五维评分 ───────────────────────────────────────────
async function scoreContent(item) {
    const cfg = loadConfig();
    const template = cfg.scoring.promptTemplate;
    
    const prompt = template
        .replace('{title}', item.title || '')
        .replace('{summary}', (item.summary || item.introduce || '').substring(0, 300))
        .replace('{source}', item.source || item.source_id || '')
        .replace('{category}', (item.category || []).join(', '));

    try {
        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            return ruleBasedScore(item); // 无 API Key 时用规则评分
        }

        const body = {
            model: AI_CONFIG.scoring.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: AI_CONFIG.scoring.maxTokens,
            temperature: 0.3
        };

        const resp = await httpPost(AI_CONFIG.scoring.baseUrl, body, {
            'Authorization': `Bearer ${apiKey}`
        });

        const content = resp.choices?.[0]?.message?.content || '';
        
        // 提取 JSON
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const scores = JSON.parse(jsonMatch[0]);
            return {
                novelty: Math.min(100, Math.max(0, scores.novelty || 50)),
                importance: Math.min(100, Math.max(0, scores.importance || 50)),
                relevance: Math.min(100, Math.max(0, scores.relevance || 50)),
                readability: Math.min(100, Math.max(0, scores.readability || 50)),
                viral: Math.min(100, Math.max(0, scores.viral || 50)),
                reason: scores.reason || ''
            };
        }
        
        return ruleBasedScore(item);
    } catch (e) {
        console.log('[Score Error]', e.message);
        return ruleBasedScore(item);
    }
}

// ── 规则评分（后备方案）───────────────────────────────
function ruleBasedScore(item) {
    const text = ((item.title || '') + ' ' + (item.summary || item.introduce || '')).toLowerCase();
    
    let novelty = 50;
    let importance = 50;
    let relevance = 50;
    let readability = 60;
    let viral = 40;
    
    // AI 相关关键词
    const aiKws = ['ai', '人工智能', '机器学习', '深度学习', 'gpt', 'llm', '大模型', 
                   'openai', 'anthropic', 'claude', '机器人', '具身智能'];
    for (const kw of aiKws) {
        if (text.includes(kw)) relevance += 10;
    }
    
    // 热门话题
    const hotKws = ['发布', '新品', '突破', '首创', '革命', '创新', '最新'];
    for (const kw of hotKws) {
        if (text.includes(kw)) {
            novelty += 8;
            importance += 5;
        }
    }
    
    // 传播性关键词
    const viralKws = ['震惊', '首次', '独家', '揭秘', '必看', '重磅'];
    for (const kw of viralKws) {
        if (text.includes(kw)) viral += 15;
    }
    
    // 信源权重
    const tier = item.tier || 2;
    const tierBonus = { 1: 15, 1.5: 10, 2: 5, 3: 0 };
    importance += tierBonus[tier] || 0;
    
    return {
        novelty: Math.min(100, novelty),
        importance: Math.min(100, importance),
        relevance: Math.min(100, relevance),
        readability: Math.min(100, readability),
        viral: Math.min(100, viral),
        reason: '规则评分'
    };
}

// ── 计算最终得分 ───────────────────────────────────────
function calculateFinalScore(scores, item) {
    const cfg = loadConfig();
    const dims = cfg.scoring.dimensions;
    
    // 五维加权
    let finalScore = 
        scores.novelty * dims.novelty.weight +
        scores.importance * dims.importance.weight +
        scores.relevance * dims.relevance.weight +
        scores.readability * dims.readability.weight +
        scores.viral * dims.viral.weight;
    
    // 信源权重
    const tier = item.tier || 2;
    const tierWeight = cfg.tiers[tier]?.weight || 1.0;
    finalScore *= tierWeight;
    
    // 热度加分
    if (item.heat) {
        const heatBonus = Math.min(10, item.heat / 50000);
        finalScore += heatBonus;
    }
    
    return Math.round(finalScore * 100) / 100;
}

// ── 判断是否精选 ───────────────────────────────────────
function isFeatured(finalScore, category) {
    const cfg = loadConfig();
    const threshold = cfg.categoryThresholds[category] || 50;
    return finalScore >= threshold;
}

// ── 完整处理流程 ───────────────────────────────────────
async function processContent(item) {
    console.log(`[Process] ${item.title?.substring(0, 40)}...`);
    
    // 1. 预筛 AI 相关性（可选）
    // const isRelated = await preScreenAIRelated(item.title, item.summary);
    // if (!isRelated) {
    //     console.log('  [Skip] Not AI related');
    //     return null;
    // }
    
    // 2. 五维评分
    const scores = await scoreContent(item);
    
    // 3. 计算最终得分
    const finalScore = calculateFinalScore(scores, item);
    
    // 4. 判断是否精选
    const featured = isFeatured(finalScore, item.category?.[0] || '综合');
    
    return {
        ...item,
        scores,
        finalScore,
        isFeatured: featured
    };
}

// ── 批量处理 ───────────────────────────────────────────
async function processBatch(items, concurrency) {
    concurrency = concurrency || 3;
    const results = [];
    
    for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const processed = await Promise.all(batch.map(processContent));
        results.push(...processed.filter(Boolean));
        
        // 避免触发 API 限流
        if (i + concurrency < items.length) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    
    // 按最终得分排序
    results.sort((a, b) => b.finalScore - a.finalScore);
    
    return results;
}

// ── 导出 ───────────────────────────────────────────────
module.exports = {
    preScreenAIRelated,
    scoreContent,
    calculateFinalScore,
    isFeatured,
    processContent,
    processBatch,
    ruleBasedScore
};

// ── 测试 ───────────────────────────────────────────────
if (require.main === module) {
    const testItem = {
        title: 'OpenAI 发布 GPT-5，推理能力提升 10 倍',
        summary: 'OpenAI 今日正式发布 GPT-5 模型，在复杂推理、多模态理解方面取得重大突破...',
        source: 'OpenAI Blog',
        tier: 1,
        category: ['AI'],
        heat: 100000
    };
    
    processContent(testItem).then(result => {
        console.log('\n=== 测试结果 ===');
        console.log('标题:', result.title);
        console.log('评分:', result.scores);
        console.log('最终得分:', result.finalScore);
        console.log('是否精选:', result.isFeatured);
    }).catch(console.error);
}
