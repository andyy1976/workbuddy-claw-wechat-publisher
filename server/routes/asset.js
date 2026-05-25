/**
 * 素材资源路由（封面图、小红书图、幻灯片）
 */
const express = require('express');
const router = express.Router();

// ── 生成封面图 ──────────────────────────────────
router.post('/cover', async (req, res) => {
    try {
        const { title, style } = req.body;
        res.json({ success: true, message: '封面图生成（待实现）', data: { url: null } });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 生成小红书图片 ──────────────────────────────────
router.post('/xhs', async (req, res) => {
    try {
        const { title, content } = req.body;
        res.json({ success: true, message: '小红书图片生成（待实现）', data: { url: null } });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 生成幻灯片 ──────────────────────────────────
router.post('/slide', async (req, res) => {
    try {
        const { title, content } = req.body;
        res.json({ success: true, message: '幻灯片生成（待实现）', data: { url: null } });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;