/**
 * 环境变量加载器
 * 从 .env 文件加载环境变量（不依赖 dotenv 包）
 */

const fs = require('fs');
const path = require('path');

function loadEnv(envDir) {
    // 支持传入自定义目录，默认为调用者的上级目录（项目根目录）
    const envPath = path.resolve(envDir || path.join(__dirname, '..'), '.env');

    if (!fs.existsSync(envPath)) {
        console.warn('⚠️  .env 文件不存在:', envPath);
        return;
    }

    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        // 跳过空行和注释
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;

        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();

        // 去掉引号
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        // 只在未设置时覆盖（环境变量优先）
        if (!process.env[key]) {
            process.env[key] = value;
        }
    }

    console.log('✅ .env 加载成功:', envPath);
}

module.exports = { loadEnv };
