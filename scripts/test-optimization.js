// 测试优化工作流
const OptimizationWorkflow = require('./optimization-workflow.cjs');

async function test() {
    console.log('🚀 开始测试优化工作流...\n');
    
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
        const initResult = await workflow.init();
        console.log('初始化结果:', initResult);
        
        if (!initResult.success) {
            console.error('❌ 初始化失败');
            return;
        }
        
        // 获取统计信息
        console.log('\n📊 获取文章统计...');
        const stats = await workflow.getOptimizationStats();
        console.log('统计结果:', stats);
        
        console.log('\n✅ 测试完成！');
        
    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        console.error(error.stack);
    }
}

test();