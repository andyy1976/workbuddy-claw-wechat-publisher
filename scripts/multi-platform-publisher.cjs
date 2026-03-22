/**
 * 多平台发布器 - 支持微信和文心公众号
 * 基于现有微信发布器插件扩展
 */

const https = require('https');

// ── 平台配置 ──────────────────────────────────────────────
const platformConfigs = {
    wechat: {
        name: '微信公众号',
        baseUrl: 'https://api.weixin.qq.com',
        endpoints: {
            token: '/cgi-bin/token',
            draft: '/cgi-bin/draft/add',
            upload: '/cgi-bin/media/uploadimg'
        },
        requiredFields: ['appId', 'appSecret', 'thumbMediaId']
    },
    wenxin: {
        name: '文心公众号',
        baseUrl: 'https://api.wenxin.baidu.com',
        endpoints: {
            token: '/oauth/token',
            draft: '/v1/articles/draft',
            publish: '/v1/articles/publish'
        },
        requiredFields: ['appId', 'appSecret', 'tenantId']
    }
};

// ── 多平台发布器类 ──────────────────────────────────────
class MultiPlatformPublisher {
    constructor(config = {}) {
        this.config = config;
        this.tokens = {};
        this.initialized = false;
    }
    
    // ── 初始化发布器 ──────────────────────────────────────
    async init() {
        try {
            console.log('🚀 初始化多平台发布器...');
            
            // 验证平台配置
            for (const [platform, config] of Object.entries(this.config)) {
                if (!platformConfigs[platform]) {
                    console.warn(`⚠️  未知平台: ${platform}`);
                    continue;
                }
                
                const required = platformConfigs[platform].requiredFields;
                const missing = required.filter(field => !config[field]);
                
                if (missing.length > 0) {
                    console.warn(`⚠️  ${platform} 缺少必需字段: ${missing.join(', ')}`);
                } else {
                    console.log(`✅ ${platformConfigs[platform].name} 配置验证通过`);
                }
            }
            
            this.initialized = true;
            console.log('✅ 发布器初始化完成\n');
            
            return { success: true };
            
        } catch (error) {
            console.error('❌ 发布器初始化失败:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ── 获取平台Token ────────────────────────────────────
    async getPlatformToken(platform) {
        // 检查缓存
        if (this.tokens[platform] && this.tokens[platform].expiresAt > Date.now()) {
            return this.tokens[platform].token;
        }
        
        const config = this.config[platform];
        if (!config) {
            throw new Error(`平台 ${platform} 未配置`);
        }
        
        const platformInfo = platformConfigs[platform];
        if (!platformInfo) {
            throw new Error(`不支持的平台: ${platform}`);
        }
        
        console.log(`🔑 获取 ${platformInfo.name} Token...`);
        
        let tokenUrl, tokenData;
        
        switch (platform) {
            case 'wechat':
                tokenUrl = `${platformInfo.baseUrl}${platformInfo.endpoints.token}?grant_type=client_credential&appid=${config.appId}&secret=${config.appSecret}`;
                break;
                
            case 'wenxin':
                tokenUrl = `${platformInfo.baseUrl}${platformInfo.endpoints.token}`;
                tokenData = {
                    grant_type: 'client_credentials',
                    client_id: config.appId,
                    client_secret: config.appSecret
                };
                if (config.tenantId) {
                    tokenData.tenant_id = config.tenantId;
                }
                break;
                
            default:
                throw new Error(`未知平台的Token获取方式: ${platform}`);
        }
        
        try {
            const response = await this.makeRequest(
                platform === 'wenxin' && tokenData ? 'POST' : 'GET',
                tokenUrl,
                platform === 'wenxin' ? tokenData : undefined
            );
            
            if (!response.access_token) {
                throw new Error(`Token获取失败: ${JSON.stringify(response)}`);
            }
            
            // 缓存Token（提前5分钟过期）
            const expiresIn = response.expires_in || 7200;
            this.tokens[platform] = {
                token: response.access_token,
                expiresAt: Date.now() + (expiresIn - 300) * 1000
            };
            
            console.log(`✅ ${platformInfo.name} Token获取成功`);
            return response.access_token;
            
        } catch (error) {
            console.error(`❌ ${platformInfo.name} Token获取失败:`, error.message);
            throw error;
        }
    }
    
    // ── 发布到微信公众号草稿箱 ──────────────────────────────
    async publishToWechat(article, draftConfig = {}) {
        const config = this.config.wechat;
        if (!config) {
            throw new Error('微信公众号未配置');
        }
        
        console.log('📤 发布到微信公众号草稿箱...');
        
        try {
            // 获取Token
            const token = await this.getPlatformToken('wechat');
            
            // 准备文章数据
            const wechatArticle = this.prepareWechatArticle(article, draftConfig);
            
            // 发布草稿
            const publishUrl = `${platformConfigs.wechat.baseUrl}${platformConfigs.wechat.endpoints.draft}?access_token=${token}`;
            
            const response = await this.makeRequest('POST', publishUrl, {
                articles: [wechatArticle]
            });
            
            if (response.errcode && response.errcode !== 0) {
                throw new Error(`微信发布失败: ${response.errmsg || JSON.stringify(response)}`);
            }
            
            const articleId = response.media_id || response.draft_id;
            console.log(`✅ 微信公众号草稿发布成功: ${articleId}`);
            
            return {
                success: true,
                platform: 'wechat',
                articleId: articleId,
                response: response
            };
            
        } catch (error) {
            console.error('❌ 微信公众号发布失败:', error.message);
            return {
                success: false,
                platform: 'wechat',
                error: error.message
            };
        }
    }
    
    // ── 准备微信公众号文章数据 ──────────────────────────────
    prepareWechatArticle(article, draftConfig = {}) {
        const config = this.config.wechat;
        
        return {
            title: article.title || '无标题',
            author: draftConfig.author || config.author || 'WorkBuddy',
            digest: draftConfig.digest || article.description || article.content?.substring(0, 120) + '...',
            content: article.content || '',
            thumb_media_id: draftConfig.thumbMediaId || config.thumbMediaId,
            show_cover_pic: draftConfig.showCoverPic !== undefined ? draftConfig.showCoverPic : 1,
            need_open_comment: draftConfig.openComment !== undefined ? draftConfig.openComment : 1,
            only_fans_can_comment: draftConfig.onlyFansComment !== undefined ? draftConfig.onlyFansComment : 0
        };
    }
    
    // ── 发布到文心公众号草稿箱 ──────────────────────────────
    async publishToWenxin(article, draftConfig = {}) {
        const config = this.config.wenxin;
        if (!config) {
            throw new Error('文心公众号未配置');
        }
        
        console.log('📤 发布到文心公众号草稿箱...');
        
        try {
            // 获取Token
            const token = await this.getPlatformToken('wenxin');
            
            // 准备文章数据
            const wenxinArticle = this.prepareWenxinArticle(article, draftConfig);
            
            // 发布草稿
            const publishUrl = `${platformConfigs.wenxin.baseUrl}${platformConfigs.wenxin.endpoints.draft}?access_token=${token}`;
            
            const response = await this.makeRequest('POST', publishUrl, wenxinArticle);
            
            if (response.code && response.code !== 0) {
                throw new Error(`文心公众号发布失败: ${response.message || JSON.stringify(response)}`);
            }
            
            const articleId = response.data?.article_id || response.article_id;
            console.log(`✅ 文心公众号草稿发布成功: ${articleId}`);
            
            return {
                success: true,
                platform: 'wenxin',
                articleId: articleId,
                response: response
            };
            
        } catch (error) {
            console.error('❌ 文心公众号发布失败:', error.message);
            return {
                success: false,
                platform: 'wenxin',
                error: error.message
            };
        }
    }
    
    // ── 准备文心公众号文章数据 ──────────────────────────────
    prepareWenxinArticle(article, draftConfig = {}) {
        const config = this.config.wenxin;
        
        // 文心公众号可能需要不同的格式
        // 这里假设文心公众号支持类似的格式
        return {
            title: article.title || '无标题',
            author: draftConfig.author || config.author || 'WorkBuddy',
            summary: draftConfig.digest || article.description || article.content?.substring(0, 120) + '...',
            content: this.formatContentForWenxin(article.content || ''),
            cover_image: draftConfig.coverImage || config.coverImage,
            tags: draftConfig.tags || article.tags || [],
            category: draftConfig.category || config.category || '科技',
            is_draft: draftConfig.isDraft !== undefined ? draftConfig.isDraft : true,
            publish_time: draftConfig.publishTime || undefined
        };
    }
    
    // ── 格式化内容供文心公众号使用 ──────────────────────────
    formatContentForWenxin(content) {
        if (!content) return '';
        
        // 文心公众号可能对HTML标签有不同要求
        // 这里进行基本的格式转换
        let formatted = content
            // 清理微信特有的格式
            .replace(/data-src=/g, 'src=')
            .replace(/style="[^"]*"/g, '')
            // 简化段落样式
            .replace(/<p[^>]*>/g, '<p>')
            .replace(/<\/p>/g, '</p>\n')
            // 清理多余的div
            .replace(/<div[^>]*>/g, '')
            .replace(/<\/div>/g, '')
            // 确保图片有alt属性
            .replace(/<img([^>]*)>/g, (match, attrs) => {
                if (!attrs.includes('alt=')) {
                    return `<img${attrs} alt="文章图片">`;
                }
                return match;
            });
        
        // 添加基本的样式（如果需要）
        formatted = `<div style="font-family: -apple-system, 'PingFang SC', sans-serif; line-height: 1.8;">${formatted}</div>`;
        
        return formatted;
    }
    
    // ── 多平台发布 ────────────────────────────────────────
    async publishToPlatforms(article, platforms, draftConfig = {}) {
        if (!this.initialized) {
            await this.init();
        }
        
        console.log(`📤 发布到 ${platforms.length} 个平台: ${platforms.join(', ')}`);
        
        const results = {};
        const promises = [];
        
        for (const platform of platforms) {
            if (!this.config[platform]) {
                console.warn(`⚠️  平台 ${platform} 未配置，跳过`);
                results[platform] = {
                    success: false,
                    error: '平台未配置'
                };
                continue;
            }
            
            const promise = (async () => {
                try {
                    let result;
                    
                    switch (platform) {
                        case 'wechat':
                            result = await this.publishToWechat(article, draftConfig);
                            break;
                            
                        case 'wenxin':
                            result = await this.publishToWenxin(article, draftConfig);
                            break;
                            
                        default:
                            result = {
                                success: false,
                                error: `不支持的平台: ${platform}`
                            };
                    }
                    
                    results[platform] = result;
                    return result;
                    
                } catch (error) {
                    const errorResult = {
                        success: false,
                        platform: platform,
                        error: error.message
                    };
                    results[platform] = errorResult;
                    return errorResult;
                }
            })();
            
            promises.push(promise);
        }
        
        // 等待所有发布完成
        await Promise.all(promises);
        
        // 统计结果
        const successful = Object.values(results).filter(r => r.success);
        const failed = Object.values(results).filter(r => !r.success);
        
        console.log(`\n📊 多平台发布完成:`);
        console.log(`   ✅ 成功: ${successful.length} 个平台`);
        console.log(`   ❌ 失败: ${failed.length} 个平台`);
        
        if (successful.length > 0) {
            console.log(`\n🏆 成功发布的平台:`);
            successful.forEach(result => {
                console.log(`   📱 ${result.platform}: ${result.articleId}`);
            });
        }
        
        if (failed.length > 0) {
            console.log(`\n⚠️  发布失败的平台:`);
            failed.forEach(result => {
                console.log(`   📱 ${result.platform}: ${result.error}`);
            });
        }
        
        return {
            success: failed.length === 0, // 全部成功才算成功
            results: results,
            statistics: {
                total: platforms.length,
                successful: successful.length,
                failed: failed.length
            }
        };
    }
    
    // ── 批量发布 ──────────────────────────────────────────
    async publishBatch(articles, platform, draftConfig = {}) {
        if (!this.initialized) {
            await this.init();
        }
        
        console.log(`📦 批量发布 ${articles.length} 篇文章到 ${platform}`);
        
        const results = [];
        const batchSize = 3; // 避免API限制
        const delayBetweenBatches = 1000;
        
        for (let i = 0; i < articles.length; i += batchSize) {
            const batch = articles.slice(i, i + batchSize);
            console.log(`🔄 处理批次 ${Math.floor(i/batchSize) + 1} (${batch.length}篇)`);
            
            const batchPromises = batch.map(async (article, index) => {
                try {
                    console.log(`  ${i + index + 1}/${articles.length}: ${article.title?.substring(0, 30)}...`);
                    
                    let result;
                    switch (platform) {
                        case 'wechat':
                            result = await this.publishToWechat(article, draftConfig);
                            break;
                        case 'wenxin':
                            result = await this.publishToWenxin(article, draftConfig);
                            break;
                        default:
                            result = { success: false, error: `不支持的平台: ${platform}` };
                    }
                    
                    result.articleId = article.id || article.aid;
                    result.articleTitle = article.title;
                    
                    return result;
                    
                } catch (error) {
                    console.error(`  ❌ 文章 ${i + index + 1} 发布失败:`, error.message);
                    return {
                        success: false,
                        articleId: article.id || article.aid,
                        articleTitle: article.title,
                        error: error.message
                    };
                }
            });
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            // 批次间延迟
            if (i + batchSize < articles.length) {
                await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
            }
        }
        
        // 统计结果
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        
        console.log(`\n📊 批量发布完成:`);
        console.log(`   ✅ 成功: ${successful.length} 篇`);
        console.log(`   ❌ 失败: ${failed.length} 篇`);
        
        return {
            success: failed.length === 0,
            results: results,
            statistics: {
                total: articles.length,
                successful: successful.length,
                failed: failed.length
            }
        };
    }
    
    // ── HTTP 请求封装 ─────────────────────────────────────
    async makeRequest(method, url, data = null) {
        return new Promise((resolve, reject) => {
            const options = {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'WorkBuddy-MultiPlatform-Publisher/1.0'
                }
            };
            
            const req = https.request(url, options, (res) => {
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(responseData);
                        resolve(parsed);
                    } catch (e) {
                        resolve(responseData);
                    }
                });
            });
            
            req.on('error', (error) => {
                reject(error);
            });
            
            if (data && (method === 'POST' || method === 'PUT')) {
                req.write(JSON.stringify(data));
            }
            
            req.end();
        });
    }
    
    // ── 健康检查 ──────────────────────────────────────────
    async healthCheck() {
        console.log('🩺 检查发布器健康状态...');
        
        const checks = [];
        
        // 检查平台配置
        for (const [platform, config] of Object.entries(this.config)) {
            const platformInfo = platformConfigs[platform];
            if (!platformInfo) {
                checks.push({
                    platform: platform,
                    status: '❌ 未知平台',
                    details: '不支持该平台'
                });
                continue;
            }
            
            const required = platformInfo.requiredFields;
            const missing = required.filter(field => !config[field]);
            
            if (missing.length > 0) {
                checks.push({
                    platform: platform,
                    status: '⚠️ 配置不完整',
                    details: `缺少字段: ${missing.join(', ')}`
                });
            } else {
                checks.push({
                    platform: platform,
                    status: '✅ 配置正常',
                    details: `${platformInfo.name} 配置完整`
                });
            }
        }
        
        // 检查Token状态
        for (const [platform, tokenInfo] of Object.entries(this.tokens)) {
            const platformInfo = platformConfigs[platform];
            if (platformInfo) {
                const expiresIn = Math.floor((tokenInfo.expiresAt - Date.now()) / 1000);
                checks.push({
                    platform: platform,
                    status: expiresIn > 60 ? '✅ Token有效' : '⚠️ Token即将过期',
                    details: `Token有效时间: ${expiresIn}秒`
                });
            }
        }
        
        console.log('\n📋 发布器健康检查结果:');
        checks.forEach(check => {
            console.log(`   ${check.status} ${check.platform}: ${check.details}`);
        });
        
        const allReady = checks.every(check => check.status.includes('✅') || check.status.includes('配置正常'));
        
        return {
            ready: allReady,
            checks: checks
        };
    }
}

// ── 导出模块 ──────────────────────────────────────────────
module.exports = MultiPlatformPublisher;

// ── 示例配置 ──────────────────────────────────────────────
const exampleConfig = {
    wechat: {
        appId: '你的微信公众号AppID',
        appSecret: '你的微信公众号AppSecret',
        thumbMediaId: '你的封面图MediaID',
        author: 'WorkBuddy'
    },
    wenxin: {
        appId: '你的文心公众号AppID',
        appSecret: '你的文心公众号AppSecret',
        tenantId: '你的租户ID（可选）',
        author: 'WorkBuddy',
        category: '科技'
    }
};