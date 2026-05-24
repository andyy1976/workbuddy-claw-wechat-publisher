const express = require('express');
const app = express();
const PORT = 3456;

// 测试加载 routes/models.js
console.log('[Test] 开始加载 routes/models.js...');
try {
  const modelsRoutes = require('./server/routes/models');
  app.use('/api/models', modelsRoutes);
  console.log('[Test] routes/models.js 加载成功');
} catch (e) {
  console.error('[Test] routes/models.js 加载失败:', e.message);
}

// 测试加载 routes/content.js
console.log('[Test] 开始加载 routes/content.js...');
try {
  const contentRoutes = require('./server/routes/content');
  app.use('/api/content', contentRoutes);
  console.log('[Test] routes/content.js 加载成功');
} catch (e) {
  console.error('[Test] routes/content.js 加载失败:', e.message);
}

app.get('/', (req, res) => {
    res.send('Test Server');
});

app.listen(PORT, () => {
    console.log(`Test server running on port ${PORT}`);
});

// 保持进程运行
setInterval(() => {}, 1000);
