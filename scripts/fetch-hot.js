/**
 * 实时热搜抓取 + 爆款文章生成
 * 数据源：微博热搜 + 知乎热榜 + Reddit 热点
 * Reddit 使用 PowerShell 方式抓取（自动走 WinINET 系统代理，无需 API Key）
 */
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── 系统代理检测 ─────────────────────────────────────────
function detectSystemProxy() {
    if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) return;
    try {
        const reg = execSync(
            'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable',
            { encoding: 'utf8', timeout: 3000 }
        );
        const enabled = parseInt((reg.match(/ProxyEnable\s+REG_DWORD\s+0x([0-9a-f]+)/i) || [])[1] || '0', 16);
        if (!enabled) return;
        const serverReg = execSync(
            'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
            { encoding: 'utf8', timeout: 3000 }
        );
        const match = serverReg.match(/ProxyServer\s+REG_SZ\s+([^\s]+)/);
        if (match) {
            const proxy = match[1];
            const port = proxy.includes(':') ? proxy.split(':')[1] : '10809';
            process.env.HTTPS_PROXY = 'http://127.0.0.1:' + port;
            process.env.HTTP_PROXY = 'http://127.0.0.1:' + port;
        }
    } catch (e) {}
}
detectSystemProxy();

// ── PowerShell 脚本路径 ──────────────────────────────────
const _psScript = path.join(os.tmpdir(), '_fh_ps_' + process.pid + '.ps1');
const _psContent = [
    "$ProgressPreference='SilentlyContinue';",
    "$ErrorAction='Stop';",
    "$url=$args[0];",
    "$h=@{'User-Agent'='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';",
    "  'Accept'='application/json';",
    "  'Accept-Language'='en-US,en;q=0.9'};",
    "try{",
    "  $r=Invoke-WebRequest -Uri $url -Headers $h -TimeoutSec 15 -UseBasicParsing;",
    "  $r.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10",
    "}catch{Write-Error $_.Exception.Message;exit 1}"
].join(' ');
fs.writeFileSync(_psScript, _psContent, 'utf8');

// ── PowerShell HTTP GET ─────────────────────────────────
function psFetch(url) {
    var result = execSync(
        'powershell -ExecutionPolicy Bypass -File "' + _psScript + '" "' + url + '"',
        { encoding: 'utf8', timeout: 20000, maxBuffer: 10 * 1024 * 1024 }
    );
    return JSON.parse(result);
}

// ── HTTP GET ─────────────────────────────────────────────
function httpGet(url, headers) {
    headers = headers || {};
    return new Promise(function(resolve, reject) {
        var u = new URL(url);
        var lib = u.protocol === 'https:' ? https : http;
        var req = lib.get({
            hostname: u.hostname,
            port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + u.search,
            headers: Object.assign({
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json, text/plain, */*'
            }, headers)
        }, function(res) {
            var data = '';
            res.on('data', function(c) { data += c; });
            res.on('end', function() {
                try { resolve(JSON.parse(data)); }
                catch { resolve({ raw: data }); }
            });
        });
        req.on('error', reject);
        req.setTimeout(12000, function() { req.destroy(); reject(new Error('Timeout')); });
    });
}

// ── 微博热搜 ─────────────────────────────────────────────
async function fetchWeiboHot(limit) {
    limit = limit || 30;
    console.log('[1/3] Weibo Hot...');
    try {
        var resp = await httpGet('https://weibo.com/ajax/side/hotSearch', {
            Referer: 'https://weibo.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });
        if (resp.data && resp.data.realtime) {
            var topics = resp.data.realtime
                .filter(function(item) { return item.word || item.note; })
                .slice(0, limit)
                .map(function(item, i) {
                    return {
                        rank: i + 1,
                        topic: item.word || item.note || '',
                        heat: item.raw_hot || item.num || 0,
                        source: 'Weibo',
                        platform: 'weibo',
                        url: 'https://s.weibo.com/weibo?q=' + encodeURIComponent(item.word || item.note)
                    };
                });
            console.log('    + ' + topics.length + ' items');
            return topics;
        }
    } catch(e) { console.log('    ! ' + e.message); }
    return [];
}

// ── 知乎热榜 ─────────────────────────────────────────────
async function fetchZhihuHot(limit) {
    limit = limit || 30;
    console.log('[2/3] Zhihu Hot...');
    try {
        var resp = await httpGet(
            'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=' + limit,
            { Referer: 'https://www.zhihu.com/' }
        );
        if (resp.data && resp.data.data) {
            var topics = resp.data.data
                .filter(function(item) { return item.target && item.target.title; })
                .map(function(item, i) {
                    var heat = 50000;
                    if (item.detail_text) {
                        var num = parseInt(item.detail_text.replace(/[^\d]/g, ''));
                        if (!isNaN(num)) heat = num * 10000;
                    }
                    return {
                        rank: i + 1,
                        topic: item.target.title,
                        heat: heat,
                        source: 'Zhihu',
                        platform: 'zhihu',
                        url: item.target.url || 'https://www.zhihu.com'
                    };
                });
            console.log('    + ' + topics.length + ' items');
            return topics;
        }
    } catch(e) { console.log('    ! ' + e.message); }
    return [];
}

// ── Reddit 热点（PowerShell 方式，无需 API Key）──────────
async function fetchRedditHot(subs, limit) {
    subs = subs || ['AskReddit', 'technology', 'China', 'worldnews', 'AmItheAsshole'];
    limit = limit || 10;
    console.log('[3/3] Reddit Hot (' + subs.join(', ') + ')...');

    var results = [];
    for (var si = 0; si < subs.length; si++) {
        var sub = subs[si];
        var url = 'https://www.reddit.com/r/' + sub + '/hot.json?limit=' + limit;
        try {
            var data = psFetch(url);
            var posts = data.data && data.data.children ? data.data.children : [];
            for (var pi = 0; pi < posts.length; pi++) {
                var p = posts[pi].data;
                if (p.over_18 || !p.title || p.title.length < 15) continue;
                var authorName = typeof p.author === 'object' ? (p.author && p.author.name ? p.author.name : 'unknown') : p.author;
                results.push({
                    rank: results.length + 1,
                    topic: p.title,
                    heat: p.score || 0,
                    source: 'r/' + sub,
                    platform: 'reddit',
                    url: 'https://reddit.com' + p.permalink,
                    meta: {
                        subreddit: sub,
                        author: authorName || 'unknown',
                        numComments: p.num_comments || 0,
                        isSelf: p.is_self,
                        selftext: (p.selftext || '').substring(0, 500)
                    }
                });
            }
            console.log('    + r/' + sub + ': ' + posts.length + ' posts');
        } catch(e) {
            console.log('    ! r/' + sub + ': ' + e.message);
        }
    }
    console.log('    Total: ' + results.length + ' items');
    return results;
}

// ── 爆款评分 ─────────────────────────────────────────────
function scoreTopicForViral(topic) {
    var score = 0;
    var text = (topic.topic || '').toLowerCase();
    var meta = topic.meta || {};
    var selftext = ((meta.selftext || '') || '').toLowerCase();
    var combined = text + ' ' + selftext;

    if (topic.platform === 'reddit') {
        score += Math.min((topic.heat || 0) / 5000, 35);
        if (meta.numComments > 1000) score += 10;
        if (meta.numComments > 5000) score += 10;
    } else {
        score += Math.min((topic.heat || 0) / 100000, 40);
    }

    var publicKws = ['\u4E2D\u56FD','\u56FD\u5BB6','\u6C11\u65CF','\u4EBA\u6C11','\u519C\u6C11','\u5DE5\u4EBA',
        '\u5C31\u4E1A','\u5DE5\u8D44','\u623F\u4EF7','\u6559\u80B2','\u533B\u7597','\u517B\u8001',
        '\u5B69\u5B50','\u5B66\u751F','\u9AD8\u8003','\u5317\u6597','\u534E\u4E3A','\u9AD8\u94C1',
        '\u822A\u6BCD','\u822A\u5929','\u706B\u7BAD','\u82F9\u8F66','AI','\u673A\u5668\u4EBA',
        '\u65B0\u80FD\u6E90','\u7535\u52A8'];
    for (var pk = 0; pk < publicKws.length; pk++) {
        if (combined.indexOf(publicKws[pk]) !== -1) score += 8;
    }

    var visualKws = ['\u673A\u5668\u4EBA','\u65E0\u4EBA\u673A','\u8F66\u7978','\u6551\u4EBA','\u706B\u7070','\u5730\u9707','\u6D41\u6C34','\u96EA\u707E'];
    for (var vk = 0; vk < visualKws.length; vk++) {
        if (combined.indexOf(visualKws[vk]) !== -1) score += 12;
    }

    var storyKws = ['\u6050\u6016','\u8BE1\u5F02','\u53CD\u8F6C','\u6696\u5FC3','\u6CE8\u76EE','\u6CEB\u76EE',
        '\u6D51\u8BC9','aita','\u9ED1\u5409','\u7EDD\u5883','\u8D44\u672C','\u516C\u53F8'];
    for (var sk = 0; sk < storyKws.length; sk++) {
        if (combined.indexOf(storyKws[sk]) !== -1) score += 15;
    }

    var techKws = ['ai','machine learning','robot','technology','science','engineer','software','code','research','study','\u79D1\u5B66','\u7814\u7A76'];
    for (var tk = 0; tk < techKws.length; tk++) {
        if (combined.indexOf(techKws[tk]) !== -1) score += 10;
    }

    var entKws = ['\u660E\u661F','\u6F14\u5458','\u6B4C\u624B','\u7EFC\u827A','\u50CF\u7B49','\u7C89\u4E1D','\u516B\u5366','\u7EF7\u95FB'];
    for (var ek = 0; ek < entKws.length; ek++) {
        if (text.indexOf(entKws[ek]) !== -1) score -= 25;
    }

    return Math.max(0, score);
}

function generateViralTitle(topic) {
    var heat = topic.heat || 0;
    var heatStr;
    if (topic.platform === 'reddit') {
        heatStr = (heat > 0 ? '\u2191' + heat + ' ' : '') + topic.source;
    } else {
        heatStr = (heat / 10000).toFixed(1) + '\u4E07\u4EBA\u5173\u6CE8';
    }
    var score = topic.viralScore || 0;
    if (score >= 70) {
        return '\u3010\u70ED\u641C\u7B2C\u4E00\u3011' + topic.topic + '\uFF1A' + heatStr + '\u7684\u80CC\u540E\uFF0C\u662F\u4E00\u573A\u9759\u6084\u6084\u7684\u9769\u547D';
    } else if (score >= 45) {
        return topic.topic + '\uFF1A' + heatStr + '\u70ED\u8BAE\uFF0C\u666E\u901A\u4EBA\u8BE5\u5982\u4F55\u5E94\u5BF9\uFF1F';
    } else if (score >= 25) {
        return '\u201C' + topic.topic + '\u201D ' + heatStr;
    }
    return topic.topic;
}

function isGoodForVideo(topic) {
    var meta = topic.meta || {};
    var combined = ((topic.topic || '') + ' ' + (meta.selftext || '')).toLowerCase();
    var videoKws = ['\u6050\u6016','\u8BE1\u5F02','\u53CD\u8F6C','\u6696\u5FC3','\u6CE8\u76EE','\u6CEB\u76EE',
        'story','my friend','i found','this happened','aita','what should',
        '\u9ED1\u5409','\u7EAA\u5B9E','\u6D51\u8BC9','\u54E5\u4EEC','real'];
    var hasStory = false;
    for (var i = 0; i < videoKws.length; i++) {
        if (combined.indexOf(videoKws[i]) !== -1) { hasStory = true; break; }
    }
    return hasStory && (meta.numComments || 0) > 100 && (topic.topic || '').length > 20;
}

// ── 主函数 ───────────────────────────────────────────────
async function main() {
    console.log('\n========================================');
    console.log('  Real-time Hot Topics + Viral Writer');
    console.log('========================================\n');

    var results = await Promise.all([
        fetchWeiboHot(30),
        fetchZhihuHot(30),
        fetchRedditHot(['AskReddit', 'technology', 'China', 'worldnews', 'AmItheAsshole'], 10)
    ]);

    var all = results[0].concat(results[1]).concat(results[2]);
    if (all.length === 0) {
        console.log('[ERROR] No data retrieved. Check network.');
        return;
    }

    var scored = all.map(function(t) {
        t.viralScore = scoreTopicForViral(t);
        return t;
    });
    scored.sort(function(a, b) { return b.viralScore - a.viralScore; });

    console.log('\n========================================');
    console.log('  Full Ranking (by viral score)');
    console.log('----------------------------------------');
    var top15 = scored.slice(0, 15);
    for (var i = 0; i < top15.length; i++) {
        var t = top15[i];
        var emoji = t.platform === 'reddit' ? '[R]' : t.platform === 'weibo' ? '[W]' : '[Z]';
        var heatStr = t.platform === 'reddit' ? '\u2191' + t.heat : (t.heat / 10000).toFixed(1) + 'W';
        var videoTag = isGoodForVideo(t) ? ' [VIDEO]' : '';
        console.log((i + 1) + '. ' + emoji + ' ' + t.source + ' | ' + heatStr + ' | score:' + t.viralScore.toFixed(0) + videoTag);
        console.log('   ' + t.topic.substring(0, 70) + (t.topic.length > 70 ? '...' : ''));
    }

    var videoTopics = scored.filter(isGoodForVideo);
    if (videoTopics.length > 0) {
        console.log('\n========================================');
        console.log('  Short Video Recommendations');
        console.log('----------------------------------------');
        for (var vi = 0; vi < Math.min(videoTopics.length, 5); vi++) {
            var vt = videoTopics[vi];
            var vheat = vt.platform === 'reddit' ? '\u2191' + vt.heat : (vt.heat / 10000).toFixed(1) + 'W';
            console.log((vi + 1) + '. ' + vt.source + ' (' + vheat + ')');
            console.log('   Title: ' + vt.topic);
            console.log('   URL: ' + vt.url);
            if (vt.meta && vt.meta.selftext) {
                var preview = vt.meta.selftext.substring(0, 120).replace(/\n/g, ' ');
                console.log('   Preview: ' + preview + '...');
            }
        }
    }

    var best = scored[0];
    console.log('\n========================================');
    console.log('  Best Topic (' + best.platform + ')');
    console.log('   ' + best.topic);
    var bestHeat = best.platform === 'reddit' ? '\u2191' + best.heat : (best.heat / 10000).toFixed(1) + 'W';
    console.log('   Source: ' + best.source + ' | ' + bestHeat + ' | score:' + best.viralScore.toFixed(0));
    console.log('   URL: ' + best.url);
    console.log('   Title: "' + generateViralTitle(best) + '"');
    console.log('========================================\n');

    // 清理 PowerShell 脚本
    try { fs.unlinkSync(_psScript); } catch(e) {}

    return { best: best, all: top15, videoTopics: videoTopics.slice(0, 5) };
}

main().catch(function(e) {
    console.error('[ERROR]:', e.message);
    try { fs.unlinkSync(_psScript); } catch(e2) {}
});
