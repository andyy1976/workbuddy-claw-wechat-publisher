const fs = require('fs');
const path = require('path');
const markdownit = require('markdown-it');
const sharp = require('sharp');

class MarkdownToWeChat {
    constructor() {
        this.md = markdownit({
            html: true,
            breaks: true,
            linkify: true
        });
    }

    // 生成标题哈希值用于配色
    generateTitleHash(title) {
        let hash = 0;
        for (let i = 0; i < title.length; i++) {
            const char = title.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转为32位整数
        }
        return Math.abs(hash);
    }

    // 根据哈希值选择配色方案
    getColorScheme(hash) {
        const colorSchemes = [
            { bg: '#667eea', text: '#ffffff', accent: '#764ba2' }, // 紫蓝渐变
            { bg: '#f093fb', text: '#ffffff', accent: '#f5576c' }, // 粉紫渐变
            { bg: '#4facfe', text: '#ffffff', accent: '#00f2fe' }, // 蓝绿渐变
            { bg: '#43e97b', text: '#ffffff', accent: '#38f9d7' }, // 绿青渐变
            { bg: '#fa709a', text: '#ffffff', accent: '#fee140' }, // 粉黄渐变
            { bg: '#30cfd0', text: '#ffffff', accent: '#330867' }, // 青紫渐变
            { bg: '#a8edea', text: '#000000', accent: '#fed6e3' }, // 浅蓝粉
            { bg: '#ff9a9e', text: '#000000', accent: '#fecfef' }, // 浅粉
            { bg: '#ffecd2', text: '#000000', accent: '#fcb69f' }, // 暖橙
            { bg: '#ff6e7f', text: '#ffffff', accent: '#bfe9ff' }  // 红蓝色
        ];
        return colorSchemes[hash % colorSchemes.length];
    }

    // 生成 SVG 封面图
    generateSVGCover(title, colorScheme, width = 1000, height = 400) {
        const { bg, text, accent } = colorScheme;
        
        // 计算标题字体大小
        let fontSize = 48;
        if (title.length > 30) fontSize = 36;
        if (title.length > 50) fontSize = 28;
        
        // 标题换行处理
        const maxCharsPerLine = 25;
        const lines = [];
        let currentLine = '';
        for (let i = 0; i < title.length; i++) {
            if (currentLine.length >= maxCharsPerLine && title[i] === ' ') {
                lines.push(currentLine.trim());
                currentLine = '';
            }
            currentLine += title[i];
        }
        if (currentLine) lines.push(currentLine.trim());
        
        // 计算文本位置
        const lineHeight = fontSize * 1.5;
        const totalTextHeight = lines.length * lineHeight;
        const startY = (height - totalTextHeight) / 2;
        
        return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <!-- 渐变背景 -->
    <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${bg};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${accent};stop-opacity:1" />
        </linearGradient>
    </defs>
    
    <!-- 背景 -->
    <rect width="${width}" height="${height}" fill="url(#bgGradient)"/>
    
    <!-- 装饰性圆圈 -->
    <circle cx="100" cy="100" r="60" fill="${text}" opacity="0.1"/>
    <circle cx="${width - 100}" cy="${height - 100}" r="80" fill="${text}" opacity="0.1"/>
    
    <!-- 标题 -->
    <g fill="${text}" font-family="Microsoft YaHei, Arial, sans-serif" font-size="${fontSize}" font-weight="bold" text-anchor="middle">
        ${lines.map((line, i) => `
        <text x="${width / 2}" y="${startY + (i + 0.8) * lineHeight}">${line}</text>
        `).join('')}
    </g>
    
    <!-- 底部装饰条 -->
    <rect x="0" y="${height - 20}" width="${width}" height="20" fill="${text}" opacity="0.2"/>
</svg>
`.trim();
    }

    // SVG 转 PNG
    async svgToPng(svgContent, outputPath, width = 1000, height = 400) {
        try {
            await sharp(Buffer.from(svgContent))
                .resize(width, height)
                .png()
                .toFile(outputPath);
            return true;
        } catch (error) {
            console.error('SVG 转 PNG 失败:', error);
            return false;
        }
    }

    // 自动生成封面图
    async generateCover(title, outputPath) {
        const hash = this.generateTitleHash(title);
        const colorScheme = this.getColorScheme(hash);
        const svg = this.generateSVGCover(title, colorScheme);
        const success = await this.svgToPng(svg, outputPath);
        return success ? outputPath : null;
    }

    // Markdown 转 HTML
    markdownToHTML(markdownContent, title, coverPath) {
        // 解析 Markdown
        const contentHTML = this.md.render(markdownContent);
        
        // 微信公众号 HTML 模板
        return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f8f9fa;
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
        }
        
        /* 标题 */
        .article-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 30px;
            border-radius: 12px;
            margin-bottom: 30px;
            text-align: center;
        }
        
        .article-title {
            font-size: 28px;
            font-weight: bold;
            margin-bottom: 15px;
            line-height: 1.4;
        }
        
        .article-meta {
            font-size: 14px;
            opacity: 0.9;
        }
        
        /* 封面图 */
        .article-cover {
            width: 100%;
            border-radius: 8px;
            margin-bottom: 20px;
            display: block;
        }
        
        /* 内容区域 */
        .article-content {
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 2px 15px rgba(0,0,0,0.1);
        }
        
        /* Markdown 样式 */
        .article-content h1 { font-size: 24px; margin: 24px 0 16px 0; color: #2c3e50; }
        .article-content h2 { font-size: 20px; margin: 20px 0 14px 0; color: #34495e; }
        .article-content h3 { font-size: 18px; margin: 18px 0 12px 0; color: #4a5568; }
        
        .article-content p { margin: 14px 0; text-align: justify; }
        
        .article-content ul, .article-content ol {
            margin: 14px 0;
            padding-left: 28px;
        }
        
        .article-content li { margin: 8px 0; }
        
        .article-content blockquote {
            border-left: 4px solid #667eea;
            padding-left: 16px;
            margin: 16px 0;
            color: #666;
            font-style: italic;
        }
        
        .article-content code {
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
        }
        
        .article-content pre {
            background: #f4f4f4;
            padding: 16px;
            border-radius: 8px;
            overflow-x: auto;
            margin: 16px 0;
        }
        
        .article-content pre code {
            background: none;
            padding: 0;
        }
        
        .article-content img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            margin: 16px 0;
            display: block;
        }
        
        .article-content a {
            color: #667eea;
            text-decoration: none;
            border-bottom: 1px solid #667eea;
        }
        
        .article-content a:hover {
            color: #764ba2;
            border-bottom-color: #764ba2;
        }
        
        /* 响应式 */
        @media (max-width: 768px) {
            body { padding: 15px; }
            .article-header { padding: 30px 20px; }
            .article-title { font-size: 24px; }
            .article-content { padding: 20px; }
        }
        
        /* 分割线 */
        hr {
            border: none;
            border-top: 2px solid #e9ecef;
            margin: 24px 0;
        }
        
        /* 高亮 */
        .highlight {
            background: #fff3cd;
            padding: 2px 6px;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="article-header">
        <h1 class="article-title">${title}</h1>
        <div class="article-meta">
            发布于 ${new Date().toLocaleDateString('zh-CN')}
        </div>
    </div>
    
    ${coverPath ? `<img src="${coverPath}" class="article-cover" alt="文章封面">` : ''}
    
    <div class="article-content">
        ${contentHTML}
    </div>
    
    <script>
        // 图片懒加载
        document.addEventListener('DOMContentLoaded', function() {
            const images = document.querySelectorAll('img');
            images.forEach(img => {
                img.addEventListener('load', function() {
                    this.style.opacity = '0';
                    this.style.transition = 'opacity 0.3s ease';
                    setTimeout(() => {
                        this.style.opacity = '1';
                    }, 100);
                });
            });
        });
    </script>
</body>
</html>
`.trim();
    }

    // 读取 Markdown 文件
    readMarkdownFile(filePath) {
        try {
            // 明确指定 UTF-8 编码，避免系统默认编码问题
            return fs.readFileSync(filePath, 'utf8');
        } catch (error) {
            console.error('读取文件失败:', error);
            return null;
        }
    }

    // 写入 HTML 文件
    writeHTMLFile(filePath, htmlContent) {
        try {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            // 确保内容是正确的 UTF-8 编码
            const utf8Content = Buffer.from(htmlContent, 'utf8').toString('utf8');
            fs.writeFileSync(filePath, utf8Content, 'utf8');
            return true;
        } catch (error) {
            console.error('写入文件失败:', error);
            return false;
        }
    }

    // 完整转换过程
    async convert(markdownFile, outputDir, title) {
        // 读取 Markdown 文件
        const markdownContent = this.readMarkdownFile(markdownFile);
        if (!markdownContent) return null;
        
        // 自动获取标题
        if (!title) {
            const titleMatch = markdownContent.match(/^#\s+(.*)$/m);
            title = titleMatch ? titleMatch[1] : path.basename(markdownFile, '.md');
        }
        
        // 生成封面图
        const coverPath = path.join(outputDir, 'cover.png');
        const coverGenerated = await this.generateCover(title, coverPath);
        
        // 转换为 HTML
        const htmlContent = this.markdownToHTML(markdownContent, title, coverGenerated ? 'cover.png' : null);
        
        // 写入 HTML 文件
        const outputHTML = path.join(outputDir, 'article.html');
        const success = this.writeHTMLFile(outputHTML, htmlContent);
        
        if (success) {
            return {
                html: outputHTML,
                cover: coverGenerated || null,
                title: title
            };
        }
        return null;
    }
}

// 命令行使用
async function main() {
    const args = process.argv.slice(2);
    
    // 判断是否是封面图生成模式
    if (args.length === 2 && args[0] !== '--help' && !args[0].endsWith('.md')) {
        // 封面图生成模式
        const title = args[0];
        const outputPath = args[1];
        return generateCoverFromCommandLine(title, outputPath);
    }
    
    // Markdown 转 HTML 模式
    const markdownFile = args[0];
    const outputDir = args[1] || 'output';
    const title = args[2];
    
    if (!markdownFile || !fs.existsSync(markdownFile)) {
        console.error('Usage: node markdown-to-wechat.js <markdown-file> [output-dir] [title]');
        console.error('   或: node markdown-to-wechat.js <title> <output-path>');
        process.exit(1);
    }
    
    const converter = new MarkdownToWeChat();
    const result = await converter.convert(markdownFile, outputDir, title);
    
    if (result) {
        console.log('转换成功!');
        console.log(`HTML 文件: ${result.html}`);
        if (result.cover) {
            console.log(`封面图片: ${result.cover}`);
        }
    } else {
        console.error('转换失败');
        process.exit(1);
    }
}

async function generateCoverFromCommandLine(title, outputPath) {
    const converter = new MarkdownToWeChat();
    const coverPath = await converter.generateCover(title, outputPath);
    
    if (coverPath) {
        console.log('封面图生成成功!');
        console.log(`输出文件: ${coverPath}`);
        
        const stats = fs.statSync(coverPath);
        console.log(`尺寸: 1000x400 像素`);
        console.log(`文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
    } else {
        console.error('封面图生成失败');
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('转换过程发生错误:', error);
        process.exit(1);
    });
}

// 导出功能
module.exports = MarkdownToWeChat;
module.exports.generateCover = generateCoverFromCommandLine;
module.exports.convert = async (markdownFile, outputDir, title) => {
    const converter = new MarkdownToWeChat();
    return await converter.convert(markdownFile, outputDir, title);
};
