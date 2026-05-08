/**
 * CMS Bridge - 内容管线到 CMS 的桥接模块
 * 
 * 将 content-pipeline 产出的精选内容推送到 CMS 数据库
 * 
 * 使用方式：
 *   const bridge = require('./cms-bridge.cjs');
 *   await bridge.pushToCMS(item);
 *   await bridge.pushBatch(items);
 * 
 * CLI:
 *   node cms-bridge.cjs --push-last    # 推送最近一次采集结果
 *   node cms-bridge.cjs --test         # 测试连接
 */

const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

// ── 配置 ───────────────────────────────────────────────
const CMS_CONFIG = {
    host: process.env.CMS_DB_HOST || '82.156.40.94',
    port: parseInt(process.env.CMS_DB_PORT || '3306'),
    user: process.env.CMS_DB_USER || 'root',
    password: process.env.CMS_DB_PASS || 'gyCms2024!',
    database: process.env.CMS_DB_NAME || 'eastaiai'
};

const API_CONFIG = {
    baseUrl: process.env.CMS_API_URL || 'http://localhost',
    apiKey: process.env.CMS_API_KEY || 'sciot_content_2026'
};

// 模式: 'mysql' 直连数据库 或 'api' 通过HTTP API
const BRIDGE_MODE = process.env.CMS_BRIDGE_MODE || 'mysql';

// ── 栏目映射 ───────────────────────────────────────────
const CATEGORY_KEYWORDS = {
    111: ['数字员工', '内容创作', 'AI写作', '内容发布', '公众号', '小红书'],
    112: ['营销', '获客', '私域', '社群', '转化'],
    113: ['客服', '智能问答', '工单'],
    121: ['大模型', 'LLM', 'GPT', 'Claude', 'DeepSeek', '开源模型', 'Gemini', 'Llama'],
    122: ['智能体', 'Agent', 'AutoGPT', 'LangChain', '工作流', 'CrewAI', 'Dify'],
    123: ['AI应用', 'RAG', '微调', 'Fine-tune', 'Prompt', '提示词'],
    124: ['多模态', '文生图', '文生视频', 'Sora', '语音合成', 'TTS', 'FLUX'],
    131: ['PLM', '产品生命周期', 'BOM', '变更管理', 'PDM'],
    132: ['MES', '制造执行', '生产管理', '排产'],
    133: ['QMS', '质量管理', 'ISO', '合规', 'Design Control'],
    134: ['ERP', 'CAPP', '工艺设计', '工作流引擎', '数据资产'],
    141: ['具身智能', 'Embodied', '感知决策', '机器人学习'],
    142: ['人形机器人', '宇树', 'Optimus', 'Figure', '特斯拉机器人'],
    143: ['工业机器人', '协作机器人', '机械臂', '自动化'],
    21216: ['AI', '人工智能', 'ChatGPT'],
    21217: ['硬核', '技术深度', '底层', '原理'],
    21225: ['开源', 'Open Source', 'GitHub'],
    21215: ['技术观察', '趋势', '分析']
};

// ── 连接池 ─────────────────────────────────────────────
let pool = null;

async function getPool() {
    if (pool) return pool;
    pool = mysql.createPool({
        ...CMS_CONFIG,
        waitForConnections: true,
        connectionLimit: 5
    });
    return pool;
}

// ── 自动分类 ───────────────────────────────────────────
function autoClassify(title, summary) {
    const text = (title + ' ' + (summary || '')).toLowerCase();
    const scores = {};

    for (const [typeid, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        for (const kw of keywords) {
            if (text.includes(kw.toLowerCase())) {
                if (!scores[typeid]) scores[typeid] = 0;
                scores[typeid] += kw.length;
            }
        }
    }

    if (Object.keys(scores).length === 0) return 21215; // 默认：技术观察

    return parseInt(Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]);
}

// ── Markdown → HTML ────────────────────────────────────
function markdownToHtml(md) {
    if (!md) return '';
    let html = md;
    // 标题
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // 加粗
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // 链接
    html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');
    // 段落
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    // 清理
    html = html.replace(/<p><(h[1-3])>/g, '<$1>');
    html = html.replace(/<\/(h[1-3])><\/p>/g, '</$1>');
    return html;
}

// ── 去重检查 ───────────────────────────────────────────
async function checkDuplicate(title, sourceUrl) {
    const p = await getPool();
    const [rows] = await p.execute(
        'SELECT aid FROM lvbo_article WHERE title = ? LIMIT 1',
        [title.substring(0, 80)]
    );
    if (rows.length > 0) return rows[0].aid;

    if (sourceUrl) {
        const [rows2] = await p.execute(
            'SELECT aid FROM lvbo_article WHERE source_url = ? LIMIT 1',
            [sourceUrl.substring(0, 500)]
        );
        if (rows2.length > 0) return rows2[0].aid;
    }

    return null;
}

// ── HTTP API 模式推送 ─────────────────────────────────
async function pushViaAPI(item) {
    const http = require('http');
    const https = require('https');
    
    const typeid = item.typeid || autoClassify(item.title, item.summary || item.description || '');
    const payload = JSON.stringify({
        title: item.title,
        content: item.content || generateContentHtml(item),
        typeid,
        keywords: item.keywords || item.tags?.join(','),
        description: item.summary || item.description || item.introduce,
        imgurl: item.imgurl || item.image,
        copyfrom: item.source || item.copyfrom,
        source_url: item.url || item.original_url,
        ai_score: item.finalScore || item.ai_score,
        ai_scores: item.scores
    });
    
    const url = new URL('/index.php?s=Contentapi/push', API_CONFIG.baseUrl);
    const mod = url.protocol === 'https:' ? https : http;
    
    return new Promise((resolve, reject) => {
        const req = mod.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_CONFIG.apiKey,
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    resolve(result);
                } catch (e) {
                    reject(new Error('Invalid JSON: ' + body.substring(0, 200)));
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// ── 单条推送 ───────────────────────────────────────────
async function pushToCMS(item) {
    // API 模式
    if (BRIDGE_MODE === 'api') {
        try {
            const result = await pushViaAPI(item);
            console.log(`[Bridge-API] ${result.msg}: ${item.title?.substring(0, 40)}...`);
            return result.data || result;
        } catch (e) {
            console.error(`[Bridge-API] Error: ${e.message}`);
            return { error: e.message };
        }
    }
    
    // MySQL 直连模式
    const p = await getPool();

    // 去重
    const existingAid = await checkDuplicate(item.title, item.url);
    if (existingAid) {
        console.log(`[Bridge] Duplicate: "${item.title?.substring(0, 40)}..." (aid=${existingAid})`);
        return { aid: existingAid, duplicate: true };
    }

    // 自动分类
    const typeid = item.typeid || autoClassify(item.title, item.summary || item.description || '');

    // 生成内容
    let content = item.content || '';
    if (!content && (item.summary || item.introduce)) {
        content = generateContentHtml(item);
    }
    if (content && !content.includes('<')) {
        content = markdownToHtml(content);
    }

    // 来源
    const copyfrom = item.copyfrom || item.source || '';
    const sourceUrl = item.url || item.original_url || item.source_url || '';

    // 构建 INSERT
    const [result] = await p.execute(`
        INSERT INTO lvbo_article 
            (title, keywords, description, note, content, typeid, status, addtime, 
             author, copyfrom, imgurl, hits, source_url, ai_score, ai_scores, is_ai_generated, tier)
        VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), ?, ?, ?, 1, ?, ?, ?, 1, ?)
    `, [
        (item.title || '').substring(0, 80),
        (item.keywords || item.tags?.join(',') || '').substring(0, 40),
        (item.summary || item.description || item.introduce || '').substring(0, 500),
        (item.note || item.summary || '').substring(0, 200),
        content,
        typeid,
        (item.author || 'AI\u6570\u5b57\u5458\u5de5').substring(0, 20),
        copyfrom.substring(0, 100),
        item.imgurl || item.image || '',
        sourceUrl.substring(0, 500),
        item.finalScore || item.ai_score || 0,
        item.scores ? JSON.stringify(item.scores) : null,
        item.tier || 2
    ]);

    // 高分文章标记推荐
    if ((item.finalScore || 0) >= 80) {
        await p.execute(
            'UPDATE lvbo_article SET istop = 1, ishot = 1 WHERE aid = ?',
            [result.insertId]
        );
    }

    console.log(`[Bridge] Created: aid=${result.insertId}, typeid=${typeid}, "${item.title?.substring(0, 40)}..."`);
    return { aid: result.insertId, typeid, duplicate: false };
}

// ── 生成内容 HTML ─────────────────────────────────────
function generateContentHtml(item) {
    const title = item.title || '';
    const desc = item.summary || item.description || item.introduce || '';
    const source = item.source || item.copyfrom || '';
    const url = item.url || '';
    const score = item.finalScore || item.ai_score || 0;
    const scores = item.scores || {};

    let html = `<h2>${escapeHtml(title)}</h2>`;
    if (desc) html += `<p>${escapeHtml(desc)}</p>`;

    if (score > 0) {
        html += '<div class="ai-score-badge" style="background:#f0f7ff;padding:15px;border-radius:8px;margin:15px 0;">';
        html += `<p><strong>AI \u8bc4\u5206\uff1a${score.toFixed(1)} / 100</strong></p>`;
        const labels = { novelty: '\u65b0\u9896\u6027', importance: '\u91cd\u8981\u6027', relevance: '\u76f8\u5173\u6027', readability: '\u53ef\u8bfb\u6027', viral: '\u4f20\u64ad\u6027' };
        if (Object.keys(scores).length > 0) {
            html += '<p>';
            for (const [dim, val] of Object.entries(scores)) {
                html += `${labels[dim] || dim}:${val} `;
            }
            html += '</p>';
        }
        html += '</div>';
    }

    if (url) {
        html += `<p>\u6765\u6e90\uff1a<a href="${escapeHtml(url)}" target="_blank">${escapeHtml(source || url)}</a></p>`;
    }

    return html;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── 批量推送 ───────────────────────────────────────────
async function pushBatch(items) {
    const results = [];
    let created = 0, duplicates = 0, errors = 0;

    for (const item of items) {
        try {
            const result = await pushToCMS(item);
            results.push(result);
            if (result.duplicate) duplicates++;
            else created++;
        } catch (e) {
            console.error(`[Bridge] Error: ${e.message}`);
            results.push({ error: e.message, title: item.title });
            errors++;
        }
    }

    console.log(`\n[Bridge] Batch complete: ${created} created, ${duplicates} duplicates, ${errors} errors`);
    return { created, duplicates, errors, results };
}

// ── 获取分类列表 ───────────────────────────────────────
async function getCategories() {
    const p = await getPool();
    const [rows] = await p.execute(
        'SELECT typeid, typename, typename_en, fid, path, keywords FROM lvbo_type WHERE ismenu = 1 ORDER BY drank ASC'
    );
    return rows;
}

// ── 获取最近文章 ───────────────────────────────────────
async function getRecentArticles(typeid, limit) {
    const p = await getPool();
    limit = limit || 10;
    let sql = 'SELECT aid, title, addtime, ai_score, typeid FROM lvbo_article WHERE status = 1';
    const params = [];
    if (typeid) {
        sql += ' AND typeid = ?';
        params.push(typeid);
    }
    sql += ' ORDER BY addtime DESC LIMIT ?';
    params.push(limit);
    const [rows] = await p.execute(sql, params);
    return rows;
}

// ── 测试连接 ───────────────────────────────────────────
async function testConnection() {
    try {
        const p = await getPool();
        const [rows] = await p.execute('SELECT COUNT(*) as total FROM lvbo_article');
        const [types] = await p.execute('SELECT COUNT(*) as total FROM lvbo_type WHERE ismenu = 1');
        console.log('[Bridge] Connection OK');
        console.log(`  Articles: ${rows[0].total}`);
        console.log(`  Categories: ${types[0].total}`);
        return { ok: true, articles: rows[0].total, categories: types[0].total };
    } catch (e) {
        console.error(`[Bridge] Connection failed: ${e.message}`);
        return { ok: false, error: e.message };
    }
}

// ── 推送最近采集结果 ───────────────────────────────────
async function pushLastResults() {
    const logDir = path.join(__dirname, '../logs');
    const latestReport = path.join(logDir, 'daily-report.json');

    if (!fs.existsSync(latestReport)) {
        console.log('[Bridge] No daily-report.json found. Run content-pipeline first.');
        return;
    }

    const report = JSON.parse(fs.readFileSync(latestReport, 'utf8'));
    const allItems = [];

    for (const [section, items] of Object.entries(report.sections || {})) {
        for (const item of items) {
            allItems.push(item);
        }
    }

    if (allItems.length === 0) {
        console.log('[Bridge] No items in latest report');
        return;
    }

    console.log(`[Bridge] Pushing ${allItems.length} items from latest report...`);
    return pushBatch(allItems);
}

// ── CLI ─────────────────────────────────────────────────
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.includes('--test')) {
        testConnection().then(r => {
            if (!r.ok) process.exit(1);
        });
    } else if (args.includes('--push-last')) {
        pushLastResults().then(r => {
            if (r) console.log(JSON.stringify(r, null, 2));
        });
    } else if (args.includes('--categories')) {
        getCategories().then(cats => {
            cats.forEach(c => console.log(`  ${c.typeid}: ${c.typename} (fid=${c.fid})`));
        });
    } else {
        console.log('Usage:');
        console.log('  node cms-bridge.cjs --test          Test CMS connection');
        console.log('  node cms-bridge.cjs --push-last     Push latest pipeline results');
        console.log('  node cms-bridge.cjs --categories    List CMS categories');
    }
}

module.exports = {
    pushToCMS,
    pushBatch,
    autoClassify,
    getCategories,
    getRecentArticles,
    testConnection,
    pushLastResults,
    markdownToHtml
};
