/**
 * 测试微信公众号发布 API
 */

const http = require('http');

const testData = {
    title: 'WorkBuddy 测试文章 - ' + new Date().toISOString().slice(0, 16),
    content: `# 测试文章\n\n这是一篇测试文章，用于验证微信公众号发布功能。\n\n## 功能特性\n\n1. **自动生成** - AI 自动生成内容\n2. **多平台发布** - 支持微信、CMS、小红书\n3. **定时任务** - 支持定时自动发布\n\n> 这是引用文本\n\n这是普通段落。`
};

console.log('📤 开始测试微信公众号发布 API...');
console.log('   标题:', testData.title);
console.log('   内容长度:', testData.content.length);
console.log('');

const postData = JSON.stringify(testData);
const options = {
    hostname: 'localhost',
    port: 3456,
    path: '/api/publish/wechat',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
};

const req = http.request(options, (res) => {
    console.log('📥 收到响应:');
    console.log('   状态码:', res.statusCode);
    console.log('   响应头:', JSON.stringify(res.headers, null, 2));
    console.log('');
    
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        console.log('📥 响应体:');
        try {
            const json = JSON.parse(data);
            console.log('   ', JSON.stringify(json, null, 2));
        } catch (e) {
            console.log('   ', data);
        }
        console.log('');
        console.log('✅ 测试完成！');
    });
});

req.on('error', (e) => {
    console.error('❌ 请求失败:', e.message);
    console.error('   堆栈:', e.stack);
});

req.write(postData);
req.end();
