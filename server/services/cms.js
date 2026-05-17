/**
 * CMS 集成服务
 * 
 * 与 SCSAICMS (ThinkPHP) 双向集成：
 * - 读取CMS栏目/文章
 * - 推送内容到CMS
 * - 产品数据桥接
 */

const axios = require('axios');
const http = require('http');

// ── 配置 ──────────────────────────────────────────
const CMS_BASE = process.env.CMS_BASE_URL || 'http://localhost';
const CMS_API_KEY = process.env.CMS_API_KEY || 'sciot_content_2026';

// 栏目映射（与 cms-bridge.cjs 保持一致）
const CATEGORY_MAP = {
    111: { name: '数字员工', keywords: ['数字员工', '内容创作', 'AI写作', '内容发布'] },
    112: { name: '营销获客', keywords: ['营销', '获客', '私域', '社群'] },
    113: { name: '智能客服', keywords: ['客服', '智能问答', '工单'] },
    121: { name: '大模型', keywords: ['大模型', 'LLM', 'GPT', 'Claude', 'DeepSeek'] },
    122: { name: '智能体', keywords: ['智能体', 'Agent', '工作流', 'Dify'] },
    131: { name: 'PLM', keywords: ['PLM', '产品生命周期', 'BOM', '变更管理'] },
    132: { name: 'MES', keywords: ['MES', '制造执行', '生产管理'] },
    133: { name: '质量管理', keywords: ['QMS', '质量管理', 'ISO', '合规'] },
    134: { name: 'ERP', keywords: ['ERP', 'CAPP', '工艺设计'] }
};

// ── HTTP 请求工具 ─────────────────────────────────
function cmsRequest(apiPath, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(apiPath, CMS_BASE);
        const options = {
            hostname: url.hostname,
            port: url.port || 80,
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': CMS_API_KEY
            }
        };
        
        if (data) {
            const body = JSON.stringify(data);
            options.headers['Content-Length'] = Buffer.byteLength(body);
        }
        
        const req = http.request(options, (res) => {
            let raw = '';
            res.on('data', chunk => raw += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(raw));
                } catch (e) {
                    reject(new Error('CMS响应解析失败: ' + raw.substring(0, 200)));
                }
            });
        });
        
        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

// ── 服务接口 ──────────────────────────────────────

/**
 * 获取栏目列表
 */
async function getCategories() {
    try {
        const result = await cmsRequest('/index.php?s=Contentapi/categories');
        return { success: true, data: CATEGORY_MAP, source: 'config' };
    } catch (e) {
        // 降级：返回配置的栏目
        return { success: true, data: CATEGORY_MAP, source: 'fallback' };
    }
}

/**
 * 智能匹配栏目
 */
function matchCategory(title, content) {
    const text = (title + ' ' + content).toLowerCase();
    let bestMatch = null;
    let bestScore = 0;
    
    for (const [id, cat] of Object.entries(CATEGORY_MAP)) {
        let score = 0;
        for (const kw of cat.keywords) {
            if (text.includes(kw.toLowerCase())) {
                score += kw.length; // 更长的关键词权重更高
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestMatch = { id: parseInt(id), name: cat.name, score };
        }
    }
    
    return bestMatch || { id: 111, name: '数字员工', score: 0 };
}

/**
 * 推送文章到CMS
 */
async function pushArticle(article) {
    const { title, content, categoryId, status = 1, source = 'ContentAI' } = article;
    
    const cat = categoryId || matchCategory(title, content);
    const catId = typeof cat === 'object' ? cat.id : cat;
    
    const payload = {
        title,
        content,
        typeid: catId,
        status,
        source,
        addtime: Math.floor(Date.now() / 1000)
    };
    
    const result = await cmsRequest('/index.php?s=Contentapi/push', 'POST', payload);
    
    return {
        success: result.code === 0 || result.success,
        articleId: result.data?.aid,
        categoryId: catId,
        url: result.success ? `${CMS_BASE}/index.php?s=Article/index&id=${result.data?.aid}` : null,
        message: result.msg || result.message
    };
}

/**
 * 获取CMS文章列表
 */
async function getArticles(options = {}) {
    const { categoryId, page = 1, pageSize = 20 } = options;
    
    try {
        const params = new URLSearchParams({ page, pageSize });
        if (categoryId) params.set('categoryId', categoryId);
        
        const result = await cmsRequest(`/index.php?s=Contentapi/articles?${params}`);
        return { success: true, data: result.data || result };
    } catch (e) {
        return { success: false, message: e.message };
    }
}

/**
 * 从CMS读取产品数据（企业BOM/工艺/质量）
 */
async function getProductData(productId) {
    try {
        const result = await cmsRequest(`/index.php?s=Contentapi/product/${productId}`);
        return { success: true, data: result.data || result };
    } catch (e) {
        return { success: false, message: e.message };
    }
}

module.exports = {
    getCategories,
    matchCategory,
    pushArticle,
    getArticles,
    getProductData,
    CATEGORY_MAP
};
