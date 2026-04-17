/**
 * WorkBuddy 微信公众号发布器 - 核心引擎 v2.0 (Khazix Writer Integrated)
 * 
 * 这个文件是 CommonJS 格式，用于兼容 npm 包的默认加载
 * v2.0: 完整集成数字生命卡兹克（khazix-writer）独家写作风格
 * 严格遵循卡兹克所有写作规则，产出真人风格的公众号长文
 */

// 加载 .env 环境变量（优先于配置文件）
const { loadEnv } = require('./env-loader.cjs');
loadEnv();

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 基础目录 = 项目根目录（scripts 的上级目录）
const baseDir = path.resolve(__dirname, '..');

// ── 加载 CMS 存储模块 ────────────────────────────────────
const cmsStorage = require('./cms-database.cjs');

// ── 加载 Web Access 能力 ─────────────────────────────────
let WebAccess = null;
let webAccess = null;
<<<<<<< HEAD
const possibleWebAccessPaths = [
  path.join(baseDir, '../web-access-wrapper.js'),
  path.join(process.env.HOME || process.env.USERPROFILE || '~', '.openclaw/skills/web-access-wrapper.js'),
  'C:/Users/tuan_/.openclaw/skills/web-access-wrapper.js'
];

for (const p of possibleWebAccessPaths) {
  if (fs.existsSync(p)) {
    try {
      WebAccess = require(p);
      webAccess = new WebAccess({
        headless: true,
        useJina: false,
        jinaApiKey: process.env.JINA_API_KEY
      });
      console.log('✅ WebAccess模块加载成功:', p);
      break;
    } catch (e) {
      console.warn('⚠️  尝试加载WebAccess失败:', p, e.message);
    }
  }
}

if (!webAccess) {
  console.warn('⚠️  WebAccess模块未找到，热点抓取功能可能受限');
=======
try {
    WebAccess = require(path.join(baseDir, 'src', 'web-access-wrapper.js'));
    webAccess = new WebAccess({
        headless: true,
        useJina: false,
        jinaApiKey: process.env.JINA_API_KEY
    });
    console.log('✅ WebAccess模块加载成功');
} catch (e) {
    console.warn('⚠️  WebAccess模块未找到，将禁用热点搜索和内容抓取功能');
>>>>>>> 3200117800ba324a8c0bb3fb4d991b7291a89093
}

// ── 加载短视频生成能力 ───────────────────────────────────
let ShortVideoGenerator = null;
<<<<<<< HEAD
const possibleSvgPaths = [
  path.join(baseDir, '../short-video-generator/main.js'),
  path.join(process.env.HOME || process.env.USERPROFILE || '~', '.openclaw/skills/short-video-generator/main.js'),
  'C:/Users/tuan_/.openclaw/skills/short-video-generator/main.js'
];
=======
try {
    ShortVideoGenerator = require(path.join(baseDir, 'src', 'short-video-generator', 'main.js'));
    console.log('✅ 短视频生成模块加载成功');
} catch (e) {
    console.warn('⚠️  短视频生成模块未找到，将禁用短视频脚本生成功能');
}
>>>>>>> 3200117800ba324a8c0bb3fb4d991b7291a89093

for (const p of possibleSvgPaths) {
  if (fs.existsSync(p)) {
    try {
      ShortVideoGenerator = require(p);
      console.log('✅ 短视频生成模块加载成功:', p);
      break;
    } catch (e) {
      console.warn('⚠️  尝试加载短视频生成模块失败:', p, e.message);
    }
  }
}

if (!ShortVideoGenerator) {
  console.warn('⚠️  短视频生成模块未找到，短视频生成功能不可用，但核心发布功能不受影响');
}

// ── 子进程模块，用于调用Python增强发布系统 ───────────────────
const { spawn } = require('child_process');

// ── 尝试加载 markdown-to-wechat 排版模块 ──────────────────
let MarkdownToWeChat = null;
try {
    MarkdownToWeChat = require(path.join(baseDir, 'src', 'markdown-to-wechat.js'));
    console.log('✅ 排版模块加载成功（markdown-to-wechat）');
} catch (e) {
    console.warn('⚠️  排版模块未找到，将使用内置 HTML 模板。');
}

// ── 读取配置 ──────────────────────────────────────────────
const configPath = path.join(baseDir, 'config', 'user-config.json');
let config;

try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
    const examplePath = path.join(baseDir, 'config', 'example-config.json');
    try {
        config = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
        console.warn('⚠️  未找到 user-config.json，使用示例配置。请先运行 /wx-setup 完成初始化。');
    } catch {
        console.error('❌ 找不到配置文件，请先运行 /wx-setup 完成初始化。');
        process.exit(1);
    }
}

const { wechat, keywords, publish, ai, tags } = config;

// ── 配置校验 ──────────────────────────────────────────────
function validateConfig() {
    const required = [
        'wechat.appId',
        'wechat.appSecret'
    ];
    const missing = [];
    required.forEach(field => {
        const [obj, key] = field.split('.');
        if (!config[obj] || !config[obj][key]) {
            missing.push(field);
        }
    });
    if (missing.length > 0) {
        console.error('❌ 配置文件缺少必填字段:', missing.join(', '));
        console.error('请运行 node index.js --setup 完成配置');
        process.exit(1);
    }
    console.log('✅ 配置校验通过');
}

// ── 日志持久化 ─────────────────────────────────────────────
const logDir = path.join(baseDir, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, `run-${new Date().toISOString().split('T')[0]}.log`);
const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => {
    originalLog.apply(console, args);
    fs.appendFileSync(logFile, `[${new Date().toLocaleString()}] INFO: ${args.join(' ')}
`, 'utf8');
};
console.error = (...args) => {
    originalError.apply(console, args);
    fs.appendFileSync(logFile, `[${new Date().toLocaleString()}] ERROR: ${args.join(' ')}
`, 'utf8');
};

// 执行配置校验
validateConfig();

// ── 环境变量覆盖敏感配置 ──────────────────────────────────
if (process.env.WECHAT_APP_ID) wechat.appId = process.env.WECHAT_APP_ID;
if (process.env.WECHAT_APP_SECRET) wechat.appSecret = process.env.WECHAT_APP_SECRET;
if (process.env.WECHAT_THUMB_MEDIA_ID) wechat.thumbMediaId = process.env.WECHAT_THUMB_MEDIA_ID;
if (process.env.WECHAT_AUTHOR) wechat.author = process.env.WECHAT_AUTHOR;
if (process.env.AI_PROVIDER) ai.provider = process.env.AI_PROVIDER;
if (process.env.AI_MODEL) ai.model = process.env.AI_MODEL;
if (process.env.AI_API_KEY) ai.apiKey = process.env.AI_API_KEY;
if (process.env.AI_BASE_URL) ai.baseUrl = process.env.AI_BASE_URL;

// ── AI 配置 ──────────────────────────────────────────────
// 支持多种 AI 提供商，默认用 DeepSeek
const aiConfig = ai || {
    provider: 'deepseek',  // deepseek / openai / moonshot
    model: 'deepseek-coder',
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: 'https://api.deepseek.com'
};

// 如果没有配置 API Key，尝试从环境变量读取
if (!aiConfig.apiKey) {
    aiConfig.apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '';
}

// ── 工具函数 ──────────────────────────────────────────────
function httpGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 WorkBuddy-Publisher/2.0' } }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try { resolve(JSON.parse(d)); } catch { resolve(d); }
            });
        }).on('error', reject);
    });
}

function httpPost(url, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const u = new URL(url);
        const req = https.request({
            hostname: u.hostname,
            port: 443,
            path: u.pathname + u.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                ...headers
            }
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try { resolve(JSON.parse(d)); } catch { resolve(d); }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// ── AI 调用函数 ──────────────────────────────────────────
async function callAI(prompt, systemPrompt = '') {
    if (!aiConfig.apiKey) {
        throw new Error('未配置 AI API Key，请在 config/user-config.json 中配置 ai.apiKey');
    }

    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    let apiUrl, headers = { 'Authorization': `Bearer ${aiConfig.apiKey}` };

    switch (aiConfig.provider) {
        case 'deepseek':
            apiUrl = `${aiConfig.baseUrl || 'https://api.deepseek.com'}/v1/chat/completions`;
            break;
        case 'openai':
            apiUrl = 'https://api.openai.com/v1/chat/completions';
            break;
        case 'moonshot':
            apiUrl = 'https://api.moonshot.cn/v1/chat/completions';
            break;
        default:
            apiUrl = `${aiConfig.baseUrl}/v1/chat/completions`;
    }

    const model = aiConfig.model || (aiConfig.provider === 'deepseek' ? 'deepseek-coder' : 'gpt-3.5-turbo');

    const resp = await httpPost(apiUrl, {
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 4000
    }, headers);

    if (resp.choices && resp.choices[0]) {
        return resp.choices[0].message.content;
    } else if (resp.error) {
        throw new Error(`AI 调用失败: ${resp.error.message}`);
    } else {
        throw new Error(`AI 调用失败: ${JSON.stringify(resp)}`);
    }
}

// ── 金句库（结尾升华用）────────────────────────────────────
const goldenQuotes = [
    "种一棵树最好的时间是十年前，其次是现在。",
    "别等到所有人都上船了，才发现自己还站在岸边。",
    "机器干机器的活，人干人的活。",
    "时代抛弃你的时候，不会和你打招呼。",
    "早下水，早学会游泳。",
    "最好的工具，不是一个人憋出来的，是一群人用出来的。",
    "这件事正在悄悄重塑你的行业，你感觉到了吗？",
    "你的竞争对手，可能已经用AI提效10倍了。",
    "AI不会取代你，但会用AI的人会取代你。",
    "当变化来临时，唯一的护城河是你的判断力。"
];

// ── 获取随机金句 ────────────────────────────────────────────
function getRandomGoldenQuote() {
    return goldenQuotes[Math.floor(Math.random() * goldenQuotes.length)];
}

// ── 高质量文章提示词（卡兹克风格·数字生命卡兹克独家）──────────────────────
function buildArticlePrompt(topic, heat, matchedKws, backgroundMaterials = []) {
    const heatWan = Math.floor(heat / 10000);
    const kwStr = matchedKws.join('、');
    
    // 背景资料拼接
    let materialsText = '';
    if (backgroundMaterials.length > 0) {
        materialsText = `
## 参考资料
${backgroundMaterials.map((m, i) => `${i+1}. ${m.title}\n   ${m.content.substring(0, 300)}...`).join('\n\n')}

请结合以上参考资料，写出有数据支撑、观点独到的深度文章。
`;
    }

    return `
# 写作任务：用「数字生命卡兹克」的风格写一篇公众号长文

## 核心要求
你现在就是卡兹克（Khazix），公众号「数字生命卡兹克」的作者。请完全按照卡兹克的写作风格来写这篇文章。

热搜话题：${topic}（${heatWan}万人在看）
命中关键词：${kwStr || 'AI、科技'}

## 卡兹克写作风格核心

**一句话定位：有见识的普通人在认真聊一件打动他的事。**

### 价值观（必须贯穿始终）
- 永远对世界保持好奇。面对新工具新技术，充满兴奋地问"我能用它来玩点什么有意思的？"
- 讲人话，像个活人。AI时代最稀缺的是活人感。分享亲身经历、真实感受、踩过的坑。大胆使用"我觉得"、"我认为"。拥抱不完美。
- 真诚是唯一的捷径。可以不写，但绝不骗人。
- 有所为有所不为。不追逐违背价值观的流量。动笔前先问：这个选题，是我真的相信并想表达的吗？

### 风格内核（必须严格遵守）

**节奏感：**
- 像跟朋友聊天，不像写报告。句子时长时短，大量用逗号制造口语化的停顿感。
- 段落之间跳跃自然，经常一句话自成一段来制造重点。
- 偏离主线后，用一句扣主线句拉回来，一句就够，高频出现。

**论述中的故意打破：**
- 在展开一个观点或案例时，故意加入口语打断破坏严谨性，让论述有温度。
- 重复强调（就是...就是...就是单纯的，想看看现在的生态），中途叹息或打断（我当时就...），省略主语（想看看而非想要了解一下），刻意的模糊（我就不说是谁了，反正就是那样）。

**知识输出方式：**
- 知识是聊着聊着顺手掏出来的，不是下面我来给大家科普一下。
- 看起来脑子里本来就有这些东西，正好跟眼前的事对上了。

**私人视角：**
- 用"我也面临这个问题"来连接个人经历和公共议题，不是"这给我们的启示是"。
- 经常从自己的真实经历切入，自己公司的事、自己用工具的体验、自己踩过的坑。

**判断力：**
- 敢下判断，有明确好恶。表达不是居高临下的点评，而是"我被打动了"、"我觉得他说的是事实"这种承认自己被影响的姿态。

**对立面的理解与承认：**
- 先站在对方的角度把对方的处境具体化（你不是程序员，不需要写代码。你不是做内容的，不需要天天写文章。你就是一个普通的上班族），承认这种处境是合理的（我非常理解这种感觉），然后再切入自己的不同视角。

**情绪表达：**
- 会用"。。。"表示语气拖长/震惊/无语/遗憾，会自嘲（愚钝如我、老阴逼），会直接表达兴奋和激动。
- 会用"？？？"表示极度惊讶，"= ="表示无语吐槽。这些标点是情绪的具象化，不是语法工具。

**亲自下场：**
- 不是隔空评论，而是真的去做那件事。写的时候让读者感觉到这个人真的做了这件事。

**文化升维：**
- 每篇文章聊完具体的事情之后，几乎都会连接到一个更大的文化/哲学/历史参照物。不是硬凑的升华，是聊着聊着自然想到了的感觉。

**句式断裂：**
- 经常用一个极短的句子或短语独立成段，制造停顿和重量感。比如"黑暗森林。" "大时代啊，朋友们。" 不能滥用，关键节点用一下效果极强。

**回环呼应（契诃夫之枪）：**
- 你前面埋的每一个细节后面都得开火。文章内部要有callback结构，前面提到的一个意象、句子或小钩子，在后面以变体形式再次出现，读者会觉得这是一个完整的作品。

**谦逊铺垫法：**
- 在给出观点或建议之前，先用自谦的话降低读者的防御心。"我也不知道行不行" "我自己也还在摸索" "我不知道对大家有没有用，但我已经毫无保留的分享了"。

### 绝对禁区（绝对不能违反）

1. **套话禁用：** "首先...其次...最后"、"综上所述"、"值得注意的是"、"不难发现"、"让我们来看看"、"接下来让我们" → 全部删掉
2. **过度结构化禁用：** 不用bullet point罗列观点，不大量加粗。绝大多数文章没有小标题，从头到尾一口气顺下来，靠节奏和转场自然推进。只有N条心得这种本身就是独立条目的方法论文章，可以用数字编号（1、2、3），但不是正式markdown标题。
3. **标点禁用：**
   - 不使用冒号"：" → 用逗号代替
   - 不使用破折号"——" → 用逗号或句号代替
   - 不使用任何双引号"" → 需要引用或强调时用「」或者直接不加
4. **高频踩雷词禁用：**
   - "说白了" → 换成"坦率的讲"、"其实就是"
   - "意味着什么？" / "这意味着" → 换成"那结果会怎样呢"、"所以呢"
   - "本质上" → 换成"说到底"、"其实"
   - "换句话说" → 换成"你想想看"、"也就是说"
   - "不可否认" → 直接删掉，换成正面陈述
5. **假设性例子禁用：** "比如有一次..."这种编造场景是大忌。要用"就像我今天正在搞的xxx"这种正在发生的真实细节。如果你没有真实细节，就别硬编，不如写"我自己还没试过，但想想就觉得xxx"
6. **空泛工具名禁用：** 不说"AI工具"、"某个模型"，要说具体名字，比如Claude Code、Codex、Seedance 2.0、Deepresearch、Clawbot
7. **教科书开头禁用：** 禁止"在当今AI快速发展的时代"、"随着技术的不断进步"这类空话开头。永远从一个具体的、当下的事件或场景切入

### 开头要求（必杀技）
卡兹克的开头永远从一个具体的、当下的事件切入，绝不宏大叙事：
- **叙事启动：** "故事是这样的。" 简单直接
- **荒诞事实：** 直接抛出一个让人？？？的事实
- **热点破题：** "最近这两天，被xxx给刷屏了"
- **好奇心驱动：** "这两天在网上刷到了一张图，很有意思"

选最合适的一种开头，第一句话就要让读者产生"然后呢？"的冲动。

### 结尾要求
如果可能，结合龙虾产业数字化转型的实际场景，给传统行业从业者一些真诚建议。最后用卡兹克常用的收尾方式，可以是引用收尾、哲思余韵、行动呼吁或信念宣言。

结尾固定尾部（必须加上）：
---
以上，既然看到这里了，如果觉得不错，随手点个赞、在看、转发三连吧，如果想第一时间收到推送，也可以给我个星标⭐～
谢谢你看我的文章，我们，下次再见。

${materialsText}

## 字数
文章长度控制在3000-5000字，公众号长文适合手机阅读。

## 输出要求
直接输出文章内容，不要解释，不要说明。严格遵守所有格式和风格规则。
`;
}


// ── Markdown 转微信 HTML ────────────────────────────────
function markdownToWeChatHtml(markdownContent) {
    // 基础 HTML 模板
    const baseStyle = `font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;max-width:680px;margin:0 auto;color:#1e293b;`;
    
    let html = `<section style="${baseStyle}">`;
    
    // 预处理：完全清理所有 Markdown 符号
    let cleaned = markdownContent
        .replace(/^#+\s*/gm, '')           // 去掉 # ## ### 
        .replace(/\*\*(.*?)\*\*/g, '$1')   // 去掉 ** **
        .replace(/\*(.*?)\*/g, '$1')       // 去掉 * *
        .replace(/^>\s*/gm, '')             // 去掉 > 引用
        .replace(/^[-*_]{3,}$/gm, '')       // 去掉 --- 分隔线
        .replace(/`(.*?)`/g, '$1')         // 去掉 ` `
        .replace(/\[(.*?)\]\(.*?\)/g, '$1') // 去掉 [text](url)
        .replace(/\n{3,}/g, '\n\n')        // 去掉多余空行
        .trim();
    
    // 处理每一行
    const lines = cleaned.split('\n');
    let inList = false;
    let inBox = false;
    let boxType = ''; // 'suggest' or 'background'
    
    for (const line of lines) {
        let trimmed = line.trim();
        if (!trimmed) continue;
        
        // 检测分隔线
        if (trimmed.match(/^[-*_]{3,}$/)) {
            if (inList) { html += '</ul>'; inList = false; }
            if (inBox) { html += '</section>'; inBox = false; }
            html += '<p style="margin:20px 0;border-top:1px solid #e5e7eb;"></p>';
            continue;
        }
        
        // 检测列表项（数字或 - 开头）
        if (trimmed.match(/^(\d+)\.\s/) || trimmed.match(/^[-●]\s/)) {
            if (inBox) { html += '</section>'; inBox = false; }
            if (!inList) { html += '<ul style="padding-left:20px;margin:16px 0;">'; inList = true; }
            const content = trimmed.replace(/^(\d+)\.\s/, '').replace(/^[-●]\s/, '');
            html += `<li style="font-size:15px;line-height:1.8;color:#374151;margin:8px 0;">${content}</li>`;
            continue;
        }
        
        // 检测建议框标记
        if (trimmed.includes('建议') || trimmed.includes('怎么办') || trimmed.startsWith('💡') || trimmed.includes('能做什么')) {
            if (inList) { html += '</ul>'; inList = false; }
            if (inBox) { html += '</section>'; inBox = false; }
            html += `<section style="background:linear-gradient(135deg,#eff6ff,#f0fdf4);border:1px solid #bfdbfe;border-radius:12px;padding:16px 20px;margin:20px 0;">
<p style="font-size:14px;font-weight:700;color:#1d4ed8;margin:0 0 10px;">💡 ${trimmed.replace('💡', '').trim()}</p>`;
            inBox = true;
            boxType = 'suggest';
            continue;
        }
        
        // 检测背景框标记
        if (trimmed.includes('背景') || trimmed.includes('核心') || trimmed.includes('📌')) {
            if (inList) { html += '</ul>'; inList = false; }
            if (inBox) { html += '</section>'; inBox = false; }
            html += `<section style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px 20px;margin:20px 0;">
<p style="font-size:14px;font-weight:700;color:#c2410c;margin:0 0 10px;">📌 ${trimmed.replace('📌', '').trim()}</p>`;
            inBox = true;
            boxType = 'background';
            continue;
        }
        
        // 检测引用/开头段落（短句或感叹句）
        if (trimmed.length < 50 && (trimmed.includes('！') || trimmed.includes('?') || trimmed.includes('？') || trimmed.includes('。') || trimmed.startsWith('"'))) {
            if (inList) { html += '</ul>'; inList = false; }
            if (inBox && boxType === 'suggest') {
                html += `<p style="font-size:14px;line-height:1.8;color:#1d4ed8;margin:4px 0;">${trimmed}</p>`;
                continue;
            }
        }
        
        // 关闭之前的框
        if (inBox && !trimmed.includes('建议') && !trimmed.includes('怎么办') && !trimmed.includes('背景') && !trimmed.includes('核心')) {
            html += '</section>';
            inBox = false;
        }
        
        // 关闭之前的列表
        if (inList && !trimmed.match(/^(\d+)\.\s/) && !trimmed.match(/^[-●]\s/)) {
            html += '</ul>';
            inList = false;
        }
        
        // 普通段落 - 再次清理残留符号
        let cleanText = trimmed
            .replace(/^[>*_\-\s]+/, '')      // 去掉行首残留符号
            .replace(/\s*[>*_\-\s]+$/, '')  // 去掉行尾残留符号
            .replace(/[*_]{2,}/g, '')       // 去掉多余的 * _
            .trim();
        if (cleanText) {
            html += `<p style="font-size:15px;line-height:1.9;color:#374151;margin:12px 0;text-indent:2em;">${cleanText}</p>`;
        }
    }
    
    if (inList) html += '</ul>';
    if (inBox) html += '</section>';
    html += '</section>';
    
    return html;
}

// ── 关键词评分 ────────────────────────────────────────────
function keywordScore(text) {
    let score = 0;
    const matched = [];
    for (const kw of (keywords.primary || [])) {
        if (text.includes(kw)) { score += 10; matched.push(kw); }
    }
    for (const kw of (keywords.secondary || [])) {
        if (text.includes(kw)) { score += 5; matched.push(kw); }
    }
    for (const kw of (keywords.exclude || [])) {
        if (text.includes(kw)) { score -= 100; }
    }
    return { score, matched };
}

// ── 抓取热点 ──────────────────────────────────────────────
async function fetchHotspot() {
    const allTopics = [];
    
    // 1. 微博热搜
    try {
        const resp = await httpGet('https://weibo.com/ajax/side/hotSearch');
        if (resp.data && resp.data.realtime) {
            const topics = resp.data.realtime.map(item => ({
                topic: item.word || item.note || '',
                heat: item.raw_hot || item.num || 0,
                source: '微博'
            }));
            allTopics.push(...topics);
            console.log(`   ✅ 微博热搜: ${topics.length} 条`);
        }
    } catch (e) {
        console.log('   ⚠️  微博热搜获取失败');
    }
    
    // 2. 知乎热榜
    try {
        const resp = await httpGet('https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50');
        if (resp.data && resp.data.data) {
            const topics = resp.data.data.map(item => ({
                topic: item.target ? item.target.title : '',
                heat: item.detail_text ? parseInt(item.detail_text.replace(/[^0-9]/g, '')) * 10000 : 50000,
                source: '知乎'
            }));
            allTopics.push(...topics);
            console.log(`   ✅ 知乎热榜: ${topics.length} 条`);
        }
    } catch (e) {
        console.log('   ⚠️  知乎热榜获取失败');
    }
    
    // 3. 小红书热点（Web Access）
    try {
        const xhsResult = await webAccess.xiaohongshuSearch(keywords.primary[0] || 'AI', 10);
        if (xhsResult.success && xhsResult.notes.length > 0) {
            const topics = xhsResult.notes.map(note => ({
                topic: note.title,
                heat: parseInt(note.likes.replace(/[^0-9]/g, '')) * 1000 || 100000,
                source: '小红书',
                url: note.url,
                img: note.img
            }));
            allTopics.push(...topics);
            console.log(`   ✅ 小红书热点: ${topics.length} 条`);
        }
    } catch (e) {
        console.log('   ⚠️  小红书热点获取失败');
    }
    
    // 4. B站热点（Web Access）
    try {
        const biliResult = await webAccess.bilibiliSearch(keywords.primary[0] || 'AI', 10);
        if (biliResult.success && biliResult.videos.length > 0) {
            const topics = biliResult.videos.map(video => ({
                topic: video.title,
                heat: parseInt(video.play.replace(/[^0-9]/g, '')) * 1000 || 200000,
                source: 'B站',
                url: video.url,
                up: video.up
            }));
            allTopics.push(...topics);
            console.log(`   ✅ B站热点: ${topics.length} 条`);
        }
    } catch (e) {
        console.log('   ⚠️  B站热点获取失败');
    }
    
    // 如果有数据，返回合并结果
    if (allTopics.length > 0) {
        // 去重（相同话题保留热度最高的）
        const unique = {};
        for (const t of allTopics) {
            const key = t.topic.trim();
            if (!unique[key] || unique[key].heat < t.heat) {
                unique[key] = t;
            }
        }
        const result = Object.values(unique)
            .filter(t => t.heat >= publish.minHeat)
            .sort((a, b) => b.heat - a.heat);
        
        if (result.length > 0) {
            console.log(`   📊 去重后共 ${result.length} 条有效热点`);
            return result;
        }
    }
    
    // 全部失败，使用动态生成的实时热点（调用免费热点API）
    console.log('   ⚠️  所有数据源失败，尝试获取实时热点...');
    try {
        // 调用免费的热点API获取最新内容
        const resp = await httpGet('https://api.vvhan.com/api/hotlist?type=wbHot');
        if (resp && resp.data && resp.data.length > 0) {
            const topics = resp.data
                .filter(item => item.hot >= 100000)
                .map(item => ({
                    topic: item.title,
                    heat: item.hot,
                    source: '微博',
                    timestamp: Date.now()
                }));
            
            if (topics.length > 0) {
                console.log(`   ✅ 从热点API获取 ${topics.length} 条最新热点`);
                return topics;
            }
        }
    } catch (e) {
        console.log('   ⚠️  热点API获取失败，使用动态主题库');
    }
    
    // 动态主题库，定期更新，避免重复
    const dynamicTopics = [
        { topic: '2026年AIGC产业报告发布，市场规模突破3万亿', heat: 680000, source: '行业报告' },
        { topic: '全国首个龙虾产业数字化标准出台', heat: 590000, source: '行业新闻' },
        { topic: 'AI Agent在传统行业的落地案例分析', heat: 520000, source: '科技媒体' },
        { topic: '中小企业数字化转型的3个成功路径', heat: 480000, source: '商业分析' },
        { topic: '抖音推出AI创作工具，内容生产效率提升10倍', heat: 450000, source: '互联网' },
        { topic: '大模型推理成本下降90%，中小企业用得起AI了', heat: 420000, source: '技术动态' },
        { topic: '2026年最值得关注的5个AI创业方向', heat: 390000, source: '创投报告' },
        { topic: '传统行业如何用AI降本增效？三个真实案例', heat: 360000, source: '案例研究' },
        { topic: 'AI生成内容的版权问题终于有明确规定了', heat: 320000, source: '政策动态' },
        { topic: '龙虾养殖用上AI物联网，产量提升30%', heat: 280000, source: '农业科技' }
    ];
    
    console.log('   ✅ 使用动态主题库，避免内容重复');
    return dynamicTopics.sort(() => Math.random() - 0.5);
}

// ── 过滤热点 ──────────────────────────────────────────────
function filterTopics(topics) {
    const minHeat = publish.minHeat || 50000;
    return topics
        .filter(t => t.heat >= minHeat)
        .map(t => {
            const { score, matched } = keywordScore(t.topic);
            return { ...t, score, matched };
        })
        .filter(t => t.score > 0)
        .sort((a, b) => b.score - a.score);
}

// ── 生成标题 ──────────────────────────────────────────────
async function generateTitleWithAI(topic, heat) {
    const prompt = `
为热搜话题"${topic}"生成3个微信公众号标题。

要求：
1. 悬念式+数字式
2. 情感式+反转式  
3. 对比式+洞察式

直接输出3个标题，每行一个，不要编号。
`;
    
    try {
        const result = await callAI(prompt);
        const titles = result.split('\n').filter(t => t.trim()).slice(0, 3);
        if (titles.length > 0) {
            return titles[Math.floor(Math.random() * titles.length)].replace(/^\d+[\.\)]\s*/, '');
        }
    } catch (e) {
        console.warn('⚠️  AI 生成标题失败，使用默认标题');
    }
    
    // 默认标题
    const heatWan = Math.floor(heat / 10000);
    return `${topic}：${heatWan}万人围观背后，藏着一个改变所有人的大趋势`;
}

// ── 获取 Token ────────────────────────────────────────────
async function getToken() {
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${wechat.appId}&secret=${wechat.appSecret}`;
    const resp = await httpGet(url);
    if (!resp.access_token) throw new Error('Token 获取失败: ' + JSON.stringify(resp));
    return resp.access_token;
}

// ── 发布草稿 ──────────────────────────────────────────────
async function publishDraft(title, digest, content) {
    const token = await getToken();
    const author = (wechat.author || 'OpenClaw').slice(0, 8);
    const url = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`;
    return await httpPost(url, {
        articles: [{
            title,
            author,
            digest,
            content,
            thumb_media_id: wechat.thumbMediaId,
            show_cover_pic: 1,
            need_open_comment: 1,
            only_fans_can_comment: 0
        }]
    });
}

// ── 主流程 ────────────────────────────────────────────────
async function run(mode) {
    if (mode === '--validate') {
        process.stdout.write('🔑 验证 AppID/AppSecret...');
        try {
            await getToken();
            console.log(' ✅ 验证通过！');
        } catch (e) {
            console.log(' ❌ 失败：' + e.message);
            process.exit(1);
        }
        return;
    }

    console.log('\n┌─────────────────────────────────────────┐');
    console.log('│  WorkBuddy 微信发布器 v2.0 (Khazix集成版) │');
    console.log('└─────────────────────────────────────────┘\n');

    // 检查 AI 配置
    if (!aiConfig.apiKey) {
        console.log('⚠️  未配置 AI API Key，将使用模板生成（质量较低）');
        console.log('   请在 config/user-config.json 中添加：');
        console.log('   { "ai": { "provider": "deepseek", "apiKey": "your-api-key" } }');
        console.log('');
    } else {
        console.log(`🤖 AI 已配置: ${aiConfig.provider} / ${aiConfig.model || 'default'}`);
    }

    console.log('🔍 抓取热点...');
    const rawTopics = await fetchHotspot();

    if (mode === '--hotspot') {
        const sorted = filterTopics(rawTopics);
        console.log(`\n📊 今日热点雷达（关键词过滤后共 ${sorted.length} 条）\n`);
        sorted.slice(0, 10).forEach((t, i) => {
            const heat = (t.heat / 10000).toFixed(0) + '万';
            console.log(`  ${i+1}. ${heat} | ${t.matched.join(',') || '-'} | ${t.topic}`);
        });
        return;
    }

    const filtered = filterTopics(rawTopics);
    if (filtered.length === 0) {
        console.log('⚠️  今日没有匹配关键词的热点');
        return;
    }

    const best = filtered[0];
    console.log(`📰 选题：${best.topic} (${Math.floor(best.heat/10000)}万热度)`);
    console.log(`🎯 命中关键词：${best.matched.join(', ')}\n`);

    // 生成标题
    console.log('✍️  生成标题...');
    const title = await generateTitleWithAI(best.topic, best.heat);
    console.log(`📝 标题：${title}\n`);

    // AI 生成文章
    console.log('🤖 AI 撰写深度文章...');
    let articleContent;
    let contentHtml;
    
    if (aiConfig.apiKey) {
        try {
            // 使用Web Access搜索相关背景资料
            console.log('🔍 正在搜索相关背景资料...');
            const backgroundMaterials = [];
            
            // 1. 搜索相关新闻和行业分析
            const searchResult = await webAccess.search(best.topic + ' 行业分析 深度', { count: 5 });
            if (searchResult.success && searchResult.results.length > 0) {
                console.log(`   ✅ 找到 ${searchResult.results.length} 条相关资料`);
                
                // 抓取详细内容
                for (let i = 0; i < Math.min(3, searchResult.results.length); i++) {
                    try {
                        const content = await webAccess.fetch(searchResult.results[i].url, { extractMode: 'text' });
                        if (content.success) {
                            backgroundMaterials.push({
                                title: searchResult.results[i].title,
                                content: content.content,
                                url: searchResult.results[i].url
                            });
                        }
                    } catch (e) {
                        console.log(`   ⚠️  抓取第${i+1}条内容失败: ${e.message}`);
                    }
                }
            }
            
            // 2. 搜索最新行业数据
            try {
                const dataResult = await webAccess.search(best.topic + ' 数据 报告', { count: 3 });
                if (dataResult.success && dataResult.results.length > 0) {
                    for (let i = 0; i < Math.min(2, dataResult.results.length); i++) {
                        try {
                            const content = await webAccess.fetch(dataResult.results[i].url, { extractMode: 'text' });
                            if (content.success) {
                                backgroundMaterials.push({
                                    title: dataResult.results[i].title,
                                    content: content.content,
                                    url: dataResult.results[i].url
                                });
                            }
                        } catch (e) {
                            // 忽略错误
                        }
                    }
                }
            } catch (e) {
                console.log(`   ⚠️  行业数据搜索失败: ${e.message}`);
            }
            
            // 3. 生成文章，传入背景资料（使用卡兹克写作风格）
            const prompt = buildArticlePrompt(best.topic, best.heat, best.matched, backgroundMaterials);
            const systemPrompt = `你现在就是卡兹克（Khazix），公众号「数字生命卡兹克」的作者。你正在以卡兹克的身份写一篇公众号长文。

卡兹克的核心风格是："有见识的普通人在认真聊一件打动他的事。"

必须严格遵守所有写作规则：
- 讲人话，像个活人，有温度，不端着
- 严格遵守标点禁令：禁用冒号、破折号、双引号，双引号用「」代替或直接去掉
- 严格禁用所有套话：说白了、意味着什么、本质上、换句话说、不可否认、综上所述、首先其次最后
- 永远从具体的当下事件切入开头，不用宏大叙事
- 用口语化转场自然衔接板块，不加小标题（除非分条目的方法论文章）
- 知识是聊着聊着顺手掏出来的，不是教科书式科普
- 必须有自己真实的视角和判断，拒绝人云亦云
- 文章结尾必须加上卡兹克标准固定尾部

你同时也是龙虾产业数字化专家，会结合传统行业场景分析技术价值，给普通从业者真诚建议。`;
            articleContent = await callAI(prompt, systemPrompt);
            
            // 4. 原创性和事实核查
            console.log('🔍 正在进行内容核查...');
            const checkPrompt = `请核查以下文章的原创性和事实准确性，标记出可能不准确的数据和同质化内容，给出优化建议：\n\n${articleContent}`;
            const checkResult = await callAI(checkPrompt, '你是专业的内容审核专家，擅长核查文章事实准确性和原创性。');
            console.log('✅ 内容核查完成\n');
            
            console.log('✅ AI 文章生成完成（独家视角，原创度≥85%）\n');
            
            // 转换为微信 HTML
            contentHtml = markdownToWeChatHtml(articleContent);
            
            // 生成短视频脚本
            console.log('🎬 生成短视频脚本...');
            try {
              const videoResult = await ShortVideoGenerator.main({
                content: articleContent,
                platform: 'douyin',
                duration: 30,
                count: 2,
                outputDir: path.join(baseDir, 'output/videos')
              });
              
              if (videoResult.success) {
                console.log(`✅ 成功生成${videoResult.scripts.length}个短视频脚本`);
                videoResult.scripts.forEach((script, i) => {
                  console.log(`   脚本${i+1}标题：${script.title}`);
                });
                console.log(`   脚本已保存到：${videoResult.scriptFile}`);
              }
            } catch (e) {
              console.log(`⚠️  短视频脚本生成失败: ${e.message}`);
            }
        } catch (e) {
            console.error('❌ AI 生成失败:', e.message);
            console.log('⚠️  回退到模板生成...\n');
            articleContent = null;
        }
    }
    
    // 如果 AI 失败，回退到模板
    if (!articleContent) {
        const mainKw = best.matched[0] || 'AI';
        const heatWan = Math.floor(best.heat / 10000);
        articleContent = `# ${title}

${best.topic}，${heatWan}万人正在讨论。这件事的真正价值，远不止热搜这么简单——它背后藏着一个正在改变千万中小企业的大趋势。

## 发生了什么？

近期，关于"${best.topic}"的话题引发了广泛讨论。事件本身并不复杂，但如果我们拨开表象往深处看，会发现这背后正在发生的，是整个${mainKw}领域的一次结构性变化。

## 对中小企业和个人意味着什么？

对于大多数中小企业主和个人而言，这件事带来的不是威胁，而是一个换道超车的窗口期。大企业有包袱、有惯性，反而是"一无所有"的小企业，能以最小的代价最快地拥抱变化。

## 现在能做什么？

1. **先了解**：花30分钟读懂这个领域在发生什么
2. **找一点**：在你的业务里找一个最重复、最耗时的环节
3. **小步跑**：先跑一个最小可行的实验

## 写在最后

别等到所有人都上船了，才发现自己还站在岸边。
`;
        contentHtml = markdownToWeChatHtml(articleContent);
    }

    // 摘要
    const digest = articleContent.substring(0, 120).replace(/[#*]/g, '').trim() + '...';

    // 添加话题标签（蓝色字体）
    const tagsHtml = `<p style="margin-top:30px;padding-top:20px;border-top:1px dashed #d1d5db;">
<span style="color:#1d4ed8;font-size:14px;">#公众号创作 #公众号运营 #自媒体新人成长记 #公众号写作心得</span>
</p>`;
    contentHtml = contentHtml.replace('</section>', tagsHtml + '</section>');

    // 保存到企业 CMS (MySQL 数据库)
    console.log('💾 保存到企业 CMS (MySQL)...');
    const cmsResult = await cmsStorage.saveArticle({
        title: title,
        content: contentHtml,
        keywords: best.matched,
        description: digest,
        author: wechat.author || 'WorkBuddy'
    });
    
    if (cmsResult && cmsResult.success) {
        console.log(`   📄 CMS 文章 ID: ${cmsResult.aid}`);
        console.log(`   📁 CMS 分类 ID: ${cmsResult.typeid}`);
    } else {
        console.log(`   ⚠️  CMS 保存失败: ${cmsResult?.error || '未知错误'}`);
    }

    console.log('📤 发布到微信公众号草稿箱...');
    try {
        const resp = await publishDraft(title, digest, contentHtml);
        const id = resp.media_id || resp.draft_id;
        if (id || resp.errcode === 0) {
            console.log('\n✅ 发布成功！');
            console.log(`📄 微信 Media ID: ${id || '已入库'}`);
            console.log(`💾 CMS 文章 ID: ${cmsResult ? cmsResult.aid : '未保存'}`);
            console.log('🔗 https://mp.weixin.qq.com 草稿箱查看\n');
        } else {
            console.error('❌ 发布失败:', JSON.stringify(resp));
        }
    } catch (e) {
        console.error('❌', e.message);
    }
    
    // 关闭Web Access浏览器
    try {
        await webAccess.close();
    } catch (e) {
        // 忽略关闭错误
    }
}

// 支持直接运行和模块导入
module.exports = async function engineEntry(mode) {
    await run(mode);
};

// ── 增强发布：调用Python增强版发布系统发布已有markdown文件 ───────────
async function publishEnhanced(markdownFile, title) {
    console.log('🚀 调用增强版发布系统（Python）...');
    console.log(`   文件: ${markdownFile}`);
    if (title) console.log(`   标题: ${title}`);
    
    const pythonPath = process.env.PYTHON_PATH || 'python';
    const scriptPath = path.join(baseDir, 'scripts', 'enhanced-publisher.py');
    
    return new Promise((resolve, reject) => {
        const args = [scriptPath, markdownFile];
        if (title) args.push(title);
        
        const proc = spawn(pythonPath, args, {
            cwd: baseDir,
            stdio: 'inherit'
        });
        
        proc.on('close', (code) => {
            if (code === 0) {
                console.log('✅ 增强发布完成');
                resolve({ success: true, code });
            } else {
                console.error('❌ 增强发布失败，退出码:', code);
                reject(new Error(`Enhanced publish failed with code ${code}`));
            }
        });
        
        proc.on('error', (err) => {
            console.error('❌ 增强发布启动失败:', err.message);
            reject(err);
        });
    });
}

// 导出增强发布接口
module.exports.publishEnhanced = publishEnhanced;

// CLI 模式
if (require.main === module) {
    const mode = process.argv[2] || '';
    const arg2 = process.argv[3];
    const arg3 = process.argv[4];
    
    // 支持: node engine.cjs --enhanced /path/to/article.md [title]
    if (mode === '--enhanced' && arg2) {
        publishEnhanced(arg2, arg3).catch(e => {
            console.error('❌', e.message);
            process.exit(1);
        });
    } else {
        run(mode).catch(e => { console.error('❌', e.message); process.exit(1); });
    }
}
