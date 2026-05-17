#!/usr/bin/env node
/**
 * test-fetch-local.cjs - 测试本地 CMS 内容采集（跳过 Reddit）
 * 用途：验证本地版本能否连接外网数据库并采集内容
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// 配置
const CONFIG = {
  // CMS API 配置
  cmsApiUrl: 'http://localhost/index.php',
  cmsApiKey: 'scsai_2026_contentos_admin_key',
  
  // 测试模式：只采集微博和知乎（跳过 Reddit）
  sources: ['weibo', 'zhihu'],
  
  // 输出文件
  outputFile: path.join(__dirname, '../data/test-hot-topics.json')
};

// HTTP/HTTPS GET 请求封装
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const timeout = 10000; // 10 秒超时
    
    const req = client.get(url, { timeout }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSON 解析失败: ' + e.message));
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
  });
}

// 采集微博热搜
async function fetchWeiboHot() {
  console.log('[1/2] 正在采集微博热搜...');
  try {
    const url = 'https://weibo.com/ajax/side/hotSearch';
    const data = await httpGet(url);
    const hotList = data.data.realtime || [];
    
    return hotList.slice(0, 10).map((item, idx) => ({
      rank: idx + 1,
      title: item.word,
      hot: item.num ? String(item.num) : '',
      url: 'https://s.weibo.com/weibo?q=' + encodeURIComponent(item.word),
      source: 'weibo'
    }));
  } catch (err) {
    console.error('  ❌ 微博采集失败:', err.message);
    return [];
  }
}

// 采集知乎热榜
async function fetchZhihuHot() {
  console.log('[2/2] 正在采集知乎热榜...');
  try {
    const url = 'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=10';
    const data = await httpGet(url);
    const hotList = data.data || [];
    
    return hotList.map((item, idx) => ({
      rank: idx + 1,
      title: item.target.title,
      hot: item.detail_text || '',
      url: 'https://www.zhihu.com/question/' + item.target.id,
      source: 'zhihu'
    }));
  } catch (err) {
    console.error('  ❌ 知乎采集失败:', err.message);
    return [];
  }
}

// 主函数
async function main() {
  console.log('========================================');
  console.log('  Local CMS Content Fetcher (Test Mode)');
  console.log('========================================\n');
  
  const results = [];
  
  // 采集微博
  if (CONFIG.sources.includes('weibo')) {
    const weibo = await fetchWeiboHot();
    results.push(...weibo);
    console.log(`  ✅ 微博: ${weibo.length} 条\n`);
  }
  
  // 采集知乎
  if (CONFIG.sources.includes('zhihu')) {
    const zhihu = await fetchZhihuHot();
    results.push(...zhihu);
    console.log(`  ✅ 知乎: ${zhihu.length} 条\n`);
  }
  
  // 保存结果
  const outputDir = path.dirname(CONFIG.outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(CONFIG.outputFile, JSON.stringify(results, null, 2));
  console.log(`\n✅ 采集完成！共 ${results.length} 条热点`);
  console.log(`   结果已保存到: ${CONFIG.outputFile}`);
  
  // 推送到 CMS
  console.log('\n========================================');
  console.log('  推送到本地 CMS...');
  console.log('========================================\n');
  
  for (const item of results.slice(0, 3)) { // 只推送前 3 条测试
    console.log(`[推送] ${item.title}`);
    
    try {
      const postData = JSON.stringify({
        title: item.title,
        content: `热点来源：${item.source}\n排名：第 ${item.rank} 名\n热度：${item.hot}\n\n原文链接：${item.url}`,
        typeid: 21215, // 技术观察分类
        source: item.source,
        tags: [item.source, '测试', '热点']
      });
      
      const options = {
        hostname: 'localhost',
        port: 80,
        path: '/index.php?s=Contentapi/push',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': CONFIG.cmsApiKey,
          'Content-Length': Buffer.byteLength(postData)
        }
      };
      
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log(`  ✅ 推送成功: ${data}`);
        });
      });
      
      req.on('error', (err) => {
        console.error(`  ❌ 推送失败: ${err.message}`);
      });
      
      req.write(postData);
      req.end();
      
      // 等待 1 秒避免频率限制
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (err) {
      console.error(`  ❌ 推送失败: ${err.message}`);
    }
  }
  
  console.log('\n✅ 测试完成！请访问 http://localhost/admin.php 查看推送的文章');
}

// 执行
main().catch(err => {
  console.error('❌ 致命错误:', err);
  process.exit(1);
});
