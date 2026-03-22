@echo off
cd /d "C:\Users\tuan_\WorkBuddy\20260317201006\wechat-publisher-plugin\scripts"
node -e "const wf = require('./optimization-workflow.cjs'); (async () => { const w = new wf({ database: { host: 'localhost', database: 'eastaiai', user: 'root', password: 'gyc1234567' }, ai: { provider: 'deepseek', apiKey: process.env.DEEPSEEK_API_KEY || '' } }); await w.init(); const result = await w.optimizeSingleArticle(1768); console.log(JSON.stringify(result, null, 2)); })()"
pause