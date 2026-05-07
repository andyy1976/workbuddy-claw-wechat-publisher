/**
 * Reddit 短视频管线 - 截图模块
 * Playwright 无头浏览器截取 Reddit 帖子/评论
 */

const fs = require('fs');
const path = require('path');
const { screenshotConfig } = require('./config.cjs');

// 动态加载 playwright
let playwright, chromium;

async function getBrowser() {
    if (!chromium) {
        try {
            playwright = require('playwright');
            chromium = await playwright.chromium.launch({
                headless: screenshotConfig.headless,
                args: ['--no-sandbox', '--disable-dev-shm-usage'],
            });
        } catch (e) {
            console.warn('   ⚠️  Playwright 未安装，截图功能不可用');
            return null;
        }
    }
    return chromium;
}

// ── 截取 Reddit 帖子页面 ────────────────────────────────
async function screenshotPost(postUrl, outputPath) {
    const browser = await getBrowser();
    if (!browser) return null;

    const context = await browser.newContext({
        viewport: screenshotConfig.viewport,
        deviceScaleFactor: screenshotConfig.deviceScaleFactor,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });

    const page = await context.newPage();

    try {
        console.log(`   📸 截图: ${postUrl.substring(0, 80)}...`);
        await page.goto(postUrl, { waitUntil: 'networkidle', timeout: 30000 });

        // 等待内容加载
        await page.waitForSelector('shreddit-post', { timeout: 10000 }).catch(() => {});

        // 移除弹窗等干扰元素
        await page.evaluate(() => {
            document.querySelectorAll('[data-testid="second-toast"]').forEach(el => el.remove());
            document.querySelectorAll('faceplate-dialog').forEach(el => el.remove());
        });

        await page.screenshot({
            path: outputPath,
            type: 'png',
            fullPage: false,
        });

        console.log(`   ✅ 截图已保存: ${outputPath}`);
        return outputPath;
    } finally {
        await page.close();
        await context.close();
    }
}

// ── 截取 Reddit 评论 ────────────────────────────────────
async function screenshotComment(postUrl, commentSelectors, outputDir) {
    const browser = await getBrowser();
    if (!browser) return [];

    const context = await browser.newContext({
        viewport: screenshotConfig.viewport,
        deviceScaleFactor: screenshotConfig.deviceScaleFactor,
    });

    const page = await context.newPage();

    try {
        await page.goto(postUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForSelector('shreddit-comment', { timeout: 10000 }).catch(() => {});

        const screenshots = [];

        // 截图每条评论
        const comments = await page.$$('[data-testid="comment"]');
        const limit = Math.min(commentSelectors.length, comments.length, 8);

        for (let i = 0; i < limit; i++) {
            const comment = comments[i];
            if (!comment) continue;

            const output = path.join(outputDir, `comment_${i}.png`);
            try {
                await comment.screenshot({ path: output, type: 'png' });
                screenshots.push(output);
            } catch {
                console.warn(`   ⚠️  评论 ${i+1} 截图失败，跳过`);
            }
        }

        return screenshots;
    } finally {
        await page.close();
        await context.close();
    }
}

// ── 文字转图片（Story Mode，不依赖浏览器）─────────────────
function textToImage(text, outputPath, options = {}) {
    const {
        width = 800,
        bgColor = '#1a1a2e',
        textColor = '#ffffff',
        fontSize = 36,
        padding = 40,
    } = options;

    // 使用 Python PIL 生成文字图片
    const pyCode = `
from PIL import Image, ImageDraw, ImageFont
import textwrap
import os

text = ${JSON.stringify(text)}
width = ${width}
bg_color = ${JSON.stringify(bgColor)}
text_color = ${JSON.stringify(textColor)}
font_size = ${fontSize}
padding = ${padding}

# 估算高度
line_height = font_size + 10
lines = textwrap.wrap(text, width=30)
height = len(lines) * line_height + padding * 2

img = Image.new('RGB', (width, height), bg_color)
draw = ImageDraw.Draw(img)

# 尝试使用系统字体
font_paths = [
    'C:/Windows/Fonts/msyh.ttc',  # 微软雅黑
    'C:/Windows/Fonts/simhei.ttf',  # 黑体
    '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
]
font = None
for fp in font_paths:
    if os.path.exists(fp):
        try:
            font = ImageFont.truetype(fp, font_size)
            break
        except:
            pass
if font is None:
    font = ImageFont.load_default()

y = padding
for line in lines:
    draw.text((padding, y), line, font=font, fill=text_color)
    y += line_height

img.save(${JSON.stringify(outputPath)})
print('OK')
`;

    return new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        const proc = spawn('python', ['-c', pyCode], { shell: true });
        let err = '';
        proc.stderr.on('data', d => err += d);
        proc.on('close', code => {
            if (code === 0 && fs.existsSync(outputPath)) {
                resolve(outputPath);
            } else {
                reject(new Error('PIL 图片生成失败: ' + err));
            }
        });
    });
}

// ── 从评论列表生成文字图片 ───────────────────────────────
async function generateTextSlides(comments, outputDir) {
    const { title, author } = comments;

    const slides = [];
    const { width, bgColor, textColor } = screenshotConfig;

    // 标题页
    const titlePath = path.join(outputDir, 'title.png');
    try {
        await textToImage(title, titlePath, {
            bgColor: '#16213e',
            textColor: '#ffffff',
            fontSize: 42,
            width: 800,
        });
        slides.push(titlePath);
    } catch (e) {
        console.warn('   ⚠️  标题图片生成失败');
    }

    // 每条评论一页
    for (let i = 0; i < Math.min(comments.length, 8); i++) {
        const c = comments[i];
        const commentPath = path.join(outputDir, `slide_${i}.png`);

        // 评论文本：@作者 + 内容
        const slideText = `@${c.author}: ${c.body}`;
        try {
            await textToImage(slideText, commentPath, {
                bgColor: '#0f3460',
                textColor: '#e8e8e8',
                fontSize: 32,
                width: 800,
            });
            slides.push(commentPath);
        } catch (e) {
            console.warn(`   ⚠️  评论 ${i+1} 图片生成失败`);
        }
    }

    return slides;
}

// ── 清理浏览器实例 ───────────────────────────────────────
async function closeBrowser() {
    if (chromium) {
        try { await chromium.close(); } catch {}
        chromium = null;
        playwright = null;
    }
}

module.exports = {
    screenshotPost,
    screenshotComment,
    textToImage,
    generateTextSlides,
    closeBrowser,
};
