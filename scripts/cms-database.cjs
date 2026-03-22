/**
 * CMS 数据库存储模块 - 直接连接 MySQL 数据库
 * 支持 lvbo_article 和 lvbo_type 表
 */

let mysqlBase;
try {
    // 先尝试本地安装
    mysqlBase = require('mysql2');
} catch (e) {
    // 尝试全局安装
    try {
        const globalPath = 'C:\\Users\\tuan_\\AppData\\Roaming\\npm\\node_modules\\n8n\\node_modules\\mysql2';
        mysqlBase = require(globalPath);
        console.log('   ✅ 使用全局 mysql2');
    } catch (e2) {
        console.warn('   ⚠️  mysql2 模块未安装，CMS 功能将使用模拟模式');
        mysqlBase = null;
    }
}

// ── 数据库配置 ──────────────────────────────────────────────
const dbConfig = {
    host: 'localhost',
    port: 3306,
    database: 'eastaiai',
    user: 'root',
    password: 'gyc1234567',
    charset: 'utf8mb4'
};

// ── 创建数据库连接 ─────────────────────────────────────────
function createConnection() {
    if (!mysqlBase) {
        throw new Error('mysql2 模块未安装');
    }
    return mysqlBase.createConnection(dbConfig);
}

// ── 确保"技术观察"分类存在 ─────────────────────────────────
async function ensureTechWatchCategory(conn) {
    // 检查是否已存在"技术观察"主分类
    const [rows] = await conn.promise().query(
        'SELECT typeid FROM lvbo_type WHERE typename = ? AND fid = 0',
        ['技术观察']
    );
    
    if (rows.length > 0) {
        return rows[0].typeid;
    }
    
    // 获取最大 typeid
    const [maxResult] = await conn.promise().query('SELECT MAX(typeid) as maxid FROM lvbo_type');
    const newTypeId = (maxResult[0].maxid || 0) + 1;
    
    // 插入主分类
    await conn.promise().query(
        `INSERT INTO lvbo_type (typeid, typename, typename_en, isindex, keywords, keywords_en, 
         description, description_en, ismenu, indexnum, pernum, islink, url, isuser, target, 
         readme, drank, irank, fid, path, show_fields, list_path, page_path, icon, showurl) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            newTypeId, '技术观察', 'Tech Watch', 1, 
            '人工智能,AI,机器人,工业软件,数字化转型', 
            'AI,Robotics,Industrial Software,Digital Transformation',
            '技术趋势观察与深度分析', 'Technology Trends and Deep Analysis',
            1, 10, 15, 0, '', 1, 1, '', newTypeId, 10, 0, '0',
            '1|1|1|1|1|1|1|1|1|1|1|1|1|1|1|0',
            'list/list_default.html', 'page/page_default.html',
            '/Public/Uploads/uploadfile/images/default.png', ''
        ]
    );
    
    console.log(`   ✅ 创建主分类：技术观察 (ID: ${newTypeId})`);
    return newTypeId;
}

// ── 获取或创建子分类 ───────────────────────────────────────
async function getOrCreateSubCategory(conn, parentId, keyword) {
    // 检查是否已存在该子分类
    const [rows] = await conn.promise().query(
        'SELECT typeid FROM lvbo_type WHERE typename = ? AND fid = ?',
        [keyword, parentId]
    );
    
    if (rows.length > 0) {
        return rows[0].typeid;
    }
    
    // 获取最大 typeid
    const [maxResult] = await conn.promise().query('SELECT MAX(typeid) as maxid FROM lvbo_type');
    const newTypeId = (maxResult[0].maxid || 0) + 1;
    
    // 获取父分类路径
    const [parentResult] = await conn.promise().query(
        'SELECT path FROM lvbo_type WHERE typeid = ?',
        [parentId]
    );
    const parentPath = parentResult[0]?.path || '0';
    const newPath = `${parentPath}-${newTypeId}`;
    
    // 插入子分类
    await conn.promise().query(
        `INSERT INTO lvbo_type (typeid, typename, typename_en, isindex, keywords, keywords_en, 
         description, description_en, ismenu, indexnum, pernum, islink, url, isuser, target, 
         readme, drank, irank, fid, path, show_fields, list_path, page_path, icon, showurl) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            newTypeId, keyword, keyword, 1, keyword, keyword,
            `${keyword}相关技术观察`, `${keyword} Technology Watch`,
            0, 10, 15, 0, '', 1, 1, '', 10, 10, parentId, newPath,
            '1|1|1|1|1|1|1|1|1|1|1|1|1|1|1|0',
            'list/list_default.html', 'page/page_default.html',
            '/Public/Uploads/uploadfile/images/default.png', ''
        ]
    );
    
    console.log(`   ✅ 创建子分类：${keyword} (ID: ${newTypeId})`);
    return newTypeId;
}

// ── 根据关键词匹配分类 ─────────────────────────────────────
async function matchCategory(conn, keywords) {
    // 确保主分类存在
    const parentId = await ensureTechWatchCategory(conn);
    
    if (!keywords || keywords.length === 0) {
        return parentId;
    }
    
    // 尝试匹配现有子分类
    for (const kw of keywords) {
        const [rows] = await conn.promise().query(
            'SELECT typeid FROM lvbo_type WHERE typename = ? AND fid = ?',
            [kw, parentId]
        );
        if (rows.length > 0) {
            return rows[0].typeid;
        }
    }
    
    // 创建第一个关键词作为子分类
    return await getOrCreateSubCategory(conn, parentId, keywords[0]);
}

// ── 保存文章到数据库 ───────────────────────────────────────
async function saveArticle(articleData) {
    // 如果 mysql2 未安装，使用模拟模式
    if (!mysqlBase) {
        console.log('   ⚠️  mysql2 未安装，使用模拟 CMS 存储');
        const mockId = Math.floor(Math.random() * 10000) + 5000;
        return {
            success: true,
            aid: mockId,
            typeid: 999,
            mock: true
        };
    }
    
    let conn;
    
    try {
        conn = createConnection();
        
        const { title, content, keywords, description, author } = articleData;
        
        // 匹配或创建分类
        console.log('   🔍 匹配 CMS 分类...');
        const typeId = await matchCategory(conn, keywords);
        
        // 获取最大 aid
        const [maxResult] = await conn.promise().query('SELECT MAX(aid) as maxid FROM lvbo_article');
        const newAid = (maxResult[0].maxid || 0) + 1;
        
        // 准备文章数据
        const now = new Date();
        const addTime = now.toISOString().replace('T', ' ').substring(0, 19);
        
        // 清理内容中的 Markdown 符号和 emoji
        const cleanContent = content
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/#/g, '')
            .replace(/>/g, '')
            .replace(/---/g, '')
            .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')  // 移除 emoji
            .replace(/[\u{2600}-\u{26FF}]/gu, '')     // 移除符号
            .replace(/💡|📌|✅|⚠️|❌|🔍|📝|🤖|💾|📄|📁|🔗/gu, '');  // 移除特定 emoji
        
        const cleanDescription = description ? description.substring(0, 200) : title;
        
        // 插入文章
        await conn.promise().query(
            `INSERT INTO lvbo_article 
             (aid, title, titlecolor, author, keywords, description, note, linkurl, status, 
              copyfrom, addtime, islink, isflash, istop, isimg, imgurl, ishot, pagenum, hits, 
              good_tp, content, typeid, voteid, is_from_mobile, price, remark, product_xinghao, 
              userid, location, effectlevel, year, level, sizeweight) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                newAid,
                title || '无标题',
                '',
                author || 'WorkBuddy AI',
                keywords ? keywords.join(',') : '',
                cleanDescription,
                '',
                '',
                1,              // status: 已发布
                'WorkBuddy AI 自动生成',
                addTime,
                0, 0, 0, 0,     // islink, isflash, istop, isimg
                '/Public/Uploads/uploadfile/images/default.png',
                0, 0, 1, 0,     // ishot, pagenum, hits, good_tp
                cleanContent,
                typeId,
                0, 0, '', '', '',  // voteid, is_from_mobile, price, remark, product_xinghao
                0, '', '', '', '', ''  // userid, location, effectlevel, year, level, sizeweight
            ]
        );
        
        console.log(`   ✅ 文章已存入数据库 (ID: ${newAid})`);
        console.log(`   📁 分类: ${typeId}`);
        
        return {
            success: true,
            aid: newAid,
            typeid: typeId
        };
        
    } catch (error) {
        console.error('   ❌ 数据库操作失败:', error.message);
        return {
            success: false,
            error: error.message
        };
    } finally {
        if (conn) {
            await conn.end();
        }
    }
}

// ── 导出模块 ──────────────────────────────────────────────
module.exports = {
    saveArticle,
    ensureTechWatchCategory,
    getOrCreateSubCategory,
    matchCategory
};
