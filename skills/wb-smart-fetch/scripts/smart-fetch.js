/**
 * wb-smart-fetch — 企业数据采集引擎 v2.0
 * 定位：不是通用爬虫，而是"企业数据变内容"
 * 三种模式：BOM采集、竞品采集、信源采集
 * 闭环：采集→产品库→对比→内容→发布
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── 方法论引擎（角度评分 + 情绪曲线）────────────────────
let methodologyEngine = null;
try {
  const mePath = path.join(__dirname, '..', 'wb-content-gen', 'scripts', 'methodology-engine.js');
  if (fs.existsSync(mePath)) {
    methodologyEngine = require(mePath);
    console.log('[SmartFetch] 方法论引擎加载成功');
  }
} catch(e) { console.log('[SmartFetch] 方法论引擎加载失败:', e.message); }

// ── 配置 ──────────────────────────────────────────────
const CONFIG_DIR = path.join(__dirname, '..', '..', 'server', 'config');
const DATA_DIR = path.join(__dirname, '..', '..', 'server', 'data', 'smart-fetch-history');
const PRODUCT_DB = path.join(DATA_DIR, 'product-catalog.json');

[CONFIG_DIR, DATA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── 产品库 ─────────────────────────────────────────────

/**
 * 加载产品库
 */
function loadProductCatalog() {
  try {
    if (fs.existsSync(PRODUCT_DB)) {
      return JSON.parse(fs.readFileSync(PRODUCT_DB, 'utf8'));
    }
  } catch (e) {}
  return { products: [], lastUpdated: null };
}

/**
 * 保存产品库
 */
function saveProductCatalog(catalog) {
  catalog.lastUpdated = new Date().toISOString();
  fs.writeFileSync(PRODUCT_DB, JSON.stringify(catalog, null, 2), 'utf8');
}

/**
 * 添加或更新产品
 */
function upsertProduct(product) {
  const catalog = loadProductCatalog();
  const existing = catalog.products.find(p => p.productId === product.productId);
  
  if (existing) {
    // 更新：合并specs和bom
    Object.assign(existing.specs || {}, product.specs || {});
    if (product.bom) existing.bom = product.bom;
    if (product.name) existing.name = product.name;
    if (product.category) existing.category = product.category;
    if (product.contentTags) existing.contentTags = product.contentTags;
    existing.lastUpdated = new Date().toISOString();
  } else {
    // 新增
    catalog.products.push({
      productId: product.productId || `PROD-${Date.now()}`,
      name: product.name || '未命名产品',
      category: product.category || '未分类',
      specs: product.specs || {},
      bom: product.bom || [],
      competitors: product.competitors || [],
      contentTags: product.contentTags || [],
      contentGenerated: 0,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    });
  }
  
  saveProductCatalog(catalog);
  return catalog.products.find(p => p.productId === (product.productId || `PROD-${Date.now()}`));
}

// ── HTTP 工具 ──────────────────────────────────────────

function fetchPage(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      timeout
    };

    const req = mod.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location, timeout).then(resolve).catch(reject);
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ html: data, statusCode: res.statusCode, url }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    req.end();
  });
}

// ── BOM 采集模式 ───────────────────────────────────────

/**
 * 解析 BOM 数据（从JSON/简单表格格式）
 * 输入可以是 PLM导出的JSON、Excel转的JSON、或手动录入
 */
function parseBOM(bomData, productId) {
  const result = {
    productId,
    bom: [],
    specs: {},
    contentTags: []
  };

  if (Array.isArray(bomData)) {
    // 数组格式：[{partNo, name, qty, supplier, category, params}]
    for (const item of bomData) {
      result.bom.push({
        partNo: item.partNo || item['零件号'] || item['物料编码'] || '',
        name: item.name || item['名称'] || item['物料名称'] || '',
        qty: item.qty || item['数量'] || 1,
        supplier: item.supplier || item['供应商'] || '',
        category: item.category || item['分类'] || '',
        params: item.params || item['参数'] || {}
      });

      // 从BOM项提取技术参数到产品规格
      if (item.params || item['参数']) {
        const params = item.params || item['参数'];
        Object.assign(result.specs, params);
      }

      // 从分类生成内容标签
      if (item.category || item['分类']) {
        result.contentTags.push(item.category || item['分类']);
      }
    }
  }

  // 去重标签
  result.contentTags = [...new Set(result.contentTags)];

  return result;
}

// ── 竞品采集模式 ───────────────────────────────────────

/**
 * 竞品参数提取
 * 从网页中识别产品参数表格/规格列表
 */
function extractCompetitorSpecs(html, url) {
  const specs = {};
  const productName = '';

  // 提取页面标题作为产品名
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  // 提取参数表格
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tMatch;
  while ((tMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tMatch[1];
    const rows = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    for (const row of rows) {
      const cells = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]/gi) || [];
      if (cells.length >= 2) {
        const key = cells[0].replace(/<[^>]+>/g, '').trim();
        const value = cells[1].replace(/<[^>]+>/g, '').trim();
        if (key && value && key.length < 30 && value.length < 100) {
          specs[key] = value;
        }
      }
    }
  }

  // 提取常见产品规格关键词模式
  const specPatterns = [
    { key: '型号', regex: /(?:产品型号|型号|Model)[:\s]*([A-Z0-9\-]+)/i },
    { key: '尺寸', regex: /(?:尺寸|外形尺寸|Dimension)[:\s]*([\d×x]+\s*mm)/i },
    { key: '重量', regex: /(?:重量|净重|Weight)[:\s]*([\d.]+\s*kg)/i },
    { key: '功率', regex: /(?:功率|额定功率|Power)[:\s]*([\d.]+\s*[kKW])/i },
    { key: '精度', regex: /(?:精度|检测精度|Accuracy)[:\s]*([\d.]+\s*mm)/i },
    { key: '温度', regex: /(?:工作温度|温度范围|Temp)[:\s]*([-\d~]+\s*℃)/i },
    { key: '价格', regex: /(?:价格|售价|Price|¥)[:\s]*(¥[\d,]+|\d+[\d,.]*元)/i },
  ];

  for (const p of specPatterns) {
    const match = html.match(p.regex);
    if (match) specs[p.key] = match[1];
  }

  // 提取 OG 元数据
  const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"/i);
  const ogDesc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"/i);

  return {
    name: ogTitle ? ogTitle[1] : pageTitle,
    url,
    specs,
    description: ogDesc ? ogDesc[1] : '',
    collectedAt: new Date().toISOString()
  };
}

/**
 * 生成竞品对比矩阵
 */
function generateComparisonMatrix(ourProduct, competitors) {
  const allSpecKeys = new Set();
  
  // 收集所有参数维度
  if (ourProduct.specs) Object.keys(ourProduct.specs).forEach(k => allSpecKeys.add(k));
  for (const c of competitors) {
    if (c.specs) Object.keys(c.specs).forEach(k => allSpecKeys.add(k));
  }

  // 构建对比表
  const matrix = [];
  for (const key of allSpecKeys) {
    const row = {
      parameter: key,
      ours: ourProduct.specs?.[key] || '-',
      competitors: competitors.map(c => ({
        name: c.name,
        value: c.specs?.[key] || '-'
      }))
    };
    
    // 自动标注优势
    row.advantage = determineAdvantage(key, row.ours, row.competitors.map(c => c.value));
    matrix.push(row);
  }

  // 生成营销文案模板
  const advantages = matrix.filter(r => r.advantage === '我们更强');
  const copyTemplates = advantages.map(r => 
    `${r.parameter}方面，我们(${r.ours})优于${r.competitors.filter(c => c.value !== '-').map(c => c.name).join('/')}(${r.competitors.filter(c => c.value !== '-').map(c => c.value).join('/')})`
  );

  return {
    matrix,
    advantages: advantages.map(r => r.parameter),
    copyTemplates,
    generatedAt: new Date().toISOString()
  };
}

function determineAdvantage(paramKey, ourValue, competitorValues) {
  // 数值型对比
  const numPattern = /([\d.]+)/;
  const ourNum = parseFloat((ourValue.match(numPattern) || [])[1]);
  
  if (isNaN(ourNum)) return '无法对比';
  
  const compNums = competitorValues.map(v => {
    const n = parseFloat((v.match(numPattern) || [])[1]);
    return isNaN(n) ? null : n;
  }).filter(n => n !== null);
  
  if (compNums.length === 0) return '无竞品数据';

  // 精度/分辨率类：越小越好
  if (/精度|分辨率|误差|偏差/i.test(paramKey)) {
    if (ourNum < Math.min(...compNums)) return '我们更强';
    if (ourNum > Math.max(...compNums)) return '竞品更强';
  }
  
  // 温度范围类：越宽越好（暂简化）
  if (/温度|范围/i.test(paramKey)) return '需人工判断';

  // 价格类：越低越好
  if (/价格|售价|成本/i.test(paramKey)) {
    if (ourNum < Math.min(...compNums)) return '我们更强';
    if (ourNum > Math.max(...compNums)) return '竞品更强';
  }

  // 默认：越大越好（功率、容量、速度等）
  if (ourNum > Math.max(...compNums)) return '我们更强';
  if (ourNum < Math.min(...compNums)) return '竞品更强';
  
  return '各有优势';
}

// ── 信源采集模式 ───────────────────────────────────────

/**
 * 行业信源采集 + AI评分
 * 从网页中提取文章标题/摘要，按热度排序
 */
function collectSourceContent(html, url) {
  const articles = [];

  // 提取链接+标题
  const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const link = match[1];
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    if (title.length > 5 && title.length < 200 && !/javascript:|#|^$/i.test(link)) {
      articles.push({
        title,
        url: link.startsWith('http') ? link : new URL(link, url).href,
        score: scoreArticle(title)
      });
    }
  }

  // 按评分排序
  articles.sort((a, b) => b.score - a.score);

  // 提取OG描述等
  const ogDesc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"/i);

  return {
    url,
    sourceDescription: ogDesc ? ogDesc[1] : '',
    articles: articles.slice(0, 50),  // 最多50条
    collectedAt: new Date().toISOString()
  };
}

/**
 * 文章热度评分（关键词匹配 + 方法论引擎）
 */
function scoreArticle(title, content = null) {
  // ── 原有：关键词评分 ────────────────────
  const hotKeywords = [
    // AI & 数字化
    { keyword: 'AI', weight: 10 },
    { keyword: '人工智能', weight: 10 },
    { keyword: '数字化转型', weight: 8 },
    { keyword: '智能制造', weight: 8 },
    { keyword: '数字员工', weight: 9 },
    { keyword: 'LLM', weight: 8 },
    { keyword: '大模型', weight: 8 },
    // 工业
    { keyword: 'PLM', weight: 7 },
    { keyword: 'MES', weight: 7 },
    { keyword: 'ERP', weight: 5 },
    { keyword: '工业互联网', weight: 7 },
    { keyword: '边缘计算', weight: 6 },
    { keyword: 'BOM', weight: 7 },
    // 热点
    { keyword: '突破', weight: 5 },
    { keyword: '首发', weight: 5 },
    { keyword: '独家', weight: 4 },
    { keyword: '重磅', weight: 4 },
  ];

  let keywordScore = 0;
  for (const kw of hotKeywords) {
    if (title.toLowerCase().includes(kw.keyword.toLowerCase())) {
      keywordScore += kw.weight;
    }
  }
  // ── 方法论注入：角度评分 ────────────────────
  let methodologyScore = 0;
  if (methodologyEngine && methodologyEngine.scoreAngle) {
    const fakeAngle = {
      angle: title,
      method: '关键词提取',
      psychology: '好奇',
      scores: { novelty: 50, resonance: 50, risk: 'low' }
    };
    const scored = methodologyEngine.scoreAngle(fakeAngle, []);
    methodologyScore = scored.overall;
    console.log('[方法论] 文章评分:', methodologyScore, '/100');
  }
  
  // ── 综合评分 ─────────────────────────────
  const normalizedKeyword = (keywordScore / 80) * 100;
  const finalScore = Math.round(normalizedKeyword * 0.4 + methodologyScore * 0.6);
  console.log(`[评分] 关键词:${keywordScore} 方法论:${methodologyScore} 综合:${finalScore}`);
  
  return finalScore;
}

// ── 内容生成模板 ────────────────────────────────────────

/**
 * 从产品数据+对比矩阵生成营销文案模板
 */
function generateContentFromProduct(product, comparisonMatrix) {
  const templates = [];

  // ── 方法论注入：选择情绪曲线 ─────────────────────
  let selectedArc = null;
  let arcName = '';
  if (methodologyEngine && methodologyEngine.getEmotionArcs) {
    const arcs = methodologyEngine.getEmotionArcs();
    const category = (product.category || '').toLowerCase();
    if (category.includes('制造') || category.includes('工业')) {
      selectedArc = arcs.hero || arcs.cinderella;
      arcName = selectedArc ? selectedArc.name : '';
    } else if (category.includes('数字化') || category.includes('转型')) {
      selectedArc = arcs.cinderella || arcs.hero;
      arcName = selectedArc ? selectedArc.name : '';
    } else {
      selectedArc = arcs.cinderella;
      arcName = selectedArc ? selectedArc.name : '';
    }
    console.log('[方法论] 选择情绪曲线:', arcName);
  }

  // 模板1：产品参数介绍
  const lines1 = ['## ' + product.name, '', '### 核心参数'];
  Object.entries(product.specs || {}).forEach(function(e) { lines1.push('- **' + e[0] + '**: ' + e[1]); });
  lines1.push('', '### 关键组件');
  (product.bom || []).forEach(function(b) {
    lines1.push('- ' + b.name + '(' + b.partNo + '): ' + b.qty + '个, 供应商' + b.supplier);
  });
  // 注入：情绪曲线引导的开头
  if (selectedArc) {
    lines1.push('', '### ' + arcName + '：产品价值叙事');
    lines1.push('> 本文采用「' + arcName + '」情绪曲线撰写，带您从痛点走向解决方案');
  }

  lines1.push('', '> 本文由 WorkBuddy 内容数字员工自动生成', '');
  templates.push({
    type: 'product_intro',
    title: product.name + ' — 核心参数一览',
    content: lines1.join('\n'),
    tags: product.contentTags || []
  });

  // 模板2：竞品对比文案
  if (comparisonMatrix && comparisonMatrix.advantages && comparisonMatrix.advantages.length > 0) {
    const lines2 = ['## ' + product.name + ' 核心优势', ''];
    (comparisonMatrix.copyTemplates || []).forEach(function(t) { lines2.push('- ' + t); });
    lines2.push('', '### 详细对比', '');
    // 表头
    let header = '| 参数 | 我们';
    (product.competitors || []).forEach(function(c) { header += ' | ' + c.name; });
    lines2.push(header + ' |');
    let sep = '| --- | ---';
    (product.competitors || []).forEach(function() { sep += ' | ---'; });
    lines2.push(sep + ' |');
    (comparisonMatrix.matrix || []).forEach(function(r) {
      let row = '| ' + r.parameter + ' | ' + r.ours;
      (r.competitors || []).forEach(function(c) { row += ' | ' + c.value; });
      lines2.push(row + ' |');
    });
    lines2.push('', '> 本文由 WorkBuddy 内容数字员工自动生成（竞品对比分析）', '');
    templates.push({
      type: 'comparison',
      title: product.name + ' vs 竞品：' + comparisonMatrix.advantages.join('/') + '全面领先',
      content: lines2.join('\n'),
      tags: (product.contentTags || []).concat(['竞品对比'])
    });
  }

  // 模板3：客户场景文案
  const lines3 = ['## 场景痛点', '', '（此处描述' + (product.category || '') + '领域的典型客户痛点）', '', '## ' + product.name + ' 的解决方案', ''];
  if (product.specs && Object.keys(product.specs).length > 0) {
    lines3.push('### 核心参数优势');
    Object.entries(product.specs).forEach(function(e) { lines3.push('- **' + e[0] + '**: ' + e[1]); });
    lines3.push('');
  }
  lines3.push('## 核心优势');
  const adv = (comparisonMatrix && comparisonMatrix.advantages) || product.contentTags || [];
  adv.forEach(function(a) { lines3.push('- ' + a + '方面领先竞品'); });
  // 注入：情绪曲线结构
  if (selectedArc && selectedArc.points) {
    lines3.push('### 情绪曲线：' + arcName, '');
    selectedArc.points.forEach(function(p) {
      const pct = Math.round(p.position * 100);
      lines3.push('- **' + pct + '% 进度** (' + p.label + ')：情绪值 ' + p.emotion);
    });
    lines3.push('');
  }

  lines3.push('', '## 客户收益', '- 提升效率', '- 降低成本', '- 数据可追溯', '', '> 本文由 WorkBuddy 内容数字员工自动生成', '');
  templates.push({
    type: 'use_case',
    title: product.name + ' 在' + (product.category || '') + '场景中的应用',
    content: lines3.join('\n'),
    tags: (product.contentTags || []).concat(['客户案例'])
  });

  // ── 方法论注入：角度评分 + 推荐 ─────────────────
  if (methodologyEngine && methodologyEngine.scoreAngle) {
    const angleText = product.name + ' 在' + (product.category || '工业') + '领域的应用价值';
    const fakeAngle = {
      angle: angleText,
      method: '产品价值叙事（' + arcName + '）',
      psychology: '共情、震撼',
      scores: { novelty: 60, resonance: 65, risk: 'low' }
    };
    const scored = methodologyEngine.scoreAngle(fakeAngle, []);
    console.log('[方法论] 角度评分:', scored.overall, '/100', scored.recommendation);
    
    // 添加第4个模板：方法论分析报告
    const analysisLines = [
      '## 🧠 方法论分析报告',
      '',
      '### 角度评分',
      '- **新颖度**: ' + scored.novelty + '/100',
      '- **共鸣潜力**: ' + scored.resonance + '/100',
      '- **风险等级**: ' + scored.risk,
      '- **综合评分**: **' + scored.overall + '/100**',
      '',
      '### 推荐',
      scored.recommendation,
      '',
      '### 情绪曲线',
      '本文采用「' + arcName + '」情绪曲线',
      '',
      '> 本文由 WorkBuddy 内容数字员工自动生成（含方法论引擎）',
      ''
    ];
    templates.push({
      type: 'methodology_analysis',
      title: product.name + ' — 方法论分析报告',
      content: analysisLines.join('\n'),
      tags: ['方法论', '角度评分'].concat(product.contentTags || [])
    });
  }

  return templates;

}

// ── 自愈机制 ────────────────────────────────────────────

async function healTask(task) {
  console.log(`[SmartFetch] 自愈: ${task.name || task.id}`);
  try {
    const { html } = await fetchPage(task.url);
    // 重新提取竞品参数
    const newSpecs = extractCompetitorSpecs(html, task.url);
    return { healed: true, specs: newSpecs, healedAt: new Date().toISOString() };
  } catch (e) {
    return { healed: false, error: e.message };
  }
}

// ── 任务持久化 ──────────────────────────────────────────

async function loadTasks() {
  const tasksFile = path.join(CONFIG_DIR, 'smart-fetch-tasks.json');
  try {
    if (fs.existsSync(tasksFile)) return JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
  } catch (e) {}
  return { tasks: [] };
}

async function saveTasks(config) {
  const tasksFile = path.join(CONFIG_DIR, 'smart-fetch-tasks.json');
  fs.writeFileSync(tasksFile, JSON.stringify(config, null, 2), 'utf8');
}

// ── 导出 ────────────────────────────────────────────────

module.exports = {
  // BOM模式
  parseBOM,
  upsertProduct,
  loadProductCatalog,
  saveProductCatalog,
  
  // 竞品模式
  fetchPage,
  extractCompetitorSpecs,
  generateComparisonMatrix,
  
  // 信源模式
  collectSourceContent,
  scoreArticle,
  
  // 内容生成
  generateContentFromProduct,
  
  // 自愈
  healTask,
  
  // 任务
  loadTasks,
  saveTasks,
  
  // 路径
  CONFIG_DIR,
  DATA_DIR,
  PRODUCT_DB
};