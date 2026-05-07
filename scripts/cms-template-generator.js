#!/usr/bin/env node

/**
 * CMS 模板生成器 - 根据栏目信息自动生成首页/列表页/详情页模板
 *
 * 用法：
 *   node cms-template-generator.js --typeid 21215
 *   node cms-template-generator.js --typeid 21215 --all
 *   node cms-template-generator.js --from-sql D:\scsaicms\lvbo_type.sql --typeid 21215
 *   node cms-template-generator.js --typename "技术观察"
 *   node cms-template-generator.js --typeid 21215 --output-dir D:\scsaicms\Web\Tpl\huatian
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// 加载环境变量
const { loadEnv } = require('./env-loader.cjs');
loadEnv();

// ── 配置 ────────────────────────────────────────────────
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
const DEFAULT_OUTPUT_DIR = 'D:\\scsaicms\\Web\\Tpl\\huatian';

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

// ── HTTP POST（自动判断 HTTP/HTTPS）────────────────────
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

// ── 从数据库读取栏目信息 ─────────────────────────────────
async function loadTypeFromDB(typeid) {
    let mysql2;
    try { mysql2 = require('mysql2'); } catch { return null; }

    const conn = mysql2.createConnection(dbConfig);
    try {
        const [rows] = await conn.promise().query(
            'SELECT * FROM lvbo_type WHERE typeid = ?', [typeid]
        );
        if (rows.length > 0) return rows[0];

        // 如果指定了 --all，查找子栏目
        const [children] = await conn.promise().query(
            'SELECT * FROM lvbo_type WHERE fid = ? ORDER BY drank', [typeid]
        );
        return children;
    } finally {
        conn.end();
    }
}

async function loadAllTypesFromDB() {
    let mysql2;
    try { mysql2 = require('mysql2'); } catch { return null; }

    const conn = mysql2.createConnection(dbConfig);
    try {
        const [rows] = await conn.promise().query(
            'SELECT * FROM lvbo_type ORDER BY typeid'
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
            current = '';
        } else if (ch === ' ' && !inQuote) {
            // skip
        } else if (inQuote) {
            current += ch;
        } else {
            current += ch;
        }
        i++;
    }
    return values;
}

// ── 从 SQL 文件解析栏目 ─────────────────────────────────
function loadTypeFromSQL(sqlPath, typeid) {
    if (!fs.existsSync(sqlPath)) return null;
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const types = [];
    const regex = /INSERT INTO `lvbo_type` VALUES \((.+)\);/g;
    let match;
    while ((match = regex.exec(sql)) !== null) {
        const valuesStr = match[1];
        const vals = parseSqlValues(valuesStr);
        if (vals.length >= 25) {
            const t = {
                typeid: vals[0],
                typename: vals[1],
                typename_en: vals[2],
                isindex: parseInt(vals[3]) || 1,
                keywords: vals[5],
                keywords_en: vals[6],
                description: vals[7],
                description_en: vals[8],
                ismenu: parseInt(vals[9]) || 1,
                indexnum: parseInt(vals[10]) || 10,
                pernum: parseInt(vals[11]) || 15,
                islink: parseInt(vals[12]) || 0,
                url: vals[13],
                isuser: parseInt(vals[14]) || 1,
                target: parseInt(vals[15]) || 1,
                readme: vals[16],
                drank: parseInt(vals[17]) || 10,
                irank: parseInt(vals[18]) || 10,
                fid: parseInt(vals[19]) || 0,
                path: vals[20],
                show_fields: vals[21],
                list_path: vals[22] || 'list/list_default.html',
                page_path: vals[23] || 'page/page_default.html',
                icon: vals[24],
                showurl: vals[25] || ''
            };
            types.push(t);
        }
    }

    // 查找目标栏目
    const target = types.find(t => String(t.typeid) === String(typeid));
    if (!target) return null;

    // 查找子栏目
    const children = types.filter(t => String(t.fid) === String(typeid));
    const parent = types.find(t => String(t.typeid) === String(target.fid));

    return { target, children, parent, allTypes: types };
}

// ── AI 生成模板差异化内容 ───────────────────────────────
async function aiGenerateTemplateContent(typeInfo) {
    const { target, children, parent } = typeInfo;

    const prompt = `你是 CMS 模板设计专家。请根据栏目信息生成模板的差异化内容区块。

## 栏目信息
- 名称：${target.typename} (${target.typename_en})
- 关键词：${target.keywords}
- 描述：${target.description}
- 父栏目：${parent ? parent.typename : '无（顶级栏目）'}
- 子栏目：${children.map(c => c.typename).join(', ') || '无'}

## 输出要求（JSON 格式）
{
  "banner_title": "Banner 标题文字",
  "banner_subtitle": "Banner 副标题/描述",
  "section_blocks": [
    {
      "title": "区块标题",
      "style": "grid|cards|timeline|features",  // 布局风格
      "description": "区块描述"
    }
  ],
  "feature_points": [
    {"icon": "图标类名(如fa-robot)", "title": "特点1", "desc": "描述1"}
  ],
  "meta_description": "页面 meta description",
  "page_title": "页面 title"
}

只输出 JSON，不要 markdown 代码块。`;

    console.log('🤖 调用 AI 生成模板内容...');

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
            { role: 'system', content: '你是 CMS 模板设计专家，只输出纯 JSON。' },
            { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
    }, {
        'Authorization': `Bearer ${apiKey}`
    });

    if (!response.choices || !response.choices[0]) {
        throw new Error('AI 返回格式错误');
    }

    let content = response.choices[0].message.content.trim();
    content = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    // 提取 JSON 对象
    const objStart = content.indexOf('{');
    const objEnd = content.lastIndexOf('}');
    if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
        content = content.substring(objStart, objEnd + 1);
    }

    try {
        return JSON.parse(content);
    } catch (e) {
        console.warn('⚠️  AI 返回解析失败，使用默认模板内容');
        return null;
    }
}

// ── 生成首页模板 ────────────────────────────────────────
function generateIndexTemplate(typeInfo, aiContent, enName) {
    const { target, children } = typeInfo;
    const bannerTitle = aiContent?.banner_title || target.typename;
    const bannerSubtitle = aiContent?.banner_subtitle || target.description || `探索${target.typename}的无限可能`;

    // 生成各子栏目的内容区块
    const sectionBlocks = children.length > 0
        ? children.map(child => `
        <!-- ${child.typename} -->
        <div class="container he_common">
            <div class="he_title1 wow fadeInUp">
                <h2>${child.typename}</h2>
                <p>${child.description || ''}</p>
                <a href="{$Think.CONFIG.site_url}/{$Think.CONFIG.site_dir}${child.typeid}/lists.html" class="he_more">查看更多 &gt;</a>
            </div>
            <div class="he_list clearfix">
                <articlelist typeid="${child.typeid}" limit="4" id="vo">
                <div class="he_listli wow fadeInUp" data-wow-delay="0.1s">
                    <a href="{$vo.id|url=show,###}">
                        <div class="he_listimg">
                            <img src="{$vo.thumb}" alt="{$vo.title}">
                        </div>
                        <div class="he_listtext">
                            <h3>{$vo.title}</h3>
                            <p>{$vo.description}</p>
                            <span class="he_date">{$vo.createtime|date='Y-m-d'}</span>
                        </div>
                    </a>
                </div>
                </articlelist>
            </div>
        </div>`).join('\n')
        : `
        <!-- 文章列表 -->
        <div class="container he_common">
            <div class="he_title1 wow fadeInUp">
                <h2>${target.typename}</h2>
            </div>
            <div class="he_list clearfix">
                <articlelist typeid="${target.typeid}" limit="8" id="vo">
                <div class="he_listli wow fadeInUp" data-wow-delay="0.1s">
                    <a href="{$vo.id|url=show,###}">
                        <div class="he_listimg">
                            <img src="{$vo.thumb}" alt="{$vo.title}">
                        </div>
                        <div class="he_listtext">
                            <h3>{$vo.title}</h3>
                            <p>{$vo.description}</p>
                            <span class="he_date">{$vo.createtime|date='Y-m-d'}</span>
                        </div>
                    </a>
                </div>
                </articlelist>
            </div>
        </div>`;

    return `<include file="./head_huatian"/>

 <!-- banner -->
 <div class="he_banner he_banner1">
    <div class="he_bannigul">
        <div class="he_bannigli">
            <div class="he_banig">
                <img src="__TMPL__images/banner01.png" alt="${target.typename}" class="he_banpc">
                <img src="__TMPL__images/banner02.jpg" alt="${target.typename}" class="he_banph">
            </div>
            <div class="he_bante he_common">
                <div class="he_bantepy">
                    <div class="he_bantep2t">
                        <h1><p>${bannerTitle}</p></h1>
                    </div>
                    <div class="he_bantep3v">
                        <p>${bannerSubtitle}</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
 <!-- banner end -->
${sectionBlocks}

<include file="./footer_huatian"/>`;
}

// ── 生成列表页模板 ──────────────────────────────────────
function generateListTemplate(typeInfo, aiContent, enName) {
    const { target, children, parent } = typeInfo;
    const bannerTitle = aiContent?.banner_title || target.typename;
    const bannerSubtitle = aiContent?.banner_subtitle || target.description || '';

    // 确定父栏目 ID（用于左侧导航）
    const navFid = parent ? parent.typeid : (target.fid || target.typeid);
    const navPid = parent ? (parent.fid === 0 ? parent.typeid : parent.fid) : target.typeid;

    return `<include file="./head_ps"/>

 <!-- banner -->
 <div class="he_banner he_banner1">
    <div class="he_bannigul">
        <div class="he_bannigli">
            <div class="he_banig">
                <img src="__TMPL__images/newsBanner.jpg" alt="${target.typename}" class="he_banpc">
                <img src="__TMPL__images/newsBanner_ph.jpg" alt="${target.typename}" class="he_banph">
            </div>
            <div class="he_bante he_common">
                <div class="he_bantepy">
                    <div class="he_bantep2t">
                        <h1><p>${bannerTitle}</p></h1>
                    </div>
                    <div class="he_bantep3v">
                        <p>${bannerSubtitle}</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
 <!-- banner end -->

 <!-- 内容区 -->
 <div class="he_content">
    <div class="container clearfix">

        <!-- 左侧导航 -->
        <div class="pz_SideLayerNews fl">
            <php>
                $fid=get_field('type','typeid='.$type[typeid],'fid');
                if($fid==0){
                    $pid=$type[typeid];
                    $pname=$type[typename];
                } else {
                    $pid=$fid;
                    $pname=get_field('type','typeid='.$pid,'typename');
                }
            </php>

            <category parentid="$pid" id="vo">
            <li class="l1 <php>if($type['typeid'] == $vo['typeid']){</php>  on <php>}</php>">
                <a href='{$vo.typeid|url=lists,###}'>{$vo.typename}</a>
                <php>{</php>
                    <ul>
                        <category parentid="$vo[typeid]" id="voo">
                        <li><span class="file <php>if($type['typeid'] == $voo['typeid']){</php>  active <php>}</php>">
                            <a href='{$voo.typeid|url=lists,###}'>{$voo.typename}</a>
                        </span></li>
                        </category>
                    </ul>
                <php>}</php>
            </li>
            </category>
        </div>
        <!-- 左侧导航 end -->

        <!-- 右侧内容 -->
        <div class="pz_SideLayerMain fr">
            <div class="he_list clearfix">
                <articlelist typeid="$type.typeid" limit="{$type.pernum}" page="page" id="vo">
                <div class="he_listli wow fadeInUp" data-wow-delay="0.1s">
                    <a href="{$vo.id|url=show,###}">
                        <div class="he_listimg">
                            <img src="{$vo.thumb}" alt="{$vo.title}">
                        </div>
                        <div class="he_listtext">
                            <h3>{$vo.title}</h3>
                            <p>{$vo.description}</p>
                            <span class="he_date">{$vo.createtime|date='Y-m-d'}</span>
                        </div>
                    </a>
                </div>
                </articlelist>
            </div>

            <!-- 分页 -->
            <div class="he_page">{$page}</div>
        </div>
        <!-- 右侧内容 end -->

    </div>
</div>

<include file="./footer"/>`;
}

// ── 生成详情页模板 ──────────────────────────────────────
function generateDetailTemplate(typeInfo, aiContent, enName) {
    const { target, parent } = typeInfo;
    const pageTitle = aiContent?.page_title || target.typename;

    const navPid = parent ? (parent.fid === 0 ? parent.typeid : parent.fid) : target.typeid;

    return `<include file="./head"/>

 <!-- 内容区 -->
 <div class="he_content">
    <div class="container clearfix">

        <!-- 左侧导航 -->
        <div class="pz_SideLayerNews fl">
            <php>
                $fid=get_field('type','typeid='.$type[typeid],'fid');
                if($fid==0){
                    $pid=$type[typeid];
                    $pname=$type[typename];
                } else {
                    $pid=$fid;
                    $pname=get_field('type','typeid='.$pid,'typename');
                }
            </php>

            <category parentid="$pid" id="vo">
            <li class="l1 <php>if($type['typeid'] == $vo['typeid']){</php>  on <php>}</php>">
                <a href='{$vo.typeid|url=lists,###}'>{$vo.typename}</a>
                <php>{</php>
                    <ul>
                        <category parentid="$vo[typeid]" id="voo">
                        <li><span class="file <php>if($type['typeid'] == $voo['typeid']){</php>  active <php>}</php>">
                            <a href='{$voo.typeid|url=lists,###}'>{$voo.typename}</a>
                        </span></li>
                        </category>
                    </ul>
                <php>}</php>
            </li>
            </category>
        </div>
        <!-- 左侧导航 end -->

        <!-- 右侧内容 -->
        <div class="pz_SideLayerMain fr">
            <div class="he_detail">
                <h1 class="he_detail_title">{$info.title}</h1>
                <div class="he_detail_meta">
                    <span class="he_date">{$info.createtime|date='Y-m-d H:i'}</span>
                    <span class="he_author">{$info.author}</span>
                    <span class="he_views">阅读 {$info.views}</span>
                </div>
                <div class="he_detail_content">
                    {$info.content}
                </div>

                <!-- 上下篇 -->
                <div class="he_detail_nav clearfix">
                    <div class="he_detail_prev fl">
                        <span>上一篇：</span>
                        <previd id="$info.id" typeid="$type.typeid">
                            <a href="{$pre.id|url=show,###}">{$pre.title}</a>
                        </previd>
                        <span>没有更早的文章了</span>
                    </div>
                    <div class="he_detail_next fr">
                        <span>下一篇：</span>
                        <nextid id="$info.id" typeid="$type.typeid">
                            <a href="{$nex.id|url=show,###}">{$nex.title}</a>
                        </nextid>
                        <span>没有更新的文章了</span>
                    </div>
                </div>
            </div>
        </div>
        <!-- 右侧内容 end -->

    </div>
</div>

<include file="./footer"/>`;
}

// ── 写入模板文件 ────────────────────────────────────────
function writeTemplateFiles(outputDir, enName, indexHtml, listHtml, pageHtml) {
    const results = [];

    // 列表页
    const listDir = path.join(outputDir, 'list');
    if (!fs.existsSync(listDir)) fs.mkdirSync(listDir, { recursive: true });
    const listPath = path.join(listDir, `list_${enName}.html`);
    fs.writeFileSync(listPath, listHtml, 'utf8');
    results.push({ type: '列表页', path: listPath, template: `list/list_${enName}.html` });

    // 详情页
    const pageDir = path.join(outputDir, 'page');
    if (!fs.existsSync(pageDir)) fs.mkdirSync(pageDir, { recursive: true });
    const pagePath = path.join(pageDir, `page_${enName}.html`);
    fs.writeFileSync(pagePath, pageHtml, 'utf8');
    results.push({ type: '详情页', path: pagePath, template: `page/page_${enName}.html` });

    // 首页（可选，仅一级栏目生成）
    if (indexHtml) {
        const indexPath = path.join(outputDir, `index_${enName}.html`);
        fs.writeFileSync(indexPath, indexHtml, 'utf8');
        results.push({ type: '首页', path: indexPath, template: `index_${enName}.html` });
    }

    return results;
}

// ── 更新数据库中的模板路径 ───────────────────────────────
async function updateTypeTemplatePath(typeid, listPath, pagePath) {
    let mysql2;
    try { mysql2 = require('mysql2'); } catch {
        console.warn('⚠️  mysql2 未安装，无法更新数据库模板路径');
        return false;
    }

    const conn = mysql2.createConnection(dbConfig);
    try {
        await conn.promise().query(
            'UPDATE lvbo_type SET list_path = ?, page_path = ? WHERE typeid = ?',
            [listPath, pagePath, typeid]
        );
        console.log(`   ✅ 已更新 typeid=${typeid} 的模板路径`);
        return true;
    } finally {
        conn.end();
    }
}

// ── 主流程 ──────────────────────────────────────────────
async function main() {
    console.log('\n🎨 CMS 模板生成器 v1.0\n');

    const params = parseArgs();
    const outputDir = params['output-dir'] || DEFAULT_OUTPUT_DIR;

    if (!params.typeid && !params.typename) {
        console.log('用法:');
        console.log('  node cms-template-generator.js --typeid 21215');
        console.log('  node cms-template-generator.js --typeid 21215 --all');
        console.log('  node cms-template-generator.js --typename "技术观察"');
        console.log('  node cms-template-generator.js --from-sql D:\\scsaicms\\lvbo_type.sql --typeid 21215');
        return;
    }

    // 加载栏目信息
    let typeInfo;
    if (params['from-sql']) {
        console.log('📄 从 SQL 文件加载栏目...');
        typeInfo = loadTypeFromSQL(params['from-sql'], params.typeid);
    } else {
        console.log('📦 从数据库加载栏目...');
        const dbTypes = await loadAllTypesFromDB();
        if (dbTypes) {
            const target = dbTypes.find(t => {
                if (params.typeid) return String(t.typeid) === String(params.typeid);
                if (params.typename) return t.typename === params.typename;
                return false;
            });
            if (target) {
                const children = dbTypes.filter(t => String(t.fid) === String(target.typeid));
                const parent = dbTypes.find(t => String(t.typeid) === String(target.fid));
                typeInfo = { target, children, parent, allTypes: dbTypes };
            }
        } else {
            // 降级
            const defaultSql = path.join('D:\\scsaicms', 'lvbo_type.sql');
            if (fs.existsSync(defaultSql)) {
                console.log('   📄 降级从 SQL 文件加载');
                typeInfo = loadTypeFromSQL(defaultSql, params.typeid);
            }
        }
    }

    if (!typeInfo || !typeInfo.target) {
        console.error('❌ 找不到指定栏目');
        return;
    }

    const { target, children, parent } = typeInfo;
    console.log(`\n📁 目标栏目: ${target.typename} (ID:${target.typeid})`);
    console.log(`   英文名: ${target.typename_en}`);
    console.log(`   关键词: ${target.keywords}`);
    console.log(`   子栏目: ${children.map(c => c.typename).join(', ') || '无'}`);
    console.log(`   输出目录: ${outputDir}`);

    // AI 生成差异化内容
    let aiContent = null;
    try {
        aiContent = await aiGenerateTemplateContent(typeInfo);
        if (aiContent) console.log('✅ AI 内容生成成功');
    } catch (e) {
        console.warn('⚠️  AI 生成失败，使用默认内容:', e.message);
    }

    // 英文名用于文件名
    const enName = (target.typename_en || target.typename)
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        || `type_${target.typeid}`;

    console.log(`   模板文件名: list_${enName}.html / page_${enName}.html`);

    // 生成三个模板
    const isTopLevel = target.fid === 0 || target.fid === '0';
    const indexHtml = isTopLevel ? generateIndexTemplate(typeInfo, aiContent, enName) : null;
    const listHtml = generateListTemplate(typeInfo, aiContent, enName);
    const pageHtml = generateDetailTemplate(typeInfo, aiContent, enName);

    // 写入文件
    console.log('\n📝 生成模板文件...');
    const results = writeTemplateFiles(outputDir, enName, indexHtml, listHtml, pageHtml);

    for (const r of results) {
        console.log(`   ✅ ${r.type}: ${r.path}`);
    }

    // 更新数据库模板路径
    const listTemplate = `list/list_${enName}.html`;
    const pageTemplate = `page/page_${enName}.html`;

    if (!params['dry-run']) {
        console.log('\n💾 更新数据库模板路径...');
        await updateTypeTemplatePath(target.typeid, listTemplate, pageTemplate);

        // 如果 --all，也为子栏目生成模板
        if (params.all && children.length > 0) {
            console.log(`\n🔄 为 ${children.length} 个子栏目生成模板...`);
            for (const child of children) {
                const childEnName = (child.typename_en || child.typename)
                    .toLowerCase()
                    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '_')
                    .replace(/_+/g, '_')
                    .replace(/^_|_$/g, '')
                    || `type_${child.typeid}`;

                const childTypeInfo = {
                    target: child,
                    children: (typeInfo.allTypes || []).filter(t => String(t.fid) === String(child.typeid)),
                    parent: target,
                    allTypes: typeInfo.allTypes || []
                };

                const childListHtml = generateListTemplate(childTypeInfo, null, childEnName);
                const childPageHtml = generateDetailTemplate(childTypeInfo, null, childEnName);

                const childResults = writeTemplateFiles(outputDir, childEnName, null, childListHtml, childPageHtml);
                for (const r of childResults) {
                    console.log(`   ✅ ${child.typename} ${r.type}: ${r.path}`);
                }

                await updateTypeTemplatePath(
                    child.typeid,
                    `list/list_${childEnName}.html`,
                    `page/page_${childEnName}.html`
                );
            }
        }
    } else {
        console.log('\n🔍 [DRY-RUN] 仅预览，未写入文件和数据库');
    }

    console.log('\n✅ 模板生成完成!');
    console.log(`\n💡 提示：`);
    console.log(`   - 列表页模板: ${listTemplate}`);
    console.log(`   - 详情页模板: ${pageTemplate}`);
    if (isTopLevel) {
        console.log(`   - 首页模板: index_${enName}.html`);
    }
    console.log(`   - 访问路径: http://你的域名/${target.typeid}/lists.html`);
}

main().catch(e => {
    console.error('❌ 错误:', e.message);
    process.exit(1);
});
