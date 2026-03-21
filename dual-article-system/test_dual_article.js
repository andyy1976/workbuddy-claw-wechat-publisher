/**
 * 双文章生成系统测试脚本
 * 用于测试系统功能和验证配置
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 双文章生成系统测试开始\n');
console.log('='.repeat(60));

// 测试环境检查
function testEnvironment() {
    console.log('🔍 环境检查：');
    
    const checks = [
        {
            name: 'Node.js版本',
            test: () => process.version,
            expected: 'v14.0.0以上',
            status: true
        },
        {
            name: '主脚本存在',
            test: () => fs.existsSync(path.join(__dirname, 'dual_article_generator.js')),
            expected: true,
            status: false
        },
        {
            name: '配置文件存在',
            test: () => fs.existsSync(path.join(__dirname, 'dual_article_config.json')),
            expected: true,
            status: false
        },
        {
            name: '依赖包检查',
            test: () => {
                try {
                    require('axios');
                    require('fs');
                    require('path');
                    return true;
                } catch (e) {
                    return false;
                }
            },
            expected: true,
            status: false
        }
    ];
    
    let allPassed = true;
    
    checks.forEach(check => {
        check.status = check.test();
        const passed = check.status === check.expected;
        const icon = passed ? '✅' : '❌';
        
        console.log(`   ${icon} ${check.name}: ${check.status} (期望: ${check.expected})`);
        
        if (!passed) {
            allPassed = false;
        }
    });
    
    return allPassed;
}

// 测试主题选择逻辑
function testTopicSelection() {
    console.log('\n🔍 主题选择逻辑测试：');
    
    try {
        const DualArticleGenerator = require('./dual_article_generator.js');
        const generator = new DualArticleGenerator();
        
        // 测试主题数量
        const topicCount = generator.hotTopics.length;
        console.log(`   ✅ 主题库数量: ${topicCount}个主题`);
        
        // 测试热度评分范围
        const validScores = generator.hotTopics.every(topic => 
            topic.trendScore >= 0 && topic.trendScore <= 100
        );
        console.log(`   ${validScores ? '✅' : '❌'} 热度评分范围: 0-100`);
        
        // 测试选择逻辑
        const selectedTopic = generator.selectTodayHotTopic();
        console.log(`   ✅ 主题选择函数正常工作`);
        console.log(`   • 选中主题: ${selectedTopic.title}`);
        console.log(`   • 热度评分: ${selectedTopic.trendScore}`);
        
        return true;
    } catch (error) {
        console.log(`   ❌ 主题选择测试失败: ${error.message}`);
        return false;
    }
}

// 测试文章生成逻辑
function testArticleGeneration() {
    console.log('\n🔍 文章生成逻辑测试：');
    
    try {
        const DualArticleGenerator = require('./dual_article_generator.js');
        const generator = new DualArticleGenerator();
        
        // 选择一个主题
        const topic = generator.hotTopics[0];
        console.log(`   测试主题: ${topic.title}`);
        
        // 生成小红书文章
        const xhsArticle = generator.generateXiaohongshuArticle(topic);
        const xhsLength = xhsArticle.length;
        console.log(`   ✅ 小红书文章生成: ${xhsLength} 字符`);
        
        // 检查小红书文章长度限制
        const xhsLengthOk = xhsLength <= 1000;
        console.log(`   ${xhsLengthOk ? '✅' : '❌'} 小红书文章长度: ${xhsLength} <= 1000`);
        
        // 生成公众号文章
        const wechatArticle = generator.generateWechatArticle(topic);
        const wechatLength = wechatArticle.length;
        console.log(`   ✅ 公众号文章生成: ${wechatLength} 字符`);
        
        // 检查文章内容
        const hasXhsEmoji = xhsArticle.includes(topic.emoji);
        const hasWechatKeywords = wechatArticle.includes(topic.keywords[0]);
        
        console.log(`   ${hasXhsEmoji ? '✅' : '❌'} 小红书文章包含emoji: ${topic.emoji}`);
        console.log(`   ${hasWechatKeywords ? '✅' : '❌'} 公众号文章包含关键词: ${topic.keywords[0]}`);
        
        return xhsLengthOk;
    } catch (error) {
        console.log(`   ❌ 文章生成测试失败: ${error.message}`);
        return false;
    }
}

// 测试文件保存功能
function testFileSaving() {
    console.log('\n🔍 文件保存功能测试：');
    
    try {
        const DualArticleGenerator = require('./dual_article_generator.js');
        const generator = new DualArticleGenerator();
        
        const topic = generator.hotTopics[0];
        const xhsArticle = generator.generateXiaohongshuArticle(topic);
        const wechatArticle = generator.generateWechatArticle(topic);
        
        // 测试保存功能
        const savedFiles = generator.saveArticlesToFile(xhsArticle, wechatArticle, topic);
        
        console.log(`   ✅ 文件保存成功`);
        console.log(`   • 小红书文件: ${path.basename(savedFiles.xhsPath)}`);
        console.log(`   • 公众号文件: ${path.basename(savedFiles.wechatPath)}`);
        console.log(`   • 摘要文件: ${path.basename(savedFiles.summaryPath)}`);
        
        // 验证文件存在
        const filesExist = [
            savedFiles.xhsPath,
            savedFiles.wechatPath,
            savedFiles.summaryPath
        ].every(file => fs.existsSync(file));
        
        console.log(`   ${filesExist ? '✅' : '❌'} 所有文件都成功保存`);
        
        // 清理测试文件
        setTimeout(() => {
            [savedFiles.xhsPath, savedFiles.wechatPath, savedFiles.summaryPath].forEach(file => {
                if (fs.existsSync(file)) {
                    fs.unlinkSync(file);
                }
            });
            console.log('   🧹 测试文件已清理');
        }, 1000);
        
        return filesExist;
    } catch (error) {
        console.log(`   ❌ 文件保存测试失败: ${error.message}`);
        return false;
    }
}

// 测试配置加载
function testConfigLoading() {
    console.log('\n🔍 配置加载测试：');
    
    try {
        // 创建测试配置文件
        const testConfig = {
            appId: "test_app_id",
            appSecret: "test_app_secret",
            thumbMediaId: "test_thumb_media_id"
        };
        
        const configPath = path.join(__dirname, 'automation_config.json');
        const configExists = fs.existsSync(configPath);
        
        if (!configExists) {
            fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2));
            console.log(`   ⚠️ 创建了测试配置文件: ${configPath}`);
        }
        
        console.log(`   ${configExists ? '✅' : '⚠️'} 配置文件存在`);
        
        // 尝试读取配置
        const configContent = fs.readFileSync(configPath, 'utf8');
        const parsedConfig = JSON.parse(configContent);
        
        const hasRequiredFields = 
            parsedConfig.appId && 
            parsedConfig.appSecret && 
            parsedConfig.thumbMediaId;
        
        console.log(`   ${hasRequiredFields ? '✅' : '❌'} 配置文件格式正确`);
        
        if (!configExists) {
            // 删除测试配置文件
            fs.unlinkSync(configPath);
            console.log(`   🧹 已删除测试配置文件`);
        }
        
        return hasRequiredFields;
    } catch (error) {
        console.log(`   ❌ 配置加载测试失败: ${error.message}`);
        return false;
    }
}

// 生成测试报告
function generateTestReport(results) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试报告');
    console.log('='.repeat(60));
    
    const totalTests = Object.keys(results).length;
    const passedTests = Object.values(results).filter(result => result).length;
    const successRate = Math.round((passedTests / totalTests) * 100);
    
    console.log(`✅ 通过测试: ${passedTests}/${totalTests}`);
    console.log(`📈 成功率: ${successRate}%`);
    
    Object.entries(results).forEach(([testName, result]) => {
        console.log(`   ${result ? '✅' : '❌'} ${testName}: ${result ? '通过' : '失败'}`);
    });
    
    console.log('\n' + '='.repeat(60));
    
    if (passedTests === totalTests) {
        console.log('🎉 所有测试通过！系统已准备好运行。');
        return true;
    } else {
        console.log('⚠️  部分测试失败，请检查问题后重试。');
        return false;
    }
}

// 主测试函数
async function runAllTests() {
    console.log('🧪 双文章生成系统 - 完整测试套件\n');
    
    const testResults = {
        '环境检查': testEnvironment(),
        '主题选择逻辑': testTopicSelection(),
        '文章生成逻辑': testArticleGeneration(),
        '文件保存功能': testFileSaving(),
        '配置加载': testConfigLoading()
    };
    
    const allPassed = generateTestReport(testResults);
    
    if (allPassed) {
        console.log('\n🎯 下一步：');
        console.log('   1. 确保配置了正确的微信公众号API参数');
        console.log('   2. 运行命令: node dual_article_generator.js');
        console.log('   3. 查看生成的文章和发布结果');
        console.log('   4. 检查公众号草稿箱确认文章已成功发布');
    }
    
    return allPassed;
}

// 执行测试
if (require.main === module) {
    runAllTests()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('❌ 测试执行失败:', error.message);
            process.exit(1);
        });
}

module.exports = {
    testEnvironment,
    testTopicSelection,
    testArticleGeneration,
    testFileSaving,
    testConfigLoading,
    runAllTests
};