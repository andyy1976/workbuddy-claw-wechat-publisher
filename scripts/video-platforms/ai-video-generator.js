/**
 * AI 视频生成器
 * 使用 inference.sh CLI 生成视频
 * 
 * 需要安装: npm install -g inference.sh
 * 登录: infsh login
 * 
 * 支持的模型:
 * - google/veo-3-1-fast (Veo 3.1 Fast, 带音频)
 * - google/veo-3-1 (Veo 3.1, 最佳质量)
 * - bytedance/seedance-1-5-pro (Seedance 1.5 Pro)
 * - falai/wan-2-5 (Wan 2.5, 图像转视频)
 * - xai/grok-imagine-video (Grok Video)
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * 生成视频（文本转视频）
 * @param {Object} options
 * @param {string} options.prompt - 视频描述提示词
 * @param {string} options.model - 模型 ID (默认: google/veo-3-1-fast)
 * @param {number} options.duration - 时长（秒，默认 8）
 * @param {string} options.aspectRatio - 宽高比 (16:9, 9:16, 1:1)
 * @param {string} options.outputPath - 输出路径（可选）
 */
async function generateVideo({ 
    prompt, 
    model = 'google/veo-3-1-fast', 
    duration = 8, 
    aspectRatio = '9:16',
    outputPath = null 
}) {
    console.log('🎬 生成 AI 视频...');
    console.log(`   模型: ${model}`);
    console.log(`   提示词: ${prompt.substring(0, 50)}...`);
    console.log(`   时长: ${duration}秒`);
    console.log(`   比例: ${aspectRatio}`);
    
    // 构建命令
    const timestamp = Date.now();
    const tempOutput = outputPath || path.join(__dirname, '..', 'output', `video_${timestamp}.mp4`);
    
    // 确保输出目录存在
    const outputDir = path.dirname(tempOutput);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // inference.sh 命令
    const cmd = `infsh app run ${model} --input '{"prompt": "${prompt.replace(/'/g, "\\'")}", "duration": ${duration}, "aspect_ratio": "${aspectRatio}"}' --output "${tempOutput}"`;
    
    console.log(`   命令: ${cmd.substring(0, 100)}...`);
    
    try {
        const { stdout, stderr } = await execPromise(cmd, { 
            timeout: 300000, // 5分钟超时
            maxBuffer: 1024 * 1024 * 10 
        });
        
        if (stdout) console.log('   输出:', stdout.substring(0, 200));
        if (stderr) console.log('   错误:', stderr.substring(0, 200));
        
        // 检查文件是否生成
        if (fs.existsSync(tempOutput)) {
            console.log(`✅ 视频生成成功: ${tempOutput}`);
            console.log(`   文件大小: ${(fs.statSync(tempOutput).size / 1024 / 1024).toFixed(2)} MB`);
            return { success: true, outputPath: tempOutput };
        } else {
            throw new Error('视频文件未生成');
        }
    } catch (e) {
        console.log(`❌ 视频生成失败: ${e.message}`);
        
        // 尝试备用模型
        if (model !== 'google/veo-3-1-fast') {
            console.log('⚠️  尝试备用模型...');
            return await generateVideo({ 
                prompt, 
                model: 'google/veo-3-1-fast', 
                duration, 
                aspectRatio, 
                outputPath 
            });
        }
        
        return { success: false, error: e.message };
    }
}

/**
 * 图像转视频
 * @param {Object} options
 * @param {string} options.imagePath - 输入图片路径
 * @param {string} options.prompt - 动作描述（可选）
 * @param {string} options.model - 模型 ID (默认: falai/wan-2-5-i2v)
 */
async function imageToVideo({ 
    imagePath, 
    prompt = '', 
    model = 'falai/wan-2-5-i2v',
    outputPath = null 
}) {
    console.log('🎬 图像转视频...');
    console.log(`   图片: ${imagePath}`);
    console.log(`   模型: ${model}`);
    
    if (!fs.existsSync(imagePath)) {
        throw new Error(`图片不存在: ${imagePath}`);
    }
    
    const timestamp = Date.now();
    const tempOutput = outputPath || path.join(__dirname, '..', 'output', `i2v_${timestamp}.mp4`);
    
    const cmd = `infsh app run ${model} --input '{"image": "${imagePath}", "prompt": "${prompt}"}' --output "${tempOutput}"`;
    
    try {
        const { stdout, stderr } = await execPromise(cmd, { 
            timeout: 300000,
            maxBuffer: 1024 * 1024 * 10 
        });
        
        if (fs.existsSync(tempOutput)) {
            console.log(`✅ 视频生成成功: ${tempOutput}`);
            return { success: true, outputPath: tempOutput };
        } else {
            throw new Error('视频文件未生成');
        }
    } catch (e) {
        console.log(`❌ 视频生成失败: ${e.message}`);
        return { success: false, error: e.message };
    }
}

/**
 * 从视频脚本生成完整视频
 * @param {Object} script - 视频脚本（由 video-script-generator.js 生成）
 * @param {string} options.thumbnailPath - 缩略图路径（可选）
 */
async function generateVideoFromScript(script, { thumbnailPath = null } = {}) {
    console.log('\n🎬 从脚本生成视频...');
    console.log(`   标题: ${script.title}`);
    console.log(`   分镜数: ${script.scenes.length}`);
    
    const results = [];
    
    for (const scene of script.scenes) {
        console.log(`\n📹 生成分镜 ${scene.id}/${script.scenes.length}`);
        console.log(`   画面: ${scene.visual}`);
        
        const result = await generateVideo({
            prompt: scene.visual,
            duration: scene.duration,
            aspectRatio: '9:16' // 竖屏适合短视频
        });
        
        results.push({
            sceneId: scene.id,
            ...result
        });
        
        if (!result.success) {
            console.log(`⚠️  分镜 ${scene.id} 生成失败，继续...`);
        }
    }
    
    console.log('\n📊 视频生成完成:');
    console.log(`   成功: ${results.filter(r => r.success).length}/${results.length}`);
    
    return results;
}

/**
 * 检查 inference.sh CLI 是否安装
 */
async function checkCLI() {
    try {
        const { stdout } = await execPromise('infsh --version');
        console.log(`✅ inference.sh CLI 已安装: ${stdout.trim()}`);
        return true;
    } catch (e) {
        console.log('⚠️  inference.sh CLI 未安装');
        console.log('   请运行: npm install -g inference.sh');
        console.log('   然后登录: infsh login');
        return false;
    }
}

module.exports = { 
    generateVideo, 
    imageToVideo, 
    generateVideoFromScript,
    checkCLI 
};

// 测试
if (require.main === module) {
    (async () => {
        // 检查 CLI
        const installed = await checkCLI();
        if (!installed) {
            console.log('\n❌ 请先安装 inference.sh CLI');
            process.exit(1);
        }
        
        // 测试生成视频
        try {
            const result = await generateVideo({
                prompt: 'AI chip close-up, circuit board glowing, blue tech style',
                duration: 8,
                aspectRatio: '9:16'
            });
            
            if (result.success) {
                console.log('\n✅ 测试成功');
                console.log(`   视频: ${result.outputPath}`);
            }
        } catch (e) {
            console.log(`\n❌ 测试失败: ${e.message}`);
        }
    })();
}