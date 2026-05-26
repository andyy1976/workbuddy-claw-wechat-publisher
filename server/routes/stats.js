const express = require('express');
const mysql = require('mysql2/promise');

const router = express.Router();

// 数据库配置
const DB_CONFIG = {
    host: process.env.DB_HOST || '82.156.40.94',
    user: process.env.DB_USER || 'eastaiai',
    password: process.env.DB_PASSWORD || 'alibaba',
    database: process.env.DB_NAME || 'eastaiai',
    charset: 'utf8mb4',
    connectTimeout: 15000
};

// 创建数据库连接池
const pool = mysql.createPool(DB_CONFIG);

/**
 * 1.1 发布记录列表
 * GET /api/stats/publish-logs?page=1&pageSize=20&platform=&status=&dateFrom=&dateTo=
 */
router.get('/publish-logs', async (req, res) => {
    try {
        const {
            page = 1,
            pageSize = 20,
            platform,
            status,
            dateFrom,
            dateTo
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(pageSize);
        const limit = parseInt(pageSize);

        // 构建查询条件
        let whereConditions = [];
        let queryParams = [];

        if (platform) {
            whereConditions.push('cpl.platform = ?');
            queryParams.push(platform);
        }

        if (status) {
            whereConditions.push('cpl.status = ?');
            queryParams.push(status);
        }

        if (dateFrom) {
            whereConditions.push('cpl.created_at >= ?');
            queryParams.push(dateFrom);
        }

        if (dateTo) {
            whereConditions.push('cpl.created_at <= ?');
            queryParams.push(dateTo + ' 23:59:59');
        }

        const whereClause = whereConditions.length > 0
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';

        // 查询总数
        const countQuery = `
            SELECT COUNT(*) as total
            FROM content_publish_log cpl
            ${whereClause}
        `;
        const [countResult] = await pool.execute(countQuery, queryParams);
        const total = countResult[0].total;

        // 查询列表（用 query() 而非 execute()，避免 mysql2 prepared statement LIMIT/OFFSET 兼容性问题）
        const listQuery = `
            SELECT
                cpl.id,
                cpl.content_id,
                la.title,
                cpl.platform,
                cpl.status,
                cpl.error_msg,
                cpl.published_at,
                cpl.created_at,
                cpl.retry_count
            FROM content_publish_log cpl
            LEFT JOIN lvbo_article la ON cpl.content_id = la.aid
            ${whereClause}
            ORDER BY cpl.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;
        const [rows] = await pool.query(listQuery);

        res.json({
            success: true,
            data: {
                list: rows,
                pagination: {
                    page: parseInt(page),
                    pageSize: parseInt(pageSize),
                    total: total,
                    totalPages: Math.ceil(total / pageSize)
                }
            }
        });
    } catch (error) {
        console.error('获取发布记录列表失败:', error);
        res.status(500).json({
            success: false,
            message: '获取发布记录列表失败',
            error: error.message
        });
    }
});

/**
 * 1.2 统计概览
 * GET /api/stats/overview?days=7
 */
router.get('/overview', async (req, res) => {
    try {
        const { days = 7 } = req.query;
        const daysInt = parseInt(days);

        // 计算日期范围
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split('T')[0];

        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);

        const daysAgo = new Date(today);
        daysAgo.setDate(daysAgo.getDate() - daysInt);

        // 总文章数
        const [totalResult] = await pool.execute('SELECT COUNT(*) as total FROM lvbo_article');
        const totalArticles = totalResult[0].total;

        // 今日发布数
        const [todayResult] = await pool.execute(
            'SELECT COUNT(*) as total FROM content_publish_log WHERE DATE(created_at) = ? AND status = ?',
            [todayStr, 'success']
        );
        const todayPublished = todayResult[0].total;

        // 本周发布数
        const [weekResult] = await pool.execute(
            'SELECT COUNT(*) as total FROM content_publish_log WHERE created_at >= ? AND status = ?',
            [weekAgo.toISOString().split('T')[0], 'success']
        );
        const weekPublished = weekResult[0].total;

        // 成功率统计
        const [statusResult] = await pool.execute(`
            SELECT
                status,
                COUNT(*) as count
            FROM content_publish_log
            WHERE created_at >= ?
            GROUP BY status
        `, [daysAgo.toISOString().split('T')[0]]);

        let successCount = 0, failedCount = 0, pendingCount = 0, totalCount = 0;
        statusResult.forEach(row => {
            totalCount += row.count;
            if (row.status === 'success') successCount = row.count;
            if (row.status === 'failed') failedCount = row.count;
            if (row.status === 'pending') pendingCount = row.count;
        });
        const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;

        // 按平台统计
        const [platformResult] = await pool.execute(`
            SELECT
                platform,
                COUNT(*) as count
            FROM content_publish_log
            WHERE created_at >= ? AND status = ?
            GROUP BY platform
        `, [daysAgo.toISOString().split('T')[0], 'success']);

        const byPlatform = { cms: 0, wechat: 0, xiaohongshu: 0 };
        platformResult.forEach(row => {
            if (byPlatform.hasOwnProperty(row.platform)) {
                byPlatform[row.platform] = row.count;
            }
        });

        // 按状态统计
        const byStatus = {
            success: successCount,
            failed: failedCount,
            pending: pendingCount
        };

        // 每日发布趋势
        const [trendResult] = await pool.execute(`
            SELECT
                DATE(created_at) as date,
                COUNT(*) as count
            FROM content_publish_log
            WHERE created_at >= ? AND status = ?
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `, [daysAgo.toISOString().split('T')[0], 'success']);

        const dailyTrend = trendResult.map(row => ({
            date: row.date.toISOString().split('T')[0],
            count: row.count
        }));

        // 平均发布耗时和最后发布时间
        const [timeResult] = await pool.execute(`
            SELECT
                AVG(TIMESTAMPDIFF(MICROSECOND, created_at, published_at)) as avg_time,
                MAX(published_at) as last_time
            FROM content_publish_log
            WHERE status = ? AND published_at IS NOT NULL
        `, ['success']);

        const avgPublishTime = timeResult[0].avg_time
            ? Math.round(timeResult[0].avg_time / 1000)
            : 0;
        const lastPublishTime = timeResult[0].last_time;

        res.json({
            success: true,
            data: {
                totalArticles,
                todayPublished,
                weekPublished,
                successRate,
                byPlatform,
                byStatus,
                dailyTrend,
                avgPublishTime,
                lastPublishTime
            }
        });
    } catch (error) {
        console.error('获取统计概览失败:', error);
        res.status(500).json({
            success: false,
            message: '获取统计概览失败',
            error: error.message
        });
    }
});

/**
 * 1.3 文章详情（含所有平台推送状态）
 * GET /api/stats/article/:contentId
 */
router.get('/article/:contentId', async (req, res) => {
    try {
        const { contentId } = req.params;

        // 获取文章信息
        const [articleRows] = await pool.execute(
            'SELECT * FROM lvbo_article WHERE aid = ?',
            [contentId]
        );

        if (articleRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: '文章不存在'
            });
        }

        const article = articleRows[0];

        // 获取该文章在各平台的推送状态
        const [logRows] = await pool.execute(
            `SELECT *
             FROM content_publish_log
             WHERE content_id = ?
             ORDER BY platform, created_at DESC`,
            [contentId]
        );

        const platformStatus = {};
        logRows.forEach(log => {
            platformStatus[log.platform] = {
                id: log.id,
                status: log.status,
                error_msg: log.error_msg,
                published_at: log.published_at,
                created_at: log.created_at,
                retry_count: log.retry_count
            };
        });

        res.json({
            success: true,
            data: {
                article: {
                    id: article.aid,
                    title: article.title,
                    // 根据需要添加其他字段
                },
                platforms: platformStatus
            }
        });
    } catch (error) {
        console.error('获取文章详情失败:', error);
        res.status(500).json({
            success: false,
            message: '获取文章详情失败',
            error: error.message
        });
    }
});

/**
 * 1.4 删除发布记录
 * DELETE /api/stats/publish-log/:id
 */
router.delete('/publish-log/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await pool.execute(
            'DELETE FROM content_publish_log WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: '发布记录不存在'
            });
        }

        res.json({
            success: true,
            message: '删除成功'
        });
    } catch (error) {
        console.error('删除发布记录失败:', error);
        res.status(500).json({
            success: false,
            message: '删除发布记录失败',
            error: error.message
        });
    }
});

/**
 * 1.5 手动重试失败推送
 * POST /api/stats/retry/:contentId/:platform
 */
router.post('/retry/:contentId/:platform', async (req, res) => {
    try {
        const { contentId, platform } = req.params;

        // 检查记录是否存在
        const [rows] = await pool.execute(
            'SELECT * FROM content_publish_log WHERE content_id = ? AND platform = ?',
            [contentId, platform]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: '发布记录不存在'
            });
        }

        const log = rows[0];

        // 更新重试计数和状态
        await pool.execute(
            `UPDATE content_publish_log
             SET retry_count = retry_count + 1,
                 status = ?,
                 error_msg = NULL,
                 updated_at = NOW()
             WHERE id = ?`,
            ['pending', log.id]
        );

        // TODO: 这里应该触发实际的重试逻辑
        // 例如：调用对应的发布服务

        res.json({
            success: true,
            message: '重试任务已提交',
            data: {
                id: log.id,
                content_id: contentId,
                platform: platform,
                retry_count: log.retry_count + 1
            }
        });
    } catch (error) {
        console.error('重试失败:', error);
        res.status(500).json({
            success: false,
            message: '重试失败',
            error: error.message
        });
    }
});

/**
 * 1.6 清空日志
 * DELETE /api/stats/clear-logs?before=2026-05-17
 */
router.delete('/clear-logs', async (req, res) => {
    try {
        const { before } = req.query;

        if (!before) {
            return res.status(400).json({
                success: false,
                message: '缺少 before 参数'
            });
        }

        const [result] = await pool.execute(
            'DELETE FROM content_publish_log WHERE created_at < ?',
            [before + ' 23:59:59']
        );

        res.json({
            success: true,
            message: `已删除 ${result.affectedRows} 条记录`,
            data: {
                deletedCount: result.affectedRows
            }
        });
    } catch (error) {
        console.error('清空日志失败:', error);
        res.status(500).json({
            success: false,
            message: '清空日志失败',
            error: error.message
        });
    }
});


/**
 * 内容质量检查 API
 * POST /api/stats/quality-check
 */
router.post('/quality-check', (req, res) => {
    try {
        const { content, title, topic, angle } = req.body;
        
        if (!content) {
            return res.status(400).json({ success: false, message: '缺少内容' });
        }
        
        const { qualityCheck } = require('../services/quality-check');
        const result = qualityCheck(content, { title, topic, angle });
        
        res.json({ success: true, data: result });
    } catch (e) {
        console.error('质量检查失败:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;

// 补充路由：发布趋势
router.get('/trends', async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(days));
        const since = daysAgo.toISOString().split('T')[0];

        const [rows] = await pool.execute(`
            SELECT DATE(created_at) as date,
                   platform,
                   status,
                   COUNT(*) as count
            FROM content_publish_log
            WHERE created_at >= ?
            GROUP BY DATE(created_at), platform, status
            ORDER BY date ASC
        `, [since]);

        // 按日期聚合
        const trendMap = {};
        rows.forEach(r => {
            const d = r.date.toISOString ? r.date.toISOString().split('T')[0] : String(r.date);
            if (!trendMap[d]) trendMap[d] = { date: d, total: 0, success: 0, failed: 0, byPlatform: {} };
            trendMap[d].total += r.count;
            if (r.status === 'success') trendMap[d].success += r.count;
            if (r.status === 'failed') trendMap[d].failed += r.count;
            trendMap[d].byPlatform[r.platform] = (trendMap[d].byPlatform[r.platform] || 0) + r.count;
        });

        res.json({ success: true, data: Object.values(trendMap) });
    } catch (e) {
        console.error('获取趋势失败:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// 补充路由：每日统计
router.get('/daily', async (req, res) => {
    try {
        const { date } = req.query;
        const targetDate = date || new Date().toISOString().split('T')[0];

        const [rows] = await pool.execute(`
            SELECT platform, status, COUNT(*) as count
            FROM content_publish_log
            WHERE DATE(created_at) = ?
            GROUP BY platform, status
        `, [targetDate]);

        const [articleCount] = await pool.execute(
            'SELECT COUNT(*) as count FROM lvbo_article WHERE DATE(addtime) = ?',
            [targetDate]
        );

        res.json({
            success: true,
            data: {
                date: targetDate,
                articles: articleCount[0].count,
                publishDetails: rows
            }
        });
    } catch (e) {
        console.error('获取每日统计失败:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});
