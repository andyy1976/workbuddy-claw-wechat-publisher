/**
 * WorkBuddy 微信公众号发布器 - 核心引擎 v1.1
 *
 * 用法：
 *   node engine.js              # 抓取热点 → 生成文章 → 发布草稿箱
 *   node engine.js --validate   # 仅验证 AppID/AppSecret 是否有效
 *   node engine.js --hotspot    # 仅抓取热点列表并打印
 *   node engine.js --diary "标题" "正文内容"   # 发布自定义文章
 *
 * 依赖：
 *   - ../src/markdown-to-wechat.js  （Markdown→微信HTML排版，仓库已有）
 *   - ../config/user-config.json    （用户配置，首次使用前由 /wx-setup 生成）
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ── 尝试加载 markdown-to-wechat 排版模块 ──────────────────
let MarkdownToWeChat = null;
try {
    MarkdownToWeChat = require(path.join(__dirname, '..', 'src', 'markdown-to-wechat.js'));
    console.log('✅ 排版模块加载成功（markdown-to-wechat）');
} catch (e) {
    console.warn('⚠️  排版模块未找到，将使用内置 HTML 模板。');
    console.warn('   提示：运行 npm install 安装依赖后可使用专业排版。');
}

// ── 读取配置 ──────────────────────────────────────────────
const configPath = path.join(__dirname, '..', 'config', 'user-config.json');
let config;

try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
    const examplePath = path.join(__dirname, '..', 'config', 'example-config.json');
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

    // 降级预置热点
    return [
        { topic: '北斗导航机器挖坑在沙漠5秒种1棵树', heat: 610000, source: '微博' },
        { topic: '马斯克对所有人工智能公司放狠话', heat: 130000, source: '微博' },
        { topic: 'AI大厂月薪3万疯抢文科生', heat: 90000, source: '微博' },
        { topic: '特斯拉人形机器人新进展', heat: 75000, source: '微博' },
        { topic: '中国AI大模型再突破', heat: 60000, source: '微博' }
    ];
}

// ── 过滤并排序热点 ────────────────────────────────────────
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

// ── 生成文章 Markdown（后续由排版模块转 HTML）─────────────
function generateArticleMarkdown(topic, heat, matchedKws) {
    const mainKw = matchedKws[0] || 'AI';
    const heatWan = Math.floor(heat / 10000);

    return `> **${topic}**，${heatWan}万人正在讨论。这件事的真正价值，远不止热搜这么简单——它背后藏着一个**正在改变千万中小企业的大趋势**。

## 发生了什么？

近期，关于"${topic}"的话题引发了广泛讨论。事件本身并不复杂，但拨开表象往深处看，会发现这背后正在发生的，是整个**${mainKw}**领域的一次结构性变化。

有人说这只是昙花一现的热点，有人说这会彻底改变行业格局。两种观点都有道理——关键在于，**你站在哪个位置上看这件事。**

**核心背景**：2026年是${mainKw}从"技术秀场"走向"落地应用"的关键一年。每一个看似偶然的热点背后，都是产业大势推动的必然。

## 为什么${heatWan}万人都在关注？

${heatWan}万人围观，绝不是偶然。在这个注意力极度分散的时代，能让这么多人停下来讨论同一件事，说明它击中了某个真实存在的集体焦虑或期待。

三层拆解：

- **技术层面**：${mainKw}正在从"可用"走向"好用"，落地门槛大幅降低
- **市场层面**：早期采用者已经尝到甜头，跟随者开始涌入
- **个人层面**：每个人都在思考，这件事和我的工作、生意有什么关系

> 真正的变化，往往发生在大多数人还在讨论"这是真的吗"的时候。

## 对中小企业和个人意味着什么？

说到底，所有的技术变革最终都要落在"对我有什么用"这个问题上。

对于大多数中小企业主和个人而言，这件事带来的不是威胁，而是**一个换道超车的窗口期**。大企业有包袱、有惯性，反而是"一无所有"的小企业，能以最小的代价最快地拥抱变化。

历史已经证明了这个规律：每一次技术变革，最大的红利不是被发明者拿走的，而是被**第一批学会用好新工具的人**拿走的。

## 现在能做什么？

三个马上能做的事：

1. **先了解**：花30分钟读懂这个领域在发生什么，不需要全懂，知道大方向就够了
2. **找一点**：在你的业务里找一个最重复、最耗时的环节，想想能不能用${mainKw}工具替代
3. **小步跑**：不需要大规模投入，先跑一个最小可行的实验，看看效果

## 写在最后

${heatWan}万人讨论"${topic}"，这是一个信号，不是终点。信号的意思是：**变化已经来了，你现在看到了。**

接下来你选择忽视它，还是认真对待它，决定了三年后你在哪里。

**别等到所有人都上船了，才发现自己还站在岸边。**
`;
}

// ── 将 Markdown 转为微信 HTML（优先用排版模块）────────────
async function markdownToWechatHtml(markdown, title) {
    if (MarkdownToWeChat) {
        try {
            const converter = new MarkdownToWeChat();
            return converter.markdownToHTML(markdown, title, null);
        } catch (e) {
            console.warn('⚠️  排版模块转换失败，降级为内置模板:', e.message);
        }
    }
    // 内置降级 HTML（保留原来的风格）
    return `<section style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;max-width:680px;margin:0 auto;color:#1e293b;">${
        markdown
            .replace(/^> (.+)$/gm, '<p style="background:#f0f7ff;border-left:4px solid #3b82f6;padding:14px 18px;border-radius:0 10px 10px 0;margin:0 0 20px;">$1</p>')
            .replace(/^## (.+)$/gm, '<h2 style="font-size:19px;font-weight:700;color:#1d4ed8;border-left:4px solid #3b82f6;padding-left:12px;margin:28px 0 14px;">$1</h2>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/^- (.+)$/gm, '<li style="margin:8px 0;font-size:15px;line-height:1.75;color:#374151;">$1</li>')
            .replace(/^(\d+)\. (.+)$/gm, '<li style="margin:8px 0;font-size:15px;line-height:1.75;color:#374151;"><strong>$2</strong></li>')
            .replace(/\n\n/g, '</p><p style="font-size:15px;line-height:1.9;color:#374151;margin:12px 0;text-indent:2em;">')
    }</section>`;
}

// ── 生成文章标题 ──────────────────────────────────────────
function generateTitle(topic, heat) {
    const heatWan = Math.floor(heat / 10000);
    const formulas = [
        `${topic}：${heatWan}万人围观背后，藏着一个改变所有人的大趋势`,
        `${topic}，大多数人看到的是热闹，聪明人看到的是机会`,
        `${topic}：这件事正在悄悄重塑你的行业，你感觉到了吗`,
        `从"${topic}"说起：一个正在发生的变革，和你的下一步`
    ];
    return formulas[Math.floor(Math.random() * formulas.length)];
}

// ── 获取 Access Token ─────────────────────────────────────
async function getToken() {
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${wechat.appId}&secret=${wechat.appSecret}`;
    const resp = await httpGet(url);
    if (!resp.access_token) throw new Error('Token 获取失败: ' + JSON.stringify(resp));
    return resp.access_token;
}

// ── 发布到草稿箱 ──────────────────────────────────────────
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

    // 验证配置
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

    // 发布自定义日记/文章
    if (mode === '--diary') {
        const title = process.argv[3];
        const bodyMd = process.argv[4];
        if (!title || !bodyMd) {
            console.error('用法: node engine.js --diary "标题" "Markdown正文"');
            process.exit(1);
        }
        console.log(`\n📝 发布自定义文章：${title}`);
        const content = await markdownToWechatHtml(bodyMd, title);
        const digest = bodyMd.replace(/[#*>`]/g, '').slice(0, 100) + '...';
        const resp = await publishDraft(title, digest, content);
        const id = resp.media_id || resp.draft_id;
        if (id || resp.errcode === 0) {
            console.log(`✅ 发布成功！Media ID: ${id || '已入库'}`);
            console.log('🔗 https://mp.weixin.qq.com 草稿箱查看');
        } else {
            console.error('❌ 发布失败:', JSON.stringify(resp));
            process.exit(1);
        }
        return;
    }

    console.log('\n┌─────────────────────────────────────────┐');
    console.log('│  WorkBuddy 微信发布器 v1.1               │');
    console.log('└─────────────────────────────────────────┘\n');

    // 抓取热点
    console.log('🔍 抓取热点...');
    const rawTopics = await fetchHotspot();

    // 仅查看热点
    if (mode === '--hotspot') {
        const sorted = filterTopics(rawTopics);
        console.log(`\n📊 今日热点雷达（关键词过滤后共 ${sorted.length} 条）\n`);
        console.log('排名  热度      评分  匹配词           热搜内容');
        console.log('──────────────────────────────────────────────────────');
        sorted.slice(0, 10).forEach((t, i) => {
            const heat = (t.heat / 10000).toFixed(0) + '万';
            console.log(`  ${String(i+1).padStart(2)}  ${heat.padEnd(8)} ${String(t.score).padEnd(5)} ${t.matched.join(',').padEnd(15)} ${t.topic}`);
        });
        if (sorted.length === 0) {
            console.log('今日无匹配关键词的热点。全量热点：');
            rawTopics.slice(0, 5).forEach((t, i) => console.log(`  ${i+1}. ${t.topic} (${Math.floor(t.heat/10000)}万)`));
        }
        return;
    }

    // 过滤热点
    const filtered = filterTopics(rawTopics);
    if (filtered.length === 0) {
        console.log('⚠️  今日没有匹配关键词的热点，展示候选供参考：');
        rawTopics.slice(0, 5).forEach((t, i) => console.log(`  ${i+1}. ${t.topic} (${Math.floor(t.heat/10000)}万)`));
        return;
    }

    const best = filtered[0];
    console.log(`📰 选题：${best.topic} (${Math.floor(best.heat/10000)}万热度)`);
    console.log(`🎯 命中关键词：${best.matched.join(', ')}\n`);

    // 生成文章
    console.log('✍️  生成文章...');
    const title = generateTitle(best.topic, best.heat);
    const markdown = generateArticleMarkdown(best.topic, best.heat, best.matched);
    const content = await markdownToWechatHtml(markdown, title);
    const digest = `${best.topic}，${Math.floor(best.heat/10000)}万人关注。这背后，是一个正在改变所有中小企业的大趋势。`;
    console.log(`📝 标题：${title}\n`);

    // 发布
    console.log('📤 发布到草稿箱...');
    const resp = await publishDraft(title, digest, content);
    const id = resp.media_id || resp.draft_id;

    if (id || resp.errcode === 0) {
        console.log('\n┌─────────────────────────────────────────┐');
        console.log('│  🎉 发布成功！                           │');
        console.log('└─────────────────────────────────────────┘');
        console.log(`📄 Media ID: ${id || '已入库'}`);
        console.log('🔗 https://mp.weixin.qq.com 草稿箱查看\n');
    } else {
        console.error('❌ 发布失败:', JSON.stringify(resp));
        process.exit(1);
    }
}

const mode = process.argv[2] || '';
run(mode).catch(e => { console.error('❌', e.message); process.exit(1); });
