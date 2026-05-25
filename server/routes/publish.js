/**
 * 发布路由（直接调微信API + 推送状态记录 v8.0）
 * 
 * 架构说明：
 * - 核心发布引擎是 scripts/enhanced-engine.js（CLI脚本，有main()函数）
 * - 本文件是 Web UI 的 HTTP 接口，提供 /api/publish 路由
 * - 微信发布：直接调微信 HTTP API（获取token → draft/add），不依赖任何插件
 * - CMS发布：调用 services/cms.js
 * - 日志记录：content_publish_log 表
 */

const express = require('express');
const router = express.Router();
const cms = require('../services/cms');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { prePublishCheck } = require('../services/pre-publish-check');
const mysql = require('mysql2/promise');
const { marked } = require('marked');
const axios = require('axios');
const FormData = require('form-data');

// 文章增强模块（缩略图匹配）
const enhancer = require('../../scripts/article-enhancer');

// ── 微信配置读取（支持 process.env 和 user-config.json 双来源）──────
function getWechatConfig() {
    let config = {};
    // 1. 尝试从 user-config.json 读取
    try {
        const configPath = path.join(__dirname, '../../config/user-config.json');
        if (fs.existsSync(configPath)) {
            const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            config = raw.wechat || {};
        }
    } catch (e) {
        console.warn('⚠️ [publish] 读取 user-config.json 失败:', e.message);
    }
    // 2. process.env 优先（覆盖配置文件）
    return {
        appId: process.env.WECHAT_APP_ID || process.env.WECHAT_APPID || config.appId || '',
        appSecret: process.env.WECHAT_APP_SECRET || process.env.WECHAT_SECRET || config.appSecret || '',
        thumbMediaId: process.env.WECHAT_THUMB_MEDIA_ID || config.thumbMediaId || '',
        author: process.env.WECHAT_AUTHOR || config.author || '超云艾艾'
    };
}

// ── 微信 API 辅助函数 ──────────────────────────────────────────────────

// 获取 access_token
async function getWechatToken(appId, appSecret) {
    const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
    return new Promise((resolve, reject) => {
        https.get(tokenUrl, { timeout: 10000 }, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(d);
                    if (parsed.access_token) {
                        resolve(parsed.access_token);
                    } else {
                        reject(new Error('微信Token获取失败: ' + JSON.stringify(parsed)));
                    }
                } catch { reject(new Error('微信Token响应解析失败: ' + d)); }
            });
        }).on('error', reject).on('timeout', () => reject(new Error('微信Token请求超时')));
    });
}

// 发布到微信草稿箱（统一缩略图逻辑：优先使用传入的 thumbMediaId，否则自动匹配）
async function pushWechatDraft(title, content, thumbMediaId, contentId) {
    const wc = getWechatConfig();
    const appId = wc.appId;
    const appSecret = wc.appSecret;
    const author = wc.author;

    if (!appId || !appSecret) {
        throw new Error('微信配置缺失：请在 config/user-config.json 填写 wechat.appId 和 wechat.appSecret');
    }

    // 1. 获取 access_token
    const token = await getWechatToken(appId, appSecret);

    // 2. Markdown → HTML
    let htmlContent = content;
    try {
        htmlContent = marked.parse(content);
    } catch (e) {
        console.warn('⚠️ [publish] marked 转换失败，使用原始内容');
    }

    // 3. 处理缩略图（统一逻辑：与 enhanced-engine.js 一致）
    // 优先动态匹配缩略图，匹配失败才使用配置的 thumbMediaId
    let effectiveThumb = null;
    let digest = (content || '').replace(/<[^>]+>/g, '').slice(0, 120);

    console.log('📷 [publish] 尝试动态匹配缩略图...');
    try {
        const thumbnail = await enhancer.matchThumbnail(title, digest);
        if (thumbnail && thumbnail.url) {
            const thumbnailPath = path.join(__dirname, '../../output', `thumb_${Date.now()}.jpg`);
            const outputDir = path.dirname(thumbnailPath);
            if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
            await enhancer.downloadImage(thumbnail.url, thumbnailPath);
            console.log(`📷 [publish] 缩略图已下载: ${thumbnailPath}`);

            const uploaded = await uploadWechatMaterial(token, thumbnailPath, 'thumb');
            if (uploaded && uploaded.media_id) {
                effectiveThumb = uploaded.media_id;
                console.log(`✅ [publish] 动态缩略图已上传微信: ${effectiveThumb}`);
            }
        }
    } catch (e) {
        console.warn('⚠️ [publish] 动态缩略图匹配失败，将使用配置项:', e.message);
    }

    // 动态匹配失败时使用配置的 thumbMediaId
    if (!effectiveThumb) {
        effectiveThumb = thumbMediaId || wc.thumbMediaId;
        if (effectiveThumb) {
            console.log(`📷 [publish] 使用配置的 thumbMediaId: ${effectiveThumb.substring(0, 20)}...`);
        } else {
            console.log(`⚠️ [publish] 无缩略图可用`);
        }
    }

    // 4. 调用微信草稿箱接口
    const draftUrl = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`;
    const draftBody = JSON.stringify({
        articles: [{
            title,
            author,
            digest,
            content: htmlContent,
            thumb_media_id: effectiveThumb || '',
            show_cover_pic: 1,
            need_open_comment: 1,
            only_fans_can_comment: 0
        }]
    });

    const result = await new Promise((resolve, reject) => {
        const urlObj = new URL(draftUrl);
        const req = https.request({
            hostname: urlObj.hostname, port: 443, path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(draftBody) },
            timeout: 15000
        }, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('微信草稿箱请求超时')); });
        req.write(draftBody);
        req.end();
    });

    // 5. 记录推送状态
    if (contentId) {
        await initPublishLogTable();
        if (result.errcode === 0 || result.media_id) {
            await logPushStatus(contentId, 'wechat', 'success', { mediaId: result.media_id || null, draftId: result.media_id || null });
        } else {
            await logPushStatus(contentId, 'wechat', 'failed', { error: JSON.stringify(result) });
        }
    }

    return {
        success: result.errcode === 0 || !!result.media_id,
        mediaId: result.media_id || null,
        articleId: result.media_id || null,
        raw: result
    };
}

// ── 上传素材到微信（thumb 或其他类型）─────────────────────
async function uploadWechatMaterial(token, filePath, type = 'thumb') {
    const uploadUrl = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${token}&type=${type}`;
    const form = new FormData();
    form.append('media', fs.createReadStream(filePath), path.basename(filePath));

    try {
        const resp = await axios.post(uploadUrl, form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 30000
        });
        console.log('   微信素材上传响应:', JSON.stringify(resp.data));
        return resp.data;
    } catch (e) {
        console.error('   微信素材上传失败:', e.message);
        return null;
    }
}

// ── 初始化推送日志表 ─────────────────────────────
async function initPublishLogTable() {
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST || '82.156.40.94',
            user: process.env.DB_USER || 'eastaiai',
            password: process.env.DB_PASSWORD || 'alibaba',
            database: process.env.DB_NAME || 'eastaiai',
            charset: 'utf8mb4',
            connectTimeout: 15000
        });
        
        await conn.execute(`
            CREATE TABLE IF NOT EXISTS content_publish_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                content_id INT NOT NULL COMMENT 'CMS文章ID',
                platform VARCHAR(50) NOT NULL COMMENT '平台: wechat/cms/xiaohongshu/notepad',
                status ENUM('pending', 'success', 'failed', 'retry') NOT NULL DEFAULT 'pending',
                error_msg TEXT COMMENT '失败原因',
                wechat_media_id VARCHAR(255) COMMENT '微信返回的media_id',
                wechat_draft_id VARCHAR(255) COMMENT '微信草稿箱ID',
                published_at DATETIME COMMENT '成功发布时间',
                retry_count INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_content (content_id),
                INDEX idx_status (status),
                INDEX idx_platform (platform),
                UNIQUE KEY uk_content_platform (content_id, platform)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='内容推送状态记录表'
        `);
        
        console.log('✅ [DB] content_publish_log 表已就绪');
        await conn.end();
        return true;
    } catch (e) {
        console.error('❌ [DB] 初始化推送日志表失败:', e.message);
        return false;
    }
}

// ── 记录推送状态 ─────────────────────────────
async function logPushStatus(contentId, platform, status, extra = {}) {
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST || '82.156.40.94',
            user: process.env.DB_USER || 'eastaiai',
            password: process.env.DB_PASSWORD || 'alibaba',
            database: process.env.DB_NAME || 'eastaiai',
            charset: 'utf8mb4',
            connectTimeout: 15000
        });
        
        await conn.execute(`
            INSERT INTO content_publish_log 
                (content_id, platform, status, error_msg, wechat_media_id, wechat_draft_id, published_at, retry_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            ON DUPLICATE KEY UPDATE
                status = VALUES(status),
                error_msg = VALUES(error_msg),
                wechat_media_id = VALUES(wechat_media_id),
                wechat_draft_id = VALUES(wechat_draft_id),
                published_at = VALUES(published_at),
                retry_count = retry_count + 1,
                updated_at = CURRENT_TIMESTAMP
        `, [contentId, platform, status, extra.error || null, extra.mediaId || null, extra.draftId || null, status === 'success' ? new Date() : null]);
        
        console.log(`✅ [DB] 推送状态已记录: contentId=${contentId}, platform=${platform}, status=${status}`);
        await conn.end();
    } catch (e) {
        console.error('❌ [DB] 记录推送状态失败:', e.message);
    }
}

// ══════════════════════════════════════════════════════════════════════
// 路由
// ══════════════════════════════════════════════════════════════════════

// ── 健康检查 ────────────────────────────
router.get('/health', (req, res) => {
    const wc = getWechatConfig();
    res.json({
        success: true,
        wechat: {
            configured: !!(wc.appId && wc.appSecret),
            hasThumbMediaId: !!wc.thumbMediaId,
            appId: wc.appId ? wc.appId.substring(0, 6) + '***' : '未配置'
        }
    });
});

// ── 发布到微信公众号 ─────────────────────────────────────────────────
router.post('/wechat', async (req, res) => {
    const startTime = Date.now();
    console.log('📤 [API] ========== 开始处理微信公众号发布请求 ==========');
    
    try {
        const { title, content, contentId } = req.body;
        
        if (!title || !content) {
            return res.status(400).json({ 
                success: false, 
                message: '缺少标题或内容' 
            });
        }
        
        console.log('📤 [API] 标题:', title);
        console.log('📤 [API] 内容长度:', content.length);
        
        const result = await pushWechatDraft(title, content, null, contentId);
        
        const elapsed = Date.now() - startTime;
        if (result.success) {
            console.log(`📤 [API] ✅ 微信草稿箱发布成功! mediaId=${result.mediaId} (耗时 ${elapsed}ms)`);
            res.json({ 
                success: true, 
                message: '微信公众号发布成功',
                data: { 
                    platform: 'wechat', 
                    articleId: result.articleId,
                    mediaId: result.mediaId,
                    status: 'draft',
                    elapsedMs: elapsed
                }
            });
        } else {
            console.error('📤 [API] ❌ 微信发布返回失败:', JSON.stringify(result.raw));
            throw new Error(result.raw.errmsg || '微信发布失败: ' + JSON.stringify(result.raw));
        }
    } catch (e) {
        const elapsed = Date.now() - startTime;
        console.error(`📤 [API] ❌ 微信发布失败! (耗时 ${elapsed}ms)`, e.message);
        res.status(500).json({ 
            success: false, 
            message: e.message,
            debug: {
                hasAppId: !!(process.env.WECHAT_APP_ID || process.env.WECHAT_APPID),
                hasAppSecret: !!(process.env.WECHAT_APP_SECRET || process.env.WECHAT_SECRET),
                hasThumbMediaId: !!(process.env.WECHAT_THUMB_MEDIA_ID)
            }
        });
    } finally {
        console.log('📤 [API] ========== 结束处理微信公众号发布请求 ==========');
    }
});

// ── 发布到CMS（同步推微信草稿箱）─────────────────────────────────
router.post('/cms', async (req, res) => {
    const startTime = Date.now();
    console.log('📤 [API] ========== 开始处理CMS发布请求 ==========');

    try {
        const { title, content, toWechat, thumbUrl, thumbMediaId, platforms } = req.body;

        if (!title || !content) {
            return res.status(400).json({ success: false, message: '缺少标题或内容' });
        }

        // 发布前方法论检查
        const checkResult = prePublishCheck(content, { topic: title });
        if (!checkResult.pass) {
            console.warn('📤 [API] 发布前检查未通过:', checkResult.errors.join('; '));
        } else {
            console.log('📤 [API] ✅ 发布前检查通过');
        }

        // 1. 推送到 CMS 数据库
        const cmsResult = await cms.pushArticle({ title, content });
        if (!cmsResult.success) {
            throw new Error('CMS写入失败: ' + cmsResult.message);
        }
        console.log(`📤 [API] ✅ CMS写入成功 (ID: ${cmsResult.articleId})`);
        
        await initPublishLogTable();
        await logPushStatus(cmsResult.articleId, 'cms', 'success', { publishedAt: new Date() });
        
        // 2. 多平台推送
        let wechatResult = null;
        const targetPlatforms = platforms || [];
        if (toWechat && !targetPlatforms.includes('wechat')) {
            targetPlatforms.push('wechat');
        }
        
        for (const platform of targetPlatforms) {
            if (platform === 'wechat') {
                try {
                    const effectiveThumbId = thumbMediaId || process.env.WECHAT_THUMB_MEDIA_ID;
                    wechatResult = await pushWechatDraft(title, content, effectiveThumbId, cmsResult.articleId);
                    if (wechatResult.success) {
                        console.log(`📤 [API] ✅ 微信草稿箱发布成功 (MediaID: ${wechatResult.articleId})`);
                    } else {
                        console.log(`📤 [API] ⚠️ 微信发布返回: ${JSON.stringify(wechatResult)}`);
                    }
                } catch (e) {
                    console.error('📤 [API] ⚠️ 微信推送异常:', e.message);
                }
            }
            
            if (platform === 'xiaohongshu') {
                console.log('📤 [API] 小红书推送（待实现）');
            }
            
            if (platform === 'notepad') {
                console.log('📤 [API] 笔记平台推送（待实现）');
            }
        }
        
        const elapsed = Date.now() - startTime;
        res.json({
            success: true,
            message: wechatResult?.success ? 'CMS+微信发布成功' : 'CMS发布成功（微信未启用或失败）',
            data: {
                cms: { platform: 'cms', articleId: cmsResult.articleId, status: 'success' },
                wechat: wechatResult ? {
                    platform: 'wechat',
                    articleId: wechatResult.articleId,
                    status: wechatResult.success ? 'success' : 'failed'
                } : null,
                methodologyCheck: {
                    passed: checkResult.pass,
                    errors: checkResult.errors,
                    warnings: checkResult.warnings
                },
                elapsedMs: elapsed
            }
        });
    } catch (e) {
        console.error(`❌ [API] CMS发布失败: ${e.message}`);
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 将已有CMS文章推送到微信草稿箱 ──────────────────────────────────
router.post('/cms-to-wechat', async (req, res) => {
    const startTime = Date.now();
    try {
        const { articleId } = req.body;
        if (!articleId) return res.status(400).json({ success: false, message: '缺少 articleId' });
        
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST || '82.156.40.94',
            user: process.env.DB_USER || 'eastaiai',
            password: process.env.DB_PASSWORD || 'alibaba',
            database: process.env.DB_NAME || 'eastaiai',
            charset: 'utf8mb4',
            connectTimeout: 15000
        });
        const [rows] = await conn.execute(
            'SELECT id, title, content FROM lvbo_article WHERE id = ?',
            [articleId]
        );
        await conn.end();
        
        if (!rows.length) return res.status(404).json({ success: false, message: '文章不存在' });
        
        const article = rows[0];
        const result = await pushWechatDraft(article.title, article.content, null, articleId);
        
        res.json({
            success: !!result.success,
            message: result.success ? '已推送到微信草稿箱' : '推送失败',
            data: {
                platform: 'wechat',
                articleId: result.articleId,
                title: article.title,
                status: result.success ? 'success' : 'failed',
                elapsedMs: Date.now() - startTime
            }
        });
    } catch (e) {
        console.error(`❌ [API] CMS→微信失败: ${e.message}`);
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 小红书发布（待实现）─────────────────────────────────
router.post('/xiaohongshu', async (req, res) => {
    try {
        const { title, content, contentId } = req.body;
        
        if (!title || !content) {
            return res.status(400).json({ success: false, message: '缺少标题或内容' });
        }
        
        console.log('发布到小红书:', title);
        
        if (contentId) {
            await initPublishLogTable();
            await logPushStatus(contentId, 'xiaohongshu', 'pending');
        }
        
        res.json({ 
            success: true, 
            message: '小红书发布成功（模拟）',
            data: { platform: 'xiaohongshu', status: 'pending' }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 抖音发布（待实现）─────────────────────────────────
router.post('/douyin', async (req, res) => {
    try {
        const { title, content } = req.body;
        
        if (!title || !content) {
            return res.status(400).json({ success: false, message: '缺少标题或内容' });
        }
        
        console.log('发布到抖音:', title);
        
        res.json({ 
            success: true, 
            message: '抖音发布成功（模拟）',
            data: { platform: 'douyin', status: 'pending' }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 批量发布 ──────────────────────────────────────────
router.post('/batch', async (req, res) => {
    try {
        const { articles } = req.body;
        
        if (!Array.isArray(articles) || articles.length === 0) {
            return res.status(400).json({ success: false, message: '文章列表不能为空' });
        }
        
        const results = [];
        for (const article of articles) {
            try {
                const result = await cms.pushArticle(article);
                results.push({ title: article.title, ...result });
            } catch (e) {
                results.push({ title: article.title, success: false, message: e.message });
            }
        }
        
        const successCount = results.filter(r => r.success).length;
        res.json({
            success: true,
            data: {
                total: articles.length,
                success: successCount,
                failed: articles.length - successCount,
                results
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── AI自动生成并发布（异步调用 enhanced-engine.js）─────────────────
const { spawn } = require('child_process');
const generateTasks = new Map();

router.post('/auto-generate', (req, res) => {
    const taskId = 'gen_' + Date.now();
    console.log('🤖 [API] ========== 开始AI自动生成并发布 ==========');
    
    const { model, style, words, keywords, toWechat, toCMS } = req.body;
    console.log('🤖 [API] 参数:', { model, style, words, keywords, toWechat, toCMS });
    
    generateTasks.set(taskId, {
        status: 'running',
        startTime: Date.now(),
        output: '',
        error: null,
        result: null
    });
    
    res.json({ success: true, taskId, message: '任务已提交，请轮询状态' });
    
    const enginePath = path.join(__dirname, '../../scripts/enhanced-engine.js');
    const env = {
        ...process.env,
        WB_MODEL: model || 'deepseek',
        WB_STYLE: style || 'kazik',
        WB_WORDS: words || '4000',
        WB_KEYWORDS: keywords || '',
        WB_TO_WECHAT: toWechat ? '1' : '0',
        WB_TO_CMS: toCMS ? '1' : '0'
    };
    
    const child = spawn('node', [enginePath], { env, cwd: path.dirname(enginePath) });
    
    child.stdout.on('data', (data) => {
        const str = data.toString();
        const task = generateTasks.get(taskId);
        if (task) task.output += str;
        console.log('🤖 [engine]', str.trim().substring(0, 200));
    });
    
    child.stderr.on('data', (data) => {
        const str = data.toString();
        const task = generateTasks.get(taskId);
        if (task) task.output += str;
        console.error('🤖 [engine:err]', str.trim().substring(0, 200));
    });
    
    child.on('close', (code) => {
        const task = generateTasks.get(taskId);
        if (!task) return;
        
        const elapsed = Date.now() - task.startTime;
        
        if (code === 0) {
            const out = task.output;
            const titleMatch = out.match(/标题[:\s]*([^\n]+)/);
            const mediaIdMatch = out.match(/MediaID[:\s]*([\w_-]+)/);
            const categoryMatch = out.match(/分类[:\s]*([^\n]+)/);
            const wordCountMatch = out.match(/字数[:\s]*(\d+)/);
            const publishMatch = out.match(/发布成功|草稿发布成功|draft/i);
            
            task.status = 'completed';
            task.result = {
                title: titleMatch ? titleMatch[1].trim() : 'AI生成文章',
                mediaId: mediaIdMatch ? mediaIdMatch[1].trim() : null,
                category: categoryMatch ? categoryMatch[1].trim() : 'AI',
                wordCount: wordCountMatch ? parseInt(wordCountMatch[1]) : 0,
                published: !!publishMatch,
                elapsedMs: elapsed,
                output: out.substring(out.length - 3000)
            };
            console.log(`🤖 [API] ✅ 任务完成! (耗时 ${elapsed}ms)`);
        } else {
            task.status = 'failed';
            task.error = `进程退出码: ${code}`;
            console.error(`🤖 [API] ❌ 任务失败! 退出码: ${code} (耗时 ${elapsed}ms)`);
        }
        
        setTimeout(() => generateTasks.delete(taskId), 30 * 60 * 1000);
    });
});

// ── 查询生成任务状态 ──────────────────────────────────────────
router.get('/auto-generate/:taskId', (req, res) => {
    const task = generateTasks.get(req.params.taskId);
    if (!task) {
        return res.status(404).json({ success: false, message: '任务不存在' });
    }
    res.json({ success: true, ...task });
});

// ── 获取话题库 ──────────────────────────────────────────────
router.get('/topics', async (req, res) => {
    try {
        const topicsPath = path.join(__dirname, '../../data/topics.json');
        
        if (!fs.existsSync(topicsPath)) {
            return res.json({
                success: true,
                data: [
                    { id: 1, topic: '人形机器人最新进展', category: 'AI硬件' },
                    { id: 2, topic: 'GPT-6技术突破', category: '大模型' },
                    { id: 3, topic: 'AI智能体应用', category: '智能体' },
                    { id: 4, topic: '特斯拉FSD更新', category: '自动驾驶' },
                    { id: 5, topic: 'DeepSeek开源模型', category: '大模型' },
                    { id: 6, topic: '具身智能发展', category: 'AI硬件' },
                    { id: 7, topic: '工业AI质检', category: '工业软件' },
                    { id: 8, topic: '数字员工落地', category: '企业AI' }
                ]
            });
        }
        
        const topics = JSON.parse(fs.readFileSync(topicsPath, 'utf8'));
        res.json({ success: true, data: topics });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 预览（Markdown → HTML）────────────────────────────
router.post('/preview', async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) {
            return res.json({ success: false, message: '内容不能为空' });
        }
        
        const html = marked.parse(content);
        res.json({ success: true, html: html });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
