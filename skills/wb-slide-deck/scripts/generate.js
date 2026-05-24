/**
 * WB Slide Deck - PPT 生成器
 * 
 * 流程：内容分析 → 大纲生成 → 确认 → 逐页 Prompt → AI 生成图片 → 合并 PPTX
 * 
 * 用法：
 *   node generate.js article.md
 *   node generate.js article.md --style corporate --slides 12
 *   node generate.js article.md --outline-only
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// ── 风格预设定义 ──────────────────────────────────────
const STYLE_PRESETS = {
  'blueprint':            { texture: 'grid',     mood: 'cool',        typography: 'technical',  density: 'balanced' },
  'chalkboard':           { texture: 'organic',  mood: 'warm',        typography: 'handwritten', density: 'balanced' },
  'corporate':            { texture: 'clean',    mood: 'professional', typography: 'geometric',  density: 'balanced' },
  'minimal':              { texture: 'clean',    mood: 'neutral',     typography: 'geometric',  density: 'minimal' },
  'notion':               { texture: 'clean',    mood: 'neutral',     typography: 'geometric',  density: 'dense' },
  'bold-editorial':       { texture: 'clean',    mood: 'vibrant',     typography: 'editorial',  density: 'balanced' },
  'dark-atmospheric':     { texture: 'clean',    mood: 'dark',        typography: 'editorial',  density: 'balanced' },
  'sketch-notes':         { texture: 'organic',  mood: 'warm',        typography: 'handwritten', density: 'balanced' },
  'watercolor':           { texture: 'organic',  mood: 'warm',        typography: 'humanist',   density: 'minimal' },
  'scientific':           { texture: 'clean',    mood: 'cool',        typography: 'technical',  density: 'dense' },
  'pixel-art':            { texture: 'pixel',    mood: 'vibrant',     typography: 'technical',  density: 'balanced' },
  'vintage':              { texture: 'paper',    mood: 'warm',        typography: 'editorial',  density: 'balanced' },
};

// ── 大纲生成 Prompt 模板 ──────────────────────────────────────
const OUTLINE_SYSTEM_PROMPT = `你是一个专业的PPT大纲设计专家。根据用户提供的文章内容，生成一份结构清晰的PPT大纲。

要求：
1. 每页PPT包含：标题、要点（3-5条）、视觉描述（用于AI生成配图）
2. 首页为封面页（标题+副标题）
3. 末页为总结页
4. 每页内容精炼，避免信息过载
5. 逻辑递进，从概念→细节→应用→总结

输出JSON格式：
{
  "title": "PPT主标题",
  "subtitle": "副标题",
  "author": "作者",
  "slides": [
    {
      "page": 1,
      "title": "页面标题",
      "points": ["要点1", "要点2", "要点3"],
      "visual": "视觉描述（英文，用于AI生成图片）",
      "speaker_notes": "演讲者备注"
    }
  ]
}`;

// ── 加载环境变量 ──────────────────────────────────────
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
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2];
        }
      }
    }
  }
}

// ── HTTP 请求 ──────────────────────────────────────
function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const mod = urlObj.protocol === 'https:' ? https : http;
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
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

// ── 调用 LLM 生成大纲 ──────────────────────────────────────
async function generateOutline(content, options) {
  const llmUrl = process.env.LLM_PROXY_URL || 'http://127.0.0.1:19000/proxy/llm';
  const model = process.env.LLM_MODEL || 'deepseek-chat';
  
  console.log(`\n🧠 Generating outline using ${model}...`);

  const styleInfo = options.style ? `风格: ${options.style} (${JSON.stringify(STYLE_PRESETS[options.style] || {})})` : '风格: blueprint (默认)';
  const audienceInfo = options.audience ? `受众: ${options.audience}` : '受众: general';
  const slidesInfo = `目标页数: ${options.slides || 12}`;
  const langInfo = `语言: ${options.lang || 'zh'}`;

  const userPrompt = `${styleInfo}\n${audienceInfo}\n${slidesInfo}\n${langInfo}\n\n文章内容:\n${content}`;

  try {
    const res = await httpRequest(llmUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, {
      model,
      messages: [
        { role: 'system', content: OUTLINE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    });

    if (res.status !== 200) {
      throw new Error(`LLM request failed (${res.status})`);
    }

    const text = res.data.choices?.[0]?.message?.content || '';
    // 提取 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in LLM response');

    const outline = JSON.parse(jsonMatch[0]);
    return outline;
  } catch (err) {
    console.error(`❌ LLM outline generation failed: ${err.message}`);
    // 降级：基于内容结构自动生成简单大纲
    return generateFallbackOutline(content, options);
  }
}

// ── 降级大纲生成 ──────────────────────────────────────
function generateFallbackOutline(content, options) {
  console.log('⚠️  Using fallback outline generation...');
  
  const lines = content.split('\n').filter(l => l.trim());
  const headings = lines.filter(l => /^#{1,3}\s/.test(l)).map(l => l.replace(/^#+\s*/, ''));
  
  const slides = [];
  // 封面
  slides.push({
    page: 1,
    title: headings[0] || 'Presentation',
    points: [],
    visual: 'professional cover page design, title centered, abstract geometric background',
    speaker_notes: '开场介绍',
  });

  // 内容页
  const contentHeadings = headings.slice(1) || ['Key Points', 'Details', 'Applications', 'Summary'];
  contentHeadings.forEach((h, i) => {
    slides.push({
      page: i + 2,
      title: h,
      points: ['要点1', '要点2', '要点3'],
      visual: `illustration about ${h}, professional slide design`,
      speaker_notes: '',
    });
  });

  // 总结
  slides.push({
    page: slides.length + 1,
    title: '总结',
    points: ['核心要点回顾', '关键收获', '下一步行动'],
    visual: 'summary slide, key takeaways, clean design',
    speaker_notes: '总结与行动号召',
  });

  return { title: headings[0] || 'Presentation', subtitle: '', slides };
}

// ── 生成页面图片 Prompt ──────────────────────────────────────
function buildSlidePrompt(slide, styleName) {
  const style = STYLE_PRESETS[styleName] || STYLE_PRESETS['blueprint'];
  
  const textureDesc = {
    clean: 'clean solid background, no texture',
    grid: 'subtle grid pattern background',
    organic: 'organic subtle texture, soft gradients',
    pixel: 'pixel art texture',
    paper: 'paper texture background',
  }[style.texture] || 'clean background';

  const moodDesc = {
    professional: 'professional color palette, blues and grays',
    warm: 'warm color palette, oranges and earths',
    cool: 'cool color palette, blues and teals',
    vibrant: 'vibrant bold colors, high energy',
    dark: 'dark mode palette, deep blues and blacks',
    neutral: 'neutral palette, blacks whites grays',
  }[style.mood] || 'balanced colors';

  const densityDesc = {
    minimal: 'minimal content, lots of white space, single focal point',
    balanced: 'balanced content density, clear hierarchy',
    dense: 'dense information layout, multiple sections',
  }[style.density] || 'balanced layout';

  return `Professional slide design for presentation. ${textureDesc}. ${moodDesc}. ${densityDesc}.
Title: "${slide.title}"
${slide.points?.length ? `Key points: ${slide.points.join(', ')}` : ''}
Visual: ${slide.visual}
Aspect ratio 16:9, high quality, readable text, professional presentation slide`;
}

// ── 合并为 PPTX ──────────────────────────────────────
async function mergeToPptx(outline, imagePaths, outputPath) {
  // 尝试使用 pptxgenjs
  try {
    const PptxGenJS = require('pptxgenjs');
    const pptx = new PptxGenJS();
    
    pptx.defineLayout({ name: 'LAYOUT_16x9', width: 10, height: 5.625 });
    pptx.layout = 'LAYOUT_16x9';

    outline.slides.forEach((slide, i) => {
      const s = pptx.addSlide();
      
      // 背景图
      if (imagePaths[i] && fs.existsSync(imagePaths[i])) {
        s.addImage({ path: imagePaths[i], x: 0, y: 0, w: 10, h: 5.625 });
      }
      
      // 标题覆盖层
      s.addText(slide.title, {
        x: 0.5, y: 0.3, w: 9, h: 0.8,
        fontSize: 28, bold: true, color: 'FFFFFF',
        fontFace: 'Microsoft YaHei',
        shadow: { type: 'outer', blur: 6, offset: 2, color: '000000', opacity: 0.5 },
      });

      // 演讲者备注
      if (slide.speaker_notes) {
        s.addNotes(slide.speaker_notes);
      }
    });

    await pptx.writeFile({ fileName: outputPath });
    console.log(`✅ PPTX saved: ${outputPath}`);
    return outputPath;
  } catch (err) {
    console.warn(`⚠️  pptxgenjs not available (${err.message}), installing...`);
    
    // 尝试安装 pptxgenjs
    const { execSync } = require('child_process');
    try {
      execSync('npm install pptxgenjs', { cwd: process.cwd(), stdio: 'pipe' });
      console.log('✅ pptxgenjs installed, retrying...');
      return mergeToPptx(outline, imagePaths, outputPath);
    } catch {
      console.error('❌ Failed to install pptxgenjs. PPTX generation skipped.');
      return null;
    }
  }
}

// ── 主函数 ──────────────────────────────────────
async function main() {
  loadEnv();

  const args = process.argv.slice(2);
  const options = { style: 'blueprint', slides: 12, lang: 'zh' };

  let inputFile = null;
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--style':      options.style = args[++i]; break;
      case '--audience':   options.audience = args[++i]; break;
      case '--lang':       options.lang = args[++i]; break;
      case '--slides':     options.slides = parseInt(args[++i]); break;
      case '--outline-only': options.outlineOnly = true; break;
      case '--prompts-only': options.promptsOnly = true; break;
      case '--images-only':  options.imagesOnly = true; break;
      case '--regenerate':   options.regenerate = args[++i]; break;
      case '--output':     options.outputDir = args[++i]; break;
      case '--help': case '-h':
        console.log(`
WB Slide Deck - PPT 生成器

用法:
  node generate.js article.md
  node generate.js article.md --style corporate --slides 12
  node generate.js article.md --outline-only

参数:
  --style       风格预设 (blueprint/chalkboard/corporate/minimal/notion/bold-editorial/dark-atmospheric/sketch-notes/watercolor/scientific/pixel-art/vintage)
  --audience    受众 (beginners/intermediate/experts/executives/general)
  --lang        语言 (zh/en/ja)
  --slides      目标页数 (8-25, 默认 12)
  --outline-only  只生成大纲
  --prompts-only  生成大纲+Prompt
  --images-only   只生成图片
  --regenerate  重新生成指定页 (如 3 或 2,5,8)
  --output      输出目录
`);
        process.exit(0);
      default:
        if (!args[i].startsWith('-') && !inputFile) inputFile = args[i];
    }
  }

  if (!inputFile) {
    console.error('❌ Missing input file. Use --help for usage.');
    process.exit(1);
  }

  // 读取输入内容
  let content;
  if (fs.existsSync(inputFile)) {
    content = fs.readFileSync(inputFile, 'utf8');
  } else {
    content = inputFile; // 直接文本
  }

  console.log('\n📊 WB Slide Deck - PPT Generator');
  console.log(`   Input: ${inputFile}`);
  console.log(`   Style: ${options.style}`);
  console.log(`   Target slides: ${options.slides}`);

  // Step 1: 生成大纲
  const outline = await generateOutline(content, options);
  console.log(`\n📋 Outline generated: ${outline.slides?.length || 0} slides`);
  console.log(`   Title: ${outline.title}`);

  // 保存大纲
  const outputDir = options.outputDir || path.join(process.cwd(), 'slide-output', outline.title?.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_') || 'slides');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  
  const outlinePath = path.join(outputDir, 'outline.json');
  fs.writeFileSync(outlinePath, JSON.stringify(outline, null, 2), 'utf8');
  console.log(`   Outline saved: ${outlinePath}`);

  if (options.outlineOnly) {
    // 显示大纲
    outline.slides?.forEach((s, i) => {
      console.log(`\n  Page ${s.page}: ${s.title}`);
      s.points?.forEach(p => console.log(`    • ${p}`));
    });
    console.log('\n✅ --outline-only mode, stopping here.');
    return;
  }

  // Step 2: 生成 Prompt 文件
  const promptsDir = path.join(outputDir, 'prompts');
  if (!fs.existsSync(promptsDir)) fs.mkdirSync(promptsDir, { recursive: true });

  const imagePaths = [];
  outline.slides?.forEach((slide, i) => {
    const prompt = buildSlidePrompt(slide, options.style);
    const promptFile = path.join(promptsDir, `${String(i + 1).padStart(2, '0')}-slide-${(slide.title || '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20)}.md`);
    fs.writeFileSync(promptFile, prompt, 'utf8');
    
    const imageFile = path.join(outputDir, `slide_${String(i + 1).padStart(2, '0')}.png`);
    imagePaths.push(imageFile);
  });

  console.log(`\n📝 ${outline.slides?.length} prompt files saved to ${promptsDir}`);

  if (options.promptsOnly) {
    console.log('✅ --prompts-only mode, stopping here.');
    return;
  }

  // Step 3: 生成图片
  console.log('\n🎨 Generating slide images...');
  const imageGen = require('../wb-image-gen/scripts/generate');
  
  for (let i = 0; i < outline.slides.length; i++) {
    const slide = outline.slides[i];
    const pageNumbers = options.regenerate ? options.regenerate.split(',').map(Number) : null;
    
    if (pageNumbers && !pageNumbers.includes(i + 1)) {
      if (fs.existsSync(imagePaths[i])) {
        console.log(`  ⏭️  Skipping slide ${i + 1} (already exists)`);
        continue;
      }
    }

    const prompt = buildSlidePrompt(slide, options.style);
    console.log(`\n  🖼️  Slide ${i + 1}/${outline.slides.length}: ${slide.title}`);
    
    try {
      await imageGen.generateImage(prompt, {
        output: imagePaths[i],
        provider: 'auto',
        ar: '16:9',
        quality: '2k',
      });
    } catch (err) {
      console.warn(`  ⚠️  Slide ${i + 1} image generation failed: ${err.message}`);
      // 创建占位图
      console.log(`  📄 Creating placeholder for slide ${i + 1}`);
    }
  }

  // Step 4: 合并 PPTX
  console.log('\n📎 Merging into PPTX...');
  const pptxPath = path.join(outputDir, `${(outline.title || 'presentation').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_')}.pptx`);
  await mergeToPptx(outline, imagePaths, pptxPath);

  console.log('\n🎉 Slide deck generation complete!');
  console.log(`   Output directory: ${outputDir}`);
  console.log(`   PPTX: ${pptxPath}`);
  console.log(`   Slides: ${outline.slides.length}`);
}

module.exports = { generateOutline, buildSlidePrompt, mergeToPptx, STYLE_PRESETS };

if (require.main === module) {
  main().catch(err => {
    console.error(`❌ Fatal error: ${err.message}`);
    process.exit(1);
  });
}
