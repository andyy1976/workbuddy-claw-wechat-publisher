const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'workbuddy_secret_2026';
const JWT_EXPIRES = '7d';

const DB_CONFIG = {
  host: process.env.DB_HOST || '82.156.40.94',
  user: process.env.DB_USER || 'eastaiai',
  password: process.env.DB_PASSWORD || 'alibaba',
  database: process.env.DB_NAME || 'eastaiai',
  port: parseInt(process.env.DB_PORT) || 3306,
  connectTimeout: 30000,
  ssl: false
};

// ── 注册 ──────────────────────────────────────
router.post('/register', async (req, res) => {
  const { username, email, password, displayName } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '用户名和密码必填' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: '密码至少6位' });
  }

  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
    const hash = await bcrypt.hash(password, 10);
    const [result] = await connection.execute(
      'INSERT INTO users (username, email, password_hash, display_name, role) VALUES (?,?,?,?,?)',
      [username, email || null, hash, displayName || username, 'user']
    );

    const token = jwt.sign({ id: result.insertId, username, role: 'user' }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ success: true, token, user: { id: result.insertId, username, displayName: displayName || username, role: 'user' } });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: '用户名或邮箱已存在' });
    }
    console.error('[Auth] 注册失败:', e.message);
    res.status(500).json({ success: false, message: '注册失败' });
  } finally {
    if (connection) try { await connection.end(); } catch (e) {}
  }
});

// ── 登录 ──────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '用户名和密码必填' });
  }

  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
    const [rows] = await connection.execute(
      'SELECT id, username, email, password_hash, display_name, role FROM users WHERE username = ? OR email = ?',
      [username, username]
    );
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: '用户不存在' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: '密码错误' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, displayName: user.display_name, email: user.email, role: user.role }
    });
  } catch (e) {
    console.error('[Auth] 登录失败:', e.message);
    res.status(500).json({ success: false, message: '登录失败' });
  } finally {
    if (connection) try { await connection.end(); } catch (e) {}
  }
});

// ── 获取当前用户信息 ───────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
    const [rows] = await connection.execute(
      'SELECT id, username, email, display_name, role, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: '用户不存在' });
    const u = rows[0];
    res.json({ success: true, user: { id: u.id, username: u.username, email: u.email, displayName: u.display_name, role: u.role, createdAt: u.created_at } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  } finally {
    if (connection) try { await connection.end(); } catch (e) {}
  }
});

// ── 修改密码 ──────────────────────────────────
router.put('/password', authMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ success: false, message: '请输入旧密码和新密码' });

  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
    const [rows] = await connection.execute('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: '用户不存在' });

    const match = await bcrypt.compare(oldPassword, rows[0].password_hash);
    if (!match) return res.status(401).json({ success: false, message: '旧密码错误' });

    const hash = await bcrypt.hash(newPassword, 10);
    await connection.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    res.json({ success: true, message: '密码修改成功' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  } finally {
    if (connection) try { await connection.end(); } catch (e) {}
  }
});

// ── JWT 中间件 ─────────────────────────────────
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Token无效或已过期' });
  }
}

module.exports = { router, authMiddleware };
