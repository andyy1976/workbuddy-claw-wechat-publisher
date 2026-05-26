const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const { authMiddleware } = require('./auth');

const DB_CONFIG = {
  host: process.env.DB_HOST || '82.156.40.94',
  user: process.env.DB_USER || 'eastaiai',
  password: process.env.DB_PASSWORD || 'alibaba',
  database: process.env.DB_NAME || 'eastaiai',
  port: parseInt(process.env.DB_PORT) || 3306,
  connectTimeout: 30000,
  ssl: false
};

// SMTP 配置（从 .env 读取）
function getSmtpConfig() {
  const cfg = {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: parseInt(process.env.SMTP_PORT) === 465,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromName: process.env.SMTP_FROM_NAME || 'WorkBuddy',
    fromAddress: process.env.SMTP_FROM_ADDRESS || process.env.SMTP_USER || ''
  };
  cfg.configured = !!(cfg.host && cfg.user && cfg.pass);
  return cfg;
}

// ── 获取用户所有设置 ───────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
    const [rows] = await connection.execute(
      'SELECT setting_key, setting_value FROM user_settings WHERE user_id = ?',
      [req.user.id]
    );
    const settings = {};
    for (const row of rows) {
      try { settings[row.setting_key] = typeof row.setting_value === 'string' ? JSON.parse(row.setting_value) : row.setting_value; }
      catch { settings[row.setting_key] = row.setting_value; }
    }
    // 附带用户信息
    const [userRows] = await connection.execute('SELECT username, email, display_name FROM users WHERE id = ?', [req.user.id]);
    const userInfo = userRows[0] || {};
    
    // 附带 SMTP 状态（不暴露密码）
    const smtp = getSmtpConfig();
    settings._smtp = { host: smtp.host, port: smtp.port, user: smtp.user, fromName: smtp.fromName, fromAddress: smtp.fromAddress, configured: !!(smtp.host && smtp.user && smtp.pass) };
    res.json({ success: true, settings, user: { username: userInfo.username, email: userInfo.email, displayName: userInfo.display_name } });
  } catch (e) {
    console.error('[Settings] 获取失败:', e.message);
    res.status(500).json({ success: false, message: e.message });
  } finally {
    if (connection) try { await connection.end(); } catch (e) {}
  }
});

// ── 保存用户设置 ───────────────────────────────
router.put('/:key', authMiddleware, async (req, res) => {
  const { key } = req.params;
  const value = req.body;
  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
    await connection.execute(
      'INSERT INTO user_settings (user_id, setting_key, setting_value) VALUES (?,?,?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
      [req.user.id, key, JSON.stringify(value)]
    );
    res.json({ success: true, message: '设置已保存' });
  } catch (e) {
    console.error('[Settings] 保存失败:', e.message);
    res.status(500).json({ success: false, message: e.message });
  } finally {
    if (connection) try { await connection.end(); } catch (e) {}
  }
});

// ── 测试邮件发送 ───────────────────────────────
router.post('/test-email', authMiddleware, async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ success: false, message: '请指定收件人' });

  const smtp = getSmtpConfig();
  if (!smtp.configured) {
    return res.status(400).json({ success: false, message: 'SMTP 未配置，请在 .env 中设置 SMTP_HOST/USER/PASS' });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host, port: smtp.port, secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass }
    });
    await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromAddress}>`,
      to,
      subject: 'WorkBuddy 邮件测试',
      html: '<p>✅ 邮件配置正确，这是一封测试邮件。</p>'
    });
    res.json({ success: true, message: '测试邮件已发送' });
  } catch (e) {
    console.error('[Settings] 邮件测试失败:', e.message);
    res.status(500).json({ success: false, message: '邮件发送失败: ' + e.message });
  }
});

// ── 获取所有用户列表（管理员）──────────────────
router.get('/users', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: '无权限' });
  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
    const [rows] = await connection.execute(
      'SELECT id, username, email, display_name, role, created_at FROM users ORDER BY id'
    );
    res.json({ success: true, users: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  } finally {
    if (connection) try { await connection.end(); } catch (e) {}
  }
});

module.exports = router;
