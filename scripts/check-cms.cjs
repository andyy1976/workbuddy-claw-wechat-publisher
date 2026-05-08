const mysql = require('mysql2/promise');
mysql.createConnection({
    host: '82.156.40.94', port: 3306,
    user: 'root', password: 'gyCms2024!',
    database: 'eastaiai'
})
.then(async c => {
    // 1. Check table structure
    const [rows] = await c.query('DESC lvbo_type');
    console.log('=== lvbo_type columns ===');
    rows.forEach(x => console.log(x.Field, '|', x.Type, '|', x.Key));
    console.log();
    
    // 2. Check existing typeids
    const [types] = await c.query("SELECT typeid, typename, fid FROM lvbo_type WHERE typeid IN ('11','12','13','14','61','111','112','113','121','122','123','131','132','133','141','142','143')");
    console.log('=== Existing typeids ===');
    types.forEach(t => console.log(t.typeid, t.typename, 'fid=', t.fid));
    
    await c.end();
})
.catch(e => console.error('Error:', e.message));
