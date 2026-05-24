/**
 * WB XHS Images - 小红书卡片图生成器
 * 将文章内容拆分为1-10张卡片图
 * 
 * 用法：
 *   node generate-cards.js article.md
 *   node generate-cards.js article.md --style notion --layout list
 */

const fs = require('fs');
const path = require('path');

const STYLE_PRESETS = {
  'cute':          'kawaii cute style, pastel colors, rounded shapes, adorable characters, soft shadows',
  'fresh':         'clean fresh style, light pastel palette, airy layout, minimalist icons',
  'warm':          'warm cozy style, earth tones, soft gradients, friendly rounded corners',
  'bold':          'bold high-contrast style, vibrant colors, geometric shapes, strong typography',
  'minimal':       'ultra minimal style, black white grey only, lots of white space, clean lines',
  'retro':         'vintage retro style, paper texture, muted colors, classic typography',
  'pop':           'pop art style, bright bold colors, halftone dots, comic style',
  'notion':        'Notion app style, black white grey, clean geometric, monospace accents',
  'chalkboard':    'chalkboard style, white chalk on black, hand-drawn feel',
  'study-notes':   'study notes style, lined paper background, highlighter marks, neat handwriting',
  'screen-print':  'screen print style, bold flat colors, sharp edges, limited palette',
  'sketch-notes':  'sketch notes style, marker pen doodles, arrows, boxes, hand-drawn',
};

const LAYOUT_DESC = {
  'sparse':     'Very sparse layout, 1-2 key points centered, large typography, maximum white space',
  'balanced':   'Balanced layout, 3-4 points with icons, clear hierarchy, comfortable spacing',
  'dense':      'Dense knowledge card layout, 5-8 compact points, organized grid, small icons',
  'list':       'List layout, numbered items 4-7, checkmarks or bullet points, clean vertical flow',
  'comparison': 'Split layout, two columns for comparison, VS divider, contrasting colors',
  'flow':       'Flow layout, 3-6 steps connected by arrows, timeline or process flow',
  'grid':       'Grid layout, 2x2 or 3x2 cards, each with icon and short text',
  'quote':      'Single quote layout, large centered text, decorative quotation marks, minimal',
};

// ── 内容拆分 Prompt ──────────────────────────────────────
const SPLIT_SYSTEM_PROMPT = `你是一个小红书内容专家。根据文章内容，拆分为3-8张卡片图的内容。

要求：
1. 每张卡片有：标题（短）、内容要点（3-7条）、视觉描述（英文）
2. 第一张为封面卡片（标题+副标题）
3. 最后一张为总结/关注卡片
4. 中间卡片按逻辑递进
5. 内容精炼，每条不超过20字
6. 视觉描述用于AI生成图片

输出JSON格式：
{
  "cards": [
    {
      "index": 1,
      "title": "卡片标题",
      "points": ["要点1", "要点2", "要点3"],
      "visual": "visual description in English for AI image generation",
      "type": "cover|content|summary"
    }
  ]
}`;

function loadEnv() {
  const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '.env'),
    path.join(require('os').homedir(), '.workbuddy', '.env'),
  ];
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8');
      for (const line of content.split('\n')) {
        const match = line.match(/^\s*([A-Z_]+)\s*=\s*["']?(.*?)["']?\s*$/);
        if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
      }
    }
  }
}

function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const mod = urlObj.protocol === 'https:' ? require('https') : require('http');
    const reqOpts = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'POST',
      headers: options.headers || {},
      timeout: 120000,
    };
    const req = mod.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function splitContent(content, options) {
  const llmUrl = process.env.LLM_PROXY_URL || 'http://127.0.0.1:19000/proxy/llm';
  const model = process.env.LLM_MODEL || 'deepseek-chat';
  
  const styleInfo = `风格: ${options.style || 'cute'}`;
  const layoutInfo = `布局: ${options.layout || 'balanced'}`;
  
  const userPrompt = `${styleInfo}\n${layoutInfo}\n\n文章内容:\n${content.substring(0, 8000)}`;

  try {
    const res = await httpRequest(llmUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, {
      model,
      messages: [
        { role: 'system', content: SPLIT_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
    });

    const text = res.data.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error(`Content split failed: ${err.message}`);
    return { cards: [{ index: 1, title: '内容概要', points: ['要点1', '要点2'], visual: 'simple card design', type: 'cover' }] };
  }
}

function buildCardPrompt(card, styleName, layoutName) {
  const style = STYLE_PRESETS[styleName] || STYLE_PRESETS['cute'];
  const layout = LAYOUT_DESC[layoutName] || LAYOUT_DESC['balanced'];
  
  return `Xiaohongshu (Little Red Book) social media image card. ${style}. ${layout}.
Title: "${card.title}"
${card.points?.length ? `Content points: ${card.points.join(', ')}` : ''}
Card type: ${card.type}
Aspect ratio 3:4 (portrait), high quality, Chinese text, social media optimized, ${styleName} aesthetic`;
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const options = { style: 'cute', layout: 'balanced' };
  let inputFile = null;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--style':  options.style = args[++i]; break;
      case '--layout': options.layout = args[++i]; break;
      case '--yes':    options.yes = true; break;
      case '--output': options.outputDir = args[++i]; break;
      case '--help':
        console.log(`\nWB XHS Images - 小红书卡片图生成器\n\n用法: node generate-cards.js article.md [--style notion] [--layout list]\n\n风格: cute/fresh/warm/bold/minimal/retro/pop/notion/chalkboard/study-notes/screen-print/sketch-notes\n布局: sparse/balanced/dense/list/comparison/flow/grid/quote\n`);
        process.exit(0);
      default:
        if (!args[i].startsWith('-') && !inputFile) inputFile = args[i];
    }
  }

  if (!inputFile) { console.error('❌ Missing input file'); process.exit(1); }

  let content = fs.existsSync(inputFile) ? fs.readFileSync(inputFile, 'utf8') : inputFile;

  console.log('\n🎴 WB XHS Images - 小红书卡片图生成器');
  console.log(`   Style: ${options.style}, Layout: ${options.layout}`);

  // Step 1: 拆分内容
  console.log('\n✂️  Splitting content into cards...');
  const { cards } = await splitContent(content, options);
  console.log(`   Generated ${cards.length} cards`);

  // Step 2: 生成图片
  const outputDir = options.outputDir || path.join(process.cwd(), 'xhs-output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const imageGen = require('../../wb-image-gen/scripts/generate');
  
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const prompt = buildCardPrompt(card, options.style, options.layout);
    const outputPath = path.join(outputDir, `card_${String(i + 1).padStart(2, '0')}.png`);
    
    console.log(`\n  🖼️  Card ${i + 1}/${cards.length}: ${card.title}`);
    
    try {
      await imageGen.generateImage(prompt, {
        output: outputPath,
        ar: '3:4',
        quality: '2k',
      });
    } catch (err) {
      console.warn(`  ⚠️  Card ${i + 1} failed: ${err.message}`);
    }
  }

  console.log(`\n🎉 ${cards.length} cards generated in ${outputDir}`);
}

module.exports = { splitContent, buildCardPrompt, STYLE_PRESETS, LAYOUT_DESC };

if (require.main === module) {
  main().catch(err => { console.error(`❌ ${err.message}`); process.exit(1); });
}
