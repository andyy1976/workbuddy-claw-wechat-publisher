/**
 * 将采集的热点推送到本地 CMS
 * 用法：node push-to-cms-local.cjs
 */

const http = require('http');

// ── 配置 ─────────────────────────────────────────────
const CMS_API = 'http://localhost/index.php?s=Contentapi/push';
const CMS_API_KEY = 'sciot_content_2026'; // 与 ContentapiAction.class.php 中的 API Key 匹配

// ── 热点数据（从 fetch-hot-local.cjs 的输出中手动提取）────
const hotTopic = {
    title: '世界杯转播权引关注，286万人热议新媒体格局变化',
    content: `
<h2>热点概述</h2>
<p>今日微博热搜榜首话题“<strong>世界杯转播权</strong>”引发广泛关注，相关讨论量已达 <em>286.1万</em>。</p>

<h2>背景分析</h2>
<p>世界杯作为全球顶级体育赛事，其转播权一直被视为媒体平台的核心竞争力。随着新媒体平台的崛起，传统电视媒体的垄断地位正在被打破。</p>

<h3>关键看点</h3>
<ul>
    <li>📺 <strong>转播格局</strong>：哪些平台将获得转播权？</li>
    <li>💰 <strong>商业价值</strong>：转播费用再创新高？</li>
    <li>📱 <strong>观看体验</strong>：新媒体平台如何创新互动？</li>
</ul>

<h2>行业影响</h2>
<p>此次转播权争夺不仅关乎平台流量，更反映了<strong>体育媒体生态的深刻变革</strong>。短视频、直播、社交互动成为新一代观赛体验的核心要素。</p>

<p style="color:#999;font-size:12px;">数据来源：微博热搜 | 采集时间：2026-05-09</p>
    `.trim(),
    source: 'Weibo',
    platform: 'weibo',
    heat: 2861000,
    url: 'https://s.weibo.com/weibo?q=%E4%B8%96%E7%95%8C%E6%9D%AF%E8%BD%AC%E6%92%AD%E6%9D%83',
    viralScore: 29
};

// ── 推送函数 ─────────────────────────────────────────
function pushToCMS(article) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            title: article.title,
            content: article.content,
            source: article.source,
            platform: article.platform,
            heat: article.heat,
            url: article.url,
            viralScore: article.viralScore,
            category_id: 1, // 默认分类 ID
            status: 1 // 1=发布，0=草稿
        });

        const url = new URL(CMS_API);
        const options = {
            hostname: url.hostname,
            port: url.port || 80,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'X-API-Key': CMS_API_KEY
            }
        };

        console.log('[PUSH] 推送到 CMS...');
        console.log('  URL:', CMS_API);
        console.log('  Title:', article.title);

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.code === 0 || result.success) {
                        console.log('[SUCCESS] 推送成功！');
                        console.log('  Article ID:', result.data && result.data.aid);
                        console.log('  URL: http://localhost/index.php?s=Article/index&id=' + (result.data && result.data.aid));
                        resolve(result);
                    } else {
                        console.log('[ERROR] 推送失败：', result.msg || result.message);
                        reject(new Error(result.msg || 'Unknown error'));
                    }
                } catch (e) {
                    console.log('[ERROR] 解析响应失败：', e.message);
                    console.log('  Raw response:', data);
                    reject(e);
                }
            });
        });

        req.on('error', (err) => {
            console.log('[ERROR] 请求失败：', err.message);
            reject(err);
        });

        req.write(postData);
        req.end();
    });
}

// ── 主函数 ──────────────────────────────────────────
async function main() {
    console.log('\n========================================');
    console.log('  Push Hot Topic to Local CMS');
    console.log('========================================\n');

    try {
        const result = await pushToCMS(hotTopic);
        console.log('\n========================================');
        console.log('  Done!');
        console.log('========================================\n');
    } catch (e) {
        console.error('\n[FATAL]', e.message);
        process.exit(1);
    }
}

main();
