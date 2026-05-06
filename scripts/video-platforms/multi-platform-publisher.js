/**
 * 多平台发布器
 * 将文章发布到多个平台：微信公众号、Reddit、抖音、YouTube
 * 并生成视频脚本、漫剧脚本、AI 视频
 * 
 * 使用方法:
 * node multi-platform-publisher.js --article <articlePath>
 */

const path = require('path');
const fs = require('fs');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// 导入各平台发布器
const redditPoster = require('./reddit-poster');
const videoScriptGenerator = require('./video-script-generator');
const manhuaScriptGenerator = require('./manhua-script-generator');
const aiVideoGenerator = require('./ai-video-generator');
const douyinPublisher = require('./douyin-publisher');
const youtubePublisher = require('./youtube-publisher');

/**
 * 多平台发布主函数
 * @param {Object} article - 文章数据
 * @param {Object} options - 发布选项
 */
async function publishToAllPlatforms(article, options = {}) {
    const {
        publishReddit = true,
        publishDouyin = true,
        publishYouTube = true,
        generateVideo = true,
        generateManhua = true,
        generateAIVideo = false // AI 视频生成较慢，默认关闭
    } = options;
    
    console.log('\n' + '═'.repeat(60));
    console.log('  🚀 多平台发布器');
    console.log('═'.repeat(60));
    console.log(`📝 文章: ${article.title}`);
    console.log(`📊 字数: ${article.content.length}`);
    console.log('═'.repeat(60) + '\n');
    
    const results = {
        article: article.title,
        platforms: {},
        scripts: {},
        videos: []
    };
    
    // 1. 发布到 Reddit
    if (publishReddit) {
        console.log('\n📌 [1/5] 发布到 Reddit...');
        try {
            const redditResult = await redditPoster.postToReddit({
                title: article.title,
                content: formatForReddit(article),
                subreddit: 'technology'
            });
            results.platforms.reddit = redditResult;
        } catch (e) {
            console.log(`❌ Reddit 发布失败: ${e.message}`);
            results.platforms.reddit = { success: false, error: e.message };
        }
    }
    
    // 2. 生成视频脚本
    if (generateVideo) {
        console.log('\n🎬 [2/5] 生成视频脚本...');
        try {
            const scriptResult = await videoScriptGenerator.generateAndSaveScript({
                title: article.title,
                content: article.content,
                summary: article.summary || '',
                duration: '60s',
                style: 'viral'
            });
            results.scripts.video = scriptResult;
        } catch (e) {
            console.log(`❌ 视频脚本生成失败: ${e.message}`);
            results.scripts.video = { success: false, error: e.message };
        }
    }
    
    // 3. 生成漫剧脚本
    if (generateManhua) {
        console.log('\n🎨 [3/5] 生成漫剧脚本...');
        try {
            const manhuaResult = await manhuaScriptGenerator.generateAndSaveManhuaScript({
                title: article.title,
                content: article.content,
                summary: article.summary || '',
                panelCount: 10,
                style: 'manhua'
            });
            results.scripts.manhua = manhuaResult;
        } catch (e) {
            console.log(`❌ 漫剧脚本生成失败: ${e.message}`);
            results.scripts.manhua = { success: false, error: e.message };
        }
    }
    
    // 4. 生成 AI 视频（可选）
    if (generateAIVideo && results.scripts.video?.script) {
        console.log('\n🤖 [4/5] 生成 AI 视频...');
        try {
            const videoResults = await aiVideoGenerator.generateVideoFromScript(
                results.scripts.video.script
            );
            results.videos = videoResults;
        } catch (e) {
            console.log(`❌ AI 视频生成失败: ${e.message}`);
        }
    }
    
    // 5. 发布到抖音（如果有视频）
    if (publishDouyin && results.videos.length > 0) {
        console.log('\n🎵 [5/5] 发布到抖音...');
        // 这里需要等待 AI 视频生成完成
        // 暂时跳过
        console.log('⚠️  抖音发布需要先生成视频文件');
    }
    
    // 6. 上传到 YouTube（如果有视频）
    if (publishYouTube && results.videos.length > 0) {
        console.log('\n📺 [6/6] 上传到 YouTube...');
        // 这里需要等待 AI 视频生成完成
        // 暂时跳过
        console.log('⚠️  YouTube 上传需要先生成视频文件');
    }
    
    // 打印结果汇总
    console.log('\n' + '═'.repeat(60));
    console.log('  📊 发布结果汇总');
    console.log('═'.repeat(60));
    
    console.log('\n📌 平台发布:');
    console.log(`   Reddit: ${results.platforms.reddit?.success ? '✅' : '❌'}`);
    
    console.log('\n📄 脚本生成:');
    console.log(`   视频脚本: ${results.scripts.video?.script ? '✅' : '❌'}`);
    console.log(`   漫剧脚本: ${results.scripts.manhua?.script ? '✅' : '❌'}`);
    
    console.log('\n🎬 视频生成:');
    console.log(`   AI 视频: ${results.videos.filter(v => v.success).length}/${results.videos.length}`);
    
    console.log('═'.repeat(60) + '\n');
    
    // 保存结果
    const resultPath = path.join(__dirname, '..', 'output', `multi_platform_result_${Date.now()}.json`);
    fs.writeFileSync(resultPath, JSON.stringify(results, null, 2));
    console.log(`📄 结果已保存: ${resultPath}`);
    
    return results;
}

/**
 * 格式化文章为 Reddit 格式
 */
function formatForReddit(article) {
    let content = article.summary ? `${article.summary}\n\n` : '';
    content += article.content.substring(0, 4000); // Reddit 限制
    content += '\n\n---\n';
    content += '*This article was originally published on WeChat Official Account.*\n';
    content += '*Cross-posted by WorkBuddy AI Publisher.*';
    return content;
}

/**
 * 从文件加载文章
 */
function loadArticleFromFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // 尝试解析 JSON
    if (filePath.endsWith('.json')) {
        return JSON.parse(content);
    }
    
    // 否则当作纯文本
    const lines = content.split('\n');
    const title = lines[0].replace(/^#+\s*/, '');
    const body = lines.slice(1).join('\n').trim();
    
    return {
        title,
        content: body,
        summary: body.substring(0, 200)
    };
}

// 命令行接口
if (require.main === module) {
    const argv = yargs(hideBin(process.argv))
        .option('article', {
            alias: 'a',
            type: 'string',
            description: '文章文件路径 (JSON 或 TXT)'
        })
        .option('title', {
            alias: 't',
            type: 'string',
            description: '文章标题'
        })
        .option('content', {
            alias: 'c',
            type: 'string',
            description: '文章内容'
        })
        .option('reddit', {
            type: 'boolean',
            default: true,
            description: '发布到 Reddit'
        })
        .option('video', {
            type: 'boolean',
            default: true,
            description: '生成视频脚本'
        })
        .option('manhua', {
            type: 'boolean',
            default: true,
            description: '生成漫剧脚本'
        })
        .option('ai-video', {
            type: 'boolean',
            default: false,
            description: '生成 AI 视频'
        })
        .help()
        .argv;
    
    (async () => {
        try {
            let article;
            
            if (argv.article) {
                article = loadArticleFromFile(argv.article);
            } else if (argv.title && argv.content) {
                article = {
                    title: argv.title,
                    content: argv.content,
                    summary: argv.content.substring(0, 200)
                };
            } else {
                console.log('❌ 请提供文章文件路径 (--article) 或标题和内容 (--title, --content)');
                process.exit(1);
            }
            
            const results = await publishToAllPlatforms(article, {
                publishReddit: argv.reddit,
                generateVideo: argv.video,
                generateManhua: argv.manhua,
                generateAIVideo: argv['ai-video']
            });
            
            console.log('\n✅ 多平台发布完成！');
        } catch (e) {
            console.log(`\n❌ 发布失败: ${e.message}`);
            console.error(e);
            process.exit(1);
        }
    })();
}

module.exports = { publishToAllPlatforms, formatForReddit };