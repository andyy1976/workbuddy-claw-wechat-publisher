/**
 * 环境变量加载器（reddit-video 子模块专用）
 * 从父级 .env 加载
 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
    // 依次查找：父项目 .env → 当前目录 .env
    const candidates = [
        path.join(__dirname, '..', '..', '.env'),
        path.join(__dirname, '..', '.env'),
        path.join(__dirname, '.env'),
    ];
    let loaded = false;
    for (const envPath of candidates) {
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            const lines = content.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const eqIndex = trimmed.indexOf('=');
                if (eqIndex === -1) continue;
                const key = trimmed.substring(0, eqIndex).trim();
                let value = trimmed.substring(eqIndex + 1).trim();
                // 去除引号
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                if (!process.env[key]) {
                    process.env[key] = value;
                }
            }
            console.log('   📄 已加载环境变量:', envPath);
            loaded = true;
            break;
        }
    }
    if (!loaded) {
        console.warn('   ⚠️  未找到 .env 文件');
    }
}

module.exports = { loadEnv };
