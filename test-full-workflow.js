/**
 * 完整流程测试：生成文章 → 发布到微信+CMS
 */

const http = require('http');

console.log('🚀 开始完整流程测试...\n');

// 第一步：生成文章
async function generateContent() {
    console.log('步骤1️⃣：生成文章...');
    
    const postData = JSON.stringify({
        topic: 'AI数字员工平台功能介绍',
        style: 'professional',
        platform: 'wechat',
        platforms: ['wechat', 'cms'],
        wordCount: 1500
    });
    
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3456,
            path: '/api/content/generate',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                console.log('   生成响应状态码:', res.statusCode);
                try {
                    const json = JSON.parse(data);
                    if (json.success) {
                        console.log('   ✅ 文章生成成功!');
                        console.log('   标题:', json.data.titles.split('\n')[0]);
                        console.log('   内容长度:', json.data.content.length);
                        console.log('');
                        resolve(json.data);
                    } else {
                        reject(new Error('生成失败: ' + json.message));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// 第二步：发布到微信
async function publishToWechat(title, content) {
    console.log('步骤2️⃣：发布到微信公众号草稿箱...');
    
    const postData = JSON.stringify({ title, content });
    
    return new Promise((resolve, reject) => {
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
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                console.log('   微信发布响应状态码:', res.statusCode);
                try {
                    const json = JSON.parse(data);
                    if (json.success) {
                        console.log('   ✅ 微信发布成功!');
                        console.log('   Article ID:', json.data.articleId);
                        console.log('');
                        resolve(json.data);
                    } else {
                        reject(new Error('微信发布失败: ' + json.message));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// 第三步：发布到CMS
async function publishToCMS(title, content) {
    console.log('步骤3️⃣：发布到CMS...');
    
    const postData = JSON.stringify({ title, content });
    
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3456,
            path: '/api/publish/cms',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                console.log('   CMS发布响应状态码:', res.statusCode);
                try {
                    const json = JSON.parse(data);
                    if (json.success) {
                        console.log('   ✅ CMS发布成功!');
                        console.log('   Article ID:', json.data.articleId);
                        console.log('');
                        resolve(json.data);
                    } else {
                        reject(new Error('CMS发布失败: ' + json.message));
                    }
                } catch (e) {
                    // maybeHTML response
                    if (data.includes('success') || data.includes('成功')) {
                        console.log('   ✅ CMS发布可能成功 (HTML响应)');
                        console.log('');
                        resolve({ success: true });
                    } else {
                        reject(new Error('CMS发布失败: ' + data.substring(0, 200)));
                    }
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
        // 生成文章
        const data = await generateContent();
        const title = data.titles.split('\n')[0].replace(/^\d+[.、\)]\s*/, '').trim();
        const content = data.content;
        
        console.log('📝 生成的文章:');
        console.log('   标题:', title);
        console.log('   内容长度:', content.length, '字');
        console.log('');
        
        // 发布到微信
        const wechatResult = await publishToWechat(title, content);
        
        // 发布到CMS
        const cmsResult = await publishToCMS(title, content);
        
        console.log('🎉🎉🎉 完整流程测试成功！');
        console.log('   微信 Article ID:', wechatResult.articleId);
        console.log('   CMS Article ID:', cmsResult.articleId);
        console.log('');
        console.log('请检查：');
        console.log('  1. 微信公众号后台 → 草稿箱');
        console.log('  2. CMS后台 → 文章列表');
        
    } catch (e) {
        console.error('❌ 测试失败:', e.message);
        console.error('   堆栈:', e.stack);
    }
})();
