const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'server', 'public');
const backupDir = __dirname; // 提取的备份文件在当前目录

// 页面映射：旧备份页面 -> 当前拆分文件
const pageMap = {
  'dashboard': 'index.html', // dashboard 可能合并到了 index.html
  'style': 'style.html',
  'cms': 'cms.html',
  'chat': 'chat.html',
  'models': 'models.html',
  'generate': 'generate.html',
  'product': 'product.html'
};

console.log('📊 页面大小对比：\n');
console.log('页面'.padEnd(15), '旧备份'.padEnd(12), '当前文件'.padEnd(12), '差异'.padEnd(10), '状态');
console.log('-'.repeat(70));

Object.entries(pageMap).forEach(([oldPage, newFile]) => {
  const oldFile = path.join(backupDir, `page-${oldPage}-backup.html`);
  const newFilePath = path.join(publicDir, newFile);
  
  const oldSize = fs.existsSync(oldFile) ? fs.statSync(oldFile).size : 0;
  const newSize = fs.existsSync(newFilePath) ? fs.statSync(newFilePath).size : 0;
  
  const diff = newSize - oldSize;
  const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
  const status = Math.abs(diff) > 100 ? '⚠️ 差异较大' : '✅ 相近';
  
  console.log(
    oldPage.padEnd(15),
    `${oldSize}`.padEnd(12),
    `${newSize}`.padEnd(12),
    diffStr.padEnd(10),
    status
  );
});

// 检查新增的页面（旧备份中没有的）
console.log('\n\n📋 新增页面（旧备份中没有）：');
const newPages = ['bom-import.html', 'competitor.html', 'methodology.html', 'product-catalog.html', 'tasks.html', 'deaiify.html', 'publish.html'];
newPages.forEach(file => {
  const filePath = path.join(publicDir, file);
  const size = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
  console.log(`  ${file}: ${size} 字节`);
});

console.log('\n对比完成！');
