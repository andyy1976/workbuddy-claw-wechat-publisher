/**
 * 定时任务调度器 v2.0
 * - 多语言内容生成
 * - 智能体可调用
 * - 发文章（CMS + 微信草稿箱）
 * - 发邮件（调用 imap-smtp-email skill）
 */

const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const TASKS_FILE = path.join(__dirname, '../config/tasks.json');

// 多语言配置
const LANGUAGE_CONFIG = {
  'zh-CN': {
    name: '简体中文',
    promptPrefix: '请用简体中文撰写',
    greeting: '您好',
    signature: '此致\n敬礼'
  },
  'en-US': {
    name: 'English',
    promptPrefix: 'Please write in American English',
    greeting: 'Dear Reader',
    signature: 'Best regards'
  },
  'ja-JP': {
    name: '日本語',
    promptPrefix: '日本語で書いてください',
    greeting: '皆様',
    signature: '敬具'
  },
  'ko-KR': {
    name: '한국어',
    promptPrefix: '한국어로 작성해 주세요',
    greeting: '안녕하세요',
    signature: '감사합니다'
  }
};

// 写作风格配置
const STYLE_CONFIG = {
  'professional': '专业深度风格，信息密度高，适合行业读者',
  'casual': '轻松口语风格，贴近日常，适合大众传播',
  'story': '故事叙述风格，引人入胜，适合情感共鸣',
  'technical': '硬核技术风格，代码示例多，适合开发者'
};

let scheduledTasks = [];
let executionStatus = new Map(); // 存储任务执行状态

/**
 * 加载任务配置
 */
async function loadTasks() {
  try {
    const data = await fs.readFile(TASKS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    const defaultTasks = { tasks: [], lastRun: null };
    await saveTasks(defaultTasks);
    return defaultTasks;
  }
}

/**
 * 保存任务配置
 */
async function saveTasks(data) {
  await fs.writeFile(TASKS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * 执行任务
 */
async function executeTask(task, params = {}) {
  const execId = `${task.id}-${Date.now()}`;
  console.log(`[Scheduler] 开始执行任务: ${task.name} [${execId}]`);
  
  // 记录执行状态
  executionStatus.set(execId, {
    taskId: task.id,
    taskName: task.name,
    status: 'running',
    startTime: new Date().toISOString(),
    progress: []
  });
  
  const results = {
    hotContent: null,
    article: null,
    publish: { cms: null, wechat: null, email: null },
    errors: []
  };
  
  const updateProgress = (msg) => {
    const status = executionStatus.get(execId);
    if (status) {
      status.progress.push({ time: new Date().toISOString(), message: msg });
      console.log(`[Scheduler][${execId}] ${msg}`);
    }
  };
  
  try {
    // 1. 采集热门内容
    updateProgress('开始采集热门内容');
    try {
      results.hotContent = await fetchHotContent(task.keywords, task.language);
      updateProgress(`采集成功: ${results.hotContent.title || 'N/A'}`);
    } catch (e) {
      results.errors.push({ stage: 'fetch', error: e.message });
      updateProgress(`采集失败（继续）: ${e.message}`);
      results.hotContent = { title: task.keywords[0], summary: '默认内容', url: '' };
    }
    
    // 2. AI 生成文章（多语言）
    updateProgress('开始生成文章');
    try {
      results.article = await generateArticle(results.hotContent, task);
      updateProgress(`生成成功: ${results.article.title}`);
    } catch (e) {
      results.errors.push({ stage: 'generate', error: e.message });
      updateProgress(`生成失败（继续）: ${e.message}`);
      const langConfig = LANGUAGE_CONFIG[task.language || 'zh-CN'];
      results.article = {
        title: `【${task.keywords[0]}】最新动态`,
        content: `${langConfig.greeting}，\n\n本文关于${task.keywords[0]}的详细内容。\n\n${langConfig.signature}`
      };
    }
    
    // 3. 发布到多平台
    const platforms = task.platforms || [];
    
    if (platforms.includes('cms')) {
      updateProgress('发布到 CMS');
      try {
        results.publish.cms = await publishToCMS(results.article, task);
        updateProgress('CMS 发布成功');
      } catch (e) {
        results.errors.push({ stage: 'cms', error: e.message });
        updateProgress(`CMS 发布失败: ${e.message}`);
      }
    }
    
    if (platforms.includes('wechat')) {
      updateProgress('发布到微信草稿箱');
      try {
        results.publish.wechat = await publishToWechat(results.article, task);
        updateProgress('微信草稿箱添加成功');
      } catch (e) {
        results.errors.push({ stage: 'wechat', error: e.message });
        updateProgress(`微信发布失败: ${e.message}`);
      }
    }
    
    if (platforms.includes('email')) {
      updateProgress('发送邮件');
      try {
        results.publish.email = await sendEmail(results.article, task);
        updateProgress(`邮件发送完成: ${results.publish.email.filter(r => r.success).length}/${results.publish.email.length} 成功`);
      } catch (e) {
        results.errors.push({ stage: 'email', error: e.message });
        updateProgress(`邮件发送失败: ${e.message}`);
      }
    }
    
    // 4. Webhook 回调
    if (task.webhookUrl) {
      updateProgress('触发 Webhook 回调');
      try {
        const axios = require('axios');
        await axios.post(task.webhookUrl, { taskId: task.id, execId, results });
        updateProgress('Webhook 回调成功');
      } catch (e) {
        results.errors.push({ stage: 'webhook', error: e.message });
        updateProgress(`Webhook 回调失败: ${e.message}`);
      }
    }
    
    // 更新执行状态为完成
    const status = executionStatus.get(execId);
    if (status) {
      status.status = 'completed';
      status.endTime = new Date().toISOString();
      status.results = results;
    }
    
    console.log(`[Scheduler] 任务完成: ${task.name} [${execId}]`);
    return { success: results.errors.length === 0, execId, results };
    
  } catch (e) {
    const status = executionStatus.get(execId);
    if (status) {
      status.status = 'failed';
      status.endTime = new Date().toISOString();
      status.error = e.message;
    }
    throw e;
  }
}

/**
 * 采集热门内容
 */
async function fetchHotContent(keywords, language = 'zh-CN') {
  const scriptPath = path.join(__dirname, '../../scripts/hot-content-fetcher.js');
  
  try {
    const { stdout } = await execAsync(`node "${scriptPath}" "${keywords.join(',')}"`, {
      env: { ...process.env, LANGUAGE: language }
    });
    return JSON.parse(stdout);
  } catch (e) {
    console.error('[Scheduler] 采集失败:', e.message);
    throw e;
  }
}

/**
 * AI 生成文章（多语言）
 */
async function generateArticle(hotContent, task) {
  const axios = require('axios');
  
  // 读取 .env
  let env = {};
  try {
    const envPath = path.join(__dirname, '../.env');
    const envContent = await fs.readFile(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, ...vals] = line.split('=');
      if (key && vals.length) env[key.trim()] = vals.join('=').trim();
    });
  } catch (e) {}
  
  const langConfig = LANGUAGE_CONFIG[task.language || 'zh-CN'];
  const styleConfig = STYLE_CONFIG[task.style || 'professional'];
  
  const prompt = `${langConfig.promptPrefix}一篇${styleConfig}的公众号文章：

关键词：${task.keywords.join(', ')}
热门内容：${JSON.stringify(hotContent)}

要求：
1. 标题吸引人，符合${langConfig.name}阅读习惯
2. 内容有价值，信息密度高
3. 长度 800-1200 字
4. 开头使用"${langConfig.greeting}"
5. 结尾使用"${langConfig.signature}"
6. 不要使用 Markdown 格式，直接输出纯文本`;

  // 选择模型
  const model = task.model || env.AI_MODEL || 'deepseek';
  const modelConfig = getModelConfig(model, env);
  
  const response = await axios.post(modelConfig.url, {
    model: modelConfig.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 2000
  }, {
    headers: { 
      'Authorization': `Bearer ${modelConfig.apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 60000
  });
  
  const fullContent = response.data.choices[0].message.content;
  const lines = fullContent.split('\n').filter(l => l.trim());
  
  return {
    title: lines[0].replace(/^#+\s*/, '').substring(0, 50),
    content: fullContent
  };
}

/**
 * 获取模型配置
 */
function getModelConfig(model, env) {
  const configs = {
    'deepseek': {
      url: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-chat',
      apiKey: env.DEEPSEEK_API_KEY
    },
    'ark-code': {
      url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
      model: env.ARK_MODEL || 'ep-xxxx',
      apiKey: env.ARK_API_KEY
    },
    'openai': {
      url: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      apiKey: env.OPENAI_API_KEY
    }
  };
  
  return configs[model] || configs['deepseek'];
}

/**
 * 发布到 CMS
 */
async function publishToCMS(article, task) {
  const axios = require('axios');
  
  const response = await axios.post('http://localhost:3456/api/cms/publish', {
    title: article.title,
    content: article.content,
    category: 'auto-generated',
    source: 'workbuddy-scheduler',
    language: task.language || 'zh-CN'
  }, { timeout: 30000 });
  
  return response.data;
}

/**
 * 发布到微信草稿箱
 */
async function publishToWechat(article, task) {
  const scriptPath = 'D:\\.qclaw\\workspace\\wechat-publisher-plugin\\scripts\\multi-platform-publisher.cjs';
  
  // 写入临时文件
  const tempFile = path.join(__dirname, `../temp-article-${Date.now()}.json`);
  await fs.writeFile(tempFile, JSON.stringify({
    title: article.title,
    content: article.content,
    digest: article.content.substring(0, 64)
  }), 'utf8');
  
  try {
    const { stdout } = await execAsync(
      `node "${scriptPath}" --platform wechat --input "${tempFile}"`,
      { timeout: 60000 }
    );
    return JSON.parse(stdout);
  } finally {
    await fs.unlink(tempFile).catch(() => {});
  }
}

/**
 * 发送邮件（调用 imap-smtp-email skill）
 */
async function sendEmail(article, task) {
  const recipients = task.emailRecipients || [];
  if (recipients.length === 0) return [];
  
  const skillPath = path.join(
    process.env.HOME || process.env.USERPROFILE,
    '.qclaw', 'workspace', 'skills', 'imap-smtp-email'
  );
  const gatewayScript = path.join(skillPath, 'scripts', 'unix', 'email_gateway.sh');
  
  // 构建邮件内容
  const subject = (task.emailSubject || '【自动推送】${title}')
    .replace(/\$\{title\}/g, article.title)
    .replace(/\$\{date\}/g, new Date().toLocaleDateString());
  
  const body = article.content + '\n\n---\n此邮件由 WorkBuddy 自动发送';
  
  const results = [];
  
  for (const to of recipients) {
    try {
      // Windows 下用 PowerShell 调用 bash
      const cmd = `bash "${gatewayScript}" send --to "${to}" --subject "${subject.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"').substring(0, 5000)}"`;
      
      await execAsync(cmd, { timeout: 30000 });
      results.push({ to, success: true });
    } catch (e) {
      results.push({ to, success: false, error: e.message });
    }
  }
  
  return results;
}

/**
 * 启动定时任务
 */
async function startScheduler() {
  const config = await loadTasks();
  
  scheduledTasks.forEach(t => t.task.destroy());
  scheduledTasks = [];
  
  config.tasks.forEach(task => {
    if (!task.enabled) return;
    
    const cronTask = cron.schedule(task.schedule, () => {
      executeTask(task).catch(e => console.error(`[Scheduler] 任务执行失败: ${task.name}`, e));
    }, {
      scheduled: true,
      timezone: 'Asia/Shanghai'
    });
    
    scheduledTasks.push({ id: task.id, name: task.name, task: cronTask });
    console.log(`[Scheduler] 已调度任务: ${task.name}, 计划: ${task.schedule}`);
  });
  
  console.log(`[Scheduler] 共加载 ${scheduledTasks.length} 个定时任务`);
}

/**
 * 获取执行状态
 */
function getExecutionStatus(execId) {
  if (execId) {
    return executionStatus.get(execId);
  }
  // 返回所有最近的状态（最多 50 条）
  const all = Array.from(executionStatus.entries());
  return all.slice(-50).map(([id, status]) => ({ execId: id, ...status }));
}

/**
 * 添加任务
 */
async function addTask(task) {
  const config = await loadTasks();
  
  const newTask = {
    id: Date.now().toString(),
    name: task.name,
    keywords: task.keywords,
    schedule: task.schedule,
    platforms: task.platforms,
    enabled: true,
    createdAt: new Date().toISOString(),
    // 新增字段
    language: task.language || 'zh-CN',
    style: task.style || 'professional',
    model: task.model || 'deepseek',
    emailRecipients: task.emailRecipients || [],
    emailSubject: task.emailSubject,
    agentCallable: task.agentCallable !== false,
    webhookUrl: task.webhookUrl,
    tags: task.tags || []
  };
  
  config.tasks.push(newTask);
  await saveTasks(config);
  await startScheduler();
  
  return newTask;
}

/**
 * 删除任务
 */
async function deleteTask(taskId) {
  const config = await loadTasks();
  config.tasks = config.tasks.filter(t => t.id !== taskId);
  await saveTasks(config);
  await startScheduler();
}

/**
 * 更新任务
 */
async function updateTask(taskId, updates) {
  const config = await loadTasks();
  const task = config.tasks.find(t => t.id === taskId);
  
  if (task) {
    Object.assign(task, updates);
    await saveTasks(config);
    await startScheduler();
  }
  
  return task;
}

/**
 * 获取所有任务
 */
async function getTasks() {
  const config = await loadTasks();
  return config.tasks;
}

/**
 * 获取单个任务
 */
async function getTask(taskId) {
  const config = await loadTasks();
  return config.tasks.find(t => t.id === taskId);
}

/**
 * 获取任务执行历史（通过 taskId）
 */
async function getTaskLogs(taskId) {
  const logs = [];
  for (const [execId, status] of executionStatus.entries()) {
    if (status.taskId === taskId) {
      logs.push({
        execId,
        taskId: status.taskId,
        taskName: status.taskName,
        status: status.status,
        startTime: status.startTime,
        endTime: status.endTime || null,
        progress: status.progress || []
      });
    }
  }
  // 按开始时间倒序
  logs.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  return logs;
}

module.exports = {
  startScheduler,
  addTask,
  deleteTask,
  updateTask,
  getTasks,
  getTask,
  executeTask,
  getExecutionStatus,
  getTaskLogs,
  LANGUAGE_CONFIG,
  STYLE_CONFIG
};
