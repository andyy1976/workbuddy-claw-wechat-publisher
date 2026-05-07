/**
 * 内容存储模块 - 支持多种后端
 * 
 * 支持：MySQL、本地 JSON 文件、Redis
 */

const fs = require('fs');
const path = require('path');

// ── 配置 ───────────────────────────────────────────────
const STORAGE_TYPE = process.env.CONTENT_STORAGE || 'json';
const JSON_DATA_PATH = process.env.CONTENT_DATA_PATH || path.join(__dirname, '../data/contents');

// ── JSON 文件存储 ───────────────────────────────────────
const JsonStorage = {
    async init() {
        // 确保目录存在
        const dirs = [
            JSON_DATA_PATH,
            path.join(JSON_DATA_PATH, 'featured'),
            path.join(JSON_DATA_PATH, 'archive'),
            path.join(JSON_DATA_PATH, 'daily')
        ];
        dirs.forEach(d => {
            if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
        });
        console.log('[Storage] JSON mode initialized');
    },
    
    async saveContent(item) {
        const date = new Date().toISOString().split('T')[0];
        const file = path.join(JSON_DATA_PATH, `${date}.json`);
        
        let data = [];
        if (fs.existsSync(file)) {
            try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
        }
        
        // 去重
        const exists = data.find(d => d.id === item.id || d.url === item.url);
        if (!exists) {
            data.push({
                ...item,
                storedAt: new Date().toISOString()
            });
            fs.writeFileSync(file, JSON.stringify(data, null, 2));
        }
        
        return !exists;
    },
    
    async saveFeatured(items) {
        const date = new Date().toISOString().split('T')[0];
        const file = path.join(JSON_DATA_PATH, 'featured', `${date}.json`);
        fs.writeFileSync(file, JSON.stringify(items, null, 2));
        console.log(`[Storage] Saved ${items.length} featured items`);
        return items.length;
    },
    
    async getFeatured(date) {
        date = date || new Date().toISOString().split('T')[0];
        const file = path.join(JSON_DATA_PATH, 'featured', `${date}.json`);
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
        return [];
    },
    
    async getHistory(days) {
        days = days || 7;
        const results = [];
        const today = new Date();
        
        for (let i = 0; i < days; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const file = path.join(JSON_DATA_PATH, `${dateStr}.json`);
            
            if (fs.existsSync(file)) {
                try {
                    results.push(...JSON.parse(fs.readFileSync(file, 'utf8')));
                } catch {}
            }
        }
        
        return results;
    },
    
    async saveDailyReport(report) {
        const file = path.join(JSON_DATA_PATH, 'daily', `${report.date}.json`);
        fs.writeFileSync(file, JSON.stringify(report, null, 2));
        console.log(`[Storage] Daily report saved: ${report.date}`);
        return true;
    },
    
    async search(query, limit) {
        limit = limit || 50;
        const results = [];
        const files = fs.readdirSync(JSON_DATA_PATH).filter(f => f.endsWith('.json'));
        
        for (const file of files) {
            try {
                const items = JSON.parse(fs.readFileSync(path.join(JSON_DATA_PATH, file), 'utf8'));
                const matches = items.filter(item => 
                    (item.title || '').toLowerCase().includes(query.toLowerCase()) ||
                    (item.summary || '').toLowerCase().includes(query.toLowerCase())
                );
                results.push(...matches);
            } catch {}
            
            if (results.length >= limit) break;
        }
        
        return results.slice(0, limit);
    }
};

// ── MySQL 存储 ─────────────────────────────────────────
let mysqlPool = null;

const MySqlStorage = {
    async init() {
        const mysql = require('mysql2/promise');
        const host = process.env.CMS_DB_HOST || 'localhost';
        const port = parseInt(process.env.CMS_DB_PORT || '3306');
        const user = process.env.CMS_DB_USER || 'root';
        const password = process.env.CMS_DB_PASS || '';
        const database = process.env.CMS_DB_NAME || 'content_platform';
        
        mysqlPool = mysql.createPool({
            host, port, user, password, database,
            waitForConnections: true,
            connectionLimit: 10
        });
        
        // 创建表
        await mysqlPool.execute(`
            CREATE TABLE IF NOT EXISTS contents (
                id VARCHAR(64) PRIMARY KEY,
                source_id VARCHAR(32),
                title VARCHAR(500),
                summary TEXT,
                original_url VARCHAR(500),
                publish_time DATETIME,
                fetch_time DATETIME,
                is_ai_related BOOLEAN DEFAULT TRUE,
                scores JSON,
                final_score DECIMAL(5,2),
                is_featured BOOLEAN DEFAULT FALSE,
                cluster_id VARCHAR(32),
                category VARCHAR(50),
                tags JSON,
                raw_data JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_score (final_score DESC),
                INDEX idx_featured (is_featured, publish_time DESC),
                INDEX idx_source (source_id, fetch_time DESC)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        
        console.log('[Storage] MySQL mode initialized');
    },
    
    async saveContent(item) {
        const id = item.id || Buffer.from(item.url || item.title).toString('base64').substring(0, 32);
        
        await mysqlPool.execute(`
            INSERT INTO contents (id, source_id, title, summary, original_url, publish_time, 
                                  fetch_time, scores, final_score, is_featured, category, raw_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                final_score = VALUES(final_score),
                is_featured = VALUES(is_featured),
                scores = VALUES(scores)
        `, [
            id,
            item.source_id || item.source,
            item.title,
            item.summary || item.introduce,
            item.url,
            item.publishTime || item.publish_time,
            new Date(),
            JSON.stringify(item.scores || {}),
            item.finalScore || item.final_score || 0,
            item.isFeatured || item.is_featured || false,
            (item.category || [])[0] || '综合',
            JSON.stringify(item)
        ]);
        
        return true;
    },
    
    async saveFeatured(items) {
        for (const item of items) {
            await this.saveContent({ ...item, is_featured: true });
        }
        console.log(`[Storage] Saved ${items.length} featured items to MySQL`);
        return items.length;
    },
    
    async getFeatured(date) {
        const [rows] = await mysqlPool.execute(`
            SELECT * FROM contents 
            WHERE is_featured = TRUE 
            AND DATE(fetch_time) = ?
            ORDER BY final_score DESC
            LIMIT 100
        `, [date || new Date().toISOString().split('T')[0]]);
        
        return rows;
    },
    
    async getHistory(days) {
        const [rows] = await mysqlPool.execute(`
            SELECT * FROM contents 
            WHERE fetch_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
            ORDER BY fetch_time DESC
        `, [days || 7]);
        
        return rows;
    },
    
    async search(query, limit) {
        const [rows] = await mysqlPool.execute(`
            SELECT * FROM contents 
            WHERE title LIKE ? OR summary LIKE ?
            ORDER BY final_score DESC
            LIMIT ?
        `, [`%${query}%`, `%${query}%`, limit || 50]);
        
        return rows;
    }
};

// ── 统一接口 ───────────────────────────────────────────
let storage = null;

async function initStorage() {
    if (storage) return storage;
    
    if (STORAGE_TYPE === 'mysql') {
        storage = MySqlStorage;
    } else {
        storage = JsonStorage;
    }
    
    await storage.init();
    return storage;
}

async function saveContent(item) {
    const s = await initStorage();
    return s.saveContent(item);
}

async function saveFeatured(items) {
    const s = await initStorage();
    return s.saveFeatured(items);
}

async function getFeatured(date) {
    const s = await initStorage();
    return s.getFeatured(date);
}

async function getHistory(days) {
    const s = await initStorage();
    return s.getHistory(days);
}

async function search(query, limit) {
    const s = await initStorage();
    return s.search(query, limit);
}

// ── 导出 ───────────────────────────────────────────────
module.exports = {
    initStorage,
    saveContent,
    saveFeatured,
    getFeatured,
    getHistory,
    search,
    JsonStorage,
    MySqlStorage
};
