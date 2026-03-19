/**
 * WorkBuddy 微信公众号发布器 - 核心引擎 v1.1 (CommonJS 兼容版)
 * 
 * 这个文件是 CommonJS 格式，用于兼容 npm 包的默认加载
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// 基础目录 = 项目根目录（index.js 所在目录）
const baseDir = path.dirname(process.argv[1]);

// ── 尝试加载 markdown-to-wechat 排版模块 ──────────────────
let MarkdownToWeChat = null;
try {
    MarkdownToWeChat = require(path.join(baseDir, 'src', 'markdown-to-wechat.js'));
    console.log('✅ 排版模块加载成功（markdown-to-wechat）');
} catch (e) {
    console.warn('⚠️  排版模块未找到，将使用内置 HTML 模板。');
}

// ── 读取配置 ──────────────────────────────────────────────
const configPath = path.join(baseDir, 'config', 'user-config.json');
let config;

try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
    const examplePath = path.join(baseDir, 'config', 'example-config.json');
    try {
        config = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
        console.warn('⚠️  未找到 user-config.json，使用示例配置。请先运行 /wx-setup 完成初始化。');
    } catch {
        console.error('❌ 找不到配置文件，请先运行 /wx-setup 完成初始化。');
        process.exit(1);
    }
}

const { wechat, keywords, publish } = config;

// ── 工具函数 ──────────────────────────────────────────────
function httpGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 WorkBuddy-Publisher/1.1' } }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try { resolve(JSON.parse(d)); } catch { resolve(d); }
            });
        }).on('error', reject);
    });
}

function httpPost(url, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const u = new URL(url);
        const req = https.request({
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
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

// ── 关键词评分 ────────────────────────────────────────────
function keywordScore(text) {
    let score = 0;
    const matched = [];
    for (const kw of (keywords.primary || [])) {
        if (text.includes(kw)) { score += 10; matched.push(kw); }
    }
    for (const kw of (keywords.secondary || [])) {
        if (text.includes(kw)) { score += 5; matched.push(kw); }
    }
    for (const kw of (keywords.exclude || [])) {
        if (text.includes(kw)) { score -= 100; }
    }
    return { score, matched };
}

// ── 抓取热点 ──────────────────────────────────────────────
async function fetchHotspot() {
    try {
        const resp = await httpGet('https://weibo.com/ajax/side/hotSearch');
        if (resp.data && resp.data.realtime) {
            return resp.data.realtime.map(item => ({
                topic: item.word || item.note || '',
                heat: item.raw_hot || item.num || 0,
                source: '微博'
            }));
        }
    } catch { /* 降级 */ }
    return [
        { topic: '千问大模型首发搭载智己LS8', heat: 150000, source: '微博' },
        { topic: 'AI演员 粉丝', heat: 120000, source: '微博' },
        { topic: '北斗导航机器沙漠种树', heat: 610000, source: '微博' },
        { topic: '马斯克对AI公司放狠话', heat: 130000, source: '微博' }
    ];
}

// ── 过滤热点 ──────────────────────────────────────────────
function filterTopics(topics) {
    const minHeat = publish.minHeat || 50000;
    return topics
        .filter(t => t.heat >= minHeat)
        .map(t => {
            const { score, matched } = keywordScore(t.topic);
            return { ...t, score, matched };
        })
        .filter(t => t.score > 0)
        .sort((a, b) => b.score - a.score);
}

// ── 生成文章 HTML ─────────────────────────────────────────
function generateArticleHtml(topic, heat, matchedKws) {
    const mainKw = matchedKws[0] || 'AI';
    const heatWan = Math.floor(heat / 10000);

    return `<section style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;max-width:680px;margin:0 auto;color:#1e293b;">
<p style="font-size:15px;line-height:1.9;color:#374151;background:#f0f7ff;border-left:4px solid #3b82f6;padding:14px 18px;border-radius:0 10px 10px 0;margin:0 0 20px;">
<strong>${topic}</strong>，${heatWan}万人正在讨论。这件事的真正价值，远不止热搜这么简单——它背后藏着一个<strong>正在改变千万中小企业的大趋势</strong>。
</p>
<h2 style="font-size:19px;font-weight:700;color:#1d4ed8;border-left:4px solid #3b82f6;padding-left:12px;margin:28px 0 14px;">发生了什么？</h2>
<p style="font-size:15px;line-height:1.9;color:#374151;margin:12px 0;text-indent:2em;">
近期，关于"${topic}"的话题引发了广泛讨论。事件本身并不复杂，但如果我们拨开表象往深处看，会发现这背后正在发生的，是整个<strong>${mainKw}</strong>领域的一次结构性变化。
</p>
<section style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px 20px;margin:20px 0;">
<p style="font-size:14px;font-weight:700;color:#c2410c;margin:0 0 10px;">📌 核心背景</p>
<p style="font-size:14px;line-height:1.75;color:#374151;margin:0;">2026年是<strong>${mainKw}</strong>从"技术秀场"走向"落地应用"的关键一年。</p>
</section>
<h2 style="font-size:19px;font-weight:700;color:#1d4ed8;border-left:4px solid #3b82f6;padding-left:12px;margin:28px 0 14px;">对中小企业和个人意味着什么？</h2>
<p style="font-size:15px;line-height:1.9;color:#374151;margin:12px 0;text-indent:2em;">
对于大多数中小企业主和个人而言，这件事带来的不是威胁，而是<strong>一个换道超车的窗口期</strong>。大企业有包袱、有惯性，反而是"一无所有"的小企业，能以最小的代价最快地拥抱变化。
</p>
<h2 style="font-size:19px;font-weight:700;color:#1d4ed8;border-left:4px solid #3b82f6;padding-left:12px;margin:28px 0 14px;">现在能做什么？</h2>
<section style="background:linear-gradient(135deg,#eff6ff,#f0fdf4);border:1px solid #bfdbfe;border-radius:12px;padding:16px 20px;margin:20px 0;">
<p style="font-size:14px;font-weight:700;color:#1d4ed8;margin:0 0 10px;">💡 三个马上能做的事</p>
<p style="font-size:14px;line-height:1.8;color:#374151;margin:4px 0;">1. <strong>先了解</strong>：花30分钟读懂这个领域在发生什么</p>
<p style="font-size:14px;line-height:1.8;color:#374151;margin:4px 0;">2. <strong>找一点</strong>：在你的业务里找一个最重复、最耗时的环节</p>
<p style="font-size:14px;line-height:1.8;color:#374151;margin:4px 0;">3. <strong>小步跑</strong>：先跑一个最小可行的实验</p>
</section>
<h2 style="font-size:19px;font-weight:700;color:#1d4ed8;border-left:4px solid #3b82f6;padding-left:12px;margin:28px 0 14px;">写在最后</h2>
<p style="font-size:15px;line-height:1.9;color:#374151;margin:12px 0;text-indent:2em;">
<strong>别等到所有人都上船了，才发现自己还站在岸边。</strong>
</p>
</section>`;
}

// ── 生成标题 ──────────────────────────────────────────────
function generateTitle(topic, heat) {
    const heatWan = Math.floor(heat / 10000);
    const formulas = [
        `${topic}：${heatWan}万人围观背后，藏着一个改变所有人的大趋势`,
        `${topic}，大多数人看到的是热闹，聪明人看到的是机会`,
        `${topic}：这件事正在悄悄重塑你的行业，你感觉到了吗`
    ];
    return formulas[Math.floor(Math.random() * formulas.length)];
}

// ── 获取 Token ────────────────────────────────────────────
async function getToken() {
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${wechat.appId}&secret=${wechat.appSecret}`;
    const resp = await httpGet(url);
    if (!resp.access_token) throw new Error('Token 获取失败: ' + JSON.stringify(resp));
    return resp.access_token;
}

// ── 发布草稿 ──────────────────────────────────────────────
async function publishDraft(title, digest, content) {
    const token = await getToken();
    const author = (wechat.author || 'WorkBuddy').slice(0, 8);
    const url = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`;
    return await httpPost(url, {
        articles: [{
            title,
            author,
            digest,
            content,
            thumb_media_id: wechat.thumbMediaId,
            show_cover_pic: 1,
            need_open_comment: 1,
            only_fans_can_comment: 0
        }]
    });
}

// ── 主流程 ────────────────────────────────────────────────
async function run(mode) {
    if (mode === '--validate') {
        process.stdout.write('🔑 验证 AppID/AppSecret...');
        try {
            await getToken();
            console.log(' ✅ 验证通过！');
        } catch (e) {
            console.log(' ❌ 失败：' + e.message);
            process.exit(1);
        }
        return;
    }

    console.log('\n┌─────────────────────────────────────────┐');
    console.log('│  WorkBuddy 微信发布器 v1.1               │');
    console.log('└─────────────────────────────────────────┘\n');

    console.log('🔍 抓取热点...');
    const rawTopics = await fetchHotspot();

    if (mode === '--hotspot') {
        const sorted = filterTopics(rawTopics);
        console.log(`\n📊 今日热点雷达（关键词过滤后共 ${sorted.length} 条）\n`);
        sorted.slice(0, 10).forEach((t, i) => {
            const heat = (t.heat / 10000).toFixed(0) + '万';
            console.log(`  ${i+1}. ${heat} | ${t.matched.join(',') || '-'} | ${t.topic}`);
        });
        return;
    }

    const filtered = filterTopics(rawTopics);
    if (filtered.length === 0) {
        console.log('⚠️  今日没有匹配关键词的热点');
        return;
    }

    const best = filtered[0];
    console.log(`📰 选题：${best.topic} (${Math.floor(best.heat/10000)}万热度)`);
    console.log(`🎯 命中关键词：${best.matched.join(', ')}\n`);

    console.log('✍️  生成文章...');
    const title = generateTitle(best.topic, best.heat);
    const content = generateArticleHtml(best.topic, best.heat, best.matched);
    const digest = `${best.topic}，${Math.floor(best.heat/10000)}万人关注。`;
    console.log(`📝 标题：${title}\n`);

    console.log('📤 发布到草稿箱...');
    try {
        const resp = await publishDraft(title, digest, content);
        const id = resp.media_id || resp.draft_id;
        if (id || resp.errcode === 0) {
            console.log('\n✅ 发布成功！');
            console.log(`📄 Media ID: ${id || '已入库'}`);
            console.log('🔗 https://mp.weixin.qq.com 草稿箱查看\n');
        } else {
            console.error('❌ 发布失败:', JSON.stringify(resp));
        }
    } catch (e) {
        console.error('❌', e.message);
    }
}

// 支持直接运行和模块导入
module.exports = async function engineEntry(mode) {
    await run(mode);
};

// CLI 模式
if (require.main === module) {
    const mode = process.argv[2] || '';
    run(mode).catch(e => { console.error('❌', e.message); process.exit(1); });
}
