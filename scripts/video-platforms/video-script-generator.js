/**
 * 视频脚本生成器
 * 将文章转为短视频脚本（60秒内）
 * 
 * 输出格式:
 * - 分镜列表 (scenes)
 * - 旁白文本 (voiceover)
 * - 画面描述 (visual)
 * - 字幕文本 (subtitle)
 * - 音乐建议 (music)
 */

const path = require('path');
const fs = require('fs');

/**
 * 生成短视频脚本
 * @param {Object} options
 * @param {string} options.title - 文章标题
 * @param {string} options.content - 文章内容
 * @param {string} options.summary - 文章摘要
 * @param {string} options.duration - 目标时长 (30s, 60s, 90s)
 * @param {string} options.style - 风格 (documentary, viral, educational)
 */
async function generateVideoScript({ title, content, summary, duration = '60s', style = 'documentary' }) {
    console.log('🎬 生成视频脚本...');
    
    // 调用 AI 生成脚本
    const aiProviders = loadAIProviders();
    const prompt = buildVideoScriptPrompt({ title, content, summary, duration, style });
    
    let script = null;
    for (const provider of aiProviders) {
        try {
            console.log(`🤖 尝试 ${provider.name}...`);
            script = await callAI(prompt, provider);
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
    const parsed = parseVideoScript(script);
    
    // 保存脚本
    const scriptPath = path.join(__dirname, '..', 'output', `video_script_${Date.now()}.json`);
    fs.writeFileSync(scriptPath, JSON.stringify(parsed, null, 2));
    console.log(`📄 脚本已保存: ${scriptPath}`);
    
    return parsed;
}

/**
 * 构建视频脚本提示词
 */
function buildVideoScriptPrompt({ title, content, summary, duration, style }) {
    const styleGuide = {
        documentary: '纪录片风格：严肃、专业、信息密度高',
        viral: '爆款风格：节奏快、情绪化、吸引眼球',
        educational: '教育风格：清晰、易懂、循序渐进'
    };
    
    return `你是一个专业的短视频脚本编剧。请将以下文章转换为${duration}的短视频脚本。

**文章标题**: ${title}

**文章摘要**: ${summary}

**文章正文**: 
${content.substring(0, 2000)}...

**脚本要求**:
1. 时长: ${duration}
2. 风格: ${styleGuide[style]}
3. 输出 JSON 格式，包含以下字段:
   - title: 视频标题（吸引眼球，15字内）
   - duration: 预计时长（秒）
   - scenes: 分镜数组，每个分镜包含:
     * id: 分镜编号
     * visual: 画面描述（AI 视频生成用）
     * voiceover: 旁白文本（50字内）
     * subtitle: 字幕文本（简短）
     * duration: 该分镜时长（秒）
   - music: 推荐背景音乐风格
   - hashtags: 推荐话题标签（5个）

**输出示例**:
\`\`\`json
{
  "title": "AI芯片大突破！",
  "duration": 60,
  "scenes": [
    {
      "id": 1,
      "visual": "AI芯片特写，电路板发光，蓝色科技感",
      "voiceover": "英伟达刚刚宣布，AI设计芯片取得重大突破！",
      "subtitle": "AI设计芯片突破",
      "duration": 8
    }
  ],
  "music": "科技感电子音乐，节奏明快",
  "hashtags": ["#AI", "#芯片", "#科技", "#英伟达", "#创新"]
}
\`\`\`

请严格按照 JSON 格式输出，不要包含其他解释文字。`;
}

/**
 * 解析视频脚本
 */
function parseVideoScript(scriptText) {
    try {
        // 提取 JSON（可能包含在代码块中）
        const jsonMatch = scriptText.match(/```json\s*([\s\S]*?)\s*```/) || 
                        scriptText.match(/\{[\s\S]*\}/);
        
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : scriptText;
        return JSON.parse(jsonStr.trim());
    } catch (e) {
        console.log('⚠️  脚本解析失败，使用默认格式');
        return {
            title: 'AI 科技速递',
            duration: 60,
            scenes: [
                {
                    id: 1,
                    visual: '科技背景，AI 芯片，数据中心',
                    voiceover: '最新科技突破，AI 正在改变世界',
                    subtitle: 'AI 改变世界',
                    duration: 10
                }
            ],
            music: '科技感背景音乐',
            hashtags: ['#AI', '#科技']
        };
    }
}

/**
 * 加载 AI 提供者配置
 */
function loadAIProviders() {
    try {
        const configPath = path.join(__dirname, '..', 'config', 'ai-providers.json');
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
        return [{ name: 'astron', model: 'astron-code-latest' }];
    }
}

/**
 * 调用 AI (简化版本，实际应从 enhanced-engine.js 导入)
 */
async function callAI(prompt, provider) {
    const axios = require('axios');
    
    // 这里简化实现，实际应该调用真实的 AI API
    // 为了简化，我返回一个模拟响应
    if (provider.name === 'mock') {
        return JSON.stringify({
            title: 'AI 科技速递',
            duration: 60,
            scenes: [
                {
                    id: 1,
                    visual: '科技背景，AI 芯片，数据中心',
                    voiceover: '最新科技突破，AI 正在改变世界',
                    subtitle: 'AI 改变世界',
                    duration: 10
                }
            ],
            music: '科技感背景音乐',
            hashtags: ['#AI', '#科技']
        });
    }
    
    // 实际调用（简化）
    throw new Error('需要使用真实的 AI API 调用');
}

/**
 * 生成视频脚本并保存
 */
async function generateAndSaveScript(articleData) {
    const script = await generateVideoScript(articleData);
    
    const outputPath = path.join(__dirname, '..', 'output', `video_${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(script, null, 2));
    
    console.log('\n📊 视频脚本生成完成:');
    console.log(`   标题: ${script.title}`);
    console.log(`   时长: ${script.duration}秒`);
    console.log(`   分镜: ${script.scenes.length}个`);
    console.log(`   音乐: ${script.music}`);
    console.log(`   标签: ${script.hashtags.join(', ')}`);
    
    return { script, outputPath };
}

module.exports = { generateVideoScript, generateAndSaveScript };

// 测试
if (require.main === module) {
    (async () => {
        const testArticle = {
            title: '英伟达用AI设计芯片：开发周期从10个月压缩到一晚',
            content: '英伟达宣布AI设计芯片取得重大突破，开发周期从10个月压缩到一晚...',
            summary: '英伟达用AI设计芯片，开发周期从10个月压缩到一晚，摩尔定律要终结了吗？',
            duration: '60s',
            style: 'viral'
        };
        
        try {
            const result = await generateAndSaveScript(testArticle);
            console.log('\n✅ 测试成功');
        } catch (e) {
            console.log(`\n❌ 测试失败: ${e.message}`);
        }
    })();
}