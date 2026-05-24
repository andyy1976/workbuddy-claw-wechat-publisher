const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '..', '..', '.env');
const content = fs.readFileSync(envPath, 'utf8');
content.split('\n').forEach(line => {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*["']?(.+?)["']?\s*$/);
  if (m) process.env[m[1]] = m[2];
});

const { hunyuan } = require('tencentcloud-sdk-nodejs-hunyuan');
const client = new hunyuan.v20230901.Client({
  credential: {
    secretId: process.env.TENCENT_SECRET_ID,
    secretKey: process.env.TENCENT_SECRET_KEY,
  },
  region: 'ap-guangzhou',
  profile: { httpProfile: { endpoint: 'hunyuan.tencentcloudapi.com' } },
});

client.QueryHunyuanImageJob({
  JobId: '1373421398-1779284941-a832e0ef-5452-11f1-a48f-5254001aeb39-0'
}).then(res => {
  console.log('Full response:', JSON.stringify(res, null, 2));
}).catch(err => {
  console.error('Error:', err.message);
});
