const mysql = require('C:\\Users\\tuan_\\AppData\\Roaming\\npm\\node_modules\\n8n\\node_modules\\mysql2');

const dbConfig = {
    host: 'localhost',
    port: 3306,
    database: 'eastaiai',
    user: 'root',
    password: 'gyc1234567',
    charset: 'utf8mb4'
};

async function testConnection() {
    let conn;
    try {
        console.log('🔌 正在连接数据库...');
        conn = await mysql.createConnection(dbConfig);
        console.log('✅ 数据库连接成功！');
        
        // 测试查询 - 使用 promise 方式
        const result1 = await conn.promise().query('SELECT COUNT(*) as count FROM lvbo_article');
        console.log('📊 当前文章数量:', result1[0][0].count);
        
        // 检查 lvbo_type 表
        const result2 = await conn.promise().query('SELECT typeid, typename FROM lvbo_type WHERE fid = 0 LIMIT 5');
        console.log('📁 主分类:');
        result2[0].forEach(t => console.log(`   - ${t.typename} (ID: ${t.typeid})`));
        
    } catch (error) {
        console.error('❌ 数据库连接失败:', error.message);
    } finally {
        if (conn) {
            await conn.end();
            console.log('🔌 连接已关闭');
        }
    }
}

testConnection();
