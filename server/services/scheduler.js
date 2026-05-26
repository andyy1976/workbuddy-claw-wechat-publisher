/**
 * 定时任务调度器 v2.0
 * - 多语言内容生成
 * - 智能体可调用
 * - 发文章(CMS + 微信草稿箱)
 * - 发邮件(调用 imap-smtp-email skill)
 */

const cron = require('node-cron');
const fs = require('fs');
const fsPromises = require('fs').promises;
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
  'professional': '专业深度风格,信息密度高,适合行业读者',
  'casual': '轻松口语风格,贴近日常,适合大众传播',
  'story': '故事叙述风格,引人入胜,适合情感共鸣',
  'technical': '硬核技术风格,代码示例多,适合开发者'
};

let scheduledTasks = [];
let executionStatus = new Map(); // 存储任务执行状态

/**
 * 加载任务配置
 */
async function loadTasks() {
  try {
    const data = await fsPromises.readFile(TASKS_FILE, 'utf8');
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
  await fsPromises.writeFile(TASKS_FILE, JSON.stringify(data, null, 2), 'utf8');
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
      updateProgress(`采集失败(继续): ${e.message}`);
      results.hotContent = { title: task.keywords[0], summary: '默认内容', url: '' };
    }

    // 2. AI 生成文章(多语言)
    updateProgress('开始生成文章');
    try {
      results.article = await generateArticle(results.hotContent, task);
      updateProgress(`生成成功: ${results.article.title}`);
    } catch (e) {
      results.errors.push({ stage: 'generate', error: e.message });
      updateProgress(`生成失败(继续): ${e.message}`);
      const langConfig = LANGUAGE_CONFIG[task.language || 'zh-CN'];
      results.article = {
        title: `【${task.keywords[0]}】最新动态`,
        content: `${langConfig.greeting},\n\n本文关于${task.keywords[0]}的详细内容。\n\n${langConfig.signature}`
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
 * 读取用户配置文件
 */
function loadUserConfig() {
  // 候选路径：优先项目根目录，再试运行路径
  const candidates = [
    path.join(__dirname, '../../config/user-config.json'),   // server/services -> 项目根目录
    path.join(__dirname, '../config/user-config.json'),      // server -> config（兼容旧路径）
    path.join(process.cwd(), 'config/user-config.json'),     // cwd
  ];
  for (const configPath of candidates) {
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(raw);
        console.log(`[Scheduler] ✅ user-config 已加载: ${configPath}`);
        return config;
      }
    } catch (e) {
      console.warn(`[Scheduler] 读取失败 ${configPath}:`, e.message);
    }
  }
  console.warn('[Scheduler] ⚠️ 未找到 user-config.json，使用默认配置');
  return {};
}

/**
 * 从 models.json 加载模型配置（Web UI 模型配置页面的数据源）
 */
function loadModelsConfig() {
  const candidates = [
    path.join(__dirname, '../config/models.json'),     // server/config/models.json
    path.join(__dirname, '../../server/config/models.json'), // 项目根目录
    path.join(process.cwd(), 'server/config/models.json'),
  ];
  for (const configPath of candidates) {
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf8');
        const models = JSON.parse(raw);
        console.log(`[Scheduler] ✅ models.json 已加载: ${configPath}`);
        return models;
      }
    } catch (e) {
      console.warn(`[Scheduler] 读取 models.json 失败 ${configPath}:`, e.message);
    }
  }
  console.warn('[Scheduler] ⚠️ 未找到 models.json');
  return null;
}

/**
 * 获取当前选中的模型配置（优先从 models.json，回退到 user-config）
 */
function getActiveModelConfig() {
  const models = loadModelsConfig();
  if (models && models._selected && models[models._selected]) {
    const m = models[models._selected];
    if (m.enabled && m.key) {
      console.log(`[Scheduler] 使用模型: ${m.name} (${m.model}), URL: ${m.url}`);
      return { url: m.url, model: m.model, apiKey: m.key };
    }
  }
  // 回退到 user-config
  const uc = loadUserConfig();
  const ai = uc.ai || {};
  console.log(`[Scheduler] 回退 user-config: ${ai.provider}/${ai.model}`);
  return { url: (ai.baseUrl || 'https://api.deepseek.com') + '/v1/chat/completions', model: ai.model || 'deepseek-chat', apiKey: ai.apiKey };
}

/**
 * AI 生成文章（多语言）
 */
async function generateArticle(hotContent, task) {
  const axios = require('axios');
  const config = loadUserConfig();
  
  // 从用户设置读取关键词和方法论偏好
  let userKw = null, userMethod = null;
  try {
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || '82.156.40.94', user: process.env.DB_USER || 'eastaiai',
      password: process.env.DB_PASSWORD || 'alibaba', database: process.env.DB_NAME || 'eastaiai',
      port: parseInt(process.env.DB_PORT) || 3306, connectTimeout: 30000, ssl: false
    });
    const [rows] = await conn.execute(
      `SELECT us.setting_key, us.setting_value FROM user_settings us JOIN users u ON us.user_id = u.id WHERE u.role = 'admin' AND us.setting_key IN ('keywords','methodology')`
    );
    for (const row of rows) {
      const val = typeof row.setting_value === 'string' ? JSON.parse(row.setting_value) : row.setting_value;
      if (row.setting_key === 'keywords') userKw = val;
      if (row.setting_key === 'methodology') userMethod = val;
    }
    await conn.end();
  } catch (e) {
    console.warn('[Scheduler] 读取用户关键词/方法论设置失败:', e.message);
  }

  // 合并关键词：用户设置 + 任务配置
  const keywords = [...(userKw?.list || []), ...(task.keywords || [])];
  const uniqueKw = [...new Set(keywords)];
  
  const langConfig = LANGUAGE_CONFIG[task.language || userKw?.language || 'zh-CN'];
  const styleKey = task.style || userKw?.style || 'professional';
  const styleConfig = STYLE_CONFIG[styleKey] || STYLE_CONFIG['professional'];
  
  // 方法论指令
  let methodPrompt = '';
  if (userMethod) {
    const methods = [];
    if (userMethod.threeIronRules) methods.push('遵循三条铁律：时间真实、角度陌生化、人称诚意');
    if (userMethod.emotionArc) methods.push('使用情绪曲线结构');
    if (userMethod.angleStranger) methods.push('角度陌生化：逆向思考/角色转换');
    if (userMethod.redGreenCard) methods.push('红绿牌分析：风险与机遇并存');
    if (userMethod.storyAnalyze) methods.push('故事拆解手法');
    if (userMethod.valueFilter) methods.push('价值过滤：只保留核心价值');
    if (userMethod.mediciCollision) methods.push('美第奇碰撞：跨领域交叉');
    if (userMethod.dataPredict) methods.push('数据驱动预测');
    if (methods.length) methodPrompt = `\n方法论要求：${methods.join('；')}。`;
    
    // 人称偏好
    const personMap = { you: '优先用"你"作主语', we: '用"我们"作主语', third: '用第三人称', first: '用第一人称"我"' };
    if (userMethod.person && personMap[userMethod.person]) {
      methodPrompt += ` ${personMap[userMethod.person]}。`;
    }
    // 结构偏好
    const structMap = { story: '故事化叙事', list: '清单式结构', analysis: '深度分析结构', contrast: '对比评测结构' };
    if (userMethod.structure && structMap[userMethod.structure]) {
      methodPrompt += ` 采用${structMap[userMethod.structure]}。`;
    }
  }
  
  const prompt = `${langConfig.promptPrefix}一篇${styleConfig}的公众号文章：

关键词：${uniqueKw.join(', ')}
热门内容：${JSON.stringify(hotContent)}
${methodPrompt}
【输出格式要求】（必须严格遵守，否则无效）：
第一行必须是文章标题，格式为「标题：xxx」（不要加任何Markdown符号）
第二行空行
第三行开始是正文，正文开头使用"${langConfig.greeting}"
正文结尾使用"${langConfig.signature}"
⚠️ 注意：绝对不要把问候语当成标题，标题必须是有实质内容的文章标题
其他要求：
- 标题吸引人，符合${langConfig.name}阅读习惯
- 内容有价值，信息密度高
- 长度 800-1200 字
- 不要使用 Markdown 格式，直接输出纯文本`;

  // 从 models.json 读取当前选中模型配置（优先）
  const modelConfig = getActiveModelConfig();

  console.log(`[Scheduler] 调用 AI: ${modelConfig.url}, 模型: ${modelConfig.model}`);
  
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
  
  // 智能提取标题：找「标题：」或「Title:」开头的行，否则取第一个非问候语的非空行
  let title = '';
  for (const line of lines) {
    const t = line.trim();
    if (t.match(/^(标题|Title)[\s:：]/)) {
      title = t.replace(/^(标题|Title)[\s:：]+/, '').substring(0, 60);
      break;
    }
    if (t && !t.match(/^(Dear Reader|你好|您好|Hello|Hi|各位读者|亲爱的|Hey)/i) && t.length > 5 && t.length < 80 && !t.match(/^[。！？.!?]$/)) {
      title = t.substring(0, 60);
      break;
    }
  }
  if (!title || title.match(/^(Dear Reader|你好|您好|Hello|Hi|各位读者|亲爱的|Hey)[，。！？.!?]?$/i)) {
    // 标题提取失败或仍是问候语 → 用关键词组合生成
    title = `【${uniqueKw[0] || '热点'}】${new Date().toLocaleDateString('zh-CN', {month:'long', day:'numeric'})}最新动态`;
  }
  
  return { title, content: fullContent };
}

/**
 * 获取模型配置
 */
function getModelConfig(model, aiConfig) {
  const configs = {
    'deepseek': {
      url: (aiConfig.baseUrl || 'https://api.deepseek.com') + '/v1/chat/completions',
      model: aiConfig.model || 'deepseek-chat',
      apiKey: aiConfig.apiKey
    },
    'ark-code': {
      url: aiConfig.arkBaseUrl || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
      model: aiConfig.arkModel || 'ep-xxxx',
      apiKey: aiConfig.arkApiKey
    },
    'openai': {
      url: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      apiKey: aiConfig.openaiApiKey
    }
  };
  
  return configs[model] || configs['deepseek'];
}

/**
 * 发布到 CMS
 */
async function publishToCMS(article, task) {
  const { saveToCMS } = require('./publish-flow');

  const result = await saveToCMS(
    article.title,
    article.content,
    0,  // categoryId, 让系统自动匹配
    '定时任务'
  );

  if (!result.success) {
    throw new Error('CMS保存失败: ' + (result.error || '未知错误'));
  }

  return result;
}

/**
 * 发布到微信草稿箱
 */
async function publishToWechat(article, task) {
  const { publishFlow } = require('./publish-flow');

  const result = await publishFlow({
    title: article.title,
    content: article.content,
    categoryId: 0,
    toCMS: false,  // CMS已在publishToCMS()中写入，避免重复
    toWechat: true,
    source: '定时任务'
  });

  if (!result.success) {
    throw new Error('发布失败: ' + (result.errors || []).join(', '));
  }

  return result;
}

/**
 * 发送邮件（使用 nodemailer，从用户设置读取收件人）
 */
async function sendEmail(article, task) {
  // 优先从用户设置读取收件人，回退到 task 配置
  let recipients = task.emailRecipients || [];
  let subjectTemplate = task.emailSubject || '【WorkBuddy】${title} - ${date}';
  let trigger = 'onPublish';

  try {
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || '82.156.40.94',
      user: process.env.DB_USER || 'eastaiai',
      password: process.env.DB_PASSWORD || 'alibaba',
      database: process.env.DB_NAME || 'eastaiai',
      port: parseInt(process.env.DB_PORT) || 3306,
      connectTimeout: 30000, ssl: false
    });

    // 查找管理员用户的邮箱设置（第一个 admin 用户）
    const [users] = await conn.execute(
      `SELECT us.setting_value FROM user_settings us JOIN users u ON us.user_id = u.id WHERE u.role = 'admin' AND us.setting_key = 'email' LIMIT 1`
    );
    if (users.length > 0) {
      const emailSetting = typeof users[0].setting_value === 'string' ? JSON.parse(users[0].setting_value) : users[0].setting_value;
      if (emailSetting.recipients && emailSetting.recipients.length > 0) {
        recipients = emailSetting.recipients;
        console.log(`[Scheduler] 从用户设置读取邮箱收件人: ${recipients.join(', ')}`);
      }
      if (emailSetting.subject) subjectTemplate = emailSetting.subject;
      if (emailSetting.trigger) trigger = emailSetting.trigger;
    }
    await conn.end();
  } catch (e) {
    console.warn(`[Scheduler] 读取用户邮箱设置失败，使用任务配置: ${e.message}`);
  }

  // 检查发送时机
  if (trigger === 'never') {
    console.log('[Scheduler] 邮件通知已关闭');
    return [];
  }

  if (recipients.length === 0) {
    console.log('[Scheduler] 无邮件收件人，跳过发送');
    return [];
  }

  // 使用 nodemailer 发送
  const nodemailer = require('nodemailer');
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT) || 465;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFromName = process.env.SMTP_FROM_NAME || 'WorkBuddy';
  const smtpFromAddr = process.env.SMTP_FROM_ADDRESS || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn('[Scheduler] SMTP 未配置，无法发送邮件。请在 .env 设置 SMTP_HOST/USER/PASS');
    return recipients.map(to => ({ to, success: false, error: 'SMTP not configured' }));
  }

  const subject = subjectTemplate
    .replace(/\$\{title\}/g, article.title)
    .replace(/\$\{date\}/g, new Date().toLocaleDateString())
    .replace(/\$\{category\}/g, '');

  let transporter;
  try {
    transporter = nodemailer.createTransport({
      host: smtpHost, port: smtpPort, secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass }
    });
  } catch (e) {
    console.error('[Scheduler] 创建邮件传输失败:', e.message);
    return recipients.map(to => ({ to, success: false, error: e.message }));
  }

  const results = [];
  for (const to of recipients) {
    try {
      await transporter.sendMail({
        from: `"${smtpFromName}" <${smtpFromAddr}>`,
        to,
        subject,
        html: `<div style="font-family:sans-serif;max-width:680px;margin:0 auto">
          <h2 style="color:#6c5ce7">${article.title}</h2>
          <div style="line-height:1.8;color:#333">${article.content.replace(/\n/g, '<br>')}</div>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
          <p style="color:#999;font-size:12px">此邮件由 WorkBuddy 自动发送</p>
        </div>`
      });
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
  // 返回所有最近的状态(最多 50 条)
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
 * 获取任务执行历史(通过 taskId)
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
