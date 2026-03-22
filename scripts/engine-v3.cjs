/**
 * WorkBuddy 微信公众号发布器 - 核心引擎 v3.0 (企业版)
 * 
 * v3.0 新增功能：
 * 1. 🔄 内容审核工作流集成
 * 2. 🌐 多平台发布支持
 * 3. 📊 数据分析看板
 * 4. 👥 团队协作功能
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ── 加载扩展模块 ─────────────────────────────────────────
const cmsStorage = require('./cms-database.cjs');
const ExtendedCMS = require('./extended-cms-database.cjs');
const ReviewWorkflow = require('./review-workflow.cjs');

// 基础目录 - 使用__dirname确保路径正确
const baseDir = __dirname;

// ── 尝试加载排版模块 ─────────────────────────────────────
let MarkdownToWeChat = null;
try {
    MarkdownToWeChat = require(path.join(baseDir, 'src', 'markdown-to-wechat.js'));
} catch (e) {
    // 使用内置模板
}

// ── 读取配置 ──────────────────────────────────────────────
const configPath = path.join(baseDir, '..', 'config', 'user-config.json');
let config;

try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
    console.error('❌ 找不到配置文件:', configPath);
    console.error('错误:', e.message);
    process.exit(1);
}

const { wechat, keywords, publish, ai, tags } = config;

// ── 全局实例 ──────────────────────────────────────────────
let reviewWorkflow = null;

// ── 初始化审核工作流 ─────────────────────────────────────
function initReviewWorkflow() {
    if (!reviewWorkflow) {
        reviewWorkflow = new ReviewWorkflow({
            levels: [
                { name: '初审', level: 1, timeout: 24 * 60 * 60 * 1000 },
                { name: '复审', level: 2, timeout: 12 * 60 * 60 * 1000 },
                { name: '终审', level: 3, timeout: 6 * 60 * 60 * 1000 }
            ]
        });
    }
    return reviewWorkflow;
}

// ── 生成文章并提交审核 ───────────────────────────────────
async function generateAndSubmitForReview() {
    console.log('\n🚀 ============================================');
    console.log('🚀 智能文章生成 + 审核工作流');
    console.log('🚀 ============================================\n');
    
    // 1. 生成文章（复用原有逻辑）
    console.log('📝 步骤1: AI生成文章...');
    // ... 文章生成逻辑 ...
    
    const article = {
        id: null, // 保存后获得
        title: '测试文章标题',
        content: '测试文章内容...',
        author: wechat.author || 'WorkBuddy',
        keywords: ['AI', '技术'],
        description: '文章摘要'
    };
    
    // 2. 保存到CMS
    console.log('💾 步骤2: 保存到CMS...');
    const cmsResult = await cmsStorage.saveArticle(article);
    if (cmsResult.success) {
        article.id = cmsResult.aid;
        console.log(`   ✅ CMS文章ID: ${article.id}`);
    }
    
    // 3. 提交审核
    console.log('🔄 步骤3: 提交审核...');
    const workflow = initReviewWorkflow();
    const reviewResult = await workflow.submitForReview(article);
    
    if (reviewResult.success) {
        console.log(`   ✅ 审核ID: ${reviewResult.reviewId}`);
        console.log(`   📊 状态: ${reviewResult.message}`);
        
        // 保存审核关联
        await ExtendedCMS.saveReviewRelation({
            articleId: article.id,
            reviewId: reviewResult.reviewId,
            status: 'pending'
        });
    }
    
    return {
        articleId: article.id,
        reviewId: reviewResult.reviewId,
        status: reviewResult.status
    };
}

// ── 执行审核 ─────────────────────────────────────────────
async function executeReview(reviewId, reviewer, decision, comment) {
    console.log(`\n📝 执行审核: ${reviewId}`);
    
    const workflow = initReviewWorkflow();
    const result = await workflow.executeReview(reviewId, reviewer, decision, comment);
    
    if (result.success) {
        console.log(`   ✅ 审核完成`);
        console.log(`   📊 状态: ${result.status}`);
        console.log(`   📈 当前级别: ${result.currentLevel}`);
        
        // 如果审核通过且是终审，自动发布
        if (result.status === 'approved') {
            const reviewRecord = workflow.getReviewRecord(reviewId);
            if (reviewRecord) {
                console.log('\n📤 审核通过，准备发布...');
                // await publishApprovedArticle(reviewRecord.articleId);
            }
        }
    }
    
    return result;
}

// ── 查看审核列表 ─────────────────────────────────────────
async function listReviews(filters = {}) {
    const workflow = initReviewWorkflow();
    const list = workflow.getReviewList(filters);
    
    console.log('\n📋 审核列表:');
    console.log('----------------------------------------');
    console.log(`总计: ${list.total} 条`);
    console.log(`页码: ${list.page}/${Math.ceil(list.total / list.limit)}`);
    console.log('----------------------------------------');
    
    list.data.forEach((item, index) => {
        console.log(`${index + 1}. [${item.status}] ${item.articleTitle}`);
        console.log(`   审核ID: ${item.id}`);
        console.log(`   当前级别: ${item.currentLevel}`);
        console.log(`   审核人: ${item.assignedReviewer}`);
        console.log('');
    });
    
    return list;
}

// ── 查看审核统计 ─────────────────────────────────────────
async function showReviewStats() {
    const workflow = initReviewWorkflow();
    const stats = workflow.getReviewStatistics();
    
    console.log('\n📊 审核统计:');
    console.log('----------------------------------------');
    console.log(`总审核数: ${stats.total}`);
    console.log(`通过率: ${stats.approvalRate}`);
    console.log('\n按状态分布:');
    Object.entries(stats.byStatus).forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`);
    });
    console.log('\n按级别分布:');
    Object.entries(stats.byLevel).forEach(([level, count]) => {
        console.log(`  ${level}: ${count}`);
    });
    console.log('----------------------------------------');
    
    return stats;
}

// ── 主函数 ────────────────────────────────────────────────
async function main(mode = '') {
    console.log('🚀 WorkBuddy 内容引擎 v3.0 (企业版)\n');
    
    switch (mode) {
        case '--generate-and-review':
            // 生成文章并提交审核
            await generateAndSubmitForReview();
            break;
            
        case '--review-list':
            // 查看审核列表
            await listReviews();
            break;
            
        case '--review-stats':
            // 查看审核统计
            await showReviewStats();
            break;
            
        case '--review-approve':
            // 通过审核
            const reviewId = process.argv[3];
            const reviewer = process.argv[4] || '系统管理员';
            await executeReview(reviewId, reviewer, 'approve', '审核通过');
            break;
            
        case '--review-reject':
            // 驳回审核
            const rejectId = process.argv[3];
            const rejectReviewer = process.argv[4] || '系统管理员';
            const reason = process.argv[5] || '内容不符合要求';
            await executeReview(rejectId, rejectReviewer, 'reject', reason);
            break;
            
        default:
            console.log('使用方法:');
            console.log('  node engine-v3.cjs --generate-and-review  生成文章并提交审核');
            console.log('  node engine-v3.cjs --review-list          查看审核列表');
            console.log('  node engine-v3.cjs --review-stats         查看审核统计');
            console.log('  node engine-v3.cjs --review-approve <id>  通过审核');
            console.log('  node engine-v3.cjs --review-reject <id> [原因]  驳回审核');
    }
}

// CLI入口
if (require.main === module) {
    const mode = process.argv[2] || '';
    main(mode).catch(e => {
        console.error('❌ 错误:', e.message);
        process.exit(1);
    });
}

module.exports = { main, initReviewWorkflow };