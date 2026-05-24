/**
 * 直接测试插件（绕过 HTTP，直接调用）
 */

const path = require('path');
const MultiPlatformPublisher = require(path.join('D:\\', '.qclaw', 'workspace', 'wechat-publisher-plugin', 'scripts', 'multi-platform-publisher.cjs'));

async function testPluginDirectly() {
    try {
        console.log('📤 直接测试插件...\n');
        
        // 配置（从 .env 读取）
        const wechatConfig = {
            appId: 'wxbe7fd856ee4ae690',
            appSecret: 'ec65f0021eed492b6bac0670c63d67d2',
            thumbMediaId: 'fOSSI4rB_2kncg_EYxVB_3HgoVsm5uB1xT8Rd7553eHblT_oGvhZFjixaikeBYvg',
            author: 'WorkBuddy'
        };
        
        console.log('📤 初始化 MultiPlatformPublisher...');
        const publisher = new MultiPlatformPublisher({ wechat: wechatConfig });
        
        console.log('📤 调用 init()...');
        await publisher.init();
        console.log('✅ init() 成功\n');
        
        console.log('📤 调用 publishToWechat()...');
        const result = await publisher.publishToWechat({
            title: '插件直接测试 - ' + new Date().toISOString().slice(0, 16),
            content: '<p>这是通过插件直接发布的测试文章</p>',
            description: '测试插件直接调用'
        });
        
        console.log('📥 插件返回结果:');
        console.log('   success:', result.success);
        console.log('   platform:', result.platform);
        console.log('   articleId:', result.articleId);
        console.log('   完整响应:', JSON.stringify(result, null, 2));
        
        if (result.success) {
            console.log('\n✅✅✅ 插件直接调用成功！');
            console.log('   media_id:', result.articleId);
        } else {
            console.error('\n❌❌❌ 插件返回失败:', result.error);
        }
        
    } catch (e) {
        console.error('\n❌❌❌ 插件调用异常:', e.message);
        console.error('   堆栈:', e.stack);
    }
}

testPluginDirectly();
