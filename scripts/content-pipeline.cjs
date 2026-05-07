/**
 * 内容数字员工平台 - 主采集管线 v5.0
 * 
 * 统一入口：采集 → AI处理 → 存储 → 输出
 */

const path = require('path');
const fs = require('fs');

// 子模块
const aiScorer = require('./ai-scorer.cjs');

// ── 配置 ───────────────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, 'sources-config.json');

function loadConfig() {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

// ── 采集器映射 ─────────────────────────────────────────
const FETCHERS = {
    'weibo-hot': require('./fetch-hot.js').fetchWeiboHot,
    'zhihu-hot': require('./fetch-hot.js').fetchZhihuHot,
    'reddit-askreddit': () => require('./fetch-hot.js').fetchRedditHot(['AskReddit'], 25),
    'reddit-technology': () => require('./fetch-hot.js').fetchRedditHot(['technology'], 25),
    'unifolm-resources': require('./fetch-unifolm.js').fetchUnifolmResources
};

// ── 单源采集 ───────────────────────────────────────────
async function fetchSource(sourceId) {
    const config = loadConfig();
    const source = config.sources.find(s => s.id === sourceId);
    
    if (!source) {
        console.log(`[Error] Unknown source: ${sourceId}`);
        return [];
    }
    
    if (!source.enabled) {
        console.log(`[Skip] Source disabled: ${sourceId}`);
        return [];
    }
    
    console.log(`\n[Fetch] ${source.name} (T${source.tier})...`);
    
    const fetcher = FETCHERS[sourceId];
    if (!fetcher) {
        console.log(`[Error] No fetcher for: ${sourceId}`);
        return [];
    }
    
    try {
        const items = await fetcher(source.params?.limit || 20);
        
        // 补充信源信息
        return items.map(item => ({
            ...item,
            source_id: sourceId,
            tier: source.tier,
            category: item.category || source.category
        }));
    } catch (e) {
        console.log(`[Error] ${sourceId}: ${e.message}`);
        return [];
    }
}

// ── 全量采集 ───────────────────────────────────────────
async function fetchAll() {
    const config = loadConfig();
    const enabledSources = config.sources.filter(s => s.enabled);
    
    console.log('\n========================================');
    console.log('  内容数字员工平台 - 热点采集');
    console.log(`  信源数: ${enabledSources.length}`);
    console.log('========================================\n');
    
    const results = await Promise.all(
        enabledSources.map(s => fetchSource(s.id))
    );
    
    const all = results.flat();
    console.log(`\n[Total] ${all.length} items collected`);
    
    return all;
}

// ── 处理流水线 ─────────────────────────────────────────
async function runPipeline(options) {
    options = options || {};
    
    // 1. 采集
    const rawItems = await fetchAll();
    
    if (rawItems.length === 0) {
        console.log('[Error] No items collected');
        return { featured: [], all: [] };
    }
    
    // 2. AI 处理（评分）
    console.log('\n========================================');
    console.log('  AI 处理中...');
    console.log('========================================\n');
    
    const processed = await aiScorer.processBatch(rawItems, options.concurrency || 3);
    
    // 3. 筛选精选
    const featured = processed.filter(item => item.isFeatured);
    console.log(`\n[Featured] ${featured.length} items (threshold filtered)`);
    
    // 4. 输出报告
    console.log('\n========================================');
    console.log('  精选内容 Top 20');
    console.log('========================================\n');
    
    featured.slice(0, 20).forEach((item, i) => {
        const emoji = item.platform === 'reddit' ? '[R]' : 
                      item.platform === 'weibo' ? '[W]' : 
                      item.platform === 'zhihu' ? '[Z]' : '[U]';
        console.log(`${i + 1}. ${emoji} ${item.source} | Score: ${item.finalScore}`);
        console.log(`   ${item.title?.substring(0, 60)}...`);
        if (item.scores) {
            console.log(`   [新:${item.scores.novelty} 重要:${item.scores.importance} 相关:${item.scores.relevance} 传播:${item.scores.viral}]`);
        }
    });
    
    // 5. 分类统计
    const categoryStats = {};
    featured.forEach(item => {
        const cat = item.category?.[0] || '其他';
        if (!categoryStats[cat]) categoryStats[cat] = 0;
        categoryStats[cat]++;
    });
    
    console.log('\n========================================');
    console.log('  分类统计');
    console.log('========================================\n');
    Object.entries(categoryStats)
        .sort((a, b) => b[1] - a[1])
        .forEach(([cat, count]) => {
            console.log(`  ${cat}: ${count} 条`);
        });
    
    return {
        featured: featured.slice(0, 50),
        all: processed,
        stats: categoryStats
    };
}

// ── 日报生成 ───────────────────────────────────────────
function generateDailyReport(featuredItems) {
    const categories = {
        '模型发布': [],
        '产品更新': [],
        '行业动态': [],
        '论文研究': [],
        '观点技巧': []
    };
    
    // 分类
    featuredItems.forEach(item => {
        const title = (item.title || '').toLowerCase();
        const cat = item.category?.[0] || '';
        
        if (title.includes('发布') || title.includes('launch') || title.includes('release')) {
            categories['模型发布'].push(item);
        } else if (title.includes('更新') || title.includes('update') || cat.includes('产品')) {
            categories['产品更新'].push(item);
        } else if (title.includes('论文') || title.includes('paper') || title.includes('研究')) {
            categories['论文研究'].push(item);
        } else if (title.includes('观点') || title.includes('技巧') || title.includes('教程')) {
            categories['观点技巧'].push(item);
        } else {
            categories['行业动态'].push(item);
        }
    });
    
    // 生成报告
    const report = {
        date: new Date().toISOString().split('T')[0],
        generatedAt: new Date().toISOString(),
        sections: {}
    };
    
    Object.entries(categories).forEach(([section, items]) => {
        if (items.length > 0) {
            report.sections[section] = items.slice(0, 5).map(item => ({
                title: item.title,
                source: item.source,
                score: item.finalScore,
                url: item.url
            }));
        }
    });
    
    return report;
}

// ── CLI ─────────────────────────────────────────────────
if (require.main === module) {
    const args = process.argv.slice(2);
    const sourceId = args.find(a => !a.startsWith('--'));
    
    if (sourceId) {
        // 单源采集
        fetchSource(sourceId).then(items => {
            console.log(`\nCollected ${items.length} items`);
        });
    } else {
        // 完整流水线
        runPipeline({
            concurrency: parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] || 3)
        }).then(result => {
            // 生成日报
            const report = generateDailyReport(result.featured);
            const reportPath = path.join(__dirname, '../logs/daily-report.json');
            
            try {
                fs.mkdirSync(path.dirname(reportPath), { recursive: true });
                fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
                console.log(`\n[Report] Saved to ${reportPath}`);
            } catch (e) {
                console.log(`[Report Error] ${e.message}`);
            }
        }).catch(console.error);
    }
}

module.exports = {
    fetchSource,
    fetchAll,
    runPipeline,
    generateDailyReport
};
