/**
 * 漫剧脚本生成器
 * 将文章转为漫剧/漫画脚本（多格分镜）
 * 
 * 输出格式:
 * - 分格列表 (panels)
 * - 角色对话 (dialogues)
 * - 镜头描述 (camera)
 * - 表情动作 (actions)
 * - 音效建议 (sound_effects)
 */

const path = require('path');
const fs = require('fs');

/**
 * 生成漫剧脚本
 * @param {Object} options
 * @param {string} options.title - 文章标题
 * @param {string} options.content - 文章内容
 * @param {string} options.summary - 文章摘要
 * @param {number} options.panelCount - 分格数量 (默认 8-12)
 * @param {string} options.style - 风格 (manhua, webtoon, american)
 */
async function generateManhuaScript({ title, content, summary, panelCount = 10, style = 'manhua' }) {
    console.log('🎨 生成漫剧脚本...');
    
    const styleGuide = {
        manhua: '中式漫画风格：分格紧凑，对话框在上方，动作夸张',
        webtoon: '韩式条漫风格：纵向滚动，画面连贯，对话自然',
        american: '美式漫画风格：分格规整，旁白框，拟声词突出'
    };
    
    const prompt = `你是一个专业的漫剧脚本编剧。请将以下文章转换为${panelCount}格的漫剧脚本。

**文章标题**: ${title}

**文章摘要**: ${summary}

**文章正文**: 
${content.substring(0, 3000)}...

**脚本要求**:
1. 风格: ${styleGuide[style]}
2. 输出 JSON 格式，包含以下字段:
   - title: 漫剧标题（吸引眼球）
   - totalPanels: 总格数
   - characters: 角色列表（名称、外观描述）
   - panels: 分格数组，每个分格包含:
     * id: 分格编号
     * scene: 场景描述（时间、地点、环境）
     * visual: 画面描述（构图、视角、细节）
     * dialogues: 对话数组，每个对话包含:
       - character: 说话角色
       - text: 对话内容（口语化，每句20字内）
       - position: 对话框位置（top, middle, bottom）
     * actions: 动作描述数组（表情、肢体动作）
     * soundEffects: 音效（拟声词，如"砰！"、"咔嚓"）
     * duration: 建议显示时长（秒）
   - backgroundMusic: 推荐背景音乐风格
   - voiceActors: 建议声优风格（男女声、音色）

**输出示例**:
\`\`\`json
{
  "title": "AI芯片大突破！英伟达的惊天秘密",
  "totalPanels": 10,
  "characters": [
    {"name": "小艾", "desc": "年轻程序员，戴眼镜，穿 hoodie"},
    {"name": "老黄", "desc": "英伟达CEO，标志性皮衣"}
  ],
  "panels": [
    {
      "id": 1,
      "scene": "深夜，办公室，灯光昏暗",
      "visual": "特写：小艾盯着屏幕，震惊表情，屏幕显示AI设计芯片界面",
      "dialogues": [
        {"character": "小艾", "text": "天哪！10个月的工作，一晚就完成了？", "position": "top"}
      ],
      "actions": ["小艾瞪大眼睛，嘴巴张开", "手颤抖指着屏幕"],
      "soundEffects": ["啪嗒（键盘声）"],
      "duration": 5
    }
  ],
  "backgroundMusic": "悬疑感电子音，渐强",
  "voiceActors": {"小艾": "青年男声，惊讶", "老黄": "中年男声，沉稳"}
}
\`\`\`

请严格按照 JSON 格式输出，不要包含其他解释文字。`;

    // 调用 AI 生成脚本
    const aiProviders = loadAIProviders();
    let script = null;
    
    for (const provider of aiProviders) {
        try {
            console.log(`🤖 尝试 ${provider.name}...`);
            script = await callAIForScript(prompt, provider);
            if (script) {
                console.log(`✅ ${provider.name} 成功`);
                break;
            }
        } catch (e) {
            console.log(`❌ ${provider.name} 失败: ${e.message}`);
        }
    }
    
    if (!script) {
        throw new Error('所有 AI 模型调用失败');
    }
    
    // 解析脚本
    const parsed = parseManhuaScript(script);
    
    // 保存脚本
    const scriptPath = path.join(__dirname, '..', 'output', `manhua_script_${Date.now()}.json`);
    fs.writeFileSync(scriptPath, JSON.stringify(parsed, null, 2));
    console.log(`📄 漫剧脚本已保存: ${scriptPath}`);
    
    return parsed;
}

/**
 * 解析漫剧脚本
 */
function parseManhuaScript(scriptText) {
    try {
        const jsonMatch = scriptText.match(/```json\s*([\s\S]*?)\s*```/) || 
                        scriptText.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : scriptText;
        return JSON.parse(jsonStr.trim());
    } catch (e) {
        console.log('⚠️  脚本解析失败，使用默认格式');
        return {
            title: 'AI 科技漫剧',
            totalPanels: 8,
            characters: [
                { name: '解说员', desc: '旁白声音' }
            ],
            panels: [
                {
                    id: 1,
                    scene: '科技实验室',
                    visual: 'AI 芯片特写',
                    dialogues: [
                        { character: '解说员', text: '科技正在改变世界', position: 'top' }
                    ],
                    actions: ['镜头推进'],
                    soundEffects: [],
                    duration: 5
                }
            ],
            backgroundMusic: '科技感背景音乐',
            voiceActors: { '解说员': '沉稳男声' }
        };
    }
}

/**
 * 加载 AI 提供者配置
 */
function loadAIProviders() {
    try {
        const configPath = path.join(__dirname, '..', 'config', 'ai-providers.json');
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
        return [{ name: 'astron', model: 'astron-code-latest' }];
    }
}

/**
 * 调用 AI 生成脚本 (简化版，实际需要接入真实 API)
 */
async function callAIForScript(prompt, provider) {
    // 这里是简化实现，实际应该调用真实的 AI API
    // 可以复用 enhanced-engine.js 中的 callAI 函数
    throw new Error('需要实现真实的 AI API 调用');
}

/**
 * 生成并保存漫剧脚本
 */
async function generateAndSaveManhuaScript(articleData) {
    const script = await generateManhuaScript(articleData);
    
    const outputPath = path.join(__dirname, '..', 'output', `manhua_${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(script, null, 2));
    
    console.log('\n📊 漫剧脚本生成完成:');
    console.log(`   标题: ${script.title}`);
    console.log(`   分格数: ${script.totalPanels}`);
    console.log(`   角色数: ${script.characters.length}`);
    console.log(`   背景音乐: ${script.backgroundMusic}`);
    
    return { script, outputPath };
}

module.exports = { generateManhuaScript, generateAndSaveManhuaScript };

// 测试
if (require.main === module) {
    (async () => {
        const testArticle = {
            title: '英伟达用AI设计芯片：开发周期从10个月压缩到一晚',
            content: '英伟达宣布AI设计芯片取得重大突破，开发周期从10个月压缩到一晚...',
            summary: '英伟达用AI设计芯片，开发周期从10个月压缩到一晚，摩尔定律要终结了吗？',
            panelCount: 10,
            style: 'manhua'
        };
        
        try {
            const result = await generateAndSaveManhuaScript(testArticle);
            console.log('\n✅ 测试成功');
        } catch (e) {
            console.log(`\n❌ 测试失败: ${e.message}`);
        }
    })();
}