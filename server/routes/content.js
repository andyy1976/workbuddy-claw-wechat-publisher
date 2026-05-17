/**
 * 内容生成路由
 * POST /api/content/generate    - 生成企业内容
 * POST /api/content/deaiify      - 去AI味优化
 * POST /api/content/titles      - 标题生成
 * POST /api/content/outline     - 内容大纲生成
 */

const express = require('express');
const router = express.Router();
const llm = require('../services/llm');
const productSvc = require('../services/product');

// ── 生成企业内容 ──────────────────────────────────
router.post('/generate', async (req, res) => {
    try {
        const { topic, style, platform, productId, context, wordCount } = req.body;
        
        if (!topic) {
            return res.status(400).json({ success: false, message: '缺少主题(topic)' });
        }
        
        // 加载产品数据（如果有）
        let productData = null;
        if (productId) {
            productData = productSvc.getFullProductData(productId);
        }
        
        const content = await llm.generateEnterpriseContent({
            topic,
            style: style || 'professional',
            platform: platform || 'wechat',
            productData,
            context,
            wordCount: wordCount || 2000
        });
        
        // 同时生成标题建议
        const titles = await llm.generateTitles(content, platform || 'wechat');
        
        res.json({
            success: true,
            data: {
                content,
                titles,
                metadata: {
                    topic,
                    style,
                    platform,
                    wordCount: content.length,
                    productUsed: !!productId,
                    generatedAt: new Date().toISOString()
                }
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 去AI味优化 ──────────────────────────────────
router.post('/deaiify', async (req, res) => {
    try {
        const { content, intensity } = req.body;
        
        if (!content) {
            return res.status(400).json({ success: false, message: '缺少内容(content)' });
        }
        
        const optimized = await llm.deAIify(content, intensity || 'medium');
        
        res.json({
            success: true,
            data: {
                original: content,
                optimized,
                intensity: intensity || 'medium',
                reduction: {
                    originalLength: content.length,
                    optimizedLength: optimized.length
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

module.exports = router;
