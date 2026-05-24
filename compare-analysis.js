// 对比 index-old-backup.html 和当前拆分后的文件
// 目标：找出"缩水"的内容

const fs = require('fs');
const path = require('path');

const backupFile = 'D:\\scsaicms\\workbuddy-claw-wechat-publisher\\server\\public\\index-old-backup.html';
const publicDir = 'D:\\scsaicms\\workbuddy-claw-wechat-publisher\\server\\public';

// 读取备份文件
const backupContent = fs.readFileSync(backupFile, 'utf8');

// 提取所有页面ID
const pageMatches = backupContent.match(/class="page[^"]*" id="([^"]+)"/g);
const pages = pageMatches ? pageMatches.map(m => {
    const idMatch = m.match(/id="([^"]+)"/);
    return idMatch ? idMatch[1].replace('page-', '') : null;
}).filter(Boolean) : [];

console.log('=== 旧备份中的页面 ===');
pages.forEach(p => console.log(`- ${p}`));

// 检查当前拆分后的文件
console.log('\n=== 当前拆分后的文件 ===');
const files = fs.readdirSync(publicDir)
    .filter(f => f.endsWith('.html') && f !== 'index-old-backup.html')
    .map(f => f.replace('.html', ''));

files.forEach(f => console.log(`- ${f}`));

// 对比差异
console.log('\n=== 差异分析 ===');
const missingPages = pages.filter(p => !files.includes(p));
if (missingPages.length > 0) {
    console.log('可能缺失的页面:');
    missingPages.forEach(p => console.log(`  - ${p}`));
} else {
    console.log('所有页面都有对应的文件');
}

// 分析每个页面的内容大小
console.log('\n=== 页面内容大小对比 ===');
pages.forEach(pageId => {
    // 从备份中提取页面内容
    const pageRegex = new RegExp(`<div class="page[^>]*id="page-${pageId}"[^>]*>([\\s\\S]*?)</div>\\s*<!-- ═══`, 'g');
    const matches = [...backupContent.matchAll(/<div class="page[^>]*id="page-([^"]+)"[^>]*>([\s\S]*?)<!-- ═══ [^\n]+ ═══ -->/, 'g')];
    
    // 简化：只检查当前文件是否存在且大小
    const currentFile = path.join(publicDir, `${pageId}.html`);
    if (fs.existsSync(currentFile)) {
        const stats = fs.statSync(currentFile);
        console.log(`${pageId}: ${stats.size} bytes (当前) vs 备份中的大小(需要详细分析)`);
    }
});

// 详细分析：备份文件中的 JavaScript 功能
console.log('\n=== 备份中的功能特性 ===');
const features = [];

// 检查 AI 模型配置
if (backupContent.includes('deepseek')) features.push('DeepSeek 模型');
if (backupContent.includes('ark-code')) features.push('火山方舟 Ark');
if (backupContent.includes('astron')) features.push('讯飞 Astron');

// 检查发布平台
if (backupContent.includes('pubToWechat')) features.push('微信公众号发布');
if (backupContent.includes('pubToCMS')) features.push('CMS发布');

// 检查产品数据
if (backupContent.includes('genProductId')) features.push('产品数据关联');

console.log('功能列表:');
features.forEach(f => console.log(`  - ${f}`));

console.log('\n=== 建议 ===');
console.log('1. 详细对比每个页面的功能');
console.log('2. 检查 JavaScript 函数是否完整迁移');
console.log('3. 检查 CSS 样式是否完整');
console.log('4. 检查 API 调用是否完整');
