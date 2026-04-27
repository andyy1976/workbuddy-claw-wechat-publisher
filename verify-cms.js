const mysql = require('mysql2/promise');
(async() => {
  const conn = await mysql.createConnection({
    host: 'localhost', port: 3306,
    user: 'root', password: 'gyc1234567', database: 'eastaiai'
  });
  
  // 查最新入库的文章
  const [articles] = await conn.query(
    'SELECT aid, title, author, keywords, typeid, addtime FROM lvbo_article ORDER BY aid DESC LIMIT 3'
  );
  console.log('=== 最新入库文章 ===');
  articles.forEach(a => console.log(`  [${a.aid}] ${a.title} | 分类:${a.typeid} | ${a.addtime}`));
  
  // 查新建的"技术观察"主分类及子分类
  const [types] = await conn.query(
    "SELECT typeid, typename, fid FROM lvbo_type WHERE typename = '技术观察' OR fid IN (SELECT typeid FROM lvbo_type WHERE typename = '技术观察')"
  );
  console.log('\n=== 技术观察分类 ===');
  types.forEach(t => console.log(`  [${t.typeid}] ${t.typename} (fid:${t.fid})`));
  
  // 总文章数
  const [[cnt]] = await conn.query('SELECT COUNT(*) as cnt FROM lvbo_article');
  console.log(`\n总文章数: ${cnt.cnt}`);
  
  await conn.end();
  console.log('\n✅ 验证完成');
})();
