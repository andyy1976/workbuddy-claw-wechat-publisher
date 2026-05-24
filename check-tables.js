/**
 * 检查数据库表结构
 */

const mysql = require('mysql2/promise');

const DB_CONFIG = {
    host: '82.156.40.94',
    user: 'eastaiai',
    password: 'alibaba',
    database: 'eastaiai',
    port: 3306,
    charset: 'utf8mb4'
};

async function checkTables() {
    const connection = await mysql.createConnection(DB_CONFIG);
    
    try {
        // 查询所有表
        const [tables] = await connection.execute('SHOW TABLES');
        
        console.log('📋 数据库中的所有表:');
        console.log('='.repeat(60));
        
        for (const row of tables) {
            const tableName = Object.values(row)[0];
            console.log(`  - ${tableName}`);
            
            // 检查每个表的字段
            const [columns] = await connection.execute(`SHOW COLUMNS FROM \`${tableName}\``);
            console.log(`    字段数: ${columns.length}`);
        }
        
        console.log('='.repeat(60));
        console.log(`共 ${tables.length} 个表`);
        
    } catch (e) {
        console.error('❌ 查询失败:', e.message);
    } finally {
        await connection.end();
    }
}

checkTables();
