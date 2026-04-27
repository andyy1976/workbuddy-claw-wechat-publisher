/**
 * MySQL 连接测试脚本
 */
const mysql = require('mysql2/promise');

async function test() {
    console.log('🔌 尝试连接 MySQL...');
    
    let conn;
    try {
        conn = await mysql.createConnection({
            host: 'localhost',
            port: 3306,
            user: 'root',
            password: 'gyc1234567',
            database: 'eastaiai',
            connectTimeout: 10000
        });
        
        const [[dbInfo]] = await conn.query('SELECT DATABASE() as db, VERSION() as ver');
        console.log('✅ 连接成功！');
        console.log('   数据库:', dbInfo.db);
        console.log('   MySQL版本:', dbInfo.ver);
        
        // 查看表
        const [tables] = await conn.query('SHOW TABLES');
        console.log('   表数量:', tables.length);
        console.log('   表名:', tables.map(r => Object.values(r)[0]).join(', '));
        
        // 查看 lvbo_article 结构
        try {
            const [cols] = await conn.query('DESCRIBE lvbo_article');
            console.log('   lvbo_article 字段:', cols.map(c => c.Field).join(', '));
        } catch(e) {
            console.log('   lvbo_article 结构获取失败:', e.message);
        }
        
        // 查看 lvbo_type 结构
        try {
            const [typeCols] = await conn.query('DESCRIBE lvbo_type');
            console.log('   lvbo_type 字段:', typeCols.map(c => c.Field).join(', '));
        } catch(e) {
            console.log('   lvbo_type 结构获取失败:', e.message);
        }
        
        // 查看现有文章数量
        try {
            const [[cnt]] = await conn.query('SELECT COUNT(*) as cnt FROM lvbo_article');
            console.log('   现有文章:', cnt.cnt, '篇');
        } catch(e) {}
        
        // 查看现有分类
        try {
            const [types] = await conn.query('SELECT typeid, typename, fid FROM lvbo_type LIMIT 20');
            console.log('   分类:', JSON.stringify(types));
        } catch(e) {}
        
        await conn.end();
        console.log('\n✅ MySQL 完全可用，可以集成到发布流程！');
        
    } catch(error) {
        console.error('❌ 连接失败:', error.message);
        if (conn) conn.end();
        process.exit(1);
    }
}

test();
