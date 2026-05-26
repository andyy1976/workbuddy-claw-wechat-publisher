/**
 * 诊断脚本：验证方法论是否正确传递到 AI prompt
 * 运行: node diagnose-methodology.js
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// 从 .env 读取配置
const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) env[line.substring(0, idx)] = line.substring(idx + 1).trim();
});

const DB_CONFIG = {
  host: env.DB_HOST || '82.156.40.94',
  port: parseInt(env.DB_PORT) || 3306,
  user: env.DB_USER || 'eastaiai',
  password: env.DB_PASSWORD || 'alibaba',
  database: env.DB_NAME || 'eastaiai'
};

// 从 models.json 读取模型配置
let MODEL_CONFIG = {};
try {
  const modelsPath = path.join(__dirname, 'server', 'config', 'models.json');
  const modelsData = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
  const active = modelsData.models?.find(m => m.active) || modelsData.models?.[0];
  if (active) {
    MODEL_CONFIG = {
      url: active.baseURL || active.url,
      model: active.model,
      apiKey: active.apiKey
    };
  }
} catch (e) {
  console.error('读取 models.json 失败:', e.message);
}

// 语言配置（从 scheduler.js 复制）
const LANGUAGE_CONFIG = {
  'zh-CN': { name: '简体中文', promptPrefix: '请用简体中文撰写', greeting: '您好', signature: '此致\n敬礼' },
  'en-US': { name: 'English', promptPrefix: 'Please write in American English', greeting: 'Dear Reader', signature: 'Best regards' }
};

const STYLE_CONFIG = {
  'professional': '专业深度风格，信息密度高，适合行业读者',
  'casual': '轻松口语风格，贴近日常，适合大众传播',
  'story': '故事叙述风格，引人入胜，适合情感共鸣',
  'technical': '硬核技术风格，代码示例多，适合开发者'
};

async function diagnose() {
  let conn;
  try {
    conn = await mysql.createConnection(DB_CONFIG);
    
    // 1. 读取数据库中的方法论配置
    console.log('=== 1. 数据库中的方法论配置 ===');
    const [rows] = await conn.execute(
      `SELECT u.username, us.setting_key, us.setting_value 
       FROM user_settings us 
       JOIN users u ON us.user_id = u.id 
       WHERE us.setting_key IN ('methodology','keywords')`
    );
    
    let userMethod = {};
    let userKw = {};
    for (const row of rows) {
      const val = typeof row.setting_value === 'string' ? JSON.parse(row.setting_value) : row.setting_value;
      if (row.setting_key === 'methodology') { userMethod = val; console.log('✅ methodology:', JSON.stringify(val, null, 2)); }
      if (row.setting_key === 'keywords') { userKw = val; console.log('✅ keywords:', JSON.stringify(val, null, 2)); }
    }
    
    if (!rows.length) {
      console.log('❌ 数据库中没有找到 methodology 或 keywords 配置！');
    }
    
    // 2. 构建方法论 prompt（复制 scheduler.js 的逻辑）
    console.log('\n=== 2. 构建的方法论 prompt ===');
    let methodPrompt = '';
    if (userMethod && Object.keys(userMethod).length > 0) {
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
      
      const personMap = { you: '优先用"你"作主语', we: '用"我们"作主语', third: '用第三人称', first: '用第一人称"我"' };
      if (userMethod.person && personMap[userMethod.person]) {
        methodPrompt += ` ${personMap[userMethod.person]}。`;
      }
      const structMap = { story: '故事化叙事', list: '清单式结构', analysis: '深度分析结构', contrast: '对比评测结构' };
      if (userMethod.structure && userMethod.structure !== 'auto' && structMap[userMethod.structure]) {
        methodPrompt += ` 采用${structMap[userMethod.structure]}。`;
      }
    }
    
    console.log('✅ 方法论 prompt 片段:');
    console.log(methodPrompt || '（空，未启用任何方法论）');
    
    // 3. 构建完整 prompt
    console.log('\n=== 3. 完整 AI Prompt（前500字符）===');
    const langConfig = LANGUAGE_CONFIG['zh-CN'];
    const styleConfig = STYLE_CONFIG['professional'];
    const keywords = userKw?.list || ['AI', '智能制造'];
    
    const fullPrompt = `${langConfig.promptPrefix}一篇${styleConfig}的公众号文章：

关键词：${keywords.join(', ')}
热门内容：{}

${methodPrompt}
【输出格式要求】（必须严格遵守，否则无效）：
第一行必须是文章标题，格式为「标题：xxx」（不要加任何Markdown符号）
第二行空行
第三行开始是正文，正文开头使用"${langConfig.greeting}"
正文结尾使用"${langConfig.signature}"
⚠️ 注意：绝对不要把问候语当成标题，标题必须是有实质内容的文章标题`;

    console.log(fullPrompt.substring(0, 500) + '\n...');
    console.log('\n✅ 方法论部分已包含在 prompt 中:', methodPrompt.length > 0 ? '是' : '否');
    
    // 4. 检查 models.json 配置
    console.log('\n=== 4. 模型配置 ===');
    console.log('模型URL:', MODEL_CONFIG.url || '❌ 未配置');
    console.log('模型名称:', MODEL_CONFIG.model || '❌ 未配置');
    console.log('API Key:', MODEL_CONFIG.apiKey ? '✅ 已配置' : '❌ 未配置');
    
  } catch (e) {
    console.error('诊断失败:', e.message);
  } finally {
    if (conn) await conn.end();
  }
}

diagnose();
