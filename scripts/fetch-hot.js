/**
 * 实时热搜抓取 + 文章生成器
 * 从微博/知乎抓取最新热点，生成爆款文章
 */

const https = require('https');
const http = require('http');

// ── HTTP GET 请求 ─────────────────────────────────────────
function httpGet(url) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const lib = u.protocol === 'https:' ? https : http;
        const req = lib.get({
            hostname: u.hostname,
            port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + u.search,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Referer': 'https://weibo.com'
            }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve({ data: data });
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Timeout'));
        });
    });
}

// ── 抓取微博热搜 ──────────────────────────────────────────
async function fetchWeiboHot() {
    console.log('📱 抓取微博热搜...');
    
    try {
        const resp = await httpGet('https://weibo.com/ajax/side/hotSearch');
        if (resp.data && resp.data.realtime) {
            const topics = resp.data.realtime
                .filter(item => item.word || item.note)
                .map((item, index) => ({
                    rank: index + 1,
                    topic: item.word || item.note || '',
                    heat: item.raw_hot || item.num || 0,
                    source: '微博热搜'
                }));
            
            console.log(`   ✅ 获取 ${topics.length} 条热搜`);
            return topics;
        }
    } catch (e) {
        console.log(`   ⚠️  微博热搜获取失败: ${e.message}`);
    }
    
    return [];
}

// ── 抓取知乎热榜 ──────────────────────────────────────────
async function fetchZhihuHot() {
    console.log('📘 抓取知乎热榜...');
    
    try {
        const resp = await httpGet('https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50');
        if (resp.data && resp.data.data) {
            const topics = resp.data.data
                .filter(item => item.target && item.target.title)
                .map((item, index) => ({
                    rank: index + 1,
                    topic: item.target.title,
                    heat: item.detail_text ? parseInt(item.detail_text.replace(/[^0-9]/g, '')) * 10000 : 50000,
                    source: '知乎热榜'
                }));
            
            console.log(`   ✅ 获取 ${topics.length} 条热榜`);
            return topics;
        }
    } catch (e) {
        console.log(`   ⚠️  知乎热榜获取失败: ${e.message}`);
    }
    
    return [];
}

// ── 爆款选题评分 ──────────────────────────────────────────
function scoreTopicForViral(topic) {
    let score = 0;
    const text = topic.topic.toLowerCase();
    
    // 热度基础分（最高40分）
    score += Math.min(topic.heat / 100000, 40);
    
    // 公共性关键词（+10分每个）
    const publicKeywords = [
        '中国', '国家', '民族', '人民', '农民', '工人', '就业', '工资', '房价', '教育',
        '医疗', '养老', '孩子', '学生', '大学', '高考', '公务员', '国企', '央企',
        '北斗', '华为', '高铁', '航母', '航天', '火箭', '芯片', 'AI', '机器人',
        '沙漠', '种树', '环保', '生态', '碳中和', '新能源', '电动'
    ];
    
    for (const kw of publicKeywords) {
        if (text.includes(kw)) score += 10;
    }
    
    // 画面感关键词（+15分）
    const visualKeywords = ['种树', '沙漠', '机器人', '无人机', '车祸', '救人', '火灾', '地震', '洪水', '雪灾'];
    for (const kw of visualKeywords) {
        if (text.includes(kw)) score += 15;
    }
    
    // 反差感关键词（+10分）
    const contrastKeywords = ['农民', '农村', '老人', '孩子', '小学生', '初中生'];
    for (const kw of contrastKeywords) {
        if (text.includes(kw) && (text.includes('ai') || text.includes('机器人') || text.includes('科技'))) {
            score += 10;
        }
    }
    
    // 排除娱乐八卦（-20分）
    const entertainmentKeywords = ['明星', '演员', '歌手', '综艺', '偶像', '粉丝', '八卦', '绯闻', '恋情', '离婚', '结婚'];
    for (const kw of entertainmentKeywords) {
        if (text.includes(kw)) score -= 20;
    }
    
    return score;
}

// ── 主函数 ────────────────────────────────────────────────
async function main() {
    console.log('\n🚀 ============================================');
    console.log('🚀 实时热搜抓取 + 爆款文章生成');
    console.log('🚀 ============================================\n');
    
    // 1. 抓取热搜
    const weiboTopics = await fetchWeiboHot();
    const zhihuTopics = await fetchZhihuHot();
    
    // 2. 合并并评分
    const allTopics = [...weiboTopics, ...zhihuTopics];
    
    if (allTopics.length === 0) {
        console.log('❌ 未获取到任何热搜数据');
        return;
    }
    
    // 3. 计算爆款评分
    const scoredTopics = allTopics.map(t => ({
        ...t,
        viralScore: scoreTopicForViral(t)
    }));
    
    // 4. 按爆款评分排序
    scoredTopics.sort((a, b) => b.viralScore - a.viralScore);
    
    // 5. 显示Top 10
    console.log('\n📊 爆款选题排行（按公共性+热度综合评分）:');
    console.log('========================================');
    
    const top10 = scoredTopics.slice(0, 10);
    
    top10.forEach((t, i) => {
        const heatWan = (t.heat / 10000).toFixed(0);
        console.log(`${i + 1}. [${t.source}] ${t.topic}`);
        console.log(`   热度: ${heatWan}万 | 爆款分: ${t.viralScore.toFixed(0)}`);
    });
    
    // 6. 推荐最佳选题
    const best = scoredTopics[0];
    const heatWan = (best.heat / 10000).toFixed(0);
    
    console.log('\n🎯 ============================================');
    console.log('🎯 推荐选题:');
    console.log(`   ${best.topic}`);
    console.log(`   来源: ${best.source}`);
    console.log(`   热度: ${heatWan}万人关注`);
    console.log(`   爆款评分: ${best.viralScore.toFixed(0)}/100`);
    console.log('🎯 ============================================\n');
    
    // 7. 生成爆款标题
    const viralTitle = generateViralTitle(best);
    console.log('📝 爆款标题建议:');
    console.log(`   "${viralTitle}"\n`);
    
    return {
        bestTopic: best,
        viralTitle: viralTitle,
        allTopics: top10
    };
}

// ── 生成爆款标题 ──────────────────────────────────────────
function generateViralTitle(topic) {
    const heatWan = (topic.heat / 10000).toFixed(0);
    const topicText = topic.topic;
    
    // 爆款标题公式：热点标签 + 具体数字 + 社会证明 + 价值承诺
    if (topic.viralScore > 80) {
        return `热搜第一！${topicText}：${heatWan}万人围观的背后，是一场静悄悄的革命`;
    } else if (topic.viralScore > 60) {
        return `${topicText}：${heatWan}万人热议，普通人该如何应对？`;
    } else {
        return `${topicText}（${heatWan}万人关注）`;
    }
}

// ── 执行 ──────────────────────────────────────────────────
main().catch(e => console.error('❌ 错误:', e.message));