/**
 * 抖音发布器
 * 使用 Playwright 自动化发布视频到抖音
 * 
 * 需要:
 * - Playwright 已安装
 * - 已登录抖音网页版
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

/**
 * 发布视频到抖音
 * @param {Object} options
 * @param {string} options.videoPath - 视频文件路径
 * @param {string} options.title - 视频标题
 * @param {string} options.description - 视频描述（可选）
 * @param {Array} options.hashtags - 话题标签（可选）
 * @param {boolean} options.onlySaveDraft - 是否仅存草稿（默认 false）
 */
async function publishToDouyin({ 
    videoPath, 
    title, 
    description = '', 
    hashtags = [],
    onlySaveDraft = false 
}) {
    console.log('🎵 发布到抖音...');
    console.log(`   标题: ${title}`);
    console.log(`   视频: ${videoPath}`);
    
    if (!fs.existsSync(videoPath)) {
        throw new Error(`视频文件不存在: ${videoPath}`);
    }
    
    const browser = await chromium.launch({ 
        headless: false, // 需要看到界面进行登录
        args: ['--start-maximized'] 
    });
    
    const context = await browser.newContext({
        storageState: path.join(__dirname, '..', '..', 'douyin-auth.json'), // 保存登录状态
        viewport: { width: 1920, height: 1080 }
    });
    
    const page = await context.newPage();
    
    try {
        // 访问抖音创作者中心
        console.log('   访问抖音创作者中心...');
        await page.goto('https://creator.douyin.com/creator-micro/home', { 
            waitUntil: 'networkidle',
            timeout: 30000 
        });
        
        // 检查是否需要登录
        const isLoginPage = await page.url().includes('passport');
        if (isLoginPage) {
            console.log('⚠️  需要登录抖音，请扫码登录...');
            await page.waitForTimeout(60000); // 等待60秒让用户扫码
        }
        
        // 保存登录状态
        await context.storageState({ path: path.join(__dirname, '..', '..', 'douyin-auth.json') });
        
        // 点击上传视频按钮
        console.log('   点击上传视频...');
        await page.click('text=上传视频');
        await page.waitForTimeout(2000);
        
        // 上传视频文件
        console.log('   上传视频文件...');
        const fileInput = await page.$('input[type="file"]');
        if (!fileInput) {
            throw new Error('找不到文件上传输入框');
        }
        await fileInput.setInputFiles(videoPath);
        
        // 等待视频上传完成
        console.log('   等待视频上传...');
        await page.waitForSelector('text=上传成功', { timeout: 300000 }); // 5分钟超时
        
        // 填写标题
        console.log('   填写标题...');
        const titleInput = await page.$('textarea[placeholder*="标题"]');
        if (titleInput) {
            await titleInput.fill(title.substring(0, 30)); // 抖音标题限制
        }
        
        // 填写描述
        if (description) {
            console.log('   填写描述...');
            const descInput = await page.$('textarea[placeholder*="描述"]');
            if (descInput) {
                const fullDesc = description + (hashtags.length > 0 ? '\n' + hashtags.map(t => `#${t}`).join(' ') : '');
                await descInput.fill(fullDesc.substring(0, 500));
            }
        }
        
        // 选择话题标签
        if (hashtags.length > 0) {
            console.log('   添加话题标签...');
            for (const tag of hashtags.slice(0, 5)) { // 最多5个话题
                try {
                    await page.click('text=添加话题');
                    await page.waitForTimeout(500);
                    await page.fill('input[placeholder*="话题"]', tag);
                    await page.waitForTimeout(500);
                    await page.press('input[placeholder*="话题"]', 'Enter');
                    await page.waitForTimeout(500);
                } catch (e) {
                    console.log(`   ⚠️  添加话题失败: ${tag}`);
                }
            }
        }
        
        // 发布或存草稿
        if (onlySaveDraft) {
            console.log('   保存到草稿箱...');
            await page.click('text=存草稿');
        } else {
            console.log('   发布视频...');
            await page.click('text=发布');
        }
        
        // 等待发布完成
        await page.waitForTimeout(5000);
        
        // 获取视频链接
        const videoUrl = page.url();
        console.log(`✅ 抖音发布成功!`);
        console.log(`   链接: ${videoUrl}`);
        
        await browser.close();
        
        return { success: true, url: videoUrl };
    } catch (e) {
        console.log(`❌ 抖音发布失败: ${e.message}`);
        await browser.close();
        return { success: false, error: e.message };
    }
}

/**
 * 批量发布视频到抖音
 */
async function batchPublishToDouyin(videos) {
    console.log(`\n🎵 批量发布 ${videos.length} 个视频到抖音...`);
    const results = [];
    
    for (let i = 0; i < videos.length; i++) {
        console.log(`\n[${i + 1}/${videos.length}] ${videos[i].title}`);
        const result = await publishToDouyin(videos[i]);
        results.push(result);
        
        // 等待一段时间再发下一个
        if (i < videos.length - 1) {
            console.log('   等待 30 秒...');
            await new Promise(resolve => setTimeout(resolve, 30000));
        }
    }
    
    console.log(`\n📊 批量发布完成:`);
    console.log(`   成功: ${results.filter(r => r.success).length}/${videos.length}`);
    
    return results;
}

module.exports = { publishToDouyin, batchPublishToDouyin };

// 测试
if (require.main === module) {
    (async () => {
        try {
            const result = await publishToDouyin({
                videoPath: 'D:/test_video.mp4',
                title: 'AI 黑科技！10个月工作1晚完成',
                description: '英伟达用AI设计芯片，开发周期从10个月压缩到一晚，太震撼了！',
                hashtags: ['AI', '芯片', '科技', '英伟达', '黑科技'],
                onlySaveDraft: true // 测试时存草稿
            });
            
            if (result.success) {
                console.log('\n✅ 测试成功');
            }
        } catch (e) {
            console.log(`\n❌ 测试失败: ${e.message}`);
        }
    })();
}