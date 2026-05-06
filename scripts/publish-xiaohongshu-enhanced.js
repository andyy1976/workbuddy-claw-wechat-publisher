/**
 * 小红书图文发布脚本（增强版）
 * 功能：自动改写文章为小红书风格、匹配封面图、发布到草稿箱
 * 用法：node scripts/publish-xiaohongshu-enhanced.js --title "标题" --content "内容" --summary "摘要"
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const enhancer = require('./article-enhancer');

// 配置路径
const BASE_DIR = path.join(__dirname, '..');
const configDir = path.join(BASE_DIR, 'config');
const cookiesPath = path.join(configDir, 'xiaohongshu-cookies.json');
const outputDir = path.join(BASE_DIR, 'output', 'xiaohongshu');
const screenshotDir = outputDir;

// 确保目录存在
[configDir, outputDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 解析命令行参数
function parseArgs() {
    const args = process.argv.slice(2);
    const params = {};
    
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].substring(2);
            const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : '';
            params[key] = value;
            i++;
        }
    }
    
    return params;
}

// 检查登录状态
async function checkLogin(page) {
    try {
        if (fs.existsSync(cookiesPath)) {
            const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
            await page.context().addCookies(cookies);
        }
        
        await page.goto('https://creator.xiaohongshu.com', { waitUntil: 'networkidle', timeout: 30000 });
        
        // 检查是否登录
        const userAvatar = await page.$('.user-avatar, .avatar, [class*="avatar"]');
        if (userAvatar) {
            console.log('✅ 小红书登录态有效');
            return true;
        }
        
        return false;
    } catch (e) {
        console.log('⚠️ 登录检查失败:', e.message);
        return false;
    }
}

// 扫码登录
async function loginWithQR(page) {
    await page.goto('https://creator.xiaohongshu.com', { waitUntil: 'networkidle' });
    
    // 等待二维码出现
    await page.waitForTimeout(2000);
    
    // 截图保存二维码
    const qrPath = path.join(screenshotDir, 'qrcode.png');
    await page.screenshot({ path: qrPath });
    
    console.log(`📱 请扫码登录，二维码已保存：${qrPath}`);
    console.log('⏳ 等待扫码...');
    
    // 等待登录成功（检测用户头像出现）
    await page.waitForSelector('.user-avatar, .avatar, [class*="avatar"]', { timeout: 120000 });
    
    // 保存 cookies
    const cookies = await page.context().cookies();
    fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
    console.log('✅ 登录成功，cookies 已保存');
}

// 发布小红书图文
async function publishXiaohongshu(content) {
    console.log('\n════════════════════════════════════════════════════');
    console.log('  小红书图文发布');
    console.log('════════════════════════════════════════════════════\n');
    
    // 启动浏览器
    const browser = await chromium.launch({
        headless: false,
        args: ['--disable-blink-features=AutomationControlled']
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();
    
    try {
        // 检查登录
        const isLoggedIn = await checkLogin(page);
        if (!isLoggedIn) {
            await loginWithQR(page);
        }
        
        // 导航到发布页
        console.log('\n📤 导航到发布页...');
        await page.goto('https://creator.xiaohongshu.com/publish/publish', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
        
        // 点击「上传图文」Tab
        console.log('📝 点击上传图文...');
        const uploadTabs = await page.$$('text="上传图文"');
        for (const tab of uploadTabs) {
            try {
                const box = await tab.boundingBox();
                if (box && box.x >= 0 && box.y >= 0) {
                    await tab.click();
                    break;
                }
            } catch (e) {}
        }
        await page.waitForTimeout(1000);
        
        // 上传封面图
        if (content.coverImage && fs.existsSync(content.coverImage)) {
            console.log('📷 上传封面图...');
            const fileInput = await page.$('input[type="file"]');
            if (fileInput) {
                await fileInput.setInputFiles(content.coverImage);
                await page.waitForTimeout(3000);
            }
        }
        
        // 填写标题
        console.log('✍️  填写标题...');
        const titleInput = await page.$('input[placeholder*="标题"], input[placeholder*="填写标题"]');
        if (titleInput) {
            await titleInput.fill(content.title);
        }
        
        // 填写正文
        console.log('📝 填写正文...');
        const bodyInput = await page.$('.ql-editor, [contenteditable="true"], textarea[placeholder*="正文"]');
        if (bodyInput) {
            await bodyInput.fill(content.body);
        }
        
        // 添加话题标签
        if (content.tags && content.tags.length > 0) {
            console.log('🏷️  添加话题标签...');
            for (const tag of content.tags.slice(0, 5)) {
                try {
                    const tagInput = await page.$('input[placeholder*="话题"], input[placeholder*="搜索"]');
                    if (tagInput) {
                        await tagInput.fill(tag);
                        await page.waitForTimeout(500);
                        await page.keyboard.press('Enter');
                        await page.waitForTimeout(500);
                    }
                } catch (e) {}
            }
        }
        
        // 设置为仅自己可见（草稿）
        console.log('🔒 设置为仅自己可见...');
        try {
            const visibilityBtn = await page.$('text="公开"');
            if (visibilityBtn) await visibilityBtn.click();
            await page.waitForTimeout(500);
            const privateOption = await page.$('text="仅自己可见"');
            if (privateOption) await privateOption.click();
        } catch (e) {}
        
        // 截图保存
        const screenshotPath = path.join(screenshotDir, `draft_${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        
        console.log('\n════════════════════════════════════════════════════');
        console.log('  ✅ 预填完成！');
        console.log('════════════════════════════════════════════════════');
        console.log(`📝 标题: ${content.title}`);
        console.log(`📊 字数: ${content.body.length}`);
        console.log(`🏷️  话题: ${content.tags.join(' ')}`);
        console.log(`📸 预填截图: ${screenshotPath}`);
        console.log('⏳ 请检查内容，点击页面「发布」按钮完成发布');
        
        // 保持浏览器打开
        console.log('\n💡 浏览器保持打开，完成后请手动关闭');
        
    } catch (err) {
        console.error('❌ 发布失败:', err.message);
        const errorScreenshot = path.join(screenshotDir, 'error.png');
        await page.screenshot({ path: errorScreenshot });
    }
}

// 主函数
async function main() {
    const args = parseArgs();
    
    // 如果提供了原始文章内容，改写为小红书风格
    let xiaohongshuContent;
    
    if (args.title && args.content) {
        console.log('📝 改写为小红书风格...');
        xiaohongshuContent = await enhancer.rewriteForXiaohongshu(
            args.title,
            args.content,
            args.summary || ''
        );
        
        // 匹配封面图
        if (!args.cover) {
            console.log('\n🖼️  匹配封面图...');
            const thumbnail = await enhancer.matchThumbnail(args.title, args.summary || args.title);
            if (thumbnail.url) {
                const coverPath = path.join(outputDir, `cover_${Date.now()}.jpg`);
                try {
                    await enhancer.downloadImage(thumbnail.url, coverPath);
                    xiaohongshuContent.coverImage = coverPath;
                    console.log(`✅ 封面图已保存: ${coverPath}`);
                } catch (e) {
                    console.log('⚠️ 封面图下载失败');
                }
            }
        } else {
            xiaohongshuContent.coverImage = args.cover;
        }
    } else {
        // 使用测试内容
        console.log('⚠️ 未提供文章内容，使用测试数据');
        xiaohongshuContent = {
            title: 'AI 编程新纪元 🚀 工具在进化，人在哪里？',
            body: '最近 Claude Code 火了，很多人说它要取代 Cursor。\n\n说实话，用了几天，确实有点东西 ✨\n\n💡 最惊艳的是它的上下文理解能力，能记住整个项目的代码结构，不像其他工具只看当前文件。\n\n⚡ 而且它不是简单的代码补全，是真的能理解你的意图，帮你重构、优化、写测试。\n\n🔥 但我觉得最关键的，不是工具多强，而是我们的工作方式在改变。\n\n以前是「写代码」，现在是「描述需求 + 审核代码」。\n\n你用过哪个 AI 编程工具？评论区聊聊~',
            tags: ['#AI编程', '#ClaudeCode', '#效率工具', '#程序员'],
            coverImage: null
        };
    }
    
    // 发布
    await publishXiaohongshu(xiaohongshuContent);
}

main().catch(e => {
    console.error('\n❌ 发生错误:', e.message);
    process.exit(1);
});
