/**
 * 任务管理路由 v2.0
 * - GET  /api/tasks - 获取所有任务
 * - POST /api/tasks - 添加任务
 * - PUT  /api/tasks/:id - 更新任务
 * - DELETE /api/tasks/:id - 删除任务
 * - POST /api/tasks/:id/run - 立即执行任务
 * - GET  /api/tasks/:id/logs - 获取任务执行日志
 * 
 * 智能体调用 API:
 * - GET  /api/tasks/agent/list - 获取可调用任务列表
 * - POST /api/tasks/agent/execute - 智能体触发任务执行
 * - GET  /api/tasks/agent/status/:execId - 查询执行状态
 * - POST /api/tasks/agent/create - 智能体创建临时任务
 * 
 * ⚠️ 路由顺序很重要！/:id 必须放在最后，否则会捕获 /agent/list 等路径
 */

const express = require('express');
const router = express.Router();

console.log('[Tasks] Loading tasks.js at ' + new Date().toISOString());

// ── 调试中间件（记录所有请求）─────────────────────────────────────
router.use((req, res, next) => {
  console.log(`[Tasks] RAW REQUEST: ${req.method} ${req.originalUrl}`);
  next();
});

let scheduler = null;
try {
  scheduler = require('../services/scheduler');
} catch (e) {
  console.error('[Tasks] 加载 scheduler 失败:', e.message);
}

// ========== 基础路由（无参数）==========

/**
 * 获取所有任务
 */
router.get('/', async (req, res) => {
  try {
    if (!scheduler) return res.status(500).json({ success: false, message: '调度器未初始化' });
    const tasks = await scheduler.getTasks();
    res.json({ success: true, data: tasks });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * 添加任务
 */
router.post('/', async (req, res) => {
  try {
    if (!scheduler) return res.status(500).json({ success: false, message: '调度器未初始化' });
    
    const { name, keywords, schedule, platforms, enabled, language, style, model, emailRecipients, emailSubject, webhookUrl, tags } = req.body;
    
    if (!name || !keywords || !schedule || !platforms) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    const task = await scheduler.addTask({
      name,
      keywords: Array.isArray(keywords) ? keywords : keywords.split(',').map(k => k.trim()),
      schedule,
      platforms: Array.isArray(platforms) ? platforms : platforms.split(',').map(p => p.trim()),
      enabled: enabled !== false,
      language: language || 'zh-CN',
      style: style || 'professional',
      model: model || 'deepseek',
      emailRecipients: emailRecipients || [],
      emailSubject,
      webhookUrl,
      tags: tags || []
    });
    
    res.json({ success: true, data: task });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ========== 智能体调用 API ==========

/**
 * GET /api/tasks/agent/list - 获取可调用任务列表
 */
router.get('/agent/list', async (req, res) => {
  try {
    if (!scheduler) return res.status(500).json({ success: false, message: '调度器未初始化' });
    
    const { tag, language } = req.query;
    let tasks = await scheduler.getTasks();
    
    // 过滤可调用任务
    tasks = tasks.filter(t => t.agentCallable !== false);
    
    // 按标签过滤
    if (tag) {
      tasks = tasks.filter(t => t.tags && t.tags.includes(tag));
    }
    
    // 按语言过滤
    if (language) {
      tasks = tasks.filter(t => t.language === language);
    }
    
    res.json({ success: true, data: tasks });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * POST /api/tasks/agent/execute - 智能体触发任务执行
 */
router.post('/agent/execute', async (req, res) => {
  try {
    if (!scheduler) return res.status(500).json({ success: false, message: '调度器未初始化' });
    
    const { taskId, params, async = true } = req.body;
    
    if (!taskId) {
      return res.status(400).json({ success: false, message: '缺少 taskId' });
    }
    
    const task = await scheduler.getTask(taskId);
    
    if (!task) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }
    
    if (task.agentCallable === false) {
      return res.status(403).json({ success: false, message: '该任务不允许智能体调用' });
    }
    
    if (async) {
      // 异步执行，立即返回
      scheduler.executeTask(task, params || {}).catch(e => {
        console.error(`[Scheduler] 智能体调用任务失败: ${task.name}`, e);
      });
      res.json({ success: true, taskId, status: 'running' });
    } else {
      // 同步执行，等待结果
      const result = await scheduler.executeTask(task, params || {});
      res.json({ success: true, taskId, result });
    }
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * GET /api/tasks/agent/status/:execId - 查询执行状态
 */
router.get('/agent/status/:execId', async (req, res) => {
  try {
    if (!scheduler) return res.status(500).json({ success: false, message: '调度器未初始化' });
    
    const { execId } = req.params;
    const status = scheduler.getExecutionStatus(execId);
    
    if (execId && !status) {
      return res.status(404).json({ success: false, message: '执行记录不存在' });
    }
    
    res.json({ success: true, data: status });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * POST /api/tasks/agent/create - 智能体创建临时任务
 */
router.post('/agent/create', async (req, res) => {
  try {
    if (!scheduler) return res.status(500).json({ success: false, message: '调度器未初始化' });
    
    const { name, keywords, platforms, language, style, model, emailRecipients, runImmediately = false } = req.body;
    
    if (!name || !keywords || !platforms) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    const task = await scheduler.addTask({
      name,
      keywords: Array.isArray(keywords) ? keywords : keywords.split(',').map(k => k.trim()),
      platforms: Array.isArray(platforms) ? platforms : platforms.split(',').map(p => p.trim()),
      language: language || 'zh-CN',
      style: style || 'professional',
      model: model || 'deepseek',
      emailRecipients: emailRecipients || [],
      agentCallable: true,
      createdBy: 'agent',
      // 临时任务默认只执行一次，用特殊 schedule（每100年执行一次，基本不会触发）
      schedule: '0 0 1 1 *'
    });
    
    // 如果要求立即执行
    if (runImmediately) {
      scheduler.executeTask(task).catch(e => {
        console.error(`[Scheduler] 智能体创建任务执行失败: ${task.name}`, e);
      });
    }
    
    res.json({ success: true, data: task });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ========== 配置 API ==========

/**
 * GET /api/tasks/config/languages - 获取支持的语言列表
 */
router.get('/config/languages', (req, res) => {
  res.json({ success: true, data: scheduler?.LANGUAGE_CONFIG || {} });
});

/**
 * GET /api/tasks/config/styles - 获取支持的写作风格列表
 */
router.get('/config/styles', (req, res) => {
  res.json({ success: true, data: scheduler?.STYLE_CONFIG || {} });
});

// ========== 带 :id 参数的路由（必须放在最后！）==========

/**
 * 获取任务执行日志
 */
router.get('/:id/logs', async (req, res) => {
  try {
    if (!scheduler) return res.status(500).json({ success: false, message: '调度器未初始化' });
    
    const { id } = req.params;
    const logs = await scheduler.getTaskLogs(id);
    res.json({ success: true, data: logs });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * 获取单个任务
 */
router.get('/:id', async (req, res) => {
  console.log(`[Tasks] GET /:id called with id = ${req.params.id}`);
  try {
    if (!scheduler) return res.status(500).json({ success: false, message: '调度器未初始化' });
    
    const { id } = req.params;
    const task = await scheduler.getTask(id);
    
    if (!task) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }
    
    res.json({ success: true, data: task });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * 更新任务
 */
router.put('/:id', async (req, res) => {
  try {
    if (!scheduler) return res.status(500).json({ success: false, message: '调度器未初始化' });
    
    const { id } = req.params;
    const updates = req.body;
    
    const task = await scheduler.updateTask(id, updates);
    
    if (task) {
      res.json({ success: true, data: task });
    } else {
      res.status(404).json({ success: false, message: '任务不存在' });
    }
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * 删除任务
 */
router.delete('/:id', async (req, res) => {
  try {
    if (!scheduler) return res.status(500).json({ success: false, message: '调度器未初始化' });
    
    const { id } = req.params;
    await scheduler.deleteTask(id);
    res.json({ success: true, message: '任务已删除' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * 立即执行任务
 */
router.post('/:id/run', async (req, res) => {
  try {
    if (!scheduler) return res.status(500).json({ success: false, message: '调度器未初始化' });
    
    const { id } = req.params;
    const task = await scheduler.getTask(id);
    
    if (!task) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }
    
    // 异步执行
    scheduler.executeTask(task).then(result => {
      console.log(`[Scheduler] 手动执行任务完成: ${task.name}`, result);
    }).catch(e => {
      console.error(`[Scheduler] 手动执行任务失败: ${task.name}`, e);
    });
    
    res.json({ success: true, message: '任务已开始执行' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── 测试路由（临时）──────────────────────────────────────
router.get('/test-route', (req, res) => {
  res.json({ success: true, message: 'Test route works!', timestamp: new Date().toISOString() });
});

module.exports = router;
