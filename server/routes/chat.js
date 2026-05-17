/**
 * 对话路由
 * POST /api/chat    - 对话接口
 */

const express = require('express');
const router = express.Router();
const llm = require('../services/llm');

// ── 对话接口 ──────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const { message, history } = req.body;
        
        if (!message) {
            return res.status(400).json({ success: false, message: '缺少消息(message)' });
        }
        
        // 构建对话上下文
        let context = '';
        if (history && Array.isArray(history)) {
            context = history.map(h => `${h.role === 'user' ? '用户' : '助手'}: ${h.content}`).join('\n');
        }
        
        // 调用 LLM 生成回复
        const reply = await llm.generateChatResponse({
            message,
            context: context || undefined,
            systemPrompt: '您是 WorkBuddy，一个专业的内容生成助手。您可以帮用户生成内容、优化文章、管理任务。'
        });
        
        res.json({
            success: true,
            data: {
                reply: reply
            }
        });
    } catch (e) {
        console.error('[Chat] 生成回复失败:', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
