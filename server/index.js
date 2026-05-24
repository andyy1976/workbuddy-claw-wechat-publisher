#!/usr/bin/env node
/**
 * WorkBuddy 内容数字员工平台 - 独立服务端
 * 
 * 核心卖点：企业产品数据（BOM/工艺/质量）驱动内容生成
 * - 卡兹克风格去AI味写作
 * - CMS双向集成
 * - 多平台一键发布
 * 
 * 启动：node server/index.js
 * 端口：3456（默认）
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// 环境变量
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.SERVER_PORT || 3456;

// ── 中间件 ──────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));


// ── 路由 ──────────────────────────────────────────
const contentRoutes = require('./routes/content');
const cmsRoutes = require('./routes/cms');
const publishRoutes = require('./routes/publish');
const productRoutes = require('./routes/product');
const styleRoutes = require('./routes/style');
const chatRoutes = require('./routes/chat');
const modelsRoutes = require('./routes/models');  // 模型管理路由
const tasksRoutes = require('./routes/tasks');  // 任务管理路由
const methodologyRoutes = require('./routes/methodology');
const methodologyPipelineRoutes = require('./routes/methodology-pipeline');
const skillsRoutes = require('./routes/skills');
const scheduler = require('./services/scheduler');

app.use('/api/content', contentRoutes);
app.use('/api/cms', cmsRoutes);
app.use('/api/publish', publishRoutes);
app.use('/api/product', productRoutes);
app.use('/api/style', styleRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/models', modelsRoutes);  // 注册模型管理路由
app.use('/api/tasks', tasksRoutes);  // 注册任务管理路由
app.use('/api/methodology', methodologyRoutes);
app.use('/api/methodology', methodologyPipelineRoutes);
app.use('/api/skills', skillsRoutes);

// ── 健康检查 ──────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'WorkBuddy ContentAI Server',
        version: '6.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ── 前端页面 ──────────────────────────────────────
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── 全局错误处理 ──────────────────────────────────
app.use((err, req, res, next) => {
    console.error('[ERROR]', err.message);
    res.status(500).json({ success: false, message: err.message || '服务器内部错误' });
});

// ── 启动 ──────────────────────────────────────────
app.listen(PORT, '0.0.0.0', async () => {
    console.log('[Database] 开始初始化...');
    await initDatabase();

    console.log(`
╔════════════════════════════════════════════════╗
║   WorkBuddy 内容数字员工平台 v6.0               ║
║   服务已启动                                     ║
╠════════════════════════════════════════════════╣
║   地址: http://localhost:${PORT}                  ║
║   API:  http://localhost:${PORT}/api/health       ║
║   CMS:  http://localhost:${PORT}/api/cms/...      ║
╚════════════════════════════════════════════════╝
    `);


// ── 初始化数据库表 ─────────────────────────────
async function initDatabase() {
  try {
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || '82.156.40.94',
      user: process.env.DB_USER || 'eastaiai',
      password: process.env.DB_PASSWORD || 'alibaba',
      database: process.env.DB_NAME || 'eastaiai',
      charset: 'utf8mb4',
      connectTimeout: 15000
    });
    
    console.log('[Database] 检查数据表...');
    
    // 创建 content_publish_log 表
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS content_publish_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        content_id INT NOT NULL COMMENT 'CMS文章ID',
        platform VARCHAR(50) NOT NULL COMMENT '平台: wechat/cms/xiaohongshu/notepad',
        status ENUM('pending', 'success', 'failed', 'retry') NOT NULL DEFAULT 'pending',
        error_msg TEXT COMMENT '失败原因',
        wechat_media_id VARCHAR(255) COMMENT '微信返回的media_id',
        wechat_draft_id VARCHAR(255) COMMENT '微信草稿箱ID',
        published_at DATETIME COMMENT '成功发布时间',
        retry_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_content (content_id),
        INDEX idx_status (status),
        INDEX idx_platform (platform),
        UNIQUE KEY uk_content_platform (content_id, platform)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='内容推送状态记录表'
    `);
    
    console.log('✅ [Database] content_publish_log 表已就绪');
    await conn.end();
  } catch (e) {
    console.error('❌ [Database] 初始化失败:', e.message);
  }
}

  // 启动定时任务调度器
  scheduler.startScheduler().then(() => {
    console.log('[Scheduler] 定时任务调度器已启动');
  }).catch(e => {
    console.error('[Scheduler] 启动失败:', e.message);
  });
});
