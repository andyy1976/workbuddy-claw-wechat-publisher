/**
 * 发布流程服务（独立于大模型）
 * 
 * 职责：将任意来源的内容（AI生成/手工/去AI味/AI优化）发布到CMS和微信
 * 特点：
 *   - 不调用任何大模型 API
 *   - 包含：Markdown→HTML、缩略图匹配、上传微信、写CMS
 *   - 任何时候都能执行
 * 
 * 使用场景：
 *   1. generate.html 生成内容后自动保存CMS
 *   2. deaiify.html 去AI味后保存CMS
 *   3. logs.html 重新发布任意文章
 *   4. publish.html AI自动生成（保留测试入口）
 */

'use strict';

const path = require('path');
const fs = require('fs');
const https = require('https');
const axios = require('axios');
const FormData = require('form-data');
const { marked } = require('marked');

// 微信配置读取
function getWechatConfig() {
    let config = {};
    try {
        const configPath = path.join(__dirname, '../../config/user-config.json');
        if (fs.existsSync(configPath)) {
            const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            config = raw.wechat || {};
        }
    } catch (e) {
        console.warn('⚠️ [publish-flow] 读取 user-config.json 失败:', e.message);
    }
    return {
        appId: process.env.WECHAT_APP_ID || process.env.WECHAT_APPID || config.appId || '',
        appSecret: process.env.WECHAT_APP_SECRET || process.env.WECHAT_SECRET || config.appSecret || '',
        thumbMediaId: process.env.WECHAT_THUMB_MEDIA_ID || config.thumbMediaId || '',
        author: process.env.WECHAT_AUTHOR || config.author || '超云艾艾'
    };
}

// 获取微信 access_token
async function getWechatToken(appId, appSecret) {
    const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
    return new Promise((resolve, reject) => {
        https.get(tokenUrl, { timeout: 10000 }, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(d);
                    if (parsed.access_token) {
                        resolve(parsed.access_token);
                    } else {
                        reject(new Error('微信Token获取失败: ' + JSON.stringify(parsed)));
                    }
                } catch { reject(new Error('微信Token响应解析失败: ' + d)); }
            });
        }).on('error', reject).on('timeout', () => reject(new Error('微信Token请求超时')));
    });
}

// 上传缩略图到微信素材库
async function uploadThumbnailToWechat(token, imagePath) {
    const uploadUrl = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${token}&type=thumb`;
    const form = new FormData();
    form.append('media', fs.createReadStream(imagePath), path.basename(imagePath));

    try {
        const resp = await axios.post(uploadUrl, form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 30000
        });
        return resp.data;
    } catch (e) {
        console.error('   微信缩略图上传失败:', e.message);
        return null;
    }
}

// 发布到微信草稿箱
async function publishToWechatDraft(token, title, contentHtml, thumbMediaId, author) {
    const draftUrl = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`;
    const digest = (contentHtml || '').replace(/<[^>]+>/g, '').slice(0, 120);
    
    const draftBody = JSON.stringify({
        articles: [{
            title,
            author: author || '超云艾艾',
            digest,
            content: contentHtml,
            thumb_media_id: thumbMediaId || '',
            show_cover_pic: 1,
            need_open_comment: 1,
            only_fans_can_comment: 0
        }]
    });

    return new Promise((resolve, reject) => {
        const urlObj = new URL(draftUrl);
        const req = https.request({
            hostname: urlObj.hostname,
            port: 443,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Content-Length': Buffer.byteLength(draftBody) 
            },
            timeout: 15000
        }, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => { 
                try { resolve(JSON.parse(d)); } 
                catch { resolve({ raw: d }); } 
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('微信草稿箱请求超时')); });
        req.write(draftBody);
        req.end();
    });
}

// 保存到CMS数据库
async function saveToCMS(title, content, categoryId = 0, source = 'WorkBuddy') {
    const cms = require('./cms');
    try {
        const result = await cms.pushArticle({
            title,
            content,
            categoryId,
            status: 1,
            source
        });
        return result;
    } catch (e) {
        console.error('   CMS保存失败:', e.message);
        return { success: false, error: e.message };
    }
}

// 记录发布日志
async function logPublish(title, platform, status, details = {}) {
    const mysql = require('mysql2/promise');
    const dbConfig = {
        host: process.env.DB_HOST || '82.156.40.94',
        user: process.env.DB_USER || 'eastaiai',
        password: process.env.DB_PASSWORD || 'eastaiai@2024',
        database: process.env.DB_NAME || 'eastaiai',
        charset: 'utf8mb4'
    };
    
    let pool;
    try {
        pool = mysql.createPool(dbConfig);
        
        if (platform === 'cms') {
            await pool.execute(
                `INSERT INTO content_publish_log (title, cms_status, details, created_at) VALUES (?, ?, ?, NOW())`,
                [title, status, JSON.stringify(details)]
            );
        } else if (platform === 'wechat') {
            await pool.execute(
                `INSERT INTO content_publish_log (title, wechat_status, details, created_at) VALUES (?, ?, ?, NOW())`,
                [title, status, JSON.stringify(details)]
            );
        }
        
        pool.end();
    } catch (e) {
        console.warn('   发布日志记录失败:', e.message);
        if (pool) pool.end();
    }
}

/**
 * 发布流程主函数
 * 
 * @param {Object} options - 发布选项
 * @param {string} options.title - 文章标题
 * @param {string} options.content - Markdown内容
 * @param {number} options.categoryId - CMS栏目ID（可选）
 * @param {boolean} options.toCMS - 是否保存到CMS
 * @param {boolean} options.toWechat - 是否发布到微信
 * @param {string} options.source - 来源标识（AI生成/手工/去AI味/优化）
 * @param {string} options.thumbUrl - 自定义缩略图URL（可选）
 * 
 * @returns {Object} 发布结果
 */
async function publishFlow(options) {
    const { 
        title, 
        content, 
        categoryId = 0,
        toCMS = true, 
        toWechat = true,
        source = 'WorkBuddy',
        thumbUrl = null
    } = options;

    console.log('\n📤 [publish-flow] 开始发布流程...');
    console.log(`   标题: ${title}`);
    console.log(`   来源: ${source}`);
    console.log(`   保存CMS: ${toCMS}, 发布微信: ${toWechat}`);

    const result = {
        success: true,
        cms: null,
        wechat: null,
        errors: []
    };

    // Step 1: Markdown → HTML
    let contentHtml = content;
    try {
        contentHtml = marked.parse(content);
        console.log('   ✅ Markdown→HTML 完成');
    } catch (e) {
        console.warn('   ⚠️ Markdown转换失败，使用原始内容:', e.message);
    }

    // Step 2: 处理缩略图
    let thumbMediaId = null;
    let finalContentHtml = contentHtml;
    
    if (toWechat) {
        const wc = getWechatConfig();
        
        // 优先使用配置的 thumbMediaId
        thumbMediaId = wc.thumbMediaId || '';
        
        // 如果有自定义缩略图URL，下载并上传
        if (thumbUrl) {
            try {
                const enhancer = require('../../scripts/article-enhancer');
                const thumbnailPath = path.join(__dirname, '../../output', `thumb_${Date.now()}.jpg`);
                const outputDir = path.dirname(thumbnailPath);
                if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
                
                await enhancer.downloadImage(thumbUrl, thumbnailPath);
                console.log(`   📷 缩略图已下载: ${thumbnailPath}`);
                
                const token = await getWechatToken(wc.appId, wc.appSecret);
                const uploaded = await uploadThumbnailToWechat(token, thumbnailPath);
                
                if (uploaded && uploaded.media_id) {
                    thumbMediaId = uploaded.media_id;
                    console.log(`   ✅ 动态缩略图已上传微信: ${thumbMediaId}`);
                    
                    // 将图片插入到文章开头
                    const imgHtml = `<p style="text-align:center;margin:0 0 20px 0;"><img src="${thumbUrl}" style="max-width:100%;height:auto;border-radius:8px;" alt="${title}"></p>`;
                    finalContentHtml = imgHtml + contentHtml;
                }
                
                // 清理临时文件
                try { fs.unlinkSync(thumbnailPath); } catch {}
            } catch (e) {
                console.warn('   ⚠️ 动态缩略图处理失败，使用配置项:', e.message);
                thumbMediaId = wc.thumbMediaId || '';
            }
        } else if (thumbMediaId) {
            console.log(`   📷 使用配置的 thumbMediaId: ${thumbMediaId.substring(0, 20)}...`);
        }
    }

    // Step 3: 保存到CMS
    if (toCMS) {
        try {
            const cmsResult = await saveToCMS(title, content, categoryId, source);
            if (cmsResult.success) {
                result.cms = { success: true, aid: cmsResult.aid };
                console.log(`   ✅ CMS保存成功 (ID: ${cmsResult.aid})`);
                await logPublish(title, 'cms', 'success', { aid: cmsResult.aid });
            } else {
                result.cms = { success: false, error: cmsResult.message };
                result.errors.push('CMS保存失败: ' + cmsResult.message);
                console.error(`   ❌ CMS保存失败: ${cmsResult.message}`);
                await logPublish(title, 'cms', 'failed', { error: cmsResult.message });
            }
        } catch (e) {
            result.cms = { success: false, error: e.message };
            result.errors.push('CMS异常: ' + e.message);
            console.error(`   ❌ CMS异常: ${e.message}`);
        }
    }

    // Step 4: 发布到微信
    if (toWechat) {
        try {
            const wc = getWechatConfig();
            if (!wc.appId || !wc.appSecret) {
                result.wechat = { success: false, error: '微信配置缺失' };
                result.errors.push('微信配置缺失');
                console.error('   ❌ 微信配置缺失');
                await logPublish(title, 'wechat', 'failed', { error: '微信配置缺失' });
            } else {
                const token = await getWechatToken(wc.appId, wc.appSecret);
                const wechatResult = await publishToWechatDraft(token, title, finalContentHtml, thumbMediaId, wc.author);
                
                if (wechatResult.errcode === 0 || wechatResult.media_id) {
                    result.wechat = { success: true, mediaId: wechatResult.media_id || wechatResult.draft_id };
                    console.log(`   ✅ 微信发布成功 (MediaID: ${wechatResult.media_id || wechatResult.draft_id})`);
                    await logPublish(title, 'wechat', 'success', { mediaId: wechatResult.media_id });
                } else {
                    result.wechat = { success: false, error: JSON.stringify(wechatResult) };
                    result.errors.push('微信发布失败: ' + JSON.stringify(wechatResult));
                    console.error(`   ❌ 微信发布失败: ${JSON.stringify(wechatResult)}`);
                    await logPublish(title, 'wechat', 'failed', { error: JSON.stringify(wechatResult) });
                }
            }
        } catch (e) {
            result.wechat = { success: false, error: e.message };
            result.errors.push('微信异常: ' + e.message);
            console.error(`   ❌ 微信异常: ${e.message}`);
            await logPublish(title, 'wechat', 'failed', { error: e.message });
        }
    }

    result.success = result.errors.length === 0;
    console.log(`\n📤 [publish-flow] 发布完成: ${result.success ? '成功' : '有错误'}`);
    
    return result;
}

module.exports = {
    publishFlow,
    saveToCMS,
    getWechatConfig
};
