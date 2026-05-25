const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const DB_CONFIG = {
    host: process.env.DB_HOST || '82.156.40.94',
    user: process.env.DB_USER || 'eastaiai',
    password: process.env.DB_PASSWORD || 'alibaba',
    database: process.env.DB_NAME || 'eastaiai',
    charset: 'utf8mb4',
    connectTimeout: 15000
};

const LOG_DIR = path.join(__dirname, '../logs');

// 自动创建日志目录
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 数据库连接的态状
let pool = null;
let dbAvailable = false;

// 初始化数据库连接池
async function initDB() {
    try {
        pool = mysql.createPool(DB_CONFIG);
        // 测试数据库连接
        await pool.getConnection();
        dbAvailable = true;
        console.log('[Logger] 数据库连接成功，启用数据库日志');
    } catch (err) {
        console.error('[Logger] 数据库连接失败，将仅使用文件日志:', err.message);
        dbAvailable = false;
    }
}

// 初始化数据库
initDB();

// 日志级别定义
const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

/**
 * 格式化时间为 YYYY-MM-DD HH:mm:ss 格式
 * @param {Date} date - 日期对象，默认为当前时间
 * @returns {string} 格式化后的时间字符串
 */
function formatTime(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 写入日志到文件
 * @param {string} level - 日志级别
 * @param {string} action - 操作类型
 * @param {string} message - 日志消息
 */
function writeToFile(level, action, message) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const logFile = path.join(LOG_DIR, `${dateStr}.log`);
    const logLine = `[${formatTime(now)}] [${level}] [${action}] ${message}\n`;
    
    // 同步写入文件，确保日志不丢失
    fs.appendFileSync(logFile, logLine, { encoding: 'utf8' });
}

/**
 * 写入日志到数据库
 * @param {string} level - 日志级别
 * @param {string} action - 操作类型
 * @param {string} message - 日志消息
 * @param {string} [detail] - 详细信息（可选）
 */
async function writeToDB(level, action, message, detail) {
    if (!dbAvailable || !pool) return;
    
    try {
        const now = new Date();
        await pool.execute(
            `INSERT INTO run_log (time, level, action, message, detail) 
             VALUES (?, ?, ?, ?, ?)`,
            [now, level, action, message, detail || null]
        );
    } catch (err) {
        console.error('[Logger] 写入数据库日志失败:', err.message);
        // 不抛出错误，避免影响主流程
    }
}

/**
 * 基础日志记录方法
 * @param {string} level - 日志级别
 * @param {string} action - 操作类型
 * @param {string} message - 日志消息
 * @param {string} [detail] - 详细信息（可选）
 */
async function log(level, action, message, detail) {
    // 验证日志级别
    if (!LOG_LEVELS.includes(level)) {
        level = 'INFO';
    }
    
    // 写入文件日志
    writeToFile(level, action, message);
    
    // 写入数据库日志
    await writeToDB(level, action, message, detail);
}

// 基础Logger对象
const logger = {
    /**
     * 记录DEBUG级别日志
     * @param {string} action - 操作类型
     * @param {string} message - 日志消息
     * @param {string} [detail] - 详细信息（可选）
     */
    debug: (action, message, detail) => log('DEBUG', action, message, detail),
    
    /**
     * 记录INFO级别日志
     * @param {string} action - 操作类型
     * @param {string} message - 日志消息
     * @param {string} [detail] - 详细信息（可选）
     */
    info: (action, message, detail) => log('INFO', action, message, detail),
    
    /**
     * 记录WARN级别日志
     * @param {string} action - 操作类型
     * @param {string} message - 日志消息
     * @param {string} [detail] - 详细信息（可选）
     */
    warn: (action, message, detail) => log('WARN', action, message, detail),
    
    /**
     * 记录ERROR级别日志
     * @param {string} action - 操作类型
     * @param {string} message - 日志消息
     * @param {string} [detail] - 详细信息（可选）
     */
    error: (action, message, detail) => log('ERROR', action, message, detail)
};

/**
 * 记录内容发布日志
 * @param {Object} params - 日志参数
 * @param {string} params.title - 内容标题
 * @param {string} params.platform - 发布平台
 * @param {string} params.status - 发布状态（success/failed）
 * @param {number} params.elapsedMs - 耗时（毫秒）
 * @param {string} [params.contentId] - 内容ID（可选）
 * @param {Error} [params.error] - 错误信息（可选）
 */
async function logPublish({ title, platform, status, elapsedMs, contentId, error }) {
    const message = `${title} | ${platform} | ${status} | ${elapsedMs}ms`;
    const detail = error ? (error.stack || error.message || String(error)) : null;
    await log('INFO', 'publish', message, detail);
}

/**
 * 记录内容生成日志
 * @param {Object} params - 日志参数
 * @param {string} params.topic - 生成主题
 * @param {string} params.model - 使用的模型
 * @param {number} params.words - 生成字数
 * @param {string} params.status - 生成状态（success/failed）
 * @param {number} params.elapsedMs - 耗时（毫秒）
 * @param {string} params.title - 生成内容标题
 */
async function logGenerate({ topic, model, words, status, elapsedMs, title }) {
    const message = `${title} | ${topic} | ${model} | ${words} words | ${status} | ${elapsedMs}ms`;
    await log('INFO', 'generate', message, null);
}

/**
 * 记录内容检查日志
 * @param {Object} params - 日志参数
 * @param {string} params.contentId - 内容ID
 * @param {boolean} params.passed - 是否通过检查
 * @param {Array} params.errors - 错误列表
 * @param {Array} params.warnings - 警告列表
 */
async function logCheck({ contentId, passed, errors, warnings }) {
    const errorCount = errors?.length || 0;
    const warningCount = warnings?.length || 0;
    const message = `contentId: ${contentId} | passed: ${passed} | errors: ${errorCount} | warnings: ${warningCount}`;
    const detail = JSON.stringify({ errors, warnings });
    await log('INFO', 'check', message, detail);
}

/**
 * 记录系统操作日志
 * @param {Object} params - 日志参数
 * @param {string} params.action - 系统操作类型
 * @param {string} params.detail - 操作详情
 * @param {string} [params.level='INFO'] - 日志级别（可选，默认INFO）
 */
async function logSystem({ action, detail, level = 'INFO' }) {
    const message = action;
    await log(level, 'system', message, detail);
}

// 导出模块
module.exports = {
    logger,
    logPublish,
    logGenerate,
    logCheck,
    logSystem
};