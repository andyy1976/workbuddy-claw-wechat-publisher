/**
 * WB Cover Image - 封面图生成器
 * 5维参数系统：Type × Palette × Rendering × Text × Mood
 */

const fs = require('fs');
const path = require('path');

const DIMENSIONS = {
  type:      ['hero', 'conceptual', 'typography', 'metaphor', 'scene', 'minimal'],
  palette:   ['warm', 'elegant', 'cool', 'dark', 'earth', 'vivid', 'pastel', 'mono', 'retro', 'duotone', 'macaron'],
  rendering: ['flat-vector', 'hand-drawn', 'painterly', 'digital', 'pixel', 'chalk', 'screen-print'],
  text:      ['none', 'title-only', 'title-subtitle', 'text-rich'],
  mood:      ['subtle', 'balanced', 'bold'],
};

const DIM_DESC = {
  type: {
    hero: 'dramatic hero shot, full-bleed image, bold focal point',
    conceptual: 'conceptual abstract illustration representing the topic',
    typography: 'typography-focused design, large text as the main visual',
    metaphor: 'visual metaphor, symbolic imagery representing the subject',
    scene: 'realistic scene depicting the topic context',
    minimal: 'ultra minimal, single element, extensive white space',
  },
  palette: {
    warm: 'warm color palette, oranges reds yellows',
    elegant: 'elegant color palette, navy gold cream',
    cool: 'cool color palette, blues teals cyans',
    dark: 'dark color palette, deep blues blacks purples',
    earth: 'earth tone palette, browns greens terracotta',
    vivid: 'vivid saturated colors, bright and energetic',
    pastel: 'soft pastel palette, light and gentle',
    mono: 'monochrome palette, single hue with shades',
    retro: 'retro color palette, muted vintage tones',
    duotone: 'duotone palette, two contrasting colors',
    macaron: 'macaron palette, sweet soft candy colors',
  },
  rendering: {
    'flat-vector': 'flat vector style, clean geometric shapes, no gradients',
    'hand-drawn': 'hand-drawn illustration style, sketchy lines, organic',
    'painterly': 'painterly style, visible brush strokes, artistic',
    'digital': 'digital art style, polished, modern CGI aesthetic',
    'pixel': 'pixel art style, 8-bit retro gaming aesthetic',
    'chalk': 'chalk on blackboard style, textured white marks',
    'screen-print': 'screen print style, bold flat colors, sharp edges',
  },
  text: {
    'none': 'no text on image',
    'title-only': 'article title displayed prominently',
    'title-subtitle': 'title and subtitle displayed',
    'text-rich': 'title, subtitle, and key points displayed',
  },
  mood: {
    subtle: 'subtle understated mood, gentle and refined',
    balanced: 'balanced harmonious mood, professional and appealing',
    bold: 'bold dramatic mood, striking and attention-grabbing',
  },
};

function buildCoverPrompt(title, subtitle, dims) {
  const typeDesc = DIM_DESC.type[dims.type || 'conceptual'];
  const paletteDesc = DIM_DESC.palette[dims.palette || 'cool'];
  const renderingDesc = DIM_DESC.rendering[dims.rendering || 'digital'];
  const textDesc = DIM_DESC.text[dims.text || 'title-only'];
  const moodDesc = DIM_DESC.mood[dims.mood || 'balanced'];

  let textPart = '';
  if (dims.text === 'title-only') textPart = `Display the title "${title}" prominently.`;
  else if (dims.text === 'title-subtitle') textPart = `Display the title "${title}" and subtitle "${subtitle || ''}".`;
  else if (dims.text === 'text-rich') textPart = `Display the title "${title}" and subtitle "${subtitle || ''}" with key points.`;

  return `Professional cover image for an article. ${typeDesc}. ${paletteDesc}. ${renderingDesc}. ${moodDesc}. ${textPart} ${textDesc}. High quality, publication-ready, aspect ratio 16:9`;
}

function autoSelectDimensions(content) {
  const lower = content.toLowerCase();
  
  let type = 'conceptual';
  if (/架构|architecture|系统|system/.test(lower)) type = 'scene';
  else if (/教程|tutorial|指南|guide/.test(lower)) type = 'typography';
  else if (/故事|story|案例|case/.test(lower)) type = 'metaphor';
  else if (/数据|data|分析|analysis/.test(lower)) type = 'minimal';

  let palette = 'cool';
  if (/科技|tech|AI|人工智能/.test(lower)) palette = 'cool';
  else if (/文化|culture|历史|history/.test(lower)) palette = 'retro';
  else if (/健康|health|生活|life/.test(lower)) palette = 'pastel';
  else if (/商业|business|金融|finance/.test(lower)) palette = 'elegant';

  return { type, palette, rendering: 'digital', text: 'title-only', mood: 'balanced' };
}

async function main() {
  const args = process.argv.slice(2);
  const dims = {};
  let inputFile = null, quick = false, noTitle = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--type':      dims.type = args[++i]; break;
      case '--palette':   dims.palette = args[++i]; break;
      case '--rendering': dims.rendering = args[++i]; break;
      case '--text':      dims.text = args[++i]; break;
      case '--mood':      dims.mood = args[++i]; break;
      case '--quick':     quick = true; break;
      case '--no-title':  noTitle = true; break;
      case '--output':    dims.output = args[++i]; break;
      case '--help':
        console.log('\nWB Cover Image - 封面图生成器\n\n维度: --type, --palette, --rendering, --text, --mood\n'); process.exit(0);
      default:
        if (!args[i].startsWith('-') && !inputFile) inputFile = args[i];
    }
  }

  if (!inputFile) { console.error('❌ Missing input'); process.exit(1); }

  let content = fs.existsSync(inputFile) ? fs.readFileSync(inputFile, 'utf8') : inputFile;
  
  // 提取标题
  const titleMatch = content.match(/^#\s+(.+)/m) || content.match(/^title:\s*(.+)/m);
  const title = titleMatch ? titleMatch[1] : inputFile.replace(/\.(md|txt)$/, '');
  const subtitle = '';

  // 自动选择维度
  const autoDims = autoSelectDimensions(content);
  const finalDims = { ...autoDims, ...dims };
  if (noTitle) finalDims.text = 'none';

  console.log('\n🖼️  WB Cover Image Generator');
  console.log(`   Type: ${finalDims.type}, Palette: ${finalDims.palette}, Rendering: ${finalDims.rendering}`);
  console.log(`   Text: ${finalDims.text}, Mood: ${finalDims.mood}`);

  const prompt = buildCoverPrompt(title, subtitle, finalDims);
  console.log(`\n   Title: ${title}`);

  const imageGen = require('../../wb-image-gen/scripts/generate');
  const outputPath = dims.output || 'cover.png';

  try {
    await imageGen.generateImage(prompt, {
      output: outputPath,
      ar: '16:9',
      quality: '2k',
    });
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}

module.exports = { buildCoverPrompt, autoSelectDimensions, DIMENSIONS, DIM_DESC };

if (require.main === module) {
  main().catch(err => { console.error(`❌ ${err.message}`); process.exit(1); });
}
