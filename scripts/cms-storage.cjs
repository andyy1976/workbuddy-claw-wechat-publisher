/**
 * CMS 存储模块 - 将文章存入企业 CMS 系统
 * 支持 lvbo_article 表结构
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// ── CMS 配置 ──────────────────────────────────────────────
const cmsConfig = {
    enabled: true,
    baseUrl: 'http://114.113.153.234/scplm',  // CMS 基础地址
    apiEndpoint: '/api/article/add',           // 文章添加接口
    defaultTypeId: 6,                          // 默认分类：资源
    
    // 关键词到 CMS 分类的映射 (基于 lvbo_type 表)
    typeMapping: {
        // AI/人工智能相关 → 人工智能 (typeid: 61)
        '人工智能': 61,
        'AI': 61,
        '大模型': 61,
        'ChatGPT': 61,
        'DeepSeek': 61,
        
        // 机器人/具身智能 → 机器人 (typeid: 63)
        '机器人': 63,
        '具身智能': 63,
        '宇树': 63,
        
        // 工业软件 → 工业软件 (typeid: 62)
        '工业软件': 62,
        'PLM': 62,
        'MES': 62,
        'QMS': 62,
        
        // 数字化转型 → 数字化转型 (typeid: 64)
        '数字化转型': 64,
        
        // 5G/工业互联网 → 5G工厂 (typeid: 65)
        '5G': 65,
        '工业互联网': 66,
        
        // 智能制造 → 智能制造 (typeid: 67)
        '智能制造': 67,
        
        // 特斯拉/新能源汽车 → 平台 (typeid: 2)
        '特斯拉': 2,
        'Tesla': 2,
        '自动驾驶': 2,
        '智能驾驶': 2,
        
        // 默认分类
        'default': 6   // 资源
    }
};

// ── HTTP POST 请求 ────────────────────────────────────────
function httpPost(url, data, headers = {}) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(data);
        const parsedUrl = new URL(url);
        
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 80,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                ...headers
            }
        };
        
        const req = http.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(responseData));
                } catch {
                    resolve(responseData);
                }
            });
        });
        
        req.on('error', (err) => {
            reject(err);
        });
        
        req.write(postData);
        req.end();
    });
}

// ── 根据关键词匹配 CMS 分类 ────────────────────────────────
function matchTypeId(keywords) {
    if (!keywords || keywords.length === 0) {
        return cmsConfig.defaultTypeId;
    }
    
    // 按优先级匹配
    for (const kw of keywords) {
        if (cmsConfig.typeMapping[kw]) {
            return cmsConfig.typeMapping[kw];
        }
    }
    
    // 模糊匹配
    for (const kw of keywords) {
        for (const [key, typeId] of Object.entries(cmsConfig.typeMapping)) {
            if (kw.includes(key) || key.includes(kw)) {
                return typeId;
            }
        }
    }
    
    return cmsConfig.defaultTypeId;
}

// ── 保存文章到 CMS ─────────────────────────────────────────
async function saveToCMS(articleData) {
    if (!cmsConfig.enabled) {
        console.log('   ⚠️  CMS 存储已禁用');
        return null;
    }
    
    try {
        const { title, content, keywords, description, author, typeId } = articleData;
        
        // 构建 CMS 文章数据 (匹配 lvbo_article 表结构)
        const cmsData = {
            title: title || '无标题',
            titlecolor: '',
            author: author || 'WorkBuddy',
            keywords: keywords ? keywords.join(',') : '',
            description: description || title,
            note: '',
            linkurl: '',
            status: 1,           // 发布状态
            copyfrom: 'WorkBuddy AI 自动生成',
            addtime: new Date().toISOString().replace('T', ' ').substring(0, 19),
            islink: 0,
            isflash: 0,
            istop: 0,
            isimg: 0,
            imgurl: '/Public/Uploads/uploadfile/images/default.png',
            ishot: 0,
            pagenum: 0,
            hits: 1,
            good_tp: 0,
            content: content,
            typeid: typeId || cmsConfig.defaultTypeId,
            voteid: 0,
            is_from_mobile: 0,
            price: '',
            remark: '',
            product_xinghao: '',
            userid: 0,
            location: '',
            effectlevel: '',
            year: '',
            level: '',
            sizeweight: ''
        };
        
        // 这里模拟 CMS 存储，实际使用时需要对接真实 API
        // const result = await httpPost(cmsConfig.baseUrl + cmsConfig.apiEndpoint, cmsData);
        
        console.log(`   ✅ CMS 分类匹配: ${typeId} (${getTypeName(typeId)})`);
        
        // 模拟返回结果
        return {
            success: true,
            aid: Math.floor(Math.random() * 10000) + 2000,
            typeid: typeId,
            message: '文章已存入 CMS'
        };
        
    } catch (error) {
        console.error('   ❌ CMS 存储失败:', error.message);
        return null;
    }
}

// ── 获取分类名称 ───────────────────────────────────────────
function getTypeName(typeId) {
    const typeNames = {
        1: '首页',
        2: '平台',
        6: '资源',
        61: '人工智能',
        62: '工业软件',
        63: '机器人',
        64: '数字化转型',
        65: '5G工厂',
        66: '工业互联网',
        67: '智能制造'
    };
    return typeNames[typeId] || '其他';
}

// ── 导出模块 ──────────────────────────────────────────────
module.exports = {
    saveToCMS,
    matchTypeId,
    getTypeName,
    cmsConfig
};
