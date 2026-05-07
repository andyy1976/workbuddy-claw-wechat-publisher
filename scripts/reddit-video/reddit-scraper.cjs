/**
 * Reddit 帖子抓取模块
 * 支持：指定帖子 / 批量 / 随机 / AI语义选帖
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadEnv } = require('./env-loader.cjs');
loadEnv();

const { redditConfig, filterConfig } = require('./config.cjs');

// ── 低层 HTTP 请求（用于 PRAW 替代，避免依赖）────────────────────
function httpGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const isHttps = u.protocol === 'https:';
        const requester = isHttps ? https : http;
        const req = requester.get({
            hostname: u.hostname,
            port: u.port || (isHttps ? 443 : 80),
            path: u.pathname + u.search,
            headers: { 'User-Agent': redditConfig.user_agent, ...headers }
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try { resolve(JSON.parse(d)); } catch { reject(new Error('JSON 解析失败: ' + d.substring(0, 200))); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('请求超时')); });
    });
}

// ── Reddit OAuth 认证 ────────────────────────────────────
async function getAccessToken() {
    const u = new URL('https://www.reddit.com/api/v1/access_token');
    const body = `grant_type=password&username=${encodeURIComponent(redditConfig.username)}&password=${encodeURIComponent(redditConfig.password)}`;

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: u.hostname, port: 443,
            path: u.pathname,
            method: 'POST',
            headers: {
                'User-Agent': redditConfig.user_agent,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body),
                'Authorization': 'Basic ' + Buffer.from(
                    `${redditConfig.client_id}:${redditConfig.client_secret}`
                ).toString('base64')
            }
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try {
                    const r = JSON.parse(d);
                    if (r.access_token) resolve(r.access_token);
                    else reject(new Error('获取 AccessToken 失败: ' + JSON.stringify(r)));
                } catch { reject(new Error('Token 响应解析失败')); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ── 获取热门帖子 ─────────────────────────────────────────
async function fetchHotPosts(subreddit, limit = 25) {
    const token = await getAccessToken();
    console.log(`   🔍 从 r/${subreddit} 抓取 ${limit} 条热门帖子...`);

    const data = await httpGet(
        `https://oauth.reddit.com/r/${subreddit}/hot.json?limit=${limit}`,
        { 'Authorization': `Bearer ${token}` }
    );

    const posts = (data.data?.children || [])
        .map(child => normalizePost(child.data))
        .filter(p => filterPost(p));

    console.log(`   ✅ 获取到 ${posts.length} 条符合条件的帖子`);
    return posts;
}

// ── 获取指定帖子 ──────────────────────────────────────────
async function fetchPostById(postId, subreddit = null) {
    const token = await getAccessToken();
    let url;
    if (subreddit) {
        url = `https://oauth.reddit.com/r/${subreddit}/comments/${postId}.json`;
    } else {
        url = `https://oauth.reddit.com/api/info.json?id=t3_${postId}`;
    }

    const data = await httpGet(url, { 'Authorization': `Bearer ${token}` });
    const raw = Array.isArray(data) ? data[0]?.data?.children?.[0]?.data : data?.data?.children?.[0]?.data;
    if (!raw) throw new Error(`帖子 ${postId} 未找到`);
    return normalizePost(raw);
}

// ── 获取多帖子（postId 用 + 分隔）──────────────────────────
async function fetchMultiplePosts(postIds, subreddit) {
    const token = await getAccessToken();
    const ids = postIds.split('+').map(id => `t3_${id.trim()}`).join(',');
    const data = await httpGet(
        `https://oauth.reddit.com/api/info.json?id=${ids}`,
        { 'Authorization': `Bearer ${token}` }
    );
    return (data.data?.children || [])
        .map(child => normalizePost(child.data))
        .filter(p => filterPost(p));
}

// ── 获取帖子评论 ─────────────────────────────────────────
async function fetchComments(postId, subreddit, limit = 10) {
    const token = await getAccessToken();
    const data = await httpGet(
        `https://oauth.reddit.com/r/${subreddit}/comments/${postId}.json?limit=${limit}`,
        { 'Authorization': `Bearer ${token}` }
    );

    const commentData = data[1]?.data?.children || [];
    return commentData
        .filter(c => c.data && !c.data.stickied && !c.data.deleted && c.data.body)
        .map(c => normalizeComment(c.data));
}

// ── 数据标准化 ───────────────────────────────────────────
function normalizePost(raw) {
    return {
        id: raw.id,
        subreddit: raw.subreddit || raw.subreddit_name_prefixed?.replace('r/', ''),
        title: raw.title,
        selftext: raw.selftext || '',
        score: raw.score || 0,
        num_comments: raw.num_comments || 0,
        author: raw.author?.name || raw.author || '[deleted]',
        url: `https://reddit.com/r/${raw.subreddit}/${raw.id}`,
        created_utc: raw.created_utc,
        permalink: `https://reddit.com${raw.permalink}`,
        is_self: raw.is_self ?? true,
        thumbnail: raw.thumbnail,
        link_flair_text: raw.link_flair_text || '',
        over_18: raw.over_18 ?? false,
    };
}

function normalizeComment(raw) {
    return {
        id: raw.id,
        author: raw.author?.name || raw.author || '[deleted]',
        body: raw.body,
        score: raw.score || 0,
        created_utc: raw.created_utc,
        is_submitter: raw.is_submitter ?? false,
    };
}

// ── 帖子过滤 ────────────────────────────────────────────
function filterPost(post) {
    if (post.over_18) return false;
    if (post.score < filterConfig.minScore) return false;
    if (post.num_comments < filterConfig.minCommentCount) return false;
    const t = post.title;
    if (t.length < filterConfig.minTitleLength || t.length > filterConfig.maxTitleLength) return false;

    if (filterConfig.excludeKeywords.length) {
        for (const kw of filterConfig.excludeKeywords) {
            if (kw && (t.includes(kw) || post.selftext.includes(kw))) return false;
        }
    }

    if (filterConfig.includeKeywords.length) {
        const hit = filterConfig.includeKeywords.some(kw => kw && (t.includes(kw) || post.selftext.includes(kw)));
        if (!hit) return false;
    }

    return true;
}

// ── AI 语义选帖（sentence-transformers）─────────────────
async function rankPostsBySimilarity(posts) {
    if (!filterConfig.aiSimilarityEnabled || !filterConfig.similarityKeywords.length) {
        return posts.sort((a, b) => b.score - a.score);
    }

    console.log(`   🤖 正在加载 sentence-transformers 进行语义匹配...`);

    let transformers;
    try {
        const { pipeline } = await import('@xenova/transformers');
        const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        const kwEmbedding = await extractor(filterConfig.similarityKeywords.join(' '), { pooling: 'mean' });

        const scored = [];
        for (const post of posts) {
            const text = `${post.title} ${post.selftext}`.substring(0, 512);
            const emb = await extractor(text, { pooling: 'mean' });
            const sim = cosineSimilarity(kwEmbedding, emb);
            scored.push({ ...post, similarity: sim });
        }

        scored.sort((a, b) => b.similarity - a.similarity);
        console.log(`   ✅ AI 选帖完成，最相关帖子: "${scored[0]?.title?.substring(0, 50)}..." (相似度:${scored[0]?.similarity?.toFixed(3)})`);
        return scored;
    } catch (e) {
        console.warn('   ⚠️  sentence-transformers 加载失败，退回到评分排序:', e.message);
        return posts.sort((a, b) => b.score - a.score);
    }
}

function cosineSimilarity(a, b) {
    if (!a || !b) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

// ── 选择最佳帖子 ─────────────────────────────────────────
async function selectBestPost(subreddit, count = 5) {
    let posts = await fetchHotPosts(subreddit, 50);
    posts = await rankPostsBySimilarity(posts);
    return posts.slice(0, count);
}

// ── 导出帖子为 JSON（供后续管线使用）──────────────────────
async function exportPost(postId, subreddit) {
    const post = await fetchPostById(postId, subreddit);
    const comments = await fetchComments(postId, subreddit, 15);

    return {
        post,
        comments: comments.filter(c => c.score > 1),
        exportedAt: new Date().toISOString(),
    };
}

module.exports = {
    fetchHotPosts,
    fetchPostById,
    fetchMultiplePosts,
    fetchComments,
    selectBestPost,
    exportPost,
    rankPostsBySimilarity,
};
