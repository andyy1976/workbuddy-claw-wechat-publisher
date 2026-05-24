/**
 * 详细测试微信公众号草稿箱API - 对比插件请求
 */

const https = require('https');
const fs = require('fs');

// 读取 .env 配置
const envContent = fs.readFileSync('.env', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
        envVars[match[1].trim()] = match[2].trim();
    }
});

const APP_ID = envVars.WECHAT_APP_ID;
const APP_SECRET = envVars.WECHAT_APP_SECRET;
const THUMB_MEDIA_ID = envVars.WECHAT_THUMB_MEDIA_ID;

console.log('📤 测试微信公众号草稿箱API（详细版）\n');
console.log('配置检查:');
console.log('   APP_ID:', APP_ID ? '✅' : '❌');
console.log('   APP_SECRET:', APP_SECRET ? '✅' : '❌');
console.log('   THUMB_MEDIA_ID:', THUMB_MEDIA_ID ? '✅' : '❌');
console.log('');

// 获取 access_token
function getAccessToken() {
    return new Promise((resolve, reject) => {
        const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`;
        
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                console.log('📥 Token响应:');
                console.log('   状态码:', res.statusCode);
                console.log('   响应体:', data);
                console.log('');
                
                try {
                    const json = JSON.parse(data);
                    if (json.access_token) {
                        resolve(json.access_token);
                    } else {
                        reject(new Error('获取Token失败: ' + JSON.stringify(json)));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// 测试草稿箱API（对比插件请求）
async function testDraftAPI() {
    try {
        const token = await getAccessToken();
        console.log('✅ Token获取成功:', token.substring(0, 30) + '...\n');
        
        // 构造与插件完全相同的请求体
        const article = {
            title: '测试文章 - ' + new Date().toISOString().slice(0, 16),
            author: 'WorkBuddy',
            digest: '这是一篇测试文章',
            content: '<p>这是测试内容</p>',
            content_source_url: ''
        };
        
        // 添加 thumb_media_id（从 .env 读取）
        if (THUMB_MEDIA_ID) {
            article.thumb_media_id = THUMB_MEDIA_ID;
            console.log('📤 使用 THUMB_MEDIA_ID:', THUMB_MEDIA_ID.substring(0, 20) + '...');
        } else {
            console.warn('⚠️  缺少 THUMB_MEDIA_ID，API可能报错 40007');
        }
        
        const requestBody = {
            articles: [article]
        };
        
        const postData = JSON.stringify(requestBody);
        const url = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`;
        
        console.log('📤 发送请求到:', url.substring(0, 100) + '...');
        console.log('   请求体长度:', postData.length, 'bytes');
        console.log('   请求体前200字:', postData.substring(0, 200) + '...\n');
        
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'User-Agent': 'WorkBuddy-MultiPlatform-Publisher/1.0'
            }
        };
        
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                console.log('📥 草稿箱API响应:');
                console.log('   状态码:', res.statusCode);
                console.log('   响应头:', JSON.stringify(res.headers, null, 2).substring(0, 200) + '...');
                console.log('   响应体长度:', data.length, 'bytes');
                console.log('   响应体:', data);
                console.log('');
                
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data);
                        if (json.media_id) {
                            console.log('✅✅✅ 成功! media_id:', json.media_id);
                        } else if (json.errcode) {
                            console.error('❌❌❌ API返回错误:');
                            console.error('   errcode:', json.errcode);
                            console.error('   errmsg:', json.errmsg);
                        } else {
                            console.warn('⚠️  未知响应格式:', data);
                        }
                    } catch (e) {
                        console.error('❌ 解析响应失败:', e.message);
                        console.error('   原始响应:', data);
                    }
                } else {
                    console.error('❌ HTTP错误:', res.statusCode);
                    console.error('   响应体:', data);
                }
            });
        });
        
        req.on('error', (e) => {
            console.error('❌ 请求失败:', e.message);
            console.error('   堆栈:', e.stack);
        });
        
        req.write(postData);
        req.end();
        
    } catch (e) {
        console.error('❌ 测试失败:', e.message);
        console.error('   堆栈:', e.stack);
    }
}

testDraftAPI();
