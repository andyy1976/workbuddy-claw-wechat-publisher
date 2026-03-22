const fs = require('fs');
const path = require('path');

const testFile = path.join(__dirname, 'write-test-ok.txt');
try {
    fs.writeFileSync(testFile, 'test');
    console.log('SUCCESS - Write OK:', testFile);
    fs.unlinkSync(testFile);
} catch(e) {
    console.log('FAILED - Code:', e.code, 'Msg:', e.message);
}
