/**
 * 发布路由
 * POST /api/publish/preview    - 预览排版
 * POST /api/publish/wechat     - 发布到微信公众号
 * POST /api/publish/batch      - 批量推送
 */

const express = require('express');
const router = express.Router();
const cms = require('../services/cms');

// ── 内容预览（Markdown → 微信图文HTML） ───────────
router.post('/preview', async (req, res) => {
    try {
        const { content, platform } = req.body;
        
        if (!content) {
            return res.status(400).json({ success: false, message: '缺少内容' });
        }
        
        // 简单的预览排版转换
        let html = content
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');
        
        html = `<div style="max-width:640px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;line-height:1.8;color:#333;padding:20px;"><p>${html}</p></div>`;
        
        res.json({ success: true, data: { html } });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 发布到CMS ───────────────────────────────────
router.post('/wechat', async (req, res) => {
    try {
        const { title, content, categoryId } = req.body;
        
        // 推送到CMS
        const result = await cms.pushArticle({
            title,
            content,
            categoryId,
            status: 1,
            source: 'ContentAI-微信发布'
        });
        
        if (result.success) {
            res.json({ 
                success: true, 
                message: '已推送到CMS',
                data: result 
            });
        } else {
            res.status(500).json({ success: false, message: result.message });
        }
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 批量推送 ───────────────────────────────────
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

module.exports = router;
