/**
 * Reddit Poster
 * 使用 PRAW 库发布帖子到 Reddit
 * 
 * 环境变量:
 * - REDDIT_CLIENT_ID
 * - REDDIT_CLIENT_SECRET
 * - REDDIT_USERNAME
 * - REDDIT_PASSWORD
 * - REDDIT_SUBREDDIT (默认: technology, artificial, MachineLearning)
 */

const axios = require('axios');

// 加载配置
function loadConfig() {
    const dotenv = require('dotenv');
    dotenv.config({ path: require('path').join(__dirname, '..', '..', '.env') });
    return {
        clientId: process.env.REDDIT_CLIENT_ID,
        clientSecret: process.env.REDDIT_CLIENT_SECRET,
        username: process.env.REDDIT_USERNAME,
        password: process.env.REDDIT_PASSWORD,
        subreddit: process.env.REDDIT_SUBREDDIT || 'technology',
        userAgent: 'WorkBuddy/1.0 (AI Article Poster)'
    };
}

/**
 * 获取 Reddit Access Token
 */
async function getAccessToken(config) {
    const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    const resp = await axios.post('https://www.reddit.com/api/v1/access_token', 
        `grant_type=password&username=${config.username}&password=${config.password}`,
        {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': config.userAgent
            }
        }
    );
    return resp.data.access_token;
}

/**
 * 发帖子到 Reddit
 * @param {Object} options
 * @param {string} options.title - 标题
 * @param {string} options.content - 正文内容
 * @param {string} options.subreddit - 子版块 (可选)
 * @param {string} options.flair - 标签 (可选)
 * @param {string} options.nsfw - 是否NSFW (可选)
 */
async function postToReddit({ title, content, subreddit, flair, nsfw = false }) {
    const config = loadConfig();
    
    if (!config.clientId || !config.clientSecret) {
        console.log('⚠️  Reddit 未配置，跳过发布');
        return { success: false, error: 'Reddit API 未配置' };
    }

    try {
        const token = await getAccessToken(config);
        const targetSubreddit = subreddit || config.subreddit;
        
        const postData = {
            sr: targetSubreddit,
            kind: 'self',
            title: title.slice(0, 300),
            text: content,
            nsfw: nsfw
        };
        
        if (flair) {
            postData.link_flair_text = flair;
        }
        
        const resp = await axios.post('https://oauth.reddit.com/api/submit', postData, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': config.userAgent
            }
        });
        
        const json = resp.data;
        if (json.json && json.json.errors && json.json.errors.length > 0) {
            throw new Error(json.json.errors.join(', '));
        }
        
        const permalink = json.json.data ? json.json.data[0].data.permalink : '';
        console.log(`✅ Reddit 帖子发布成功: ${permalink}`);
        
        return { success: true, permalink };
    } catch (e) {
        console.log(`❌ Reddit 发布失败: ${e.message}`);
        return { success: false, error: e.message };
    }
}

/**
 * 发文章链接到 Reddit
 */
async function postLink({ title, url, subreddit, nsfw = false }) {
    const config = loadConfig();
    
    if (!config.clientId || !config.clientSecret) {
        return { success: false, error: 'Reddit API 未配置' };
    }

    try {
        const token = await getAccessToken(config);
        const targetSubreddit = subreddit || config.subreddit;
        
        const resp = await axios.post('https://oauth.reddit.com/api/submit', {
            sr: targetSubreddit,
            kind: 'link',
            title: title.slice(0, 300),
            url: url,
            nsfw: nsfw
        }, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': config.userAgent
            }
        });
        
        const permalink = resp.data.json?.data?.[0]?.data?.permalink || '';
        console.log(`✅ Reddit 链接发布成功: ${permalink}`);
        
        return { success: true, permalink };
    } catch (e) {
        console.log(`❌ Reddit 发布失败: ${e.message}`);
        return { success: false, error: e.message };
    }
}

module.exports = { postToReddit, postLink, loadConfig };

// 测试
if (require.main === module) {
    (async () => {
        const result = await postToReddit({
            title: 'Test Post from WorkBuddy',
            content: 'This is a test post from WorkBuddy AI Article Publisher.',
            subreddit: 'technology'
        });
        console.log(result);
    })();
}