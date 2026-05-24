// test-task.js - 测试创建任务
const http = require('http');

const data = JSON.stringify({
    name: '测试任务',
    keywords: ['AI', '数字化转型'],
    schedule: '0 9 * * *',
    platforms: ['cms', 'wechat'],
    enabled: true
});

const options = {
    hostname: 'localhost',
    port: 3456,
    path: '/api/tasks',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        console.log('状态:', res.statusCode);
        console.log('响应:', body);
    });
});

req.on('error', (e) => {
    console.error('错误:', e.message);
});

req.write(data);
req.end();
