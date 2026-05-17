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
const modelsRoutes = require('./routes/models');  // 新增：模型管理路由

app.use('/api/content', contentRoutes);
app.use('/api/cms', cmsRoutes);
app.use('/api/publish', publishRoutes);
app.use('/api/product', productRoutes);
app.use('/api/style', styleRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/models', modelsRoutes);  // 新增：注册模型管理路由

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
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║   WorkBuddy 内容数字员工平台 v6.0               ║
║   服务已启动                                     ║
╠══════════════════════════════════════════════════╣
║   地址: http://localhost:${PORT}                  ║
║   API:  http://localhost:${PORT}/api/health       ║
║   CMS:  http://localhost:${PORT}/api/cms/...      ║
╚══════════════════════════════════════════════════╝
    `);
});
