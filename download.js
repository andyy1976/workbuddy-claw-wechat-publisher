const https = require('https');
const fs = require('fs');
const path = require('path');

const url = 'https://github.com/andyy1976/feishu-weather-a-parser/archive/refs/heads/main.zip';
const outputPath = 'C:/Users/tuan_/Desktop/feishu-weather.zip';

console.log('Downloading...');

const file = fs.createWriteStream(outputPath);
https.get(url, (response) => {
    if (response.statusCode === 302 || response.statusCode === 301) {
        console.log('Redirect to:', response.headers.location);
        https.get(response.headers.location, (response2) => {
            response2.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log('Downloaded to:', outputPath);
            });
        }).on('error', (err) => {
            console.error('Download error:', err.message);
        });
    } else {
        response.pipe(file);
        file.on('finish', () => {
            file.close();
            console.log('Downloaded to:', outputPath);
        });
    }
}).on('error', (err) => {
    console.error('Request error:', err.message);
});
