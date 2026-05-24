const express = require('express');
const app = express();

// 模拟加载所有路由
const tasksRoutes = require('./server/routes/tasks');
const methodologyRoutes = require('./server/routes/methodology');

app.use('/api/tasks', tasksRoutes);
app.use('/api/methodology', methodologyRoutes);

// 打印所有路由
function printRoutes(stack, base = '') {
  stack.forEach(layer => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
      console.log(`${methods.padEnd(10)} ${base}${layer.route.path}`);
    } else if (layer.name === 'router' && layer.handle.stack) {
      const newBase = base + (layer.regexp.source.replace('\\/?', '').replace('^(?:', '').replace(')$', ''));
      printRoutes(layer.handle.stack, newBase);
    }
  });
}

console.log('📊 已注册的路由：\n');
printRoutes(app._router.stack);

console.log('\n完成！');
