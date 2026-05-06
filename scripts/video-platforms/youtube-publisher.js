/**
 * YouTube 上传器
 * 使用 YouTube Data API v3 上传视频
 * 
 * 需要:
 * - Google API 凭据 (OAuth 2.0)
 * - youtube-videos-api npm 包
 * 
 * 环境变量:
 * - YOUTUBE_CLIENT_ID
 * - YOUTUBE_CLIENT_SECRET
 * - YOUTUBE_REFRESH_TOKEN
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

/**
 * 初始化 YouTube 客户端
 */
async function initYouTubeClient() {
    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
    
    if (!clientId || !clientSecret) {
        throw new Error('YouTube API 凭据未配置');
    }
    
    const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'http://localhost:3000/oauth2callback' // 回调 URL
    );
    
    if (refreshToken) {
        oauth2Client.setCredentials({ refresh_token: refreshToken });
    }
    
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    
    return { youtube, oauth2Client };
}

/**
 * 获取 OAuth2 授权 URL
 */
function getAuthUrl(clientId, clientSecret) {
    const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'http://localhost:3000/oauth2callback'
    );
    
    const scopes = [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube'
    ];
    
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        prompt: 'consent' // 强制刷新 refresh_token
    });
}

/**
 * 使用授权码换取 token
 */
async function getTokensFromCode(code, clientId, clientSecret) {
    const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'http://localhost:3000/oauth2callback'
    );
    
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
}

/**
 * 上传视频到 YouTube
 * @param {Object} options
 * @param {string} options.videoPath - 视频文件路径
 * @param {string} options.title - 视频标题
 * @param {string} options.description - 视频描述
 * @param {Array} options.tags - 标签数组
 * @param {string} options.categoryId - 分类 ID (默认 28 = 科技)
 * @param {string} options.privacyStatus - 隐私状态 (private, public, unlisted)
 */
async function uploadToYouTube({
    videoPath,
    title,
    description = '',
    tags = [],
    categoryId = '28', // 科技
    privacyStatus = 'private' // 默认私有，可改为 public
}) {
    console.log('📺 上传到 YouTube...');
    console.log(`   标题: ${title}`);
    console.log(`   视频: ${videoPath}`);
    
    if (!fs.existsSync(videoPath)) {
        throw new Error(`视频文件不存在: ${videoPath}`);
    }
    
    try {
        const { youtube } = await initYouTubeClient();
        
        const videoMetadata = {
            snippet: {
                title: title.substring(0, 100),
                description: description.substring(0, 5000),
                tags: tags.slice(0, 500), // YouTube 限制 500 个标签
                categoryId: categoryId
            },
            status: {
                privacyStatus: privacyStatus,
                selfDeclaredMadeForKids: false
            }
        };
        
        console.log('   开始上传...');
        const res = await youtube.videos.insert({
            part: ['snippet', 'status'],
            requestBody: videoMetadata,
            media: {
                body: fs.createReadStream(videoPath)
            }
        }, {
            onUploadProgress: (evt) => {
                const progress = (evt.bytesRead / fs.statSync(videoPath).size * 100).toFixed(2);
                process.stdout.write(`\r   上传进度: ${progress}%`);
            }
        });
        
        console.log('\n✅ YouTube 上传成功!');
        console.log(`   视频 ID: ${res.data.id}`);
        console.log(`   链接: https://youtu.be/${res.data.id}`);
        
        return {
            success: true,
            videoId: res.data.id,
            url: `https://youtu.be/${res.data.id}`
        };
    } catch (e) {
        console.log(`\n❌ YouTube 上传失败: ${e.message}`);
        return { success: false, error: e.message };
    }
}

/**
 * 批量上传视频到 YouTube
 */
async function batchUploadToYouTube(videos) {
    console.log(`\n📺 批量上传 ${videos.length} 个视频到 YouTube...`);
    const results = [];
    
    for (let i = 0; i < videos.length; i++) {
        console.log(`\n[${i + 1}/${videos.length}] ${videos[i].title}`);
        const result = await uploadToYouTube(videos[i]);
        results.push(result);
        
        // 等待一段时间再上传下一个
        if (i < videos.length - 1) {
            console.log('   等待 60 秒...');
            await new Promise(resolve => setTimeout(resolve, 60000));
        }
    }
    
    console.log(`\n📊 批量上传完成:`);
    console.log(`   成功: ${results.filter(r => r.success).length}/${videos.length}`);
    
    return results;
}

/**
 * 获取视频列表
 */
async function listVideos(maxResults = 10) {
    try {
        const { youtube } = await initYouTubeClient();
        
        const res = await youtube.channels.list({
            part: ['contentDetails'],
            mine: true
        });
        
        const uploadsPlaylistId = res.data.items[0].contentDetails.relatedPlaylists.uploads;
        
        const playlistRes = await youtube.playlistItems.list({
            part: ['snippet'],
            playlistId: uploadsPlaylistId,
            maxResults: maxResults
        });
        
        return playlistRes.data.items.map(item => ({
            id: item.snippet.resourceId.videoId,
            title: item.snippet.title,
            description: item.snippet.description,
            publishedAt: item.snippet.publishedAt,
            url: `https://youtu.be/${item.snippet.resourceId.videoId}`
        }));
    } catch (e) {
        console.log(`❌ 获取视频列表失败: ${e.message}`);
        return [];
    }
}

module.exports = { 
    uploadToYouTube, 
    batchUploadToYouTube, 
    listVideos,
    getAuthUrl,
    getTokensFromCode,
    initYouTubeClient 
};

// 测试
if (require.main === module) {
    (async () => {
        // 检查配置
        if (!process.env.YOUTUBE_CLIENT_ID) {
            console.log('⚠️  YouTube API 未配置');
            console.log('请设置环境变量:');
            console.log('  YOUTUBE_CLIENT_ID');
            console.log('  YOUTUBE_CLIENT_SECRET');
            console.log('  YOUTUBE_REFRESH_TOKEN');
            process.exit(1);
        }
        
        try {
            const result = await uploadToYouTube({
                videoPath: 'D:/test_video.mp4',
                title: 'AI 黑科技！10个月工作1晚完成',
                description: '英伟达用AI设计芯片，开发周期从10个月压缩到一晚...',
                tags: ['AI', '芯片', '科技', '英伟达', '黑科技'],
                privacyStatus: 'private' // 测试时设为私有
            });
            
            if (result.success) {
                console.log('\n✅ 测试成功');
            }
        } catch (e) {
            console.log(`\n❌ 测试失败: ${e.message}`);
        }
    })();
}