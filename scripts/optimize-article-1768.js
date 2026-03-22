// 优化单篇文章 - ID 1768
const OptimizationWorkflow = require('./optimization-workflow.cjs');

// 设置DeepSeek API Key
process.env.AI_API_KEY = 'sk-be1babe391c7428a80eca2b832c44cc2';
process.env.AI_PROVIDER = 'deepseek';
process.env.AI_BASE_URL = 'https://api.deepseek.com';
process.env.AI_MODEL = 'deepseek-coder';

async function optimizeArticle() {
    console.log('🚀 开始优化文章 ID: 1768\n');
    
    try {
        // 创建工作流实例
        const workflow = new OptimizationWorkflow({
            database: {
                host: 'localhost',
                port: 3306,
                database: 'eastaiai',
                user: 'root',
                password: 'gyc1234567'
            },
            ai: {
                provider: 'deepseek',
                apiKey: process.env.DEEPSEEK_API_KEY || '',
                baseUrl: 'https://api.deepseek.com'
            }
        });
        
        // 初始化
        console.log('📋 初始化工作流...');
        await workflow.init();
        
        // 优化文章
        console.log('\n🔄 开始优化文章...');
        const result = await workflow.optimizeSingleArticle({ articleId: 1768 });
        
        console.log('\n📊 优化结果:');
        console.log('----------------------------------------');
        console.log('成功:', result.success);
        if (result.success) {
            console.log('文章ID:', result.articleId);
            console.log('标题:', result.title);
            console.log('优化类型:', result.optimizationTypes);
            console.log('改进百分比:', result.improvementPercentage, '%');
            console.log('新评分:', result.newScore);
            console.log('\n原文长度:', result.originalLength);
            console.log('优化后长度:', result.optimizedLength);
        } else {
            console.log('错误:', result.error);
        }
        console.log('----------------------------------------');
        
        console.log('\n✅ 完成！');
        
    } catch (error) {
        console.error('❌ 失败:', error.message);
        console.error(error.stack);
    }
}

optimizeArticle();