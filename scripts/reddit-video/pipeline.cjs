#!/usr/bin/env node

/**
 * Reddit 短视频管线 - 主管道
 * 自动化四步：抓帖 → TTS → 截图 → FFmpeg 合成
 *
 * 用法：
 *   node pipeline.cjs                          # 从配置文件随机选帖
 *   node pipeline.cjs --subreddit AskReddit    # 指定 subreddit
 *   node pipeline.cjs --post-id abc123         # 指定帖子
 *   node pipeline.cjs --post-id abc123+def456  # 多帖批量
 *   node pipeline.cjs --random                  # AI 语义选帖
 */

const fs = require('fs');
const path = require('path');
const { loadEnv } = require('./env-loader.cjs');
loadEnv();

const {
    redditConfig, ttsConfig, videoConfig,
    filterConfig, validateConfig, ensureOutputDir
} = require('./config.cjs');

const scraper = require('./reddit-scraper.cjs');
const tts = require('./tts-engine.cjs');
const composer = require('./video-composer.cjs');
const screenshot = require('./screenshot.cjs');

// ── 命令行参数 ───────────────────────────────────────────
function parseArgs() {
    const args = process.argv.slice(2);
    const params = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].substring(2);
            if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
                params[key] = args[i + 1];
                i++;
            } else {
                params[key] = params[key] === undefined ? true : params[key];
            }
        }
    }
    return params;
}

// ── 显示横幅 ───────────────────────────────────────────
function showBanner() {
    console.log('\n' +
        '  ╔══════════════════════════════════════════╗\n' +
        '  ║  🎬 Reddit 短视频管线  v1.0                ║\n' +
        '  ║  抓帖 → TTS → 截图 → FFmpeg 合成         ║\n' +
        '  ╚══════════════════════════════════════════╝\n'
    );
    console.log(`📡 TTS 引擎: ${tts.getEngineName()}`);
    console.log(`📺 输出尺寸: ${videoConfig.width}x${videoConfig.height} (9:16 竖屏)`);
    console.log(`📦 输出目录: ${path.dirname(require('./config.cjs').getOutputDir())}\n`);
}

// ── 单帖处理流程 ─────────────────────────────────────────
async function processPost(post, outputDir) {
    console.log(`\n📌 开始处理帖子: "${post.title}"`);
    console.log(`   📊 评分: ${post.score} | 💬 评论: ${post.num_comments} | 👤 u/${post.author}`);

    const postDir = path.join(outputDir, post.id);
    fs.mkdirSync(postDir, { recursive: true });

    // 保存帖子元数据
    fs.writeFileSync(
        path.join(postDir, 'meta.json'),
        JSON.stringify({ post, processedAt: new Date().toISOString() }, null, 2)
    );

    // ── 步骤1: 抓评论 ───────────────────────────────
    console.log('\n[1/4] 📥 抓取评论...');
    let comments;
    try {
        comments = await scraper.fetchComments(post.id, post.subreddit, 10);
        console.log(`   获取到 ${comments.length} 条评论`);
    } catch (e) {
        console.warn('   ⚠️  评论抓取失败，使用空评论:', e.message);
        comments = [];
    }

    // ── 步骤2: TTS 转语音 ──────────────────────────
    console.log('\n[2/4] 🎙️  生成 TTS 语音...');
    const audioPath = path.join(postDir, 'audio.mp3');

    try {
        // 拼接所有文本：标题 + 热门评论
        const scriptLines = [`标题：${post.title}`];
        for (let i = 0; i < Math.min(comments.length, 8); i++) {
            const c = comments[i];
            if (c.body && c.body.length > 5) {
                scriptLines.push(`用户 ${c.author} 说：${c.body}`);
            }
        }
        const fullScript = scriptLines.join('。');

        await tts.textToSpeech(fullScript, audioPath);
    } catch (e) {
        console.error('   ❌ TTS 生成失败:', e.message);
        // 降级：生成静音音频
        composer.generateSolidBackground(path.join(postDir, 'silent.mp4'), 5);
        return;
    }

    const audioDuration = tts.getAudioDuration(audioPath);
    console.log(`   ⏱️  音频时长: ${audioDuration.toFixed(1)}s`);

    // ── 步骤3: 生成截图 ─────────────────────────────
    console.log('\n[3/4] 🖼️  生成内容图片...');

    const screenshotDir = path.join(postDir, 'screenshots');
    fs.mkdirSync(screenshotDir, { recursive: true });

    let screenshotPaths = [];

    if (videoConfig.useStoryMode) {
        // Story Mode：用文字图片
        console.log('   📝 使用 Story Mode（文字图片）');
        try {
            screenshotPaths = await screenshot.generateTextSlides(
                { title: post.title, author: post.author, comments },
                screenshotDir
            );
        } catch (e) {
            console.warn('   ⚠️  Story Mode 失败，生成纯色图片');
            screenshotPaths = [path.join(screenshotDir, 'fallback.png')];
            try {
                await screenshot.textToImage(post.title, screenshotPaths[0], { width: 800 });
            } catch {
                screenshotPaths = [];
            }
        }
    } else {
        // 浏览器截图模式
        try {
            console.log('   🌐 使用浏览器截图模式');
            const titlePath = path.join(screenshotDir, 'title.png');

            // 截取帖子标题
            await screenshot.screenshotPost(post.permalink, titlePath);
            screenshotPaths.push(titlePath);

            // 截取评论（取前3条）
            const commentPaths = await screenshot.screenshotComment(
                post.permalink,
                comments.slice(0, 3),
                screenshotDir
            );
            screenshotPaths.push(...commentPaths);
        } catch (e) {
            console.warn('   ⚠️  浏览器截图失败，降级为文字图片:', e.message);
            try {
                screenshotPaths = await screenshot.generateTextSlides(
                    { title: post.title, author: post.author, comments },
                    screenshotDir
                );
            } catch {
                screenshotPaths = [];
            }
        }
    }

    if (screenshotPaths.length === 0) {
        console.error('   ❌ 无法生成任何截图，跳过该帖子');
        return null;
    }
    console.log(`   ✅ 生成了 ${screenshotPaths.length} 张图片`);

    // ── 步骤4: 视频合成 ─────────────────────────────
    console.log('\n[4/4] 🎬 合成视频...');

    const videoPath = path.join(postDir, 'output.mp4');
    const bgKeyword = videoConfig.backgroundKeyword || `${post.subreddit} gameplay`;

    let bgVideoPath = null;
    if (audioDuration > 3) {
        const bgDir = path.join(postDir, 'bg');
        fs.mkdirSync(bgDir, { recursive: true });
        const bgVideoFile = path.join(bgDir, 'background.mp4');

        try {
            await composer.downloadBackgroundVideo(bgKeyword, audioDuration, bgVideoFile);
            bgVideoPath = bgVideoFile;
        } catch (e) {
            console.warn('   ⚠️  背景视频下载失败:', e.message);
        }
    }

    try {
        composer.composeVideo(bgVideoPath, screenshotPaths, audioPath, videoPath);
    } catch (e) {
        console.error('   ❌ 视频合成失败:', e.message);
        return null;
    }

    const fileSize = composer.getVideoFileSize(videoPath);
    const duration = composer.getVideoDuration(videoPath);

    console.log('\n✅ 视频生成完成!');
    console.log(`   📄 文件: ${videoPath}`);
    console.log(`   ⏱️  时长: ${duration.toFixed(1)}s | 📦 大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

    return {
        post,
        videoPath,
        audioPath,
        duration,
        fileSize,
        postDir,
    };
}

// ── 主流程 ──────────────────────────────────────────────
async function main() {
    showBanner();

    // 验证配置
    const errors = validateConfig();
    if (errors.filter(e => e.includes('❌')).length > 0) {
        console.error('\n❌ 配置错误，无法启动');
        errors.forEach(e => console.error('  ' + e));
        return;
    }
    errors.forEach(e => console.log('  ' + e));

    const params = parseArgs();
    const outputDir = ensureOutputDir();
    console.log(`📁 输出目录: ${outputDir}\n`);

    let posts = [];

    try {
        // 抓帖子
        if (params['post-id']) {
            const [postId, subreddit] = params['post-id'].split(':');
            console.log(`📌 指定帖子: ${postId}${subreddit ? ` (r/${subreddit})` : ''}`);
            const data = await scraper.exportPost(postId.trim(), subreddit || params.subreddit);
            posts = [data.post];
        } else if (params.random || params['ai-similarity']) {
            const subreddit = params.subreddit || redditConfig.default_subreddit;
            console.log(`🎯 AI 语义选帖: r/${subreddit}`);
            posts = await scraper.selectBestPost(subreddit, parseInt(params.count) || 3);
        } else if (params.subreddit) {
            const limit = parseInt(params.limit) || 5;
            posts = await scraper.fetchHotPosts(params.subreddit, limit);
        } else {
            // 默认：从配置文件 subreddit 抓取
            const subreddit = redditConfig.default_subreddit;
            console.log(`📡 使用默认 subreddit: r/${subreddit}`);
            posts = await scraper.selectBestPost(subreddit, parseInt(params.count) || 3);
        }

        if (posts.length === 0) {
            console.error('\n❌ 未找到符合条件的帖子');
            return;
        }

        console.log(`\n📋 共 ${posts.length} 个帖子待处理\n`);

        // 逐个处理
        const results = [];
        for (let i = 0; i < posts.length; i++) {
            if (i > 0) console.log('\n' + '─'.repeat(50));

            const result = await processPost(posts[i], outputDir);
            if (result) results.push(result);
        }

        // 生成报告
        console.log('\n' + '='.repeat(50));
        console.log('🎉 批次处理完成!');
        console.log(`   ✅ 成功: ${results.length}/${posts.length} 个`);
        console.log(`   📁 输出: ${outputDir}`);

        if (results.length > 0) {
            console.log('\n📊 生成的视频:');
            for (const r of results) {
                console.log(`   • ${path.basename(r.videoPath)}: ${r.duration.toFixed(0)}s, ${(r.fileSize/1024/1024).toFixed(1)}MB`);
            }

            // 生成批报告
            const report = {
                generatedAt: new Date().toISOString(),
                total: results.length,
                videos: results.map(r => ({
                    postId: r.post.id,
                    title: r.post.title,
                    subreddit: r.post.subreddit,
                    videoPath: r.videoPath,
                    duration: r.duration,
                    fileSize: r.fileSize,
                }))
            };
            fs.writeFileSync(
                path.join(outputDir, 'report.json'),
                JSON.stringify(report, null, 2)
            );
            console.log('\n📄 报告已保存: report.json');
        }

    } catch (e) {
        console.error('\n❌ 管线执行失败:', e.message);
        if (process.env.DEBUG) console.error(e.stack);
    } finally {
        await screenshot.closeBrowser();
    }
}

main();
