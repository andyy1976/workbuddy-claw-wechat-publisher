#!/usr/bin/env node

/**
 * CMS 栏目生成器 - 根据关键词自动生成 lvbo_type 栏目结构
 *
 * 用法：
 *   node cms-column-generator.js --keywords "AI,机器人,5G" --name "技术观察"
 *   node cms-column-generator.js --from-config
 *   node cms-column-generator.js --keywords "AI,机器人" --name "技术观察" --write-db
 *   node cms-column-generator.js --keywords "AI" --name "测试" --dry-run
 *   node cms-column-generator.js --from-sql D:\scsaicms\lvbo_type.sql --keywords "AI"
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// 加载环境变量
const { loadEnv } = require('./env-loader.cjs');
loadEnv();

// ── 数据库配置 ──────────────────────────────────────────
const configPath = path.join(__dirname, '..', 'config', 'user-config.json');
let config;
try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
    console.error('❌ 找不到配置文件:', configPath);
    process.exit(1);
}

const dbConfig = {
    host: config.database?.host || process.env.DB_HOST || 'localhost',
    port: parseInt(config.database?.port || process.env.DB_PORT || 3306),
    database: config.database?.database || process.env.DB_NAME || 'eastaiai',
    user: config.database?.user || process.env.DB_USER || 'root',
    password: config.database?.password || process.env.DB_PASSWORD || '',
    charset: config.database?.charset || 'utf8mb4'
};

const aiConfig = config.ai || {};

// ── 解析命令行参数 ──────────────────────────────────────
function parseArgs() {
    const args = process.argv.slice(2);
    const params = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].substring(2);
            if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
                params[key] = args[i + 1];
                i++;
            } else {
                params[key] = true;
            }
        }
    }
    return params;
}

// ── HTTP POST（调用 AI API，自动判断 HTTP/HTTPS）──────────────────
function httpPost(url, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const u = new URL(url);
        const isHttps = u.protocol === 'https:';
        const requester = isHttps ? https : http;
        const req = requester.request({
            hostname: u.hostname,
            port: u.port || (isHttps ? 443 : 80),
            path: u.pathname + u.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                ...headers
            }
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try { resolve(JSON.parse(d)); } catch { resolve(d); }
            });
        });
        req.on('error', reject);
        req.setTimeout(120000, () => { req.destroy(); reject(new Error('AI 请求超时')); });
        req.write(data);
        req.end();
    });
}

// ── 从数据库读取现有栏目 ─────────────────────────────────
async function loadExistingTypesFromDB() {
    let mysql2;
    try { mysql2 = require('mysql2'); } catch { return null; }

    const conn = mysql2.createConnection(dbConfig);
    try {
        const [rows] = await conn.promise().query(
            'SELECT typeid, typename, typename_en, fid, path, keywords, description FROM lvbo_type ORDER BY typeid'
        );
        return rows;
    } finally {
        conn.end();
    }
}

// ── 解析 SQL VALUES 子句 ────────────────────────────────
function parseSqlValues(str) {
    const values = [];
    let current = '';
    let inQuote = false;
    let i = 0;
    while (i < str.length) {
        const ch = str[i];
        if (ch === "'" && !inQuote) {
            inQuote = true;
            current = '';
        } else if (ch === "'" && inQuote) {
            if (i + 1 < str.length && str[i + 1] === "'") {
                current += "'";
                i++;
            } else if (i + 1 < str.length && str[i + 1] === "\\") {
                current += "'";
                i += 2;
            } else {
                inQuote = false;
                values.push(current);
                current = '';
            }
        } else if (ch === ',' && !inQuote) {
            if (current !== '' || values.length === 0) {
                // skip empty between commas when not in quote
            }
            current = '';
        } else if (ch === ' ' && !inQuote) {
            // skip spaces outside quotes
        } else if (inQuote) {
            current += ch;
        } else {
            current += ch;
        }
        i++;
    }
    return values;
}

// ── 从 SQL 文件解析现有栏目 ──────────────────────────────
function loadExistingTypesFromSQL(sqlPath) {
    if (!fs.existsSync(sqlPath)) {
        console.error('❌ SQL 文件不存在:', sqlPath);
        return [];
    }
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const types = [];
    const regex = /INSERT INTO `lvbo_type` VALUES \((.+)\);/g;
    let match;
    while ((match = regex.exec(sql)) !== null) {
        const valuesStr = match[1];
        const values = parseSqlValues(valuesStr);
        if (values.length >= 25) {
            types.push({
                typeid: values[0],
                typename: values[1],
                typename_en: values[2],
                fid: values[19],
                path: values[20],
                keywords: values[5],
                description: values[7]
            });
        }
    }
    return types;
}

// ── 计算下一个可用 typeid ────────────────────────────────
function getNextTypeId(existingTypes, parentId) {
    const parentStr = String(parentId);
    let maxSuffix = 0;

    for (const t of existingTypes) {
        const tid = String(t.typeid);
        if (parentId === 0) {
            // 一级栏目：取最大的一级 ID
            if (tid.length <= 2) {
                const num = parseInt(tid);
                if (num > maxSuffix) maxSuffix = num;
            }
        } else {
            // 子栏目：以 parentId 开头的
            if (tid.startsWith(parentStr) && tid.length > parentStr.length) {
                const suffix = parseInt(tid.substring(parentStr.length));
                if (suffix > maxSuffix) maxSuffix = suffix;
            }
        }
    }

    if (parentId === 0) {
        return maxSuffix + 1;
    } else {
        return parseInt(parentStr + (maxSuffix + 1));
    }
}

// ── 生成层级路径 ─────────────────────────────────────────
function buildPath(existingTypes, parentId, newTypeId) {
    if (parentId === 0) return `0-${newTypeId}`;
    const parent = existingTypes.find(t => String(t.typeid) === String(parentId));
    if (parent && parent.path) {
        return `${parent.path}-${newTypeId}`;
    }
    return `0-${newTypeId}`;
}

// ── 调用 AI 生成栏目结构 ─────────────────────────────────
async function aiGenerateColumns(keywords, name, existingTypes) {
    const existingTree = buildTypeTree(existingTypes);

    const prompt = `你是一个 CMS 栏目规划专家。请根据用户提供的关键词和栏目名称，设计一个合理的栏目层级结构。

## 现有栏目结构
${existingTree}

## 用户需求
- 栏目名称：${name}
- 关键词：${keywords}

## 输出要求
请生成一个 JSON 数组，每个元素代表一个栏目，格式如下：
[
  {
    "typename": "中文名",
    "typename_en": "英文名(拼音或英文，用于URL，不含空格)",
    "level": 1,  // 1=一级栏目, 2=二级, 3=三级
    "parent_name": "",  // 父栏目中文名，一级栏目留空
    "keywords": "关键词1,关键词2",
    "keywords_en": "keyword1,keyword2",
    "description": "中文描述（简短，50字以内）",
    "description_en": "English description",
    "indexnum": 10,  // 首页显示条数
    "pernum": 15  // 每页条数
  }
]

## 规则
1. 一般生成 1 个一级栏目 + 3-6 个二级栏目，二级下可选 2-4 个三级栏目
2. 栏目划分要符合内容分类逻辑，避免层级太深（最多3级）
3. keywords 要包含用户原始关键词 + 该栏目特定关键词
4. typename_en 要简洁，用小写字母和下划线
5. description 要体现该栏目的内容定位和价值
6. 只输出 JSON 数组，不要输出其他内容`;

    console.log('\n🤖 调用 AI 生成栏目结构...');

    // 优先使用 QClaw 本地代理，降级使用 DeepSeek
    let baseUrl, apiKey, model;
    const qclawUrl = process.env.QCLAW_LLM_BASE_URL;
    const qclawKey = process.env.QCLAW_LLM_API_KEY;

    if (qclawUrl && qclawKey) {
        baseUrl = qclawUrl;
        apiKey = qclawKey;
        model = 'modelroute';
        console.log('   🔄 使用 QClaw 本地代理');
    } else {
        apiKey = aiConfig.apiKey || process.env.AI_API_KEY;
        baseUrl = aiConfig.baseUrl || process.env.AI_BASE_URL || 'https://api.deepseek.com';
        model = aiConfig.model || process.env.AI_MODEL || 'deepseek-chat';
        console.log('   🔄 使用 DeepSeek API');
    }

    const response = await httpPost(`${baseUrl}/chat/completions`, {
        model,
        messages: [
            { role: 'system', content: '你是一个 CMS 栏目规划专家，只输出纯 JSON，不要 markdown 代码块。' },
            { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 4000
    }, {
        'Authorization': `Bearer ${apiKey}`
    });

    if (!response.choices || !response.choices[0]) {
        throw new Error('AI 返回格式错误: ' + JSON.stringify(response));
    }

    let content = response.choices[0].message.content.trim();
    // 去掉可能的 markdown 代码块标记
    content = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    // 提取 JSON 数组（从 [ 到 ] 的内容）
    const arrStart = content.indexOf('[');
    const arrEnd = content.lastIndexOf(']');
    if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
        content = content.substring(arrStart, arrEnd + 1);
    }

    try {
        return JSON.parse(content);
    } catch (e) {
        console.error('❌ AI 返回的 JSON 解析失败:');
        console.error(content.substring(0, 500));
        throw new Error('AI 返回格式解析失败');
    }
}

// ── 构建栏目树描述 ───────────────────────────────────────
function buildTypeTree(types) {
    const lines = [];
    const roots = types.filter(t => String(t.fid) === '0' || t.fid === 0);
    for (const root of roots) {
        lines.push(`- ${root.typename} (ID:${root.typeid}, 关键词:${root.keywords || '无'})`);
        const children = types.filter(t => String(t.fid) === String(root.typeid));
        for (const child of children) {
            lines.push(`  - ${child.typename} (ID:${child.typeid})`);
            const grandChildren = types.filter(t => String(t.fid) === String(child.typeid));
            for (const gc of grandChildren) {
                lines.push(`    - ${gc.typename} (ID:${gc.typeid})`);
            }
        }
    }
    return lines.join('\n');
}

// ── 生成 INSERT SQL ──────────────────────────────────────
function generateInsertSQL(columns, existingTypes) {
    const sqls = [];
    const newTypes = []; // 新增的栏目，用于后续引用

    // 先建立 typename -> typeid 的映射
    const nameToId = {};
    for (const t of existingTypes) {
        nameToId[t.typename] = t.typeid;
    }

    for (const col of columns) {
        // 确定 fid 和 typeid
        let fid, typeid, parentPath;

        if (col.level === 1) {
            fid = 0;
            typeid = getNextTypeId([...existingTypes, ...newTypes], 0);
            parentPath = '0';
        } else {
            const parentId = nameToId[col.parent_name];
            if (!parentId) {
                console.warn(`⚠️  找不到父栏目 "${col.parent_name}"，跳过 "${col.typename}"`);
                continue;
            }
            fid = parseInt(String(parentId));
            typeid = getNextTypeId([...existingTypes, ...newTypes], fid);
            parentPath = buildPath([...existingTypes, ...newTypes], fid, typeid)
                .replace(`-${typeid}`, '');
        }

        const path = fid === 0 ? `0-${typeid}` : `${parentPath}-${typeid}`;
        const showFields = '1|1|1|1|1|1|1|1|1|1|1|1|1|1|1|0';

        const record = {
            typeid,
            typename: col.typename,
            typename_en: col.typename_en || '',
            isindex: 1,
            keywords: (col.keywords || '').substring(0, 40),
            keywords_en: col.keywords_en || '',
            description: (col.description || '').substring(0, 255),
            description_en: (col.description_en || '').substring(0, 255),
            ismenu: 1,
            indexnum: col.indexnum || 10,
            pernum: col.pernum || 15,
            islink: 0,
            url: '',
            isuser: col.level === 1 ? 1 : 0,
            target: 1,
            readme: '',
            drank: 10,
            irank: 10,
            fid,
            path,
            show_fields: showFields,
            list_path: 'list/list_default.html',
            page_path: 'page/page_default.html',
            icon: '/Public/Uploads/uploadfile/images/default.png',
            showurl: ''
        };

        // 注册到映射中
        nameToId[col.typename] = typeid;
        newTypes.push(record);

        // 生成 SQL
        const values = [
            record.typeid, escapeSql(record.typename), escapeSql(record.typename_en),
            record.isindex, escapeSql(record.keywords), escapeSql(record.keywords_en),
            escapeSql(record.description), escapeSql(record.description_en),
            record.ismenu, record.indexnum, record.pernum, record.islink,
            escapeSql(record.url), record.isuser, record.target, escapeSql(record.readme),
            record.drank, record.irank, record.fid, escapeSql(record.path),
            record.show_fields ? `'${record.show_fields}'` : 'NULL',
            escapeSql(record.list_path), escapeSql(record.page_path),
            escapeSql(record.icon), escapeSql(record.showurl)
        ].join(', ');

        sqls.push(`INSERT INTO \`lvbo_type\` VALUES (${values});`);
    }

    return { sqls, newTypes };
}

function escapeSql(str) {
    if (str === null || str === undefined) return "''";
    return "'" + String(str).replace(/'/g, "\\'") + "'";
}

// ── 写入数据库 ──────────────────────────────────────────
async function writeToDatabase(sqls) {
    let mysql2;
    try { mysql2 = require('mysql2'); } catch {
        console.error('❌ mysql2 未安装，无法写入数据库');
        return false;
    }

    const conn = mysql2.createConnection(dbConfig);
    try {
        await conn.promise().connect();
        console.log('✅ 数据库连接成功');

        for (const sql of sqls) {
            try {
                await conn.promise().query(sql);
                console.log('   ✅', sql.substring(0, 80) + '...');
            } catch (e) {
                console.error('   ❌', e.message);
                console.error('      SQL:', sql);
            }
        }
        return true;
    } finally {
        conn.end();
    }
}

// ── 主流程 ──────────────────────────────────────────────
async function main() {
    console.log('\n🏗️  CMS 栏目生成器 v1.0\n');

    const params = parseArgs();
    let keywords, name;

    if (params['from-config']) {
        keywords = [...(config.keywords?.primary || []), ...(config.keywords?.secondary || [])].join(',');
        name = '技术观察';
        console.log('📋 从配置文件读取关键词:', keywords);
    } else if (params.keywords) {
        keywords = params.keywords;
        name = params.name || '新栏目';
    } else {
        console.log('用法:');
        console.log('  node cms-column-generator.js --keywords "AI,机器人,5G" --name "技术观察"');
        console.log('  node cms-column-generator.js --from-config');
        console.log('  node cms-column-generator.js --keywords "AI,机器人" --name "技术观察" --write-db');
        console.log('  node cms-column-generator.js --keywords "AI" --name "测试" --dry-run');
        console.log('  node cms-column-generator.js --from-sql D:\\scsaicms\\lvbo_type.sql --keywords "AI"');
        return;
    }

    // 加载现有栏目
    let existingTypes = [];
    if (params['from-sql']) {
        console.log('📄 从 SQL 文件加载栏目...');
        existingTypes = loadExistingTypesFromSQL(params['from-sql']);
    } else {
        console.log('📦 从数据库加载栏目...');
        const dbTypes = await loadExistingTypesFromDB();
        if (dbTypes) {
            existingTypes = dbTypes;
        } else {
            // 降级：尝试从默认 SQL 文件
            const defaultSql = path.join('D:\\scsaicms', 'lvbo_type.sql');
            if (fs.existsSync(defaultSql)) {
                console.log('   📄 降级从 SQL 文件加载');
                existingTypes = loadExistingTypesFromSQL(defaultSql);
            }
        }
    }
    console.log(`   ✅ 已加载 ${existingTypes.length} 个现有栏目`);

    // AI 生成栏目结构
    let columns;
    try {
        columns = await aiGenerateColumns(keywords, name, existingTypes);
    } catch (e) {
        console.error('❌ AI 生成失败:', e.message);
        console.log('\n💡 提示：可以使用 --ai-off 参数跳过 AI，手动指定栏目');
        return;
    }

    console.log(`\n📝 AI 生成了 ${columns.length} 个栏目:\n`);
    for (const col of columns) {
        const indent = '  '.repeat(col.level - 1);
        console.log(`${indent}${col.level === 1 ? '📁' : col.level === 2 ? '📂' : '📄'} ${col.typename} (${col.typename_en})`);
        console.log(`${indent}   关键词: ${col.keywords}`);
        console.log(`${indent}   描述: ${col.description}`);
    }

    // 生成 SQL
    const { sqls, newTypes } = generateInsertSQL(columns, existingTypes);

    console.log('\n📋 生成的 SQL 语句:\n');
    console.log('```sql');
    for (const sql of sqls) {
        console.log(sql);
    }
    console.log('```\n');

    // 写入数据库
    if (params['write-db'] && !params['dry-run']) {
        console.log('💾 写入数据库...');
        const ok = await writeToDatabase(sqls);
        if (ok) {
            console.log('\n✅ 栏目已写入数据库!');
            // 输出新栏目 ID 供后续使用
            console.log('\n📊 新增栏目 ID:');
            for (const t of newTypes) {
                console.log(`   ${t.typename} -> typeid: ${t.typeid}, fid: ${t.fid}, path: ${t.path}`);
            }
        }
    } else if (params['dry-run']) {
        console.log('🔍 [DRY-RUN] 仅预览，未写入数据库');
    } else {
        console.log('💡 加 --write-db 参数可直接写入数据库');
    }

    // 保存结果到文件
    const outputPath = path.join(__dirname, '..', 'output', `columns_${Date.now()}.json`);
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify({ columns, newTypes, sqls }, null, 2), 'utf8');
    console.log(`\n💾 结果已保存: ${outputPath}`);
}

main().catch(e => {
    console.error('❌ 错误:', e.message);
    process.exit(1);
});
