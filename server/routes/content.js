/**
 * 内容生成路由
 * POST /api/content/generate    - 生成企业内容
 * POST /api/content/deaiify      - 去AI味优化
 * POST /api/content/titles      - 标题生成
 * POST /api/content/outline     - 内容大纲生成
 * POST /api/content/save        - 保存内容到CMS
 * POST /api/content/publish     - 发布内容（独立于大模型）
 */

const express = require('express');
const router = express.Router();
const llm = require('../services/llm');
const promptBuilder = require('../services/prompt-builder');
const { prePublishCheck } = require('../services/pre-publish-check');
const productSvc = require('../services/product');

// ── 生成企业内容 ──────────────────────────────────
router.post('/generate', async (req, res) => {
    try {
        const { topic, style, platform, productId, context, wordCount, cmsContext, plmContext } = req.body;
        
        if (!topic) {
            return res.status(400).json({ success: false, message: '缺少主题(topic)' });
        }
        
        // 加载产品数据（如果有）
        let productData = null;
        if (productId) {
            productData = productSvc.getFullProductData(productId);
        }
        
        // ── 方法论增强：构建带三条铁律的提示词 ────────────────────────
        const messages = promptBuilder.buildMessages({
            topic,
            style: style || 'professional',
            platform: platform || 'wechat',
            wordCount: wordCount || 2000,
            cmsContext: cmsContext || {},
            plmContext: plmContext || {},
            goodAngleHint: context || '',
            existingAngles: []
        });
        
        // 调用 LLM（直接从 prompt-builder 构建的消息，不走 generateEnterpriseContent）
        const rawContent = await llm.callLLM(messages, {
            temperature: style === 'khazix' ? 0.85 : 0.7,
            maxTokens: Math.ceil((wordCount || 2000) * 1.5)
        });
        
        // ── 发布前正则兜底检查 ─────────────────────────────────────
        const checkResult = prePublishCheck(rawContent, {
            topic: topic,
            angle: ''
        });
        
        // 如果有严重错误，警告但不阻止（转人工审核）
        if (!checkResult.pass) {
            console.warn('[Content] 发布前检查未通过:', checkResult.errors.join('; '));
        }
        
        // 同时生成标题建议
        const titles = await llm.generateTitles(rawContent, platform || 'wechat');
        
        res.json({
            success: true,
            data: {
                content: rawContent,
                titles,
                metadata: {
                    topic,
                    style,
                    platform,
                    wordCount: rawContent.length,
                    productUsed: !!productId,
                    generatedAt: new Date().toISOString(),
                    methodologyCheck: {
                        passed: checkResult.pass,
                        errors: checkResult.errors,
                        warnings: checkResult.warnings
                    }
                }
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 去AI味优化（方法论增强版）──────────────────────────────
router.post('/deaiify', async (req, res) => {
    try {
        const { content, intensity } = req.body;
        
        if (!content) {
            return res.status(400).json({ success: false, message: '缺少内容(content)' });
        }
        
        // ✅ llm.deAIify() 现在返回 { optimized, methodologyCheck }
        const result = await llm.deAIify(content, intensity || 'medium');
        
        res.json({
            success: true,
            data: {
                original: content,
                optimized: result.optimized,
                methodologyCheck: result.methodologyCheck,
                intensity: intensity || 'medium',
                reduction: {
                    originalLength: content.length,
                    optimizedLength: result.optimized.length
                }
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 标题生成 ────────────────────────────────────
router.post('/titles', async (req, res) => {
    try {
        const { content, platform, count } = req.body;
        
        if (!content) {
            return res.status(400).json({ success: false, message: '缺少内容(content)' });
        }
        
        const titles = await llm.generateTitles(content, platform || 'wechat', count || 5);
        
        res.json({
            success: true,
            data: { titles }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 内容大纲生成 ─────────────────────────────────
router.post('/outline', async (req, res) => {
    try {
        const { productId, topicType } = req.body;
        
        const productData = productSvc.getFullProductData(productId);
        const outline = productSvc.generateContentOutline(productData, topicType || 'product_intro');
        
        res.json({
            success: true,
            data: {
                outline,
                productName: productData.product?.name || '默认产品',
                contentHints: productData.contentHints
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 保存内容到CMS ──────────────────────────────────
router.post('/save', async (req, res) => {
    try {
        const { title, content, categoryId, source } = req.body;
        
        if (!title || !content) {
            return res.status(400).json({ success: false, message: '缺少标题或内容' });
        }
        
        const publishFlow = require('../services/publish-flow');
        const result = await publishFlow.saveToCMS(title, content, categoryId || 0, source || 'AI生成');
        
        if (result.success) {
            res.json({ success: true, data: { aid: result.articleId } });
        } else {
            res.status(500).json({ success: false, message: result.error || 'CMS保存失败' });
        }
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 发布内容（独立于大模型）───────────────────────────────
router.post('/publish', async (req, res) => {
    try {
        const { 
            title, 
            content, 
            categoryId, 
            toCMS = true, 
            toWechat = true,
            source = 'WorkBuddy',
            thumbUrl 
        } = req.body;
        
        if (!title || !content) {
            return res.status(400).json({ success: false, message: '缺少标题或内容' });
        }
        
        const publishFlow = require('../services/publish-flow');
        const result = await publishFlow.publishFlow({
            title,
            content,
            categoryId: categoryId || 0,
            toCMS,
            toWechat,
            source,
            thumbUrl
        });
        
        res.json(result);
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 内容列表（最近文章） ──────────────────────
router.get('/list', async (req, res) => {
    try {
        const { page = 1, pageSize = 20, keyword } = req.query;
        const mysql = require('mysql2/promise');
        const pool = mysql.createPool({
            host: process.env.DB_HOST || '82.156.40.94',
            user: process.env.DB_USER || 'eastaiai',
            password: process.env.DB_PASSWORD || 'alibaba',
            database: process.env.DB_NAME || 'eastaiai',
            charset: 'utf8mb4'
        });
        const offset = (parseInt(page) - 1) * parseInt(pageSize);
        const limit = parseInt(pageSize);
        let where = '';
        const params = [];
        if (keyword) { where = 'WHERE title LIKE ?'; params.push(`%${keyword}%`); }
        const [rows] = await pool.query(
            `SELECT aid as id, title, author, addtime as createdAt FROM lvbo_article ${where} ORDER BY aid DESC LIMIT ${limit} OFFSET ${offset}`,
            params
        );
        const [countRows] = await pool.execute(`SELECT COUNT(*) as total FROM lvbo_article ${where}`, params);
        await pool.end();
        res.json({
            success: true,
            data: {
                list: rows,
                pagination: { page: parseInt(page), pageSize: limit, total: countRows[0].total }
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 最近文章 ──────────────────────────────────────
router.get('/recent', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const mysql = require('mysql2/promise');
        const pool = mysql.createPool({
            host: process.env.DB_HOST || '82.156.40.94',
            user: process.env.DB_USER || 'eastaiai',
            password: process.env.DB_PASSWORD || 'alibaba',
            database: process.env.DB_NAME || 'eastaiai',
            charset: 'utf8mb4'
        });
        const [rows] = await pool.query(
            `SELECT aid as id, title, addtime as createdAt FROM lvbo_article ORDER BY aid DESC LIMIT ${parseInt(limit)}`
        );
        await pool.end();
        res.json({ success: true, data: rows });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 内容风格列表 ──────────────────────────────────
router.get('/styles', (req, res) => {
    const styles = [
        { id: 'professional', name: '专业风格', desc: '行业白皮书面貌，数据和案例密集' },
        { id: 'khazix', name: '卡兹克风格', desc: '第一人称视角，科技圈野区猎手' },
        { id: 'casual', name: '轻松风格', desc: '口语化表达，贴近读者' },
        { id: 'technical', name: '技术风格', desc: '技术深度分析，适合工程师阅读' }
    ];
    res.json({ success: true, data: styles });
});

module.exports = router;
