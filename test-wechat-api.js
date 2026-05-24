/**
 * 直接测试微信公众号草稿箱API
 */

const https = require('https');

// 配置
const APP_ID = 'wxbe7fd856ee4ae690';
const APP_SECRET = 'ec65f0021eed492b6bac0670c63d67d2';

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

// 测试草稿箱API
async function testDraftAPI() {
    try {
        console.log('📤 测试微信公众号草稿箱API...\n');
        
        const token = await getAccessToken();
        console.log('✅ Token获取成功:', token.substring(0, 20) + '...\n');
        
        const article = {
            articles: [{
                title: '测试文章 - ' + new Date().toISOString().slice(0, 16),
                author: 'WorkBuddy',
                digest: '这是一篇测试文章',
                content: '<p>这是测试内容</p>',
                content_source_url: ''
            }]
        };
        
        const postData = JSON.stringify(article);
        const url = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`;
        
        console.log('📤 发送请求到:', url);
        console.log('   请求体:', postData.substring(0, 200) + '...\n');
        
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                console.log('📥 草稿箱API响应:');
                console.log('   状态码:', res.statusCode);
                console.log('   响应头:', JSON.stringify(res.headers, null, 2));
                console.log('   响应体:', data);
                console.log('');
                
                try {
                    const json = JSON.parse(data);
                    if (json.media_id) {
                        console.log('✅✅✅ 成功! media_id:', json.media_id);
                    } else if (json.errcode) {
                        console.error('❌❌❌ API返回错误:');
                        console.error('   errcode:', json.errcode);
                        console.error('   errmsg:', json.errmsg);
                    } else {
                        console.warn('⚠️ 未知响应格式:', data);
                    }
                } catch (e) {
                    console.error('❌ 解析响应失败:', e.message);
                    console.error('   原始响应:', data);
                }
            });
        });
        
        req.on('error', (e) => {
            console.error('❌ 请求失败:', e.message);
        });
        
        req.write(postData);
        req.end();
        
    } catch (e) {
        console.error('❌ 测试失败:', e.message);
        console.error('   堆栈:', e.stack);
    }
}

testDraftAPI();
