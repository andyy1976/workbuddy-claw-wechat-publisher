const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

(async () => {
  const c = await mysql.createConnection({
    host: '82.156.40.94', user: 'eastaiai', password: 'alibaba',
    database: 'eastaiai', port: 3306
  });

  await c.execute(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    role ENUM('admin','user') DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  console.log('✅ users 表就绪');

  await c.execute(`CREATE TABLE IF NOT EXISTS user_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    setting_key VARCHAR(100) NOT NULL,
    setting_value JSON,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_key (user_id, setting_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  console.log('✅ user_settings 表就绪');

  const hash = await bcrypt.hash('admin123', 10);
  try {
    await c.execute(
      'INSERT INTO users (username, email, password_hash, display_name, role) VALUES (?,?,?,?,?)',
      ['admin', 'admin@workbuddy.com', hash, '管理员', 'admin']
    );
    console.log('✅ 默认管理员: admin / admin123');
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') console.log('管理员已存在');
    else console.error(e.message);
  }

  await c.end();
})();
