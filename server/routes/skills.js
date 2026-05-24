/**
 * WorkBuddy Skills API Route
 * 统一技能调用入口：图片生成、PPT生成、小红书卡片、封面图
 * 
 * GET  /api/skills          - 列出可用技能
 * POST /api/skills/:name    - 调用技能
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const SKILLS_DIR = path.join(__dirname, '..', '..', 'skills');

// ── 技能注册表 ──────────────────────────────────────
const SKILL_REGISTRY = {
  'image-gen': {
    name: '图片生成',
    description: 'AI图片生成，支持DashScope/火山方舟/OpenAI/Google',
    script: path.join(SKILLS_DIR, 'wb-image-gen', 'scripts', 'generate.js'),
    icon: '🎨',
  },
  'slide-deck': {
    name: 'PPT生成',
    description: '从Markdown生成专业PPT，17种风格预设',
    script: path.join(SKILLS_DIR, 'wb-slide-deck', 'scripts', 'generate.js'),
    icon: '📊',
  },
  'xhs-images': {
    name: '小红书卡片',
    description: '文章转小红书卡片图系列，12风格×8布局',
    script: path.join(SKILLS_DIR, 'wb-xhs-images', 'scripts', 'generate-cards.js'),
    icon: '🎴',
  },
  'cover-image': {
    name: '封面图生成',
    description: '5维参数系统生成专业封面图，77种组合',
    script: path.join(SKILLS_DIR, 'wb-cover-image', 'scripts', 'generate-cover.js'),
    icon: '🖼️',
  },
  'smart-fetch': {
    name: '智能采集',
    description: '2分钟把任何网页变成结构化数据，支持自愈和定时监控',
    script: path.join(SKILLS_DIR, 'wb-smart-fetch', 'scripts', 'smart-fetch.js'),
    icon: '🕷️',
  },
};

// ── GET /api/skills - 列出技能 ──────────────────────────────────────
router.get('/', (req, res) => {
  const skills = Object.entries(SKILL_REGISTRY).map(([id, skill]) => ({
    id,
    name: skill.name,
    description: skill.description,
    icon: skill.icon,
    available: fs.existsSync(skill.script),
  }));
  res.json({ skills });
});

// ── GET /api/skills/:name - 获取技能详情 ──────────────────────────────────────
router.get('/:name', (req, res) => {
  const skill = SKILL_REGISTRY[req.params.name];
  if (!skill) return res.status(404).json({ error: 'Skill not found' });

  res.json({
    id: req.params.name,
    ...skill,
    available: fs.existsSync(skill.script),
  });
});

// ── POST /api/skills/:name/execute - 执行技能 ──────────────────────────────────────
router.post('/:name/execute', async (req, res) => {
  const skill = SKILL_REGISTRY[req.params.name];
  if (!skill) return res.status(404).json({ error: 'Skill not found' });

  if (!fs.existsSync(skill.script)) {
    return res.status(503).json({ error: 'Skill script not available', path: skill.script });
  }

  const { params } = req.body;

  try {
    // 根据技能类型执行不同逻辑
    let result;

    switch (req.params.name) {
      case 'image-gen': {
        const { generateImage } = require(skill.script);
        result = await generateImage(params.prompt, {
          output: params.output || 'output.png',
          provider: params.provider,
          model: params.model,
          ar: params.ar || '1:1',
          size: params.size,
          quality: params.quality || '2k',
          style: params.style,
          ref: params.ref,
        });
        break;
      }

      case 'slide-deck': {
        const { generateOutline, buildSlidePrompt, mergeToPptx, STYLE_PRESETS } = require(skill.script);
        
        // Step 1: 生成大纲
        const outline = await generateOutline(params.content, {
          style: params.style || 'blueprint',
          audience: params.audience || 'general',
          slides: params.slides || 12,
          lang: params.lang || 'zh',
        });

        // Step 2: 生成图片（异步，返回任务ID）
        const outputDir = params.outputDir || path.join(process.cwd(), 'slide-output');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        // 保存大纲
        fs.writeFileSync(path.join(outputDir, 'outline.json'), JSON.stringify(outline, null, 2));

        result = {
          status: 'outline_ready',
          outline,
          outputDir,
          message: '大纲已生成，请确认后生成图片',
          slidesCount: outline.slides?.length || 0,
        };
        break;
      }

      case 'xhs-images': {
        const { splitContent, buildCardPrompt, STYLE_PRESETS } = require(skill.script);
        const { cards } = await splitContent(params.content, {
          style: params.style || 'cute',
          layout: params.layout || 'balanced',
        });

        result = {
          status: 'cards_ready',
          cards,
          message: `已拆分为${cards.length}张卡片，请确认后生成图片`,
        };
        break;
      }

      case 'cover-image': {
        const { buildCoverPrompt, autoSelectDimensions, DIMENSIONS } = require(skill.script);
        const dims = params.dims || autoSelectDimensions(params.content || '');
        const title = params.title || 'Cover';
        const prompt = buildCoverPrompt(title, params.subtitle, dims);

        result = {
          status: 'prompt_ready',
          prompt,
          dims,
          message: '封面图Prompt已生成，请确认后生成图片',
        };
        break;
      }

      default:
        return res.status(400).json({ error: 'Unknown skill' });
    }

    res.json({ success: true, skill: req.params.name, result });
  } catch (err) {
    console.error(`Skill execution error [${req.params.name}]:`, err);
    res.status(500).json({ error: err.message, skill: req.params.name });
  }
});

// ── POST /api/skills/:name/generate - 实际生成图片 ──────────────────────────────────────
router.post('/:name/generate', async (req, res) => {
  const { prompts, style } = req.body;
  const skill = SKILL_REGISTRY[req.params.name];
  if (!skill) return res.status(404).json({ error: 'Skill not found' });

  try {
    const { generateImage } = require(path.join(SKILLS_DIR, 'wb-image-gen', 'scripts', 'generate.js'));
    
    const subDir = req.params.name === 'xhs-images' ? 'xhs-output' : req.params.name === 'slide-deck' ? 'slide-output' : 'cover-output';
    const outputDir = path.join(__dirname, '..', 'public', 'output', subDir);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const results = [];
    for (let i = 0; i < prompts.length; i++) {
      const { prompt, filename } = prompts[i];
      const outputPath = path.join(outputDir, filename || `output_${i + 1}.png`);
      
      try {
        const result = await generateImage(prompt, {
          output: outputPath,
          style,
          ar: req.params.name === 'xhs-images' ? '3:4' : '16:9',
          quality: '2k',
        });
        results.push({ index: i, success: true, url: `/output/${subDir}/${filename || 'output_' + (i + 1) + '.png'}` });
      } catch (err) {
        results.push({ index: i, success: false, error: err.message });
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Smart Fetch 企业数据采集路由 ──────────────────────────────────

/**
 * POST /api/skills/smart-fetch/bom/import — 导入BOM数据
 */
router.post('/smart-fetch/bom/import', async (req, res) => {
  try {
    const { productId, bomData, name, category } = req.body;
    if (!bomData) return res.status(400).json({ error: '缺少 bomData 参数' });
    
    const sf = require(path.join(SKILLS_DIR, 'wb-smart-fetch', 'scripts', 'smart-fetch.js'));
    const parsed = sf.parseBOM(bomData, productId);
    
    // 写入产品库
    const product = sf.upsertProduct({
      productId: productId || parsed.productId,
      name: name || '未命名产品',
      category: category || '未分类',
      specs: parsed.specs,
      bom: parsed.bom,
      contentTags: parsed.contentTags
    });
    
    res.json({ success: true, data: { product, parsed } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/skills/smart-fetch/competitor/scan — 竞品参数采集
 */
router.post('/smart-fetch/competitor/scan', async (req, res) => {
  try {
    const { url, productId } = req.body;
    if (!url) return res.status(400).json({ error: '缺少 url 参数' });
    
    const sf = require(path.join(SKILLS_DIR, 'wb-smart-fetch', 'scripts', 'smart-fetch.js'));
    const { html, statusCode } = await sf.fetchPage(url);
    
    if (statusCode !== 200) {
      return res.status(502).json({ error: `目标页面返回 ${statusCode}` });
    }
    
    const competitor = sf.extractCompetitorSpecs(html, url);
    
    // 如果关联产品，写入竞品列表
    if (productId) {
      const catalog = sf.loadProductCatalog();
      const product = catalog.products.find(p => p.productId === productId);
      if (product) {
        if (!product.competitors) product.competitors = [];
        product.competitors.push(competitor);
        sf.saveProductCatalog(catalog);
      }
    }
    
    res.json({ success: true, data: competitor });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/skills/smart-fetch/competitor/compare — 竞品对比矩阵
 */
router.post('/smart-fetch/competitor/compare', async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ error: '缺少 productId 参数' });
    
    const sf = require(path.join(SKILLS_DIR, 'wb-smart-fetch', 'scripts', 'smart-fetch.js'));
    const catalog = sf.loadProductCatalog();
    const product = catalog.products.find(p => p.productId === productId);
    
    if (!product) return res.status(404).json({ error: '产品不存在' });
    if (!product.competitors || product.competitors.length === 0) {
      return res.status(400).json({ error: '该产品暂无竞品数据，请先采集竞品' });
    }
    
    const matrix = sf.generateComparisonMatrix(product, product.competitors);
    
    res.json({ success: true, data: { product: product.name, ...matrix } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/skills/smart-fetch/source/collect — 行业信源采集
 */
router.post('/smart-fetch/source/collect', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: '缺少 url 参数' });
    
    const sf = require(path.join(SKILLS_DIR, 'wb-smart-fetch', 'scripts', 'smart-fetch.js'));
    const { html, statusCode } = await sf.fetchPage(url);
    
    if (statusCode !== 200) {
      return res.status(502).json({ error: `目标页面返回 ${statusCode}` });
    }
    
    const content = sf.collectSourceContent(html, url);
    res.json({ success: true, data: content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/skills/smart-fetch/product/catalog — 产品库查询
 */
router.get('/smart-fetch/product/catalog', async (req, res) => {
  try {
    const sf = require(path.join(SKILLS_DIR, 'wb-smart-fetch', 'scripts', 'smart-fetch.js'));
    const catalog = sf.loadProductCatalog();
    
    // 支持搜索
    const { keyword, category } = req.query;
    let products = catalog.products;
    if (keyword) products = products.filter(p => p.name.includes(keyword) || p.productId.includes(keyword));
    if (category) products = products.filter(p => p.category === category);
    
    res.json({ success: true, data: products, total: products.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/skills/smart-fetch/product/catalog/:productId — 删除产品
 */
router.delete('/smart-fetch/product/catalog/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    if (!productId) return res.status(400).json({ error: '缺少 productId 参数' });
    
    const sf = require(path.join(SKILLS_DIR, 'wb-smart-fetch', 'scripts', 'smart-fetch.js'));
    const catalog = sf.loadProductCatalog();
    
    const initialLength = catalog.products.length;
    catalog.products = catalog.products.filter(p => p.productId !== productId);
    
    if (catalog.products.length === initialLength) {
      return res.status(404).json({ error: '产品不存在' });
    }
    
    sf.saveProductCatalog(catalog);
    
    res.json({ success: true, message: `产品 ${productId} 已删除`, remaining: catalog.products.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/skills/smart-fetch/content/generate-from-product — 从产品数据生成内容
 */
router.post('/smart-fetch/content/generate-from-product', async (req, res) => {
  try {
    const { productId, includeComparison } = req.body;
    if (!productId) return res.status(400).json({ error: '缺少 productId 参数' });
    
    const sf = require(path.join(SKILLS_DIR, 'wb-smart-fetch', 'scripts', 'smart-fetch.js'));
    const catalog = sf.loadProductCatalog();
    const product = catalog.products.find(p => p.productId === productId);
    
    if (!product) return res.status(404).json({ error: '产品不存在' });
    
    let comparisonMatrix = null;
    if (includeComparison && product.competitors && product.competitors.length > 0) {
      comparisonMatrix = sf.generateComparisonMatrix(product, product.competitors);
    }
    
    const templates = sf.generateContentFromProduct(product, comparisonMatrix);
    
    res.json({ success: true, data: { product: product.name, templates, comparisonAvailable: !!comparisonMatrix } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/skills/smart-fetch/analyze — 通用网页分析（保留）
 */
router.post('/smart-fetch/analyze', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: '缺少 url 参数' });
    
    const sf = require(path.join(SKILLS_DIR, 'wb-smart-fetch', 'scripts', 'smart-fetch.js'));
    const { html, statusCode } = await sf.fetchPage(url);
    
    if (statusCode !== 200) {
      return res.status(502).json({ error: `目标页面返回 ${statusCode}` });
    }
    
    // 自动识别模式：如果是产品页走竞品提取，否则走信源采集
    const competitor = sf.extractCompetitorSpecs(html, url);
    const source = sf.collectSourceContent(html, url);
    
    res.json({ success: true, data: { competitor, source } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/skills/smart-fetch/register — 注册监控任务
 */
router.post('/smart-fetch/register', async (req, res) => {
  try {
    const { url, schedule, notifyOn, name, mode } = req.body;
    if (!url) return res.status(400).json({ error: '缺少 url 参数' });
    
    const sf = require(path.join(SKILLS_DIR, 'wb-smart-fetch', 'scripts', 'smart-fetch.js'));
    const config = await sf.loadTasks();
    
    const task = {
      id: `sf_${Date.now()}`,
      name: name || `监控: ${new URL(url).hostname}`,
      url,
      mode: mode || 'source',  // bom / competitor / source
      schedule: schedule || '0 */12 * * *',
      notifyOn: notifyOn || 'change',
      enabled: true,
      createdAt: new Date().toISOString(),
      lastRun: null,
      lastData: null,
      healCount: 0
    };
    
    config.tasks.push(task);
    await sf.saveTasks(config);
    
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/skills/smart-fetch/tasks — 查看所有监控任务
 */
router.get('/smart-fetch/tasks', async (req, res) => {
  try {
    const sf = require(path.join(SKILLS_DIR, 'wb-smart-fetch', 'scripts', 'smart-fetch.js'));
    const config = await sf.loadTasks();
    res.json({ success: true, data: config.tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/skills/smart-fetch/heal/:taskId — 自愈修复
 */
router.post('/smart-fetch/heal/:taskId', async (req, res) => {
  try {
    const sf = require(path.join(SKILLS_DIR, 'wb-smart-fetch', 'scripts', 'smart-fetch.js'));
    const config = await sf.loadTasks();
    const task = config.tasks.find(t => t.id === req.params.taskId);
    if (!task) return res.status(404).json({ error: '任务不存在' });
    
    const result = await sf.healTask(task);
    
    if (result.healed) {
      task.lastHealed = result.healedAt;
      task.healCount = (task.healCount || 0) + 1;
      await sf.saveTasks(config);
    }
    
    res.json({ success: result.healed, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/skills/smart-fetch/tasks/:taskId — 删除监控任务
 */
router.delete('/smart-fetch/tasks/:taskId', async (req, res) => {
  try {
    const sf = require(path.join(SKILLS_DIR, 'wb-smart-fetch', 'scripts', 'smart-fetch.js'));
    const config = await sf.loadTasks();
    config.tasks = config.tasks.filter(t => t.id !== req.params.taskId);
    await sf.saveTasks(config);
    res.json({ success: true, message: '任务已删除' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
