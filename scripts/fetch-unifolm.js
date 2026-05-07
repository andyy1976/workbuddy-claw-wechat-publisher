/**
 * 宇树具身智能社群（unifolm.com）资源采集器
 * API: https://api.unitree.com/website
 * 数据源：开源资源、数据集、论文、产品资讯等
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── PowerShell HTTP GET ─────────────────────────────────
const _psScript = path.join(os.tmpdir(), '_fh_unifolm_' + process.pid + '.ps1');
const _psContent = [
    "$ProgressPreference='SilentlyContinue';",
    "$ErrorAction='Stop';",
    "$url=$args[0];",
    "$h=@{'User-Agent'='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';'Accept'='application/json'};",
    "try{",
    "  $r=Invoke-WebRequest -Uri $url -Headers $h -TimeoutSec 15 -UseBasicParsing;",
    "  $r.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10",
    "}catch{Write-Error $_.Exception.Message;exit 1}"
].join(' ');
fs.writeFileSync(_psScript, _psContent, 'utf8');

function psFetch(url) {
    const result = execSync(
        'powershell -ExecutionPolicy Bypass -File "' + _psScript + '" "' + url + '"',
        { encoding: 'utf8', timeout: 20000, maxBuffer: 10 * 1024 * 1024 }
    );
    return JSON.parse(result);
}

// ── API 配置 ─────────────────────────────────────────────
const BASE = 'https://api.unitree.com/website';

// ── 资源分类 ─────────────────────────────────────────────
const CATEGORIES = {
    '2': '数据集',    '3': '前沿探索',  '4': '通用人形',
    '5': '四足',      '6': '灵巧操作',  '7': '感知理解',
    '8': '算力',      '9': '系统',      '11': '新闻热点',
    '15': '开源',     '16': '3D打印',   '17': '讨论交流'
};

// ── 采集资源列表 ─────────────────────────────────────────
async function fetchUnifolmResources(limit) {
    limit = limit || 20;
    console.log('[Uni] 采集宇树具身智能社群资源...');
    const ts = Date.now();
    const url = BASE + '/forum/resource/list?_t=' + ts;
    try {
        const data = psFetch(url);
        if (data.code !== 100) {
            console.log('    ! API error: ' + data.errorMsg);
            return [];
        }
        const all = data.data || [];
        console.log('    + 共 ' + all.length + ' 个资源');
        return all.slice(0, limit).map(item => ({
            id: item.id,
            title: item.title || '',
            title_en: item.title_en || '',
            introduce: item.introduce || item.introduce_en || '',
            introduce_en: item.introduce_en || '',
            cover: item.cover || '',
            category: parseCategory(item.type),
            gitHref: item.gitHref || '',
            websiteHref: item.websiteHref || '',
            articleHref: item.articleHref || '',
            publishTime: item.publishTime || '',
            source: 'unifolm',
            platform: 'unifolm'
        }));
    } catch (e) {
        console.log('    ! ' + e.message);
        return [];
    }
}

// ── 采集产品新闻 ─────────────────────────────────────────
async function fetchUnifolmProductNews(limit) {
    limit = limit || 20;
    console.log('[Uni] 采集宇树产品新闻...');
    const ts = Date.now();
    const url = BASE + '/forum/product/news?_t=' + ts;
    try {
        const data = psFetch(url);
        if (data.code !== 100) return [];
        return (data.data || []).slice(0, limit).map(item => ({
            id: item.articleId || item.id || '',
            title: item.title || '',
            publishTime: item.publishTime || '',
            link: item.link || '',
            articleId: item.articleId || '',
            source: 'unifolm-product',
            platform: 'unifolm'
        }));
    } catch (e) {
        console.log('    ! ' + e.message);
        return [];
    }
}

// ── 采集社区文章 ─────────────────────────────────────────
async function fetchUnifolmArticles(limit) {
    limit = limit || 10;
    console.log('[Uni] 采集宇树社区文章...');
    const ts = Date.now();
    const url = BASE + '/forum/article/list?page=1&size=' + limit + '&_t=' + ts;
    try {
        const data = psFetch(url);
        if (data.code !== 100) return [];
        const articles = data.data && data.data.articles ? data.data.articles : [];
        return articles.slice(0, limit).map(item => ({
            id: item.id || '',
            title: item.title || '',
            summary: item.summary || '',
            author: item.author ? item.author.name : 'unknown',
            authorAvatar: item.author ? item.author.avatar : '',
            publishTime: item.publishTime || '',
            views: item.views || 0,
            likes: item.likes || 0,
            category: item.category || '',
            source: 'unifolm-article',
            platform: 'unifolm'
        }));
    } catch (e) {
        console.log('    ! ' + e.message);
        return [];
    }
}

// ── 解析分类 ─────────────────────────────────────────────
function parseCategory(typeStr) {
    if (!typeStr) return '未分类';
    try {
        const obj = typeof typeStr === 'string' ? JSON.parse(typeStr) : typeStr;
        return obj.zh || obj.en || '未分类';
    } catch {
        return typeStr;
    }
}

// ── 爆款评分（适合内容创作）───────────────────────────────
function scoreForContent(item) {
    var score = 0;
    var text = ((item.title || '') + ' ' + (item.introduce || '') + ' ' + (item.introduce_en || '')).toLowerCase();

    // 有 GitHub 链接 +8（开源=高价值内容）
    if (item.gitHref && item.gitHref.indexOf('github') !== -1) score += 8;

    // 有封面图 +5
    if (item.cover && item.cover.length > 0) score += 5;

    // 有网站链接 +5
    if (item.websiteHref && item.websiteHref.indexOf('http') !== -1) score += 5;

    // 有详细介绍 +8
    if ((item.introduce || '').length > 100) score += 8;

    // 具身智能关键词加分
    var embodiedKws = ['robot', 'humanoid', 'grasping', 'manipulation', 'perception',
        'reinforcement', 'diffusion', 'lm', 'gpt', 'vision', 'locomotion',
        '双足', '人形', '四足', '机器狗', '具身', '抓取', '感知', '灵巧'];
    for (var i = 0; i < embodiedKws.length; i++) {
        if (text.indexOf(embodiedKws[i]) !== -1) score += 10;
    }

    // 科技/AI热门方向
    var techKws = ['LLM', 'VLA', 'RT', 'diffusion policy', 'world model',
        '模仿学习', '强化学习', '多模态', '视觉语言'];
    for (var j = 0; j < techKws.length; j++) {
        if (text.indexOf(techKws[j]) !== -1) score += 12;
    }

    // 最新发布（2026年）
    if ((item.publishTime || '').indexOf('2026') !== -1) score += 5;

    // 工具类资源
    var toolKws = ['tool', 'framework', 'library', 'dataset', 'benchmark',
        '开源', '工具', '框架', '数据集'];
    for (var k = 0; k < toolKws.length; k++) {
        if (text.indexOf(toolKws[k]) !== -1) score += 6;
    }

    return Math.max(0, score);
}

// ── 生成推荐文案 ─────────────────────────────────────────
function generateRecommendation(item) {
    var title = item.title || '未命名';
    var cat = item.category || '未分类';
    var intro = (item.introduce_en || item.introduce || '').substring(0, 150).replace(/\n/g, ' ');
    var score = item.contentScore || 0;

    if (score >= 30) {
        return '【具身智能开源】' + title + '：' + intro + '...';
    } else if (score >= 15) {
        return '【' + cat + '】' + title + ' | 具身智能热点资源';
    }
    return title;
}

// ── 主采集函数 ───────────────────────────────────────────
async function fetchUnifolm() {
    console.log('\n========================================');
    console.log('  宇树具身智能社群（unifolm.com）采集');
    console.log('========================================\n');

    var [resources, productNews] = await Promise.all([
        fetchUnifolmResources(30),
        fetchUnifolmProductNews(20)
    ]);

    // 评分
    var scored = resources.map(function(r) {
        r.contentScore = scoreForContent(r);
        return r;
    });
    scored.sort(function(a, b) { return b.contentScore - a.contentScore; });

    console.log('\n========================================');
    console.log('  开源资源排行（按内容创作价值）');
    console.log('----------------------------------------');
    var top15 = scored.slice(0, 15);
    top15.forEach(function(item, i) {
        var gitIcon = item.gitHref && item.gitHref.indexOf('github') !== -1 ? '[GH]' : '';
        console.log((i + 1) + '. [' + item.category + '] ' + item.title);
        console.log('   ' + gitIcon + ' 评分:' + item.contentScore + ' | ' + item.publishTime);
        if (item.introduce_en || item.introduce) {
            var intro = (item.introduce_en || item.introduce || '').substring(0, 80).replace(/\n/g, ' ');
            console.log('   ' + intro + '...');
        }
        if (item.gitHref) console.log('   ' + item.gitHref);
    });

    // 产品新闻
    if (productNews.length > 0) {
        console.log('\n========================================');
        console.log('  宇树产品新闻');
        console.log('----------------------------------------');
        productNews.slice(0, 10).forEach(function(item, i) {
            var hasLink = item.link && item.link.indexOf('http') !== -1 ? ' [链接]' : '';
            console.log((i + 1) + '. ' + item.publishTime + ' ' + item.title + hasLink);
        });
    }

    // 最佳推荐
    var best = scored[0];
    if (best) {
        console.log('\n========================================');
        console.log('  最佳推荐');
        console.log('   标题: ' + best.title);
        console.log('   分类: ' + best.category + ' | ' + best.publishTime);
        console.log('   评分: ' + best.contentScore);
        if (best.introduce_en || best.introduce) {
            console.log('   简介: ' + (best.introduce_en || best.introduce).substring(0, 120));
        }
        if (best.gitHref) console.log('   GitHub: ' + best.gitHref);
        console.log('   推荐: "' + generateRecommendation(best) + '"');
        console.log('========================================\n');
    }

    // 清理
    try { fs.unlinkSync(_psScript); } catch (e) {}

    return {
        resources: top15,
        productNews: productNews.slice(0, 10),
        best: best
    };
}

// ── CLI ─────────────────────────────────────────────────
if (require.main === module) {
    fetchUnifolm().catch(function(e) {
        console.error('[ERROR]:', e.message);
        try { fs.unlinkSync(_psScript); } catch (e2) {}
    });
}

module.exports = { fetchUnifolm, fetchUnifolmResources, fetchUnifolmProductNews };
