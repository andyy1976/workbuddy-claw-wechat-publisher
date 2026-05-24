// 测试后端 API 端点
const http = require('http');

const endpoints = [
  { method: 'GET', path: '/api/health', desc: '健康检查' },
  { method: 'GET', path: '/api/tasks', desc: '获取任务列表' },
  { method: 'GET', path: '/api/models/list', desc: '获取模型列表' },
  { method: 'GET', path: '/api/style/list', desc: '获取风格列表' },
  { method: 'GET', path: '/api/cms/categories', desc: '获取CMS栏目' },
  { method: 'GET', path: '/api/product/list', desc: '获取产品列表' }
];

async function testEndpoint(endpoint) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: endpoint.path,
      method: endpoint.method,
      timeout: 3000
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => {
        console.log(`✅ ${endpoint.desc}: ${res.statusCode}`);
        try {
          const json = JSON.parse(data);
          console.log(`   ${JSON.stringify(json).substring(0, 100)}...`);
        } catch (e) {
          console.log(`   响应: ${data.substring(0, 50)}...`);
        }
        resolve({ success: true, status: res.statusCode });
      });
    });
    
    req.on('error', (e) => {
      console.log(`❌ ${endpoint.desc}: ${e.message}`);
      resolve({ success: false, error: e.message });
    });
    
    req.on('timeout', () => {
      console.log(`⏱️ ${endpoint.desc}: 超时`);
      req.destroy();
      resolve({ success: false, error: 'timeout' });
    });
    
    req.end();
  });
}

async function runTests() {
  console.log('🧪 开始测试后端 API 端点...\n');
  
  let successCount = 0;
  let failCount = 0;
  
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint);
    if (result.success && result.status === 200) {
      successCount++;
    } else {
      failCount++;
    }
    console.log(''); // 空行分隔
  }
  
  console.log(`\n📊 测试完成: ${successCount} 成功, ${failCount} 失败`);
}

runTests();
