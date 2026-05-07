/**
 * Reddit 短视频管线 - 配置管理
 * 所有配置统一管理，支持环境变量覆盖
 */

const { loadEnv } = require('./env-loader.cjs');
loadEnv();

// ── Reddit API 配置 ──────────────────────────────────────
const redditConfig = {
    client_id: process.env.REDDIT_CLIENT_ID || '',
    client_secret: process.env.REDDIT_CLIENT_SECRET || '',
    username: process.env.REDDIT_USERNAME || '',
    password: process.env.REDDIT_PASSWORD || '',
    user_agent: 'WechatPublisherBot/3.0 (content creator bot)',
    default_subreddit: process.env.REDDIT_SUBREDDIT || 'AskReddit',
};

// ── TTS 配置 ────────────────────────────────────────────
// 0=Google(免费), 1=EdgeTTS(微软), 2=TikTok, 3=ElevenLabs, 4=OpenAI
const ttsConfig = {
    engine: parseInt(process.env.REDDIT_TTS_ENGINE || '0'),
    // Google TTS（免费）
    googleLang: 'zh-CN',
    // Edge TTS（微软，免费，中文质量好）
    edgeVoice: 'zh-CN-XiaoxiaoNeural',
    // TikTok TTS（声音辨识度高，需 sessionid）
    tiktokSessionId: process.env.TIKTOK_SESSION_ID || '',
    // ElevenLabs（付费，音质最好）
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || '',
    elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID || 'pFZP5JQG7iQjIQuXX4FU', // Rachel，柔和女声
    // OpenAI TTS
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: 'tts-1',
    openaiVoice: 'alloy',
    // 通用参数
    maxLength: 50,        // 单段最大时长（秒）
    speed: 1.0,           // 语速
    maxAudioDuration: 90,  // 总音频最大时长（秒）
};

// ── 视频合成配置 ─────────────────────────────────────────
const videoConfig = {
    // 输出尺寸：9:16 竖屏（抖音/小红书）
    width: 1080,
    height: 1920,
    // 截图叠加：宽度占视频 45%，透明度可调
    screenshotWidthRatio: 0.45,
    screenshotOpacity: 0.85,
    // 背景视频
    backgroundDir: '',        // 本地背景视频目录（留空用yt-dlp下载）
    backgroundKeyword: 'minecraft gameplay',  // yt-dlp 下载关键词
    backgroundVolume: 0.15,   // 背景音乐音量
    // 编码器（Windows NVIDIA优先，否则用软件编码）
    videoCodec: 'h264_nvenc',
    audioCodec: 'aac',
    bitrate: '4M',
    fps: 30,
    // 输出目录
    outputDir: '',  // 留空则自动生成 output/YYYYMMDD_HHMMSS/
};

// ── 截图配置 ─────────────────────────────────────────────
const screenshotConfig = {
    // Playwright 浏览器配置
    headless: true,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
    // Reddit 主题：light / dark / transparent
    redditTheme: process.env.REDDIT_THEME || 'dark',
    // 是否自动注入 cookie 保持登录态
    useCookie: false,
    cookiePath: '',
    // 截图样式
    titleHeight: 120,   // 标题截图高度
    commentHeight: 80,   // 单条评论截图高度
};

// ── 内容过滤配置 ─────────────────────────────────────────
const filterConfig = {
    minScore: 10,         // 最低 Reddit 评分
    minCommentCount: 3,   // 最少评论数
    minTitleLength: 10,   // 最短标题长度
    maxTitleLength: 200,  // 最长标题长度
    // 必须包含的关键词（留空则不限制）
    includeKeywords: (process.env.REDDIT_INCLUDE_KEYWORDS || 'story,恐怖,诡异,反转,暖心,震惊,泪目')
        .split(',').map(k => k.trim()).filter(Boolean),
    // 排除关键词
    excludeKeywords: (process.env.REDDIT_EXCLUDE_KEYWORDS || 'nsfw,political,religious')
        .split(',').map(k => k.trim()).filter(Boolean),
    // AI 选帖：关键词语义匹配
    aiSimilarityEnabled: process.env.REDDIT_AI_SIMILARITY === 'true',
    similarityKeywords: (process.env.REDDIT_SIMILARITY_KEYWORDS || '')
        .split(',').map(k => k.trim()).filter(Boolean),
};

// ── 多平台发布配置 ───────────────────────────────────────
const publishConfig = {
    wechat: {
        enabled: process.env.ENABLE_MULTI_PLATFORM === 'true',
        appId: process.env.WECHAT_APP_ID,
        appSecret: process.env.WECHAT_APP_SECRET,
    },
    xiaohongshu: {
        enabled: false,  // 需要小红书 API
        cookies: process.env.XHS_COOKIES || '',
    },
    bilibili: {
        enabled: false,  // 需要 B站 API
        cookie: process.env.BILIBILI_COOKIE || '',
    },
};

// ── 工具函数 ─────────────────────────────────────────────
function validateConfig() {
    const errors = [];

    if (!redditConfig.client_id || !redditConfig.client_secret) {
        errors.push('⚠️  Reddit API 未配置（REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET），无法抓帖');
    } else {
        console.log('✅ Reddit API 已配置');
    }

    if (!ttsConfig.tiktokSessionId && ttsConfig.engine === 2) {
        errors.push('⚠️  TikTok TTS 需要 TIKTOK_SESSION_ID');
    }

    if (!ttsConfig.elevenlabsApiKey && ttsConfig.engine === 3) {
        errors.push('⚠️  ElevenLabs TTS 需要 ELEVENLABS_API_KEY');
    }

    if (!ttsConfig.openaiApiKey && ttsConfig.engine === 4) {
        errors.push('⚠️  OpenAI TTS 需要 OPENAI_API_KEY');
    }

    if (filterConfig.aiSimilarityEnabled) {
        if (!filterConfig.similarityKeywords.length) {
            errors.push('⚠️  AI 选帖已启用但未配置关键词（REDDIT_SIMILARITY_KEYWORDS）');
        } else {
            console.log('✅ AI 语义选帖已启用，关键词:', filterConfig.similarityKeywords.join(', '));
        }
    }

    return errors;
}

function getOutputDir() {
    if (videoConfig.outputDir) return videoConfig.outputDir;
    const d = new Date();
    const ts = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;
    return videoConfig.outputDir = require('path').join(__dirname, 'output', ts);
}

function ensureOutputDir() {
    const dir = getOutputDir();
    require('fs').mkdirSync(dir, { recursive: true });
    return dir;
}

module.exports = {
    redditConfig,
    ttsConfig,
    videoConfig,
    screenshotConfig,
    filterConfig,
    publishConfig,
    validateConfig,
    getOutputDir,
    ensureOutputDir,
};
