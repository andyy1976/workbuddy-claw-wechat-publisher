/**
 * WB Image Gen - AI 图片生成统一入口
 * 支持：DashScope(通义万象) / 火山方舟(Seedream) / OpenAI / Google Gemini
 * 
 * 用法：
 *   node generate.js --prompt "一只猫" --image cat.png
 *   node generate.js --prompt "科技封面" --image cover.png --provider dashscope --ar 16:9
 *   node generate.js --prompt "架构图" --image arch.png --style technical-schematic
 *   node generate.js --batchfile batch.json --jobs 4
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ── 风格预设 ──────────────────────────────────────
const STYLE_PRESETS = {
  'notion':                'minimalist black and white, clean geometric layout, Notion-style documentation aesthetic, sans-serif typography',
  'corporate':             'professional corporate design, clean lines, blue and grey tones, business presentation style',
  'bold-editorial':        'bold editorial magazine cover style, high contrast, dramatic typography, vibrant accents',
  'chalkboard':            'chalkboard style illustration, hand-drawn white chalk on dark board, educational feel',
  'watercolor':            'soft watercolor illustration, pastel palette, dreamy and artistic, flowing brush strokes',
  'cyberpunk':             'cyberpunk neon glow aesthetic, dark futuristic cityscape, holographic elements, purple and cyan',
  'cute':                  'kawaii cute illustration, big round eyes, pastel colors, chibi style, adorable',
  'technical-schematic':   'blueprint technical schematic style, isometric 3D view, engineering diagram, grid lines',
  'corporate-memphis':     'flat vector corporate memphis style, vibrant solid fills, geometric people, abstract shapes',
  'pixel-art':             '8-bit pixel art style, retro gaming aesthetic, nostalgic, chunky pixels',
  'sketch-notes':          'sketch notes style, hand-drawn marker pen on paper, notebook aesthetic, arrows and boxes',
  'minimal':               'ultra minimal design, extensive white space, single focal point, clean typography',
};

// ── 尺寸映射 ──────────────────────────────────────
const AR_SIZES = {
  '1:1':   { w: 1024, h: 1024 },
  '16:9':  { w: 1920, h: 1080 },
  '9:16':  { w: 1080, h: 1920 },
  '4:3':   { w: 1024, h: 768 },
  '3:4':   { w: 768, h: 1024 },
  '2.35:1':{ w: 2048, h: 875 },
};

// ── 加载环境变量 ──────────────────────────────────────
function loadEnv() {
  const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '.env'),
    path.join(process.cwd(), '..', '..', '.env'),
    path.join(process.cwd(), '..', '..', '..', '.env'),
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

// ── HTTPS 请求封装 ──────────────────────────────────────
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
      timeout: 60000,
    };
    const req = mod.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

// ── 下载图片 ──────────────────────────────────────
function downloadImage(url, outputPath) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location, outputPath).then(resolve).catch(reject);
      }
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const ws = fs.createWriteStream(outputPath);
      res.pipe(ws);
      ws.on('finish', () => { ws.close(); resolve(outputPath); });
      ws.on('error', reject);
    }).on('error', reject);
  });
}

// ── DashScope 后端 ──────────────────────────────────────
async function generateDashScope(prompt, options) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error('DASHSCOPE_API_KEY not configured');

  const size = options.size || '1024*1024';
  const model = options.model || 'qwen-image-2.0-pro';

  console.log(`[DashScope] Using model: ${model}, size: ${size}`);

  // Step 1: Submit task
  const submitRes = await httpRequest(
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
    },
    {
      model,
      input: { prompt },
      parameters: {
        size,
        n: 1,
        seed: Math.floor(Math.random() * 999999),
      },
    }
  );

  if (submitRes.status !== 200) {
    throw new Error(`DashScope submit failed: ${JSON.stringify(submitRes.data)}`);
  }

  const taskId = submitRes.data.output?.task_id;
  if (!taskId) throw new Error('No task_id returned from DashScope');

  console.log(`[DashScope] Task submitted: ${taskId}`);

  // Step 2: Poll for result
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    
    const pollRes = await httpRequest(
      `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
      {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}` },
      }
    );

    const status = pollRes.data?.output?.task_status;
    console.log(`[DashScope] Poll ${i + 1}: ${status}`);

    if (status === 'SUCCEEDED') {
      const imageUrl = pollRes.data.output.results?.[0]?.url;
      if (!imageUrl) throw new Error('No image URL in result');
      return { url: imageUrl, provider: 'dashscope', model };
    }

    if (status === 'FAILED') {
      throw new Error(`DashScope generation failed: ${JSON.stringify(pollRes.data.output?.message || pollRes.data)}`);
    }
  }

  throw new Error('DashScope generation timeout (60s)');
}

// ── 火山方舟 Seedream 后端 ──────────────────────────────────────
async function generateSeedream(prompt, options) {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) throw new Error('ARK_API_KEY not configured');

  const model = options.model || 'seedream-4.0';
  const size = options.size || '1024x1024';

  console.log(`[Seedream] Using model: ${model}, size: ${size}`);

  const res = await httpRequest(
    'https://ark.cn-beijing.volces.com/api/v3/images/generations',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    },
    {
      model,
      prompt,
      size,
      n: 1,
    }
  );

  if (res.status !== 200) {
    throw new Error(`Seedream failed (${res.status}): ${JSON.stringify(res.data)}`);
  }

  const imageUrl = res.data?.data?.[0]?.url || res.data?.data?.[0]?.b64_json;
  if (!imageUrl) throw new Error('No image in Seedream response');

  return { url: imageUrl, provider: 'seedream', model, b64: res.data?.data?.[0]?.b64_json };
}

// ── 腾讯混元 Hunyuan 后端（异步模式，使用官方 SDK）──────────────────────
// 文档: https://cloud.tencent.com/document/product/1729/105969
async function generateHunyuan(prompt, options) {
  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) throw new Error('TENCENT_SECRET_ID / TENCENT_SECRET_KEY not configured');

  // 动态加载 SDK（避免未安装时报错）
  const { hunyuan } = require('tencentcloud-sdk-nodejs-hunyuan');
  const client = new hunyuan.v20230901.Client({
    credential: { secretId, secretKey },
    region: 'ap-guangzhou',
    profile: { httpProfile: { endpoint: 'hunyuan.tencentcloudapi.com' } },
  });

  // 混元支持的分辨率
  const HUNYUAN_RESOLUTIONS = ['768:768','768:1024','1024:768','1024:1024','720:1280','1280:720','768:1280','1280:768'];
  let resolution = (options.size || '1024:1024').replace(/[*xX]/g, ':');
  // 映射到最接近的混元分辨率
  if (!HUNYUAN_RESOLUTIONS.includes(resolution)) {
    const [w, h] = resolution.split(':').map(Number);
    const ratio = w / h;
    if (ratio > 1.6) resolution = '1280:720';       // 16:9
    else if (ratio > 1.1) resolution = '1024:768';   // 4:3
    else if (ratio > 0.9) resolution = '1024:1024';  // 1:1
    else if (ratio > 0.7) resolution = '768:1024';   // 3:4
    else resolution = '720:1280';                     // 9:16
  }
  console.log(`[Hunyuan] Submitting image generation task...`);
  console.log(`[Hunyuan] Resolution: ${resolution}`);

  // Step 1: 提交任务
  const submitRes = await client.SubmitHunyuanImageJob({
    Prompt: prompt,
    Resolution: resolution,
    Num: options.num || 1,
    LogoAdd: 0,
  }).catch((err) => {
    throw new Error(`Hunyuan submit failed: ${err.message}`);
  });

  const jobId = submitRes.JobId;
  if (!jobId) throw new Error(`No JobId in response: ${JSON.stringify(submitRes)}`);
  console.log(`[Hunyuan] Job submitted: ${jobId}`);

  // Step 2: 轮询查询结果（最多180秒）
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));

    const descRes = await client.QueryHunyuanImageJob({ JobId: jobId }).catch((err) => {
      console.warn(`[Hunyuan] Poll ${i + 1} error: ${err.message}`);
      return null;
    });

    if (!descRes) continue;

    const jobStatusCode = String(descRes.JobStatusCode || '');
    const statusMsg = descRes.JobStatusMsg || '';
    console.log(`[Hunyuan] Poll ${i + 1}: JobStatusCode=${jobStatusCode} (${statusMsg})`);

    // JobStatusCode: 1=排队中, 2=处理中, 5=完成, 6=失败
    if (jobStatusCode === '5') {
      const imageUrl = Array.isArray(descRes.ResultImage)
        ? descRes.ResultImage[0]
        : descRes.ResultImage;
      if (!imageUrl) throw new Error(`No image URL in Hunyuan result: ${JSON.stringify(descRes)}`);
      console.log(`[Hunyuan] Done! RevisedPrompt: ${descRes.RevisedPrompt?.[0] || ''}`);
      return { url: imageUrl, provider: 'hunyuan', model: 'hunyuan-image' };
    }
    if (jobStatusCode === '6') {
      throw new Error(`Hunyuan generation failed: ${descRes.JobErrorMsg || descRes.JobStatusMsg || JSON.stringify(descRes)}`);
    }
  }
  throw new Error('Hunyuan generation timeout (180s)');
}

// ── OpenAI 后端 ──────────────────────────────────────
async function generateOpenAI(prompt, options) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const model = options.model || 'gpt-image-1';
  const size = options.size || '1024x1024';

  console.log(`[OpenAI] Using model: ${model}, size: ${size}`);

  const res = await httpRequest(
    'https://api.openai.com/v1/images/generations',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    },
    {
      model,
      prompt,
      size,
      quality: options.quality === 'normal' ? 'low' : 'high',
      n: 1,
    }
  );

  if (res.status !== 200) {
    throw new Error(`OpenAI failed (${res.status}): ${JSON.stringify(res.data)}`);
  }

  const imageUrl = res.data?.data?.[0]?.url;
  const b64 = res.data?.data?.[0]?.b64_json;
  if (!imageUrl && !b64) throw new Error('No image in OpenAI response');

  return { url: imageUrl, b64, provider: 'openai', model };
}

// ── 自动选择后端 ──────────────────────────────────────
function detectProvider(preferred) {
  if (preferred) return preferred;

  // 按优先级检测（腾讯混元优先，有免费额度）
  if (process.env.TENCENT_SECRET_ID && process.env.TENCENT_SECRET_KEY) return 'hunyuan';
  if (process.env.DASHSCOPE_API_KEY) return 'dashscope';
  if (process.env.ARK_API_KEY) return 'seedream';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GOOGLE_API_KEY) return 'google';

  return null;
}

// ── 主生成函数 ──────────────────────────────────────
async function generateImage(prompt, options = {}) {
  // 应用风格预设
  if (options.style && STYLE_PRESETS[options.style]) {
    prompt = `${prompt}, ${STYLE_PRESETS[options.style]}`;
  }

  // 解析宽高比
  if (options.ar && !options.size) {
    const arSize = AR_SIZES[options.ar];
    if (arSize) {
      const provider = options.provider || detectProvider();
      options.size = provider === 'dashscope'
        ? `${arSize.w}*${arSize.h}`
        : `${arSize.w}x${arSize.h}`;
    }
  }

  // 选择后端
  const provider = detectProvider(options.provider);
  if (!provider) {
    throw new Error('No image generation API key found. Please configure one of: TENCENT_SECRET_ID+TENCENT_SECRET_KEY, DASHSCOPE_API_KEY, ARK_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY');
  }

  console.log(`\n🎨 Generating image...`);
  console.log(`   Provider: ${provider}`);
  console.log(`   Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`);

  // 生成
  let result;
  const providers = [provider, 'hunyuan', 'dashscope', 'seedream', 'openai'].filter((v, i, a) => a.indexOf(v) === i);
  
  for (const p of providers) {
    try {
      if (p === 'hunyuan') result = await generateHunyuan(prompt, options);
      else if (p === 'dashscope') result = await generateDashScope(prompt, options);
      else if (p === 'seedream') result = await generateSeedream(prompt, options);
      else if (p === 'openai') result = await generateOpenAI(prompt, options);
      else continue;
      
      if (result) break;
    } catch (err) {
      console.warn(`⚠️  ${p} failed: ${err.message}`);
      if (p === provider) {
        console.log('   Trying next available provider...');
      }
    }
  }

  if (!result) throw new Error('All providers failed');

  // 下载图片
  const outputPath = options.output || 'output.png';
  if (result.url) {
    console.log(`📥 Downloading image to ${outputPath}...`);
    await downloadImage(result.url, outputPath);
  } else if (result.b64) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputPath, Buffer.from(result.b64, 'base64'));
  }

  console.log(`✅ Image saved: ${outputPath}`);
  console.log(`   Provider: ${result.provider}, Model: ${result.model}`);

  return {
    success: true,
    path: outputPath,
    provider: result.provider,
    model: result.model,
    prompt,
  };
}

// ── 批量生成 ──────────────────────────────────────
async function batchGenerate(batchFilePath, jobs) {
  const batch = JSON.parse(fs.readFileSync(batchFilePath, 'utf8'));
  const tasks = batch.tasks || batch;
  const concurrency = Math.min(jobs || 4, tasks.length);
  
  console.log(`📦 Batch mode: ${tasks.length} tasks, concurrency: ${concurrency}`);
  
  const results = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const chunk = tasks.slice(i, i + concurrency);
    const chunkResults = await Promise.allSettled(
      chunk.map(task => generateImage(task.prompt, {
        ...task,
        output: task.output || task.image || `output_${i + 1}.png`,
      }))
    );
    results.push(...chunkResults);
  }

  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  console.log(`\n📊 Batch complete: ${succeeded} succeeded, ${failed} failed`);

  return results;
}

// ── CLI 入口 ──────────────────────────────────────
async function main() {
  loadEnv();

  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--prompt': case '-p': options.prompt = args[++i]; break;
      case '--image': case '-o': options.output = args[++i]; break;
      case '--provider': options.provider = args[++i]; break;
      case '--model': case '-m': options.model = args[++i]; break;
      case '--ar': options.ar = args[++i]; break;
      case '--size': options.size = args[++i]; break;
      case '--quality': options.quality = args[++i]; break;
      case '--style': options.style = args[++i]; break;
      case '--ref': options.ref = args[++i]; break;
      case '--batchfile': options.batchfile = args[++i]; break;
      case '--jobs': options.jobs = parseInt(args[++i]); break;
      case '--json': options.json = true; break;
      case '--help': case '-h':
        console.log(`
WB Image Gen - AI 图片生成

用法:
  node generate.js --prompt "描述" --image output.png
  node generate.js --prompt "描述" --provider dashscope --ar 16:9
  node generate.js --prompt "描述" --style notion --quality 2k
  node generate.js --batchfile batch.json --jobs 4

参数:
  --prompt   Prompt 文本
  --image    输出路径
  --provider 后端: dashscope/seedream/openai
  --model    模型 ID
  --ar       宽高比: 1:1, 16:9, 9:16, 4:3, 3:4
  --size     明确尺寸 (如 1024x1024)
  --quality  质量: normal/2k
  --style    风格预设 (notion/corporate/bold-editorial/chalkboard/watercolor/cyberpunk/cute/technical-schematic/corporate-memphis/pixel-art/sketch-notes/minimal)
  --ref      参考图
  --batchfile 批量生成 JSON
  --jobs     并行数 (默认 4)
  --json     JSON 输出
`);
        process.exit(0);
    }
  }

  try {
    if (options.batchfile) {
      const results = await batchGenerate(options.batchfile, options.jobs);
      if (options.json) console.log(JSON.stringify(results, null, 2));
    } else if (options.prompt) {
      const result = await generateImage(options.prompt, options);
      if (options.json) console.log(JSON.stringify(result, null, 2));
    } else {
      console.error('❌ Missing --prompt or --batchfile. Use --help for usage.');
      process.exit(1);
    }
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

// 导出供其他模块使用
module.exports = { generateImage, batchGenerate, STYLE_PRESETS, AR_SIZES };

// 直接运行时执行 CLI
if (require.main === module) {
  main();
}
