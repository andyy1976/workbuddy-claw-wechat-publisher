#!/usr/bin/env node

/**
 * WorkBuddy Claw 微信公众号发布器
 * 
 * 支持两种安装方式：
 * 1. npm install workbuddy-claw-wechat-publisher
 * 2. openclaw plugins install ./wechat-publisher.tgz
 * 
 * 使用方法：
 *   node index.js --hotspot     查看今日热点
 *   node index.js --publish    抓热点→写文章→发布
 *   node index.js --validate   验证配置
 *   node index.js --diary "标题" "正文"  发布自定义文章
 * 
 * 全局安装后：
 *   wechat-publisher --hotspot
 */

const fs = require('fs');
const path = require('path');

// 读取配置
function loadConfig() {
    const configPath = path.join(__dirname, 'config', 'user-config.json');
    const examplePath = path.join(__dirname, 'config', 'example-config.json');
    
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (e) {}
    
    try {
        return JSON.parse(fs.readFileSync(examplePath, 'utf8'));
    } catch (e) {
        console.error('❌ 找不到配置文件，请先运行 node index.js --setup 完成初始化');
        process.exit(1);
    }
}

// 主入口
const args = process.argv.slice(2);
const command = args[0];

async function main() {
    console.log('\n📡 WorkBuddy 微信发布器 v1.1.0\n');
    
    if (!command) {
        console.log('用法:');
        console.log('  node index.js --hotspot    查看今日热点');
        console.log('  node index.js --publish    抓热点→写文章→发布');
        console.log('  node index.js --validate   验证配置');
        console.log('  node index.js --diary "标题" "正文"  发布自定义文章');
        console.log('\n或安装为全局命令: npm link');
        return;
    }
    
    // 加载引擎（优先使用 CommonJS 版本）
    const enginePath = path.join(__dirname, 'scripts', 'engine.cjs');
    if (!fs.existsSync(enginePath)) {
        console.error('❌ 引擎文件不存在:', enginePath);
        process.exit(1);
    }
    
    // 动态加载引擎模块
    const engine = require(enginePath);
    
    switch (command) {
        case '--hotspot':
            console.log('🔍 获取热点...\n');
            await engine('--hotspot');
            break;
            
        case '--publish':
            console.log('🚀 开始发布流程...\n');
            await engine('');
            break;
            
        case '--validate':
            console.log('🔑 验证配置...\n');
            await engine('--validate');
            break;
            
        case '--diary':
            const title = args[1];
            const body = args[2];
            if (!title || !body) {
                console.error('用法: node index.js --diary "标题" "正文"');
                process.exit(1);
            }
            console.log(`📝 发布日记: ${title}\n`);
            await engine(`--diary "${title}" "${body}"`);
            break;
            
        default:
            console.error('未知命令:', command);
            console.log('使用 --help 查看帮助');
    }
}

main().catch(e => {
    console.error('❌', e.message);
    process.exit(1);
});
