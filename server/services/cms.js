const mysql = require('mysql2/promise');
const marked = require('marked');

// ── 数据库配置 ──────────────────────────────────
const DB_CONFIG = {
    host: process.env.DB_HOST || '82.156.40.94',
    user: process.env.DB_USER || 'eastaiai',
    password: process.env.DB_PASSWORD || 'alibaba',
    database: process.env.DB_NAME || 'eastaiai',
    port: parseInt(process.env.DB_PORT) || 3306,
    // charset: 'utf8',
    // collate: 'utf8_general_ci',
    connectTimeout: 30000,  // 增加到30秒
    ssl: false
};

// 栏目映射（与 CMS 数据库保持一致）
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

// ── 服务接口 ─────────────────────────────────────

/**
 * 获取栏目列表
 */
async function getCategories() {
    let connection;
    try {
        connection = await mysql.createConnection(DB_CONFIG);
        const [rows] = await connection.execute(
            'SELECT typeid AS id, typename AS name, keywords FROM lvbo_type WHERE ismenu = 1 ORDER BY irank ASC'
        );
        // 转为对象格式，与 fallback 的 CATEGORY_MAP 保持一致
        const data = {};
        for (const row of rows) {
            data[row.id] = {
                name: row.name,
                keywords: (row.keywords || '').split(',').map(k => k.trim()).filter(Boolean)
            };
        }
        return { success: true, data, source: 'database' };
    } catch (e) {
        console.error('[getCategories] 数据库查询失败:', e.message);
        return { success: true, data: CATEGORY_MAP, source: 'fallback' };
    } finally {
        if (connection) {
            try { await connection.end(); } catch (e) {}
        }
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
 * 推送文章到CMS（直接写数据库，带重试）
 */
async function pushArticle(article, retryCount = 0) {
    const { title, content, categoryId, status = 1, source = 'WorkBuddy' } = article;
    
    if (!title || !content) {
        return { success: false, message: '缺少标题或内容' };
    }
    
    // ── Markdown → HTML 转换（强制转换，确保有排版）─────────────────────────────────────
    let htmlContent;
    try {
        console.log(`[pushArticle] 原始内容前100字符: ${content.substring(0, 100)}`);
        console.log(`[pushArticle] 检测到Markdown语法: ${/[#{*}_>`\\[\\]\-]/.test(content)}`);
        
        // 强制转换：无论是否检测到Markdown，都尝试用marked解析
        htmlContent = marked.parse(content);
        
        console.log(`[pushArticle] ✅ Markdown→HTML转换成功，HTML长度: ${htmlContent.length}`);
        console.log(`[pushArticle] HTML前100字符: ${htmlContent.substring(0, 100)}`);
    } catch (e) {
        console.error(`[pushArticle] ❌ Markdown转换失败，使用原文: ${e.message}`);
        htmlContent = content; // 失败时保持原文
    }
    
    const cat = categoryId || matchCategory(title, content);
    const catId = typeof cat === 'object' ? cat.id : cat;
    
    let connection;
    try {
        // 每次创建新连接（避免连接池问题）
        connection = await mysql.createConnection(DB_CONFIG);
        
        const addtime = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const [result] = await connection.execute(
            `INSERT INTO lvbo_article 
             (title, content, typeid, status, copyfrom, addtime) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                title.substring(0, 80),  // title max 80 chars
                htmlContent,  // ← 使用转换后的 HTML
                catId,
                status,
                source,
                addtime
            ]
        );
        
        const articleId = result.insertId;
        
        console.log(`[pushArticle] ✅ 文章推送成功: ID=${articleId}, 标题=${title.substring(0, 30)}...`);
        
        return {
            success: true,
            articleId,
            categoryId: catId,
            url: `${process.env.CMS_BASE_URL || 'http://82.156.40.94'}/index.php?s=Article/index&id=${articleId}`,
            message: '发布成功'
        };
    } catch (e) {
        console.error(`[pushArticle] ❌ 数据库写入失败 (尝试 ${retryCount + 1}/3):`, e.message);
        
        // 重试逻辑（最多3次）
        if (retryCount < 2 && (e.code === 'ECONNRESET' || e.code === 'PROTOCOL_CONNECTION_LOST')) {
            console.log(`[pushArticle] 🔄 重试中... (${retryCount + 2}/3)`);
            await new Promise(resolve => setTimeout(resolve, 1000));  // 等待1秒
            return pushArticle(article, retryCount + 1);
        }
        
        return { success: false, message: e.message };
    } finally {
        if (connection) {
            try { await connection.end(); } catch (e) {}
        }
    }
}

/**
 * 获取CMS文章列表
 */
async function getArticles(options = {}) {
    const { categoryId, page = 1, pageSize = 20 } = options;
    
    let connection;
    try {
        connection = await mysql.createConnection(DB_CONFIG);
        
        let query = 'SELECT aid AS id, title, typeid, status, copyfrom AS source, addtime FROM lvbo_article WHERE 1=1';
        const params = [];
        
        if (categoryId) {
            query += ' AND typeid = ?';
            params.push(categoryId);
        }
        
        query += ' ORDER BY addtime DESC LIMIT ? OFFSET ?';
        params.push(parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize));
        
        const [rows] = await connection.execute(query, params);
        
        return { success: true, data: rows };
    } catch (e) {
        console.error('[getArticles] 数据库查询失败:', e.message);
        return { success: false, message: e.message };
    } finally {
        if (connection) {
            try { await connection.end(); } catch (e) {}
        }
    }
}

module.exports = {
    getCategories,
    matchCategory,
    pushArticle,
    getArticles,
    CATEGORY_MAP
};
