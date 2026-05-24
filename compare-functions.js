const fs = require('fs');
const path = require('path');

// 读取旧备份的函数列表
const oldFuncsFile = path.join(__dirname, 'old-backup-functions.txt');
const oldFuncs = fs.readFileSync(oldFuncsFile, 'utf8').split('\n').filter(Boolean);

// 从新版本中提取所有函数
const publicDir = path.join(__dirname, 'server', 'public');
const jsDir = path.join(publicDir, 'js');

// 读取 common.js
const commonJS = fs.readFileSync(path.join(jsDir, 'common.js'), 'utf8');

// 读取所有 HTML 文件
const htmlFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

let newFuncs = [];

// 从 common.js 提取函数
const funcRegex = /function\s+(\w+)\s*\(/g;
let match;
while ((match = funcRegex.exec(commonJS)) !== null) {
  newFuncs.push(match[1]);
}

// 从每个 HTML 文件中提取函数
htmlFiles.forEach(file => {
  const content = fs.readFileSync(path.join(publicDir, file), 'utf8');
  while ((match = funcRegex.exec(content)) !== null) {
    newFuncs.push(match[1]);
  }
});

newFuncs = [...new Set(newFuncs)]; // 去重

console.log('📊 函数对比结果：\n');
console.log(`旧备份函数: ${oldFuncs.length} 个`);
console.log(`新版本函数: ${newFuncs.length} 个\n`);

// 找出缺失的函数
const missingFuncs = oldFuncs.filter(f => !newFuncs.includes(f));

if (missingFuncs.length === 0) {
  console.log('✅ 所有函数都已保留到新版本中！');
} else {
  console.log(`❌ 发现 ${missingFuncs.length} 个缺失函数：\n`);
  missingFuncs.forEach(f => {
    console.log(`  - ${f}()`);
  });
  
  // 尝试找出这些函数可能的新位置
  console.log('\n🔍 检查可能的位置：\n');
  
  missingFuncs.forEach(funcName => {
    let found = false;
    
    // 在 common.js 中搜索
    if (commonJS.includes(funcName)) {
      console.log(`  ✅ ${funcName}() 可能在 common.js 中（重命名或合并）`);
      found = true;
    }
    
    // 在每个 HTML 文件中搜索
    htmlFiles.forEach(file => {
      const content = fs.readFileSync(path.join(publicDir, file), 'utf8');
      if (content.includes(funcName)) {
        console.log(`  ✅ ${funcName}() 可能在 ${file} 中`);
        found = true;
      }
    });
    
    if (!found) {
      console.log(`  ❌ ${funcName}() 未找到，可能已丢失`);
    }
  });
}

// 找出新增的函数
const addedFuncs = newFuncs.filter(f => !oldFuncs.includes(f));

if (addedFuncs.length > 0) {
  console.log(`\n✅ 新版本新增 ${addedFuncs.length} 个函数：\n`);
  addedFuncs.forEach(f => {
    console.log(`  + ${f}()`);
  });
}

console.log('\n对比完成！');
