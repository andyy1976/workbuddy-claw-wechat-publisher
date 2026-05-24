/**
 * 内容方法论 API 路由
 * 挂载到 /api/methodology
 * 
 * 端点：
 * POST /angle/red-cards     — 生成红牌角度（第一直觉屏蔽）
 * POST /angle/green-cards   — 生成绿牌角度（反差/陌生化）
 * POST /angle/full-pipeline — 完整方法论流程
 * POST /story/analyze       — 升番+情绪分析
 * POST /story/value-filter  — 正向价值观审查
 * POST /data/predict        — 发布前预测
 * POST /data/diagnose       — 发布后诊断
 * GET  /data/bloodline      — 角度血缘库
 * GET  /emotion-arcs        — 情绪曲线模板列表
 * GET  /medici/collision    — 跨领域碰撞检测
 * GET  /info-dashboard      — T型信息组合建议
 */

const express = require('express');
const router = express.Router();

const methodology = require('../../skills/wb-content-gen/scripts/methodology-engine');

// ── 角度工坊 ──────────────────────────────────────

router.post('/angle/red-cards', (req, res) => {
  try {
    const { topic, keywords } = req.body;
    if (!topic) return res.status(400).json({ success: false, error: 'topic 必填' });
    const result = methodology.generateRedCardAngles(topic, keywords);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/angle/green-cards', (req, res) => {
  try {
    const { topic, keywords, options } = req.body;
    if (!topic) return res.status(400).json({ success: false, error: 'topic 必填' });
    const result = methodology.generateGreenCardAngles(topic, keywords, options);
    res.json({ success: true, data: { topic, angles: result, count: result.length } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/angle/full-pipeline', (req, res) => {
  try {
    const { topic, keywords, options } = req.body;
    if (!topic) return res.status(400).json({ success: false, error: 'topic 必填' });
    const result = methodology.fullMethodologyPipeline(topic, keywords, options);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── 故事引擎 ──────────────────────────────────────

router.post('/story/analyze', (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, error: 'content 必填' });
    const result = methodology.analyzeEscalation(content);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/story/value-filter', (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, error: 'content 必填' });
    const result = methodology.valueFilter(content);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/emotion-arcs', (req, res) => {
  try {
    const arcs = methodology.EMOTION_ARCS;
    res.json({ success: true, data: Object.entries(arcs).map(([key, arc]) => ({ key, name: arc.name, description: arc.description })) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── 数据教练 ──────────────────────────────────────

router.post('/data/predict', (req, res) => {
  try {
    const { angle, contentAnalysis } = req.body;
    if (!angle) return res.status(400).json({ success: false, error: 'angle 必填' });
    const result = methodology.predictPerformance(angle, contentAnalysis || {});
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/data/diagnose', (req, res) => {
  try {
    const { articleId, actualData, predictions } = req.body;
    if (!articleId || !actualData) return res.status(400).json({ success: false, error: 'articleId 和 actualData 必填' });
    const result = methodology.diagnosePerformance(articleId, actualData, predictions);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/data/bloodline', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const db = path.join(__dirname, '..', '..', 'data', 'methodology', 'angle-bloodline.json');
    let data = [];
    if (fs.existsSync(db)) {
      data = JSON.parse(fs.readFileSync(db, 'utf8'));
    }
    res.json({ success: true, data, count: data.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── 美第奇引擎 ──────────────────────────────────────

router.post('/medici/collision', (req, res) => {
  try {
    const { topic, keywords } = req.body;
    if (!topic) return res.status(400).json({ success: false, error: 'topic 必填' });
    const result = methodology.detectMediciCollision(topic, keywords);
    res.json({ success: true, data: { topic, collisions: result, count: result.length } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/info-dashboard', (req, res) => {
  try {
    const { vertical, broad } = req.query;
    const broadInterests = broad ? broad.split(',') : undefined;
    const result = methodology.generateInfoDashboard(vertical || 'AI', broadInterests);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;