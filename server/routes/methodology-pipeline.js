/**
 * 内容方法论 Pipeline - 闭环集成路由
 * 
 * 闭环流程：热点 → 美第奇碰撞 → 角度筛选 → 内容生成 → 升温检测 → 价值观过滤 → 去AI味 → 发布 → 数据追踪
 * 
 * POST /api/methodology/pipeline       — 完整闭环（异步，返回 taskId）
 * GET  /api/methodology/pipeline/:id   — 查询 pipeline 状态
 * POST /api/methodology/pipeline/sync  — 同步执行（适用于快速测试）
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const methodology = require('../../skills/wb-content-gen/scripts/methodology-engine');
const llm = require('../services/llm');

// ── Pipeline 任务存储 ──
const pipelineTasks = new Map();

// ── 辅助：写入角度血缘库 ──
function saveAngleBloodline(topic, angle, method, score, result) {
  const dbDir = path.join(__dirname, '..', '..', 'data', 'methodology');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, 'angle-bloodline.json');
  let data = [];
  if (fs.existsSync(dbPath)) data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  data.push({
    id: 'angle_' + Date.now(),
    topic,
    angle,
    method,
    score,
    result: result || 'pending',
    createdAt: new Date().toISOString()
  });
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// ── 同步执行完整 Pipeline（核心逻辑） ──
async function runPipeline(params) {
  const { topic, keywords = [], style = 'professional', platform = 'wechat', wordCount = 2000, toCMS = false, toWechat = false } = params;
  const steps = [];

  // ─── Step 1: 美第奇碰撞（跨领域灵感） ───
  let mediciResult = null;
  try {
    mediciResult = methodology.detectMediciCollision(topic, keywords);
    steps.push({ name: '美第奇碰撞', status: 'done', data: { collisions: mediciResult, count: mediciResult.length } });
  } catch (e) {
    steps.push({ name: '美第奇碰撞', status: 'skip', error: e.message });
  }

  // ─── Step 2: 角度筛选（红绿灯） ───
  let selectedAngle = null;
  try {
    const redCards = methodology.generateRedCardAngles(topic, keywords);
    const greenCards = methodology.generateGreenCardAngles(topic, keywords);
    // 自动选新颖度最高的绿牌角度
    const bestGreen = greenCards.sort((a, b) => (b.novelty || 0) - (a.novelty || 0))[0];
    selectedAngle = bestGreen;
    steps.push({
      name: '角度筛选',
      status: 'done',
      data: {
        redCards: redCards.length,
        greenCards: greenCards.length,
        selected: bestGreen,
        reason: `自动选择新颖度最高的绿牌角度 (${bestGreen.novelty}分): ${bestGreen.method}`
      }
    });
  } catch (e) {
    steps.push({ name: '角度筛选', status: 'skip', error: e.message });
  }

  // ─── Step 3: 内容生成 ───
  let generatedContent = null;
  try {
    // 将角度和碰撞灵感融入生成上下文
    const context = [];
    if (selectedAngle) context.push(`采用角度：「${selectedAngle.angle}」（方法：${selectedAngle.method}）`);
    if (mediciResult && mediciResult.length > 0) context.push(`跨领域灵感：${mediciResult.slice(0, 2).map(c => c.title || c).join('、')}`);

    generatedContent = await llm.generateEnterpriseContent({
      topic: selectedAngle ? selectedAngle.angle : topic,
      style,
      platform,
      context: context.join('\n'),
      wordCount
    });

    // 同时生成标题
    const titles = await llm.generateTitles(generatedContent, platform);
    steps.push({
      name: '内容生成',
      status: 'done',
      data: {
        wordCount: generatedContent.length,
        titles: titles ? titles.split('\n').filter(Boolean) : [],
        usedAngle: selectedAngle ? selectedAngle.method : 'direct'
      }
    });
  } catch (e) {
    steps.push({ name: '内容生成', status: 'error', error: e.message });
    return { steps, success: false, failedAt: '内容生成' };
  }

  // ─── Step 4: 升温检测（故事引擎） ───
  let escalationResult = null;
  try {
    escalationResult = methodology.analyzeEscalation(generatedContent);
    steps.push({ name: '升温检测', status: 'done', data: escalationResult });
  } catch (e) {
    steps.push({ name: '升温检测', status: 'skip', error: e.message });
  }

  // ─── Step 5: 价值观过滤 ───
  let valueResult = null;
  try {
    valueResult = methodology.valueFilter(generatedContent);
    steps.push({ name: '价值观过滤', status: 'done', data: valueResult });
    if (valueResult.blocked) {
      // 价值观命中红线，记录但不阻止（警告模式）
      steps[steps.length - 1].data.warning = '内容命中价值观红线，建议人工审核';
    }
  } catch (e) {
    steps.push({ name: '价值观过滤', status: 'skip', error: e.message });
  }

  // ─── Step 6: 去AI味 ───
  let finalContent = generatedContent;
  try {
    finalContent = await llm.deAIify(generatedContent, 'medium');
    steps.push({ name: '去AI味', status: 'done', data: { originalLength: generatedContent.length, finalLength: finalContent.length } });
  } catch (e) {
    steps.push({ name: '去AI味', status: 'skip', error: e.message, data: { fallback: '使用未优化的内容' } });
  }

  // ─── Step 7: 预测评分（数据教练） ───
  let prediction = null;
  try {
    prediction = methodology.predictPerformance(selectedAngle ? selectedAngle.angle : topic, { wordCount: finalContent.length, style, platform });
    steps.push({ name: '预测评分', status: 'done', data: prediction });
  } catch (e) {
    steps.push({ name: '预测评分', status: 'skip', error: e.message });
  }

  // ─── Step 8: 发布（可选） ───
  let publishResult = null;
  if (toCMS || toWechat) {
    try {
      // 使用内部 HTTP 调用发布接口
      const axios = require('axios');
      const title = steps.find(s => s.name === '内容生成')?.data?.titles?.[0] || topic;
      
      if (toCMS) {
        const cmsResp = await axios.post('http://localhost:3456/api/cms/push', {
          title,
          content: finalContent,
          categoryId: '111',
          status: 'published',
          source: 'methodology-pipeline',
          toWechat: !!toWechat
        });
        publishResult = { cms: cmsResp.data };
        steps.push({ name: '发布到CMS', status: 'done', data: publishResult });
      }
      
      if (toWechat && !toCMS) {
        const wechatResp = await axios.post('http://localhost:3456/api/publish/wechat', {
          title,
          content: finalContent
        });
        publishResult = { wechat: wechatResp.data };
        steps.push({ name: '发布到微信', status: 'done', data: publishResult });
      }
    } catch (e) {
      steps.push({ name: '发布', status: 'error', error: e.message });
    }
  }

  // ─── 记录角度血缘 ───
  if (selectedAngle) {
    saveAngleBloodline(topic, selectedAngle.angle, selectedAngle.method, selectedAngle.novelty, prediction ? prediction.score : null);
  }

  return {
    success: true,
    steps,
    output: {
      title: steps.find(s => s.name === '内容生成')?.data?.titles?.[0] || topic,
      content: finalContent,
      angle: selectedAngle,
      prediction,
      published: !!publishResult
    }
  };
}

// ── POST /api/methodology/pipeline (异步) ──
router.post('/pipeline', async (req, res) => {
  const { topic, keywords, style, platform, wordCount, toCMS, toWechat } = req.body;
  if (!topic) return res.status(400).json({ success: false, error: 'topic 必填' });

  const taskId = 'pipe_' + Date.now();
  pipelineTasks.set(taskId, {
    status: 'running',
    createdAt: new Date().toISOString(),
    params: { topic, keywords, style, platform, wordCount, toCMS, toWechat },
    steps: [],
    output: null,
    error: null
  });

  res.json({ success: true, taskId, message: 'Pipeline 已启动，请轮询 /api/methodology/pipeline/' + taskId });

  // 异步执行
  runPipeline(req.body).then(result => {
    const task = pipelineTasks.get(taskId);
    if (task) {
      task.status = result.success ? 'completed' : 'failed';
      task.steps = result.steps;
      task.output = result.output || null;
      task.error = result.failedAt || null;
      task.completedAt = new Date().toISOString();
    }
  }).catch(e => {
    const task = pipelineTasks.get(taskId);
    if (task) {
      task.status = 'failed';
      task.error = e.message;
      task.completedAt = new Date().toISOString();
    }
  });

  // 2小时后自动清理
  setTimeout(() => pipelineTasks.delete(taskId), 2 * 60 * 60 * 1000);
});

// ── GET /api/methodology/pipeline/:id ──
router.get('/pipeline/:id', (req, res) => {
  const task = pipelineTasks.get(req.params.id);
  if (!task) return res.status(404).json({ success: false, error: '任务不存在' });
  res.json({ success: true, ...task });
});

// ── POST /api/methodology/pipeline/sync (同步，用于测试) ──
router.post('/pipeline/sync', async (req, res) => {
  const { topic, keywords, style, platform, wordCount, toCMS, toWechat } = req.body;
  if (!topic) return res.status(400).json({ success: false, error: 'topic 必填' });

  try {
    const result = await runPipeline({ topic, keywords, style, platform, wordCount, toCMS, toWechat });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
