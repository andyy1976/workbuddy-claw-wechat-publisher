const fs = require('fs');
const path = require('path');

/**
 * 从HTML中提取JavaScript函数名
 */
function extractJSFunctions(html) {
  const funcRegex = /function\s+(\w+)\s*\(/g;
  const funcs = [];
  let match;
  while ((match = funcRegex.exec(html)) !== null) {
    funcs.push(match[1]);
  }
  return funcs;
}

/**
 * 从HTML中提取API调用
 */
function extractAPICalls(html) {
  const apiRegex = /fetch\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const apis = [];
  let match;
  while ((match = apiRegex.exec(html)) !== null) {
    apis.push(match[1]);
  }
  return [...new Set(apis)]; // 去重
}

/**
 * 对比两个文件
 */
function compareFiles(oldFile, newFile, pageName) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📋 对比页面: ${pageName}`);
  console.log('='.repeat(70));
  
  const oldContent = fs.readFileSync(oldFile, 'utf8');
  const newContent = fs.readFileSync(newFile, 'utf8');
  
  // 提取函数
  const oldFuncs = extractJSFunctions(oldContent);
  const newFuncs = extractJSFunctions(newContent);
  
  console.log(`\n📊 函数统计：`);
  console.log(`  旧备份: ${oldFuncs.length} 个函数`);
  console.log(`  当前文件: ${newFuncs.length} 个函数`);
  
  // 找出新增和缺失的函数
  const added = newFuncs.filter(f => !oldFuncs.includes(f));
  const removed = oldFuncs.filter(f => !newFuncs.includes(f));
  
  if (added.length > 0) {
    console.log(`\n✅ 新增函数 (${added.length}个):`);
    added.forEach(f => console.log(`  + ${f}()`));
  }
  
  if (removed.length > 0) {
    console.log(`\n❌ 缺失函数 (${removed.length}个):`);
    removed.forEach(f => console.log(`  - ${f}()`));
  }
  
  // 提取API调用
  const oldAPIs = extractAPICalls(oldContent);
  const newAPIs = extractAPICalls(newContent);
  
  console.log(`\n📡 API调用统计：`);
  console.log(`  旧备份: ${oldAPIs.length} 个API调用`);
  console.log(`  当前文件: ${newAPIs.length} 个API调用`);
  
  const addedAPIs = newAPIs.filter(a => !oldAPIs.includes(a));
  const removedAPIs = oldAPIs.filter(a => !newAPIs.includes(a));
  
  if (addedAPIs.length > 0) {
    console.log(`\n✅ 新增API调用 (${addedAPIs.length}个):`);
    addedAPIs.forEach(a => console.log(`  + ${a}`));
  }
  
  if (removedAPIs.length > 0) {
    console.log(`\n❌ 缺失API调用 (${removedAPIs.length}个):`);
    removedAPIs.forEach(a => console.log(`  - ${a}`));
  }
  
  return { added, removed, addedAPIs, removedAPIs };
}

// 主程序
const backupDir = __dirname;
const publicDir = path.join(__dirname, 'server', 'public');

const comparisons = [
  { old: 'page-dashboard-backup.html', new: 'index.html', name: 'Dashboard' },
  { old: 'page-style-backup.html', new: 'style.html', name: 'Style' },
  { old: 'page-cms-backup.html', new: 'cms.html', name: 'CMS' },
  { old: 'page-chat-backup.html', new: 'chat.html', name: 'Chat' },
  { old: 'page-models-backup.html', new: 'models.html', name: 'Models' },
  { old: 'page-generate-backup.html', new: 'generate.html', name: 'Generate' },
  { old: 'page-product-backup.html', new: 'product.html', name: 'Product' },
];

const results = {};

comparisons.forEach(({ old, new: newFile, name }) => {
  const oldFile = path.join(backupDir, old);
  const newFilePath = path.join(publicDir, newFile);
  
  if (!fs.existsSync(oldFile)) {
    console.log(`\n❌ 旧备份文件不存在: ${oldFile}`);
    return;
  }
  
  if (!fs.existsSync(newFilePath)) {
    console.log(`\n❌ 当前文件不存在: ${newFilePath}`);
    return;
  }
  
  results[name] = compareFiles(oldFile, newFilePath, name);
});

// 总结
console.log(`\n\n${'='.repeat(70)}`);
console.log('📊 对比总结');
console.log('='.repeat(70));

let totalAdded = 0;
let totalRemoved = 0;

Object.entries(results).forEach(([name, result]) => {
  if (result) {
    totalAdded += result.added.length;
    totalRemoved += result.removed.length;
  }
});

console.log(`\n总计：`);
console.log(`  新增函数: ${totalAdded} 个`);
console.log(`  缺失函数: ${totalRemoved} 个`);

if (totalRemoved === 0) {
  console.log(`\n✅ 未发现功能缩水！所有函数都保留到了新文件中。`);
} else {
  console.log(`\n⚠️  发现 ${totalRemoved} 个函数缺失，请检查上述详情。`);
}

console.log(`\n对比完成！`);
