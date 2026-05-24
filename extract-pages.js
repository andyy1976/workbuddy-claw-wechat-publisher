const fs = require('fs');
const path = require('path');

const backupFile = path.join(__dirname, 'server', 'public', 'index-old-backup.html');
const outputDir = __dirname;

const html = fs.readFileSync(backupFile, 'utf8');

// 页面ID列表
const pages = ['dashboard', 'style', 'cms', 'chat', 'models', 'generate', 'product'];

pages.forEach(pageId => {
  // 使用正则匹配，允许 class 有多种写法
  const startRegex = new RegExp(`<div\\s+class="page(?:\\s+active)?"\\s+id="page-${pageId}">`, 'i');
  const match = html.match(startRegex);
  
  if (!match) {
    console.log(`❌ 未找到 page-${pageId}`);
    return;
  }
  
  const startIndex = match.index;
  const startTag = match[0];
  
  // 从startIndex + startTag.length 开始，找匹配的结束标签
  let pos = startIndex + startTag.length;
  let depth = 1; // 已经有一个开始的 div
  let endIndex = -1;
  
  while (pos < html.length && depth > 0) {
    const nextOpen = html.indexOf('<div', pos);
    const nextClose = html.indexOf('</div>', pos);
    
    if (nextClose === -1) break;
    
    if (nextOpen !== -1 && nextOpen < nextClose) {
      // 找到 <div 标签
      depth++;
      pos = nextOpen + 1;
      // 跳到下一个位置
      const closeTag = html.indexOf('>', nextOpen);
      if (closeTag !== -1) pos = closeTag + 1;
    } else {
      // 找到 </div>
      depth--;
      if (depth === 0) {
        endIndex = nextClose;
        break;
      }
      pos = nextClose + 1;
    }
  }
  
  if (endIndex === -1) {
    console.log(`❌ 无法找到 page-${pageId} 的结束位置`);
    return;
  }
  
  const content = html.substring(startIndex, endIndex + 6); // +6 for </div>
  const outputFile = path.join(outputDir, `page-${pageId}-backup.html`);
  fs.writeFileSync(outputFile, content, 'utf8');
  
  console.log(`✅ 已提取 page-${pageId}: ${content.length} 字节 -> ${outputFile}`);
});

console.log('\n提取完成！');
