/**
 * 终极排查：检查微信API返回的真实情况
 */

const https = require('https');
const http = require('http');

console.log('🔍 终极排查：微信API返回的真实情况\n');

// 第一步：直接调用微信API，看真实响应
async function testWechatAPI() {
    console.log('步骤1️⃣：直接调用微信API（获取Token）...');
    
    const tokenUrl = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=wxbe7fd856ee4ae690&secret=ec65f0021eed492b6bac0670c63d67d2';
    
    return new Promise((resolve, reject) => {
        https.get(tokenUrl, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                console.log('   Token响应:', data.substring(0, 200));
                try {
                    const json = JSON.parse(data);
                    if (json.access_token) {
                        console.log('   ✅ Token获取成功');
                        resolve(json.access_token);
                    } else {
                        reject(new Error('Token获取失败: ' + data));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// 第二步：发布一篇文章到草稿箱
async function publishToWechat(token) {
    console.log('\n步骤2️⃣：发布到草稿箱...');
    
    const article = {
        articles: [{
            title: '【真实测试】WorkBuddy系统发布 - ' + new Date().toISOString().slice(11, 19),
            author: 'WorkBuddy',
            digest: '这是一个真实的测试文章，用于验证WorkBuddy是否能真正发布到公众号草稿箱',
            content: '<p>这是通过<strong>WorkBuddy系统</strong>发布的真实测试文章。</p><p>如果您能看到这篇文章，说明系统已经完全修复！</p>',
            thumb_media_id: 'fOSSI4rB_2kncg_EYxVB_wGhVKq-DaKT-HQ3kxBOHPqWKHcrNBskCu77FLMHZMgH',
            show_cover_pic: 1
        }]
    };
    
    const postData = JSON.stringify(article);
    const options = {
        hostname: 'api.weixin.qq.com',
        port: 443,
        path: '/cgi-bin/draft/add?access_token=' + token,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };
    
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                console.log('   微信API响应状态码:', res.statusCode);
                console.log('   微信API响应体:', data);
                
                try {
                    const json = JSON.parse(data);
                    if (json.errcode && json.errcode !== 0) {
                        reject(new Error('微信API错误: ' + json.errmsg));
                    } else if (json.media_id) {
                        console.log('   ✅ 发布成功! media_id:', json.media_id);
                        resolve(json);
                    } else {
                        console.warn('   ⚠️ 响应异常:', data);
                        resolve(json);
                    }
                } catch (e) {
                    console.error('   ❌ JSON解析失败:', e.message);
                    console.error('   原始响应:', data);
                    reject(e);
                }
            });
        });
        
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// 主流程
(async () => {
    try {
        // 获取Token
        const token = await testWechatAPI();
        
        // 发布文章
        const result = await publishToWechat(token);
        
        console.log('\n🎉🎉🎉 发布成功！');
        console.log('   media_id:', result.media_id);
        console.log('\n请立即检查微信公众号后台 → 草稿箱');
        console.log('应该能看到新文章：【真实测试】WorkBuddy系统发布...');
        
    } catch (e) {
        console.error('\n❌ 测试失败:', e.message);
        console.error('   堆栈:', e.stack);
    }
})();
