const fs = require('fs');
const path = require('path');
const MarkdownToWeChat = require('./markdown-to-wechat');

// 命令行使用
async function main() {
    const args = process.argv.slice(2);
    const title = args[0];
    const outputPath = args[1];
    
    if (!title) {
        console.error('Usage: node generate_cover.js <title> [output-path]');
        console.error('   title: 文章标题');
        console.error('   output-path: 输出文件路径（默认: cover.png）');
        process.exit(1);
    }
    
    const converter = new MarkdownToWeChat();
    
    try {
        const coverPath = outputPath || 'cover.png';
        
        // 确保输出目录存在
        const outputDir = path.dirname(coverPath);
        if (outputDir && !fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        console.log(`正在为标题生成封面图: "${title}"`);
        
        const coverGenerated = await converter.generateCover(title, coverPath);
        
        if (coverGenerated) {
            console.log(`封面图生成成功: ${coverPath}`);
            
            // 显示封面图信息
            const stats = fs.statSync(coverPath);
            console.log(`文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
            console.log(`尺寸: 1000x400 像素`);
            
        } else {
            console.error('❌ 封面图生成失败');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ 生成封面图过程出错:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
