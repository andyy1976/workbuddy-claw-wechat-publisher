/**
 * 启动脚本 - 生成今日热门文章
 * 解决路径问题
 */

const { spawn } = require('child_process');
const path = require('path');

// 项目根目录
const projectRoot = 'C:\\Users\\tuan_\\WorkBuddy\\20260317201006\\wechat-publisher-plugin';

// 启动引擎
console.log('🚀 启动微信公众号发布器...\n');

const child = spawn('node', ['scripts\\engine.cjs'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true
});

child.on('error', (err) => {
    console.error('❌ 启动失败:', err.message);
});

child.on('close', (code) => {
    console.log('\n📊 进程退出，代码:', code);
});