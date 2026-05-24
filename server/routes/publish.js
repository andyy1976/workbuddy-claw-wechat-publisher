/**
 * 发布路由（多平台发布 + 推送状态记录 v7.0）
 */

const express = require('express');
const router = express.Router();
const cms = require('../services/cms');
const path = require('path');
const fs = require('fs');
const { prePublishCheck } = require('../services/pre-publish-check');
const mysql = require('mysql2/promise');
const { marked } = require('marked');

// 直接加载 wechat-publisher-plugin 的 MultiPlatformPublisher 类
let MultiPlatformPublisher = null;
let pluginLoaded = false;
let pluginLoadError = null;

try {
    const pluginPath = path.join(__dirname, '../../scripts/multi-platform-publisher.cjs');
    console.log('📤 [PLUGIN] 正在加载插件:', pluginPath);
    
    if (!fs.existsSync(pluginPath)) {
        throw new Error(`插件文件不存在: ${pluginPath}`);
    }
    
    MultiPlatformPublisher = require(pluginPath);
    pluginLoaded = true;
    console.log('✅ [PLUGIN] wechat-publisher-plugin 加载成功');
    console.log('   类型:', typeof MultiPlatformPublisher);
    console.log('   导出内容:', Object.keys(MultiPlatformPublisher || {}));
} catch (e) {
    pluginLoaded = false;
    pluginLoadError = e.message;
    console.error('❌ [PLUGIN] wechat-publisher-plugin 加载失败:', e.message);
    console.error('   堆栈:', e.stack);
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
    
    console.log('[DB] 检查 content_publish_log 表...');
    
    // 创建表（如果不存在）
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
    
    // UPSERT（存在则更新，不存在则插入）
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

// ── 健康检查 ────────────────────────────
router.get('/health', (req, res) => {
    res.json({
        success: true,
        plugin: {
            loaded: pluginLoaded,
            error: pluginLoadError,
            classType: typeof MultiPlatformPublisher
        }
    });
});

// ── 发布到微信公众号（直接调用 wechat-publisher-plugin） ──────────────────────────
router.post('/wechat', async (req, res) => {
    const startTime = Date.now();
    console.log('📤 [API] ========== 开始处理微信公众号发布请求 ==========');
    console.log('📤 [API] 时间:', new Date().toISOString());
    
    try {
        const { title, content, contentId } = req.body;
        
        console.log('📤 [API] 收到请求参数:');
        console.log('   标题:', title ? title.substring(0, 50) : '【空】');
        console.log('   内容长度:', content ? content.length : '【空】');
        console.log('   contentId:', contentId || '【空】');
        
        if (!title || !content) {
            console.error('❌ [API] 参数检查失败: 缺少标题或内容');
            return res.status(400).json({ 
                success: false, 
                message: '缺少标题或内容',
                debug: { title: !!title, content: !!content }
            });
        }
        
        console.log('📤 [API] ✅ 参数检查通过');
        console.log('📤 [API] 标题:', title);
        
        // 检查是否已加载插件
        console.log('📤 [API] 检查插件加载状态...');
        console.log('   插件加载状态:', pluginLoaded);
        console.log('   插件类型:', typeof MultiPlatformPublisher);
        
        if (!pluginLoaded || !MultiPlatformPublisher) {
            console.error('❌ [API] wechat-publisher-plugin 未正确加载');
            console.error('   加载错误:', pluginLoadError);
            throw new Error('wechat-publisher-plugin 未加载: ' + pluginLoadError);
        }
        
        console.log('📤 [API] ✅ 插件已加载，开始初始化...');
        
        // 读取微信公众号配置（包含 thumbMediaId！）
        const wechatConfig = {
            appId: process.env.WECHAT_APP_ID,
            appSecret: process.env.WECHAT_APP_SECRET,
            thumbMediaId: process.env.WECHAT_THUMB_MEDIA_ID,
            author: 'WorkBuddy'
        };
        
        console.log('📤 [API] 微信配置检查:');
        console.log('   APP_ID:', wechatConfig.appId ? '✅ 已配置' : '❌ 未配置');
        console.log('   APP_SECRET:', wechatConfig.appSecret ? '✅ 已配置 (长度:' + wechatConfig.appSecret.length + ')' : '❌ 未配置');
        console.log('   THUMB_MEDIA_ID:', wechatConfig.thumbMediaId ? '✅ 已配置 (长度:' + wechatConfig.thumbMediaId.length + ')' : '❌ 未配置');
        
        if (!wechatConfig.appId || !wechatConfig.appSecret) {
            throw new Error('微信公众号配置不完整，请检查 .env 文件中的 WECHAT_APP_ID 和 WECHAT_APP_SECRET');
        }
        
        if (!wechatConfig.thumbMediaId) {
            console.warn('⚠️ [API] 缺少 THUMB_MEDIA_ID，微信API可能报错 40007');
            console.warn('   请在 .env 中配置 WECHAT_THUMB_MEDIA_ID');
        }
        
        console.log('📤 [API] ✅ 微信配置检查通过');
        console.log('📤 [API] 初始化 MultiPlatformPublisher...');
        
        // 初始化发布器
        let publisher;
        try {
            publisher = new MultiPlatformPublisher({ wechat: wechatConfig });
            console.log('📤 [API] ✅ MultiPlatformPublisher 初始化成功');
            console.log('   实例类型:', typeof publisher);
            console.log('   可用方法:', Object.getOwnPropertyNames(Object.getPrototypeOf(publisher)));
        } catch (initError) {
            console.error('❌ [API] MultiPlatformPublisher 初始化失败:', initError.message);
            console.error('   堆栈:', initError.stack);
            throw new Error('插件初始化失败: ' + initError.message);
        }
        
        console.log('📤 [API] 调用 publisher.init()...');
        try {
            await publisher.init();
            console.log('📤 [API] ✅ publisher.init() 成功');
        } catch (initError) {
            console.error('❌ [API] publisher.init() 失败:', initError.message);
            console.error('   堆栈:', initError.stack);
            throw new Error('插件 init() 失败: ' + initError.message);
        }
        
        console.log('📤 [API] 调用 publisher.publishToWechat()...');
        console.log('   参数: ', { 
            title: title.substring(0, 30) + '...',
            contentLength: content.length,
            thumbMediaId: wechatConfig.thumbMediaId ? '已配置' : '未配置'
        });
        
        // === 新增：Markdown → HTML 排版 ===
        console.log('📤 [API] 开始 Markdown → HTML 排版...');
        let htmlContent = content;
        try {
          // 如果有 marked 库，转为 HTML
          if (require.resolve('marked')) {
            const { marked } = require('marked');
            htmlContent = marked(content);
            console.log('✅ [API] Markdown → HTML 转换成功');
          }
        } catch (e) {
          console.warn('⚠️ [API] marked 库未安装，使用原始内容');
        }
        
        // === 新增：生成缩略图（AI绘图 或 图库） ===
        console.log('📤 [API] 生成缩略图...');
        let thumbMediaId = wechatConfig.thumbMediaId;
        // TODO: 调用 AI 绘图 API 或 图库 API 生成缩略图
        // 当前先用默认 thumbMediaId
        
        // 发布到微信公众号草稿箱
        let result;
        try {
            result = await publisher.publishToWechat({
                title: title,
                content: htmlContent,  // ← 改用 HTML
                description: content.substring(0, 120) + '...',
                thumbMediaId: thumbMediaId  // ← 缩略图
            });
            console.log('📤 [API] ✅ publisher.publishToWechat() 成功');
            console.log('   返回结果:', JSON.stringify(result, null, 2));
        } catch (publishError) {
            console.error('❌ [API] publisher.publishToWechat() 失败:', publishError.message);
            console.error('   堆栈:', publishError.stack);
            throw new Error('微信发布失败: ' + publishError.message);
        }
        
        if (result.success) {
            const elapsed = Date.now() - startTime;
            console.log(`📤 [API] ✅✅✅ 微信公众号草稿发布成功! (耗时 ${elapsed}ms)`);
            console.log('   文章ID:', result.articleId);
            
            // === 新增：记录推送状态 ===
            if (contentId) {
              await initPublishLogTable();
              await logPushStatus(contentId, 'wechat', 'success', {
                mediaId: result.mediaId || null,
                draftId: result.articleId || null
              });
            }
            
            res.json({ 
                success: true, 
                message: '微信公众号发布成功',
                data: { 
                    platform: 'wechat', 
                    articleId: result.articleId,
                    mediaId: result.mediaId || null,
                    status: 'draft',
                    elapsedMs: elapsed
                }
            });
        } else {
            console.error('❌ [API] 微信公众号发布返回失败:', result.error);
            
            // === 新增：记录推送失败状态 ===
            if (contentId) {
              await initPublishLogTable();
              await logPushStatus(contentId, 'wechat', 'failed', {
                error: result.error || '未知错误'
              });
            }
            
            throw new Error(result.error || '发布失败');
        }
    } catch (e) {
        const elapsed = Date.now() - startTime;
        console.error(`❌ [API] ❌❌❌ 微信公众号发布失败! (耗时 ${elapsed}ms)`);
        console.error('   错误:', e.message);
        console.error('   堆栈:', e.stack);
        
        res.status(500).json({ 
            success: false, 
            message: e.message,
            debug: {
                pluginLoaded,
                pluginError: pluginLoadError,
                env: {
                    hasAppId: !!process.env.WECHAT_APP_ID,
                    hasAppSecret: !!process.env.WECHAT_APP_SECRET,
                    hasThumbMediaId: !!process.env.WECHAT_THUMB_MEDIA_ID
                }
            }
        });
    } finally {
        console.log('📤 [API] ========== 结束处理微信公众号发布请求 ==========');
    }
});

// ── 发布到CMS（同步推微信草稿箱）─────────────────────────────────
// 
// 流程: 推送CMS数据库 → 同步推微信草稿箱 → 返回双平台结果
// 
// ── 内部：推送微信草稿箱（复用插件逻辑）────────────────────────
async function pushWechatDraft(title, content, thumbMediaId, contentId) {
    if (!pluginLoaded || !MultiPlatformPublisher) {
        throw new Error('微信插件未加载');
    }
    const wechatConfig = {
        appId: process.env.WECHAT_APP_ID,
        appSecret: process.env.WECHAT_APP_SECRET,
        thumbMediaId: thumbMediaId || process.env.WECHAT_THUMB_MEDIA_ID,
        author: 'WorkBuddy'
    };
    const publisher = new MultiPlatformPublisher({ wechat: wechatConfig });
    await publisher.init();
    
    // Markdown → HTML
    let htmlContent = content;
    try {
      if (require.resolve('marked')) {
        const { marked } = require('marked');
        htmlContent = marked(content);
      }
    } catch (e) {}
    
    const result = await publisher.publishToWechat({
        title,
        content: htmlContent,
        description: content.substring(0, 120) + '...',
        thumbMediaId: wechatConfig.thumbMediaId
    });
    
    // 记录推送状态
    if (contentId) {
      await initPublishLogTable();
      if (result.success) {
        await logPushStatus(contentId, 'wechat', 'success', {
          mediaId: result.mediaId || null,
          draftId: result.articleId || null
        });
      } else {
        await logPushStatus(contentId, 'wechat', 'failed', {
          error: result.error || '未知错误'
        });
      }
    }
    
    return result;
}

// 
// ── POST /cms ──
// 
router.post('/cms', async (req, res) => {
    const startTime = Date.now();
    console.log('📤 [API] ========== 开始处理CMS发布请求（同步微信）==========');

    try {
        const { title, content, toWechat, thumbUrl, thumbMediaId, platforms } = req.body;

        if (!title || !content) {
            return res.status(400).json({ success: false, message: '缺少标题或内容' });
        }

        // ── 发布前方法论检查 ─────────────────────────────────────
        const checkResult = prePublishCheck(content, { topic: title });
        if (!checkResult.pass) {
            console.warn('📤 [API] 发布前检查未通过:', checkResult.errors.join('; '));
            // 记录但不阻止发布（可配置为转人工审核）
        } else {
            console.log('📤 [API] ✅ 发布前检查通过');
        }

        // 1. 推送到 CMS 数据库（首要：保存起来，不丢失）
        const cmsResult = await cms.pushArticle({ title, content });
        if (!cmsResult.success) {
            throw new Error('CMS写入失败: ' + cmsResult.message);
        }
        console.log(`📤 [API] ✅ CMS写入成功 (ID: ${cmsResult.articleId})`);
        
        // === 新增：记录 CMS 推送状态 ===
        await initPublishLogTable();
        await logPushStatus(cmsResult.articleId, 'cms', 'success', {
          publishedAt: new Date()
        });
        
        // 2. 同步推微信草稿箱（如果有缩略图URL，先上传再推）
        let wechatResult = null;
        let xiaohongshuResult = null;
        
        // 多平台推送
        const targetPlatforms = platforms || [];
        if (!toWechat && targetPlatforms.length === 0) {
          // 默认只推 CMS
          targetPlatforms.push('cms');
        }
        
        for (const platform of targetPlatforms) {
          if (platform === 'wechat' && pluginLoaded) {
            try {
                let effectiveThumbId = thumbMediaId || process.env.WECHAT_THUMB_MEDIA_ID;
                
                // 如果有 thumbUrl，尝试从URL提取缩略图上传
                if (thumbUrl && !effectiveThumbId) {
                    // 简单处理：直接用默认 thumb_media_id
                    effectiveThumbId = process.env.WECHAT_THUMB_MEDIA_ID;
                }
                
                wechatResult = await pushWechatDraft(title, content, effectiveThumbId, cmsResult.articleId);
                if (wechatResult.success) {
                    console.log(`📤 [API] ✅ 微信草稿箱发布成功 (MediaID: ${wechatResult.articleId})`);
                } else {
                    console.log(`📤 [API] ⚠️ 微信发布返回: ${JSON.stringify(wechatResult)}`);
                }
            } catch (e) {
                console.error('📤 [API] ⚠️ 微信推送异常:', e.message);
                // 不阻断，只记录
            }
          }
          
          // TODO: 小红书推送
          if (platform === 'xiaohongshu') {
            console.log('📤 [API] 小红书推送（待实现）');
            // xiaohongshuResult = await pushXiaohongshu(title, content, cmsResult.articleId);
          }
          
          // TODO: 笔记平台推送
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

// 
// ── POST /cms-to-wechat ── 将已有CMS文章推送到微信草稿箱
// 
router.post('/cms-to-wechat', async (req, res) => {
    const startTime = Date.now();
    try {
        const { articleId } = req.body;
        if (!articleId) return res.status(400).json({ success: false, message: '缺少 articleId' });
        
        // 从 CMS 数据库读取文章
        const mysql = require('mysql2/promise');
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
        const thumbMediaId = process.env.WECHAT_THUMB_MEDIA_ID;
        
        const result = await pushWechatDraft(article.title, article.content, thumbMediaId, articleId);
        
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

// ── 其他路由保持不变 ─────────────────────────────
router.post('/xiaohongshu', async (req, res) => {
    try {
        const { title, content, contentId } = req.body;
        
        if (!title || !content) {
            return res.status(400).json({ success: false, message: '缺少标题或内容' });
        }
        
        // TODO: 调用小红书开放平台API发布
        // 当前先返回成功（模拟）
        console.log('发布到小红书:', title);
        
        // 记录推送状态
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

router.post('/douyin', async (req, res) => {
    try {
        const { title, content } = req.body;
        
        if (!title || !content) {
            return res.status(400).json({ success: false, message: '缺少标题或内容' });
        }
        
        // TODO: 调用抖音开放平台API发布
        // 当前先返回成功（模拟）
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

// ── AI自动生成并发布（异步调用 enhanced-engine.js）─────────────────────────
const { spawn } = require('child_process');

// 任务存储
const generateTasks = new Map();

router.post('/auto-generate', (req, res) => {
    const taskId = 'gen_' + Date.now();
    console.log('🤖 [API] ========== 开始AI自动生成并发布 ==========');
    console.log('🤖 [API] taskId:', taskId);
    
    const { model, style, words, keywords, toWechat, toCMS } = req.body;
    console.log('🤖 [API] 参数:', { model, style, words, keywords, toWechat, toCMS });
    
    // 初始化任务状态
    generateTasks.set(taskId, {
        status: 'running',
        startTime: Date.now(),
        output: '',
        error: null,
        result: null
    });
    
    // 立即返回任务ID
    res.json({ success: true, taskId, message: '任务已提交，请轮询状态' });
    
    // 异步执行 enhanced-engine.js
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
    
    console.log('🤖 [API] 异步执行:', enginePath);
    
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
            // 解析输出
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
        
        // 30分钟后自动清理
        setTimeout(() => generateTasks.delete(taskId), 30 * 60 * 1000);
    });
});

// ── 查询生成任务状态 ──────────────────────────────────────────────────────────
router.get('/auto-generate/:taskId', (req, res) => {
    const task = generateTasks.get(req.params.taskId);
    if (!task) {
        return res.status(404).json({ success: false, message: '任务不存在' });
    }
    res.json({ success: true, ...task });
});

// ── 获取话题库 ──────────────────────────────────────────────────────────────
router.get('/topics', async (req, res) => {
    try {
        const topicsPath = path.join(__dirname, '../../data/topics.json');
        
        if (!fs.existsSync(topicsPath)) {
            // 如果不存在，返回默认话题
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
        
        // 使用 marked 转换 Markdown → HTML
        const html = marked.parse(content);
        
        res.json({ success: true, html: html });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
