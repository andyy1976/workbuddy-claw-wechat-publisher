const fs = require('fs');
const path = require('path');

// 读取旧备份的 JavaScript
const oldJsFile = path.join(__dirname, 'old-backup.js');
const oldJS = fs.readFileSync(oldJsFile, 'utf8');

// 提取所有函数名
const funcRegex = /function\s+(\w+)\s*\(/g;
const funcs = [];
let match;

while ((match = funcRegex.exec(oldJS)) !== null) {
  funcs.push(match[1]);
}

console.log(`📊 旧备份 JavaScript 中的函数 (${funcs.length} 个)：\n`);

// 按页面分组函数（根据函数名猜测）
const pageFunctions = {
  dashboard: [],
  generate: [],
  deaiify: [],
  publish: [],
  product: [],
  style: [],
  cms: [],
  chat: [],
  models: [],
  shared: []
};

funcs.forEach(funcName => {
  if (funcName.startsWith('load') || funcName.startsWith('show') || funcName.startsWith('get')) {
    if (funcName.includes('Product')) pageFunctions.product.push(funcName);
    else if (funcName.includes('Style')) pageFunctions.style.push(funcName);
    else if (funcName.includes('CMS') || funcName.includes('Cms')) pageFunctions.cms.push(funcName);
    else if (funcName.includes('Model')) pageFunctions.models.push(funcName);
    else if (funcName.includes('Generate') || funcName.includes('generate')) pageFunctions.generate.push(funcName);
    else if (funcName.includes('Deai') || funcName.includes('deai')) pageFunctions.deaiify.push(funcName);
    else if (funcName.includes('Publish') || funcName.includes('publish')) pageFunctions.publish.push(funcName);
    else if (funcName.includes('Chat') || funcName.includes('chat')) pageFunctions.chat.push(funcName);
    else if (funcName.includes('Dashboard') || funcName.includes('dashboard') || funcName.includes('navigate') || funcName.includes('showToast')) pageFunctions.shared.push(funcName);
    else pageFunctions.shared.push(funcName); // 默认归为共享
  } else {
    pageFunctions.shared.push(funcName);
  }
});

// 输出按页面分组的函数
Object.entries(pageFunctions).forEach(([page, funcs]) => {
  if (funcs.length > 0) {
    console.log(`📋 ${page.toUpperCase()} 页面函数 (${funcs.length}个)：`);
    funcs.forEach(f => console.log(`  - ${f}()`));
    console.log();
  }
});

// 保存完整函数列表
const outputFile = path.join(__dirname, 'old-backup-functions.txt');
fs.writeFileSync(outputFile, funcs.join('\n'), 'utf8');
console.log(`\n✅ 完整函数列表已保存到: ${outputFile}`);
