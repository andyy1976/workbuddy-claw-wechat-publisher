const fs = require('fs');
const path = require('path');

const backupFile = path.join(__dirname, 'server', 'public', 'index-old-backup.html');
const outputFile = path.join(__dirname, 'old-backup.js');

const html = fs.readFileSync(backupFile, 'utf8');

// 查找 <script> 和 </script> 标签
const startTag = '<script>';
const endTag = '</script>';

const startIdx = html.indexOf(startTag);
const endIdx = html.indexOf(endTag);

if (startIdx === -1 || endIdx === -1) {
  console.log('❌ 未找到 <script> 标签');
  process.exit(1);
}

const jsContent = html.substring(startIdx + startTag.length, endIdx);

fs.writeFileSync(outputFile, jsContent, 'utf8');

console.log(`✅ 已提取 JavaScript: ${jsContent.length} 字节`);
console.log(`   保存到: ${outputFile}`);
