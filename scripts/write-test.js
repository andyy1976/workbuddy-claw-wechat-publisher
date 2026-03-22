const fs = require('fs');
const path = require('path');

const testFile = path.join(__dirname, 'write-test.txt');
try {
    fs.writeFileSync(testFile, 'test');
    console.log('Write OK:', testFile);
    fs.unlinkSync(testFile);
} catch(e) {
    console.log('Write FAILED:', e.code, e.message);
}
