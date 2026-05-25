/**
 * CMS 集成路由
 * GET  /api/cms/categories     - 获取栏目列表
 * GET  /api/cms/articles        - 获取文章列表
 * POST /api/cms/push            - 推送文章到CMS
 * POST /api/cms/match-category  - 智能匹配栏目
 * GET  /api/cms/stats           - CMS数据统计
 */

const express = require('express');
const router = express.Router();
const cms = require('../services/cms');

// ── 获取栏目 ─────────────────────────────────────
router.get('/categories', async (req, res) => {
    try {
        const result = await cms.getCategories();
        res.json(result);
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 获取文章 ─────────────────────────────────────
router.get('/articles', async (req, res) => {
    try {
        // 支持单个文章查询
        const { id, categoryId, page, pageSize, status, keyword } = req.query;
        
        // 单个文章查询
        if (id) {
            const article = await cms.getArticleById(parseInt(id));
            if (article) {
                return res.json({ success: true, data: article });
            } else {
                return res.json({ success: false, message: '文章不存在' });
            }
        }
        
        // 列表查询
        const result = await cms.getArticles({
            categoryId: categoryId ? parseInt(categoryId) : null,
            page: page ? parseInt(page) : 1,
            pageSize: pageSize ? parseInt(pageSize) : 20,
            status: status ? parseInt(status) : null,
            keyword: keyword || null
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 推送文章（支持同步微信草稿箱） ─────────────────────────────────────
async function pushWechatDraft(title, content, thumbMediaId) {
    try {
        const path = require('path');
        const pluginPath = path.join(__dirname, '../../scripts/multi-platform-publisher.cjs');
        const { MultiPlatformPublisher } = require(pluginPath);
        const wechatConfig = {
            appId: process.env.WECHAT_APP_ID,
            appSecret: process.env.WECHAT_APP_SECRET,
            thumbMediaId: thumbMediaId || process.env.WECHAT_THUMB_MEDIA_ID,
            author: 'WorkBuddy'
        };
        const publisher = new MultiPlatformPublisher({ wechat: wechatConfig });
        await publisher.init();
        return await publisher.publishToWechat({ title, content, description: content.substring(0, 120) + '...' });
    } catch (e) {
        console.error('[CMS→微信] 推送失败:', e.message);
        return { success: false, error: e.message };
    }
}

router.post('/push', async (req, res) => {
    try {
        const { title, content, categoryId, status, source, toWechat, thumbMediaId, thumbUrl } = req.body;
        
        if (!title || !content) {
            return res.status(400).json({ success: false, message: '缺少标题或内容' });
        }
        
        // 1. 推 CMS
        const cmsResult = await cms.pushArticle({ title, content, categoryId, status, source });
        
        if (!cmsResult.success) {
            return res.status(500).json({ success: false, message: 'CMS推送失败: ' + cmsResult.message });
        }
        
        // 2. 同步推微信
        let wechatResult = null;
        if (toWechat) {
            wechatResult = await pushWechatDraft(title, content, thumbMediaId || process.env.WECHAT_THUMB_MEDIA_ID);
        }
        
        res.json({
            success: true,
            message: wechatResult?.success ? 'CMS+微信发布成功' : 'CMS发布成功',
            data: {
                cms: { articleId: cmsResult.articleId },
                wechat: wechatResult?.success ? { articleId: wechatResult.articleId, status: 'draft' } : null
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 智能匹配栏目 ─────────────────────────────────
router.post('/match-category', async (req, res) => {
    try {
        const { title, content } = req.body;
        
        if (!title) {
            return res.status(400).json({ success: false, message: '缺少标题' });
        }
        
        const match = cms.matchCategory(title, content || '');
        res.json({ success: true, data: match });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── CMS统计 ─────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        const categories = await cms.getCategories();
        res.json({
            success: true,
            data: {
                totalCategories: Object.keys(categories.data || {}).length,
                categories: categories.data,
                source: categories.source
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
