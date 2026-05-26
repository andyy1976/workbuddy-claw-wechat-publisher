const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({host:'82.156.40.94',user:'eastaiai',password:'alibaba',database:'eastaiai'});
  const [rows] = await conn.execute('SELECT id, username, email, display_name FROM users WHERE role="admin" LIMIT 1');
  console.log(JSON.stringify(rows, null, 2));
  await conn.end();
})();
