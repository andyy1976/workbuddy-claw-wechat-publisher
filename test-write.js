const fs = require('fs');
const path = require('path');

const testFile = 'C:/test.txt';
try {
    fs.writeFileSync(testFile, 'test');
    console.log('Write OK:', testFile);
} catch(e) {
    console.log('Write FAILED:', e.code, e.message);
}
