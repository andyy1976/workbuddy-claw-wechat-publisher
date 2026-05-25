const express = require('express');
const router = express.Router();
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
        console.log('[Logs Route] 数据库连接成功，启用数据库日志查询');
    } catch (err) {
        console.error('[Logs Route] 数据库连接失败，将仅使用文件日志查询:', err.message);
        dbAvailable = false;
    }
}

// 初始化数据库
initDB();

/**
 * 解析日志文件内容
 * @param {string} filePath - 日志文件路径
 * @returns {Array} 解析后的日志对象数组
 */
function parseLogFile(filePath) {
    if (!fs.existsSync(filePath)) return [];
    
    const content = fs.readFileSync(filePath, { encoding: 'utf8' });
    const lines = content.split('\n').filter(line => line.trim());
    const logs = [];
    
    for (const line of lines) {
        // 解析日志行格式: [2026-05-24 23:36:00] [INFO] [publish] 标题 | wechat | success | 1234ms
        const match = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[(DEBUG|INFO|WARN|ERROR)\] \[(\w+)\] (.+)$/);
        if (!match) continue;
        
        const [, timeStr, level, action, message] = match;
        logs.push({
            time: timeStr.replace(' ', 'T'), // 转换为ISO 8601格式
            level,
            action,
            message,
            detail: null // 文件日志不包含detail字段
        });
    }
    
    return logs;
}

/**
 * 获取指定日期范围内的所有日志文件
 * @param {string} dateFrom - 开始日期（YYYY-MM-DD）
 * @param {string} dateTo - 结束日期（YYYY-MM-DD）
 * @returns {Array} 日志文件路径数组
 */
function getLogFilesInRange(dateFrom, dateTo) {
    if (!fs.existsSync(LOG_DIR)) return [];
    
    const files = fs.readdirSync(LOG_DIR)
        .filter(file => file.endsWith('.log'))
        .map(file => ({
            name: file,
            date: file.replace('.log', '')
        }))
        .filter(file => {
            if (dateFrom && file.date < dateFrom) return false;
            if (dateTo && file.date > dateTo) return false;
            return true;
        })
        .map(file => path.join(LOG_DIR, file.name));
    
    return files;
}

/**
 * @route GET /api/logs
 * @description 获取日志列表（支持分页、过滤）
 * @query {number} page - 页码（默认1）
 * @query {number} pageSize - 每页条数（默认50）
 * @query {string} level - 日志级别过滤（可选）
 * @query {string} action - 操作类型过滤
 * @query {string} dateFrom - 开始日期（YYYY-MM-DD，可选）
 * @query {string} dateTo - 结束日期（YYYY-MM-DD，可选）
 */
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            pageSize = 50,
            level,
            action,
            dateFrom,
            dateTo
        } = req.query;
        
        const currentPage = Math.max(parseInt(page) || 1, 1);
        const currentPageSize = Math.max(parseInt(pageSize) || 50, 1);
        
        let logs = [];
        let total = 0;
        
        // 优先从数据库读取
        if (dbAvailable && pool) {
            try {
                // 构建查询条件
                let query = 'SELECT * FROM run_log WHERE 1=1';
                const params = [];
                
                if (level) {
                    query += ' AND level = ?';
                    params.push(level);
                }
                
                if (action) {
                    query += ' AND action = ?';
                    params.push(action);
                }
                
                if (dateFrom) {
                    query += ' AND DATE(time) >= ?';
                    params.push(dateFrom);
                }
                
                if (dateTo) {
                    query += ' AND DATE(time) <= ?';
                    params.push(dateTo);
                }
                
                // 获取总数
                const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
                const [countResult] = await pool.execute(countQuery, params);
                total = countResult[0].total;
                
                // 添加排序和分页
                query += ' ORDER BY time DESC LIMIT ? OFFSET ?';
                const offset = (currentPage - 1) * currentPageSize;
                params.push(currentPageSize, offset);
                
                const [rows] = await pool.execute(query, params);
                
                return res.json({
                    success: true,
                    data: rows,
                    pagination: {
                        page: currentPage,
                        pageSize: currentPageSize,
                        total,
                        totalPages: Math.ceil(total / currentPageSize)
                    }
                });
            } catch (err) {
                console.error('[Logs Route] 数据库查询失败，降级到文件查询:', err.message);
                // 继续执行文件查询逻辑
            }
        }
        
        // 从文件读取日志
        const logFiles = getLogFilesInRange(dateFrom, dateTo);
        for (const file of logFiles) {
            const fileLogs = parseLogFile(file);
            logs.push(...fileLogs);
        }
        
        // 过滤日志
        if (level) {
            logs = logs.filter(log => log.level === level);
        }
        
        if (action) {
            logs = logs.filter(log => log.action === action);
        }
        
        // 按时间降序排序
        logs.sort((a, b) => new Date(b.time) - new Date(a.time));
        
        // 分页
        total = logs.length;
        const start = (currentPage - 1) * currentPageSize;
        const end = start + currentPageSize;
        const pagedLogs = logs.slice(start, end);
        
        res.json({
            success: true,
            data: pagedLogs,
            pagination: {
                page: currentPage,
                pageSize: currentPageSize,
                total,
                totalPages: Math.ceil(total / currentPageSize)
            }
        });
    } catch (err) {
        console.error('[Logs Route] 获取日志列表失败:', err);
        res.status(500).json({
            success: false,
            error: '获取日志列表失败',
            details: err.message
        });
    }
});

/**
 * @route GET /api/logs/stats
 * @description 获取日志统计信息
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = {
            totalLogs: 0,
            todayLogs: 0,
            errorCount: 0,
            byLevel: {
                DEBUG: 0,
                INFO: 0,
                WARN: 0,
                ERROR: 0
            },
            recentErrors: [],
            lastLogTime: null
        };
        
        const todayStr = new Date().toISOString().slice(0, 10);
        
        // 优先从数据库读取
        if (dbAvailable && pool) {
            try {
                // 总日志数
                const [totalResult] = await pool.execute('SELECT COUNT(*) as total FROM run_log');
                stats.totalLogs = totalResult[0].total;
                
                // 今日日志数
                const [todayResult] = await pool.execute('SELECT COUNT(*) as total FROM run_log WHERE DATE(time) = ?', [todayStr]);
                stats.todayLogs = todayResult[0].total;
                
                // 错误日志数
                const [errorResult] = await pool.execute('SELECT COUNT(*) as total FROM run_log WHERE level = ?', ['ERROR']);
                stats.errorCount = errorResult[0].total;
                
                // 按级别统计
                const [levelResult] = await pool.execute('SELECT level, COUNT(*) as count FROM run_log GROUP BY level');
                levelResult.forEach(row => {
                    if (stats.byLevel.hasOwnProperty(row.level)) {
                        stats.byLevel[row.level] = row.count;
                    }
                });
                
                // 最近的错误日志（最多10条）
                const [recentErrors] = await pool.execute('SELECT time, message, detail FROM run_log WHERE level = ? ORDER BY time DESC LIMIT 10', ['ERROR']);
                stats.recentErrors = recentErrors.map(row => ({
                    time: row.time,
                    message: row.message,
                    detail: row.detail
                }));
                
                // 最后日志记录时间
                const [lastLogResult] = await pool.execute('SELECT MAX(time) as lastTime FROM run_log');
                stats.lastLogTime = lastLogResult[0].lastTime;
                
                return res.json({
                    success: true,
                    data: stats
                });
            } catch (err) {
                console.error('[Logs Route] 数据库统计失败，降级到文件统计:', err.message);
                // 继续执行文件统计逻辑
            }
        }
        
        // 从文件统计
        if (!fs.existsSync(LOG_DIR)) {
            return res.json({
                success: true,
                data: stats
            });
        }
        
        const files = fs.readdirSync(LOG_DIR).filter(file => file.endsWith('.log'));
        let lastLogTime = null;
        
        for (const file of files) {
            const dateStr = file.replace('.log', '');
            const filePath = path.join(LOG_DIR, file);
            const logs = parseLogFile(filePath);
            
            stats.totalLogs += logs.length;
            
            // 统计今日日志
            if (dateStr === todayStr) {
                stats.todayLogs += logs.length;
            }
            
            // 统计错误日志和级别
            logs.forEach(log => {
                if (log.level === 'ERROR') {
                    stats.errorCount++;
                    
                    // 收集最近的错误（最多10条）
                    if (stats.recentErrors.length < 10) {
                        stats.recentErrors.push({
                            time: log.time,
                            message: log.message,
                            detail: log.detail
                        });
                    }
                }
                
                // 按级别统计
                if (stats.byLevel.hasOwnProperty(log.level)) {
                    stats.byLevel[log.level]++;
                }
                
                // 更新最后日志时间
                const logTime = new Date(log.time);
                if (!lastLogTime || logTime > lastLogTime) {
                    lastLogTime = logTime;
                }
            });
        }
        
        // 按时间降序排序最近错误
        stats.recentErrors.sort((a, b) => new Date(b.time) - new Date(a.time));
        
        // 设置最后日志时间
        stats.lastLogTime = lastLogTime ? lastLogTime.toISOString() : null;
        
        res.json({
            success: true,
            data: stats
        });
    } catch (err) {
        console.error('[Logs Route] 获取日志统计失败:', err);
        res.status(500).json({
            success: false,
            error: '获取日志统计失败',
            details: err.message
        });
    }
});

/**
 * @route GET /api/logs/download
 * @description 下载指定日期的日志文件
 * @query {string} date - 日期（YYYY-MM-DD）
 */
router.get('/download', (req, res) => {
    try {
        const { date } = req.query;
        
        // 验证日期参数
        if (!date) {
            return res.status(400).json({
                success: false,
                error: '缺少date参数'
            });
        }
        
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({
                success: false,
                error: '日期格式错误，请使用YYYY-MM-DD格式'
            });
        }
        
        const logFile = path.join(LOG_DIR, `${date}.log`);
        
        // 检查文件是否存在
        if (!fs.existsSync(logFile)) {
            return res.status(404).json({
                success: false,
                error: '指定日期的日志文件不存在'
            });
        }
        
        // 设置下载响应头
        res.setHeader('Content-Disposition', `attachment; filename=${date}.log`);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        
        // 发送文件
        const fileStream = fs.createReadStream(logFile);
        fileStream.pipe(res);

        fileStream.on('error', (err) => {
            console.error('[Logs Route] 下载日志文件失败:', err);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: '下载日志文件失败'
                });
            }
        });
    } catch (err) {
        console.error('[Logs Route] 下载日志文件失败:', err);
        res.status(500).json({
            success: false,
            error: '下载日志文件失败',
            details: err.message
        });
    }
});

/**
 * @route DELETE /api/logs/before
 * @description 清理指定日期之前的旧日志
 * @query {string} date - 截止日期（YYYY-MM-DD）
 */
router.delete('/before', async (req, res) => {
    try {
        const { date } = req.query;
        
        // 验证日期参数
        if (!date) {
            return res.status(400).json({
                success: false,
                error: '缺少date参数'
            });
        }
        
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({
                success: false,
                error: '日期格式错误，请使用YYYY-MM-DD格式'
            });
        }
        
        const beforeDate = new Date(date);
        if (isNaN(beforeDate.getTime())) {
            return res.status(400).json({
                success: false,
                error: '无效的日期'
            });
        }
        
        let deletedCount = 0;
        
        // 清理数据库日志
        if (dbAvailable && pool) {
            try {
                const [result] = await pool.execute('DELETE FROM run_log WHERE DATE(time) < ?', [date]);
                deletedCount += result.affectedRows;
            } catch (err) {
                console.error('[Logs Route] 清理数据库日志失败:', err.message);
            }
        }
        
        // 清理文件日志
        if (fs.existsSync(LOG_DIR)) {
            const files = fs.readdirSync(LOG_DIR).filter(file => file.endsWith('.log'));
            
            for (const file of files) {
                const fileDateStr = file.replace('.log', '');
                const fileDate = new Date(fileDateStr);
                
                if (fileDate < beforeDate) {
                    const filePath = path.join(LOG_DIR, file);
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            }
        }
        
        res.json({
            success: true,
            deletedCount,
            message: `成功清理${date}之前的${deletedCount}条日志`
        });
    } catch (err) {
        console.error('[Logs Route] 清理旧日志失败:', err);
        res.status(500).json({
            success: false,
            error: '清理旧日志失败',
            details: err.message
        });
    }
});

// 导出路由
module.exports = router;