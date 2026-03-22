/**
 * 内容审核工作流模块
 * 版本: 1.0.0
 * 
 * 功能特点：
 * 1. 🔄 多级审核流程（初审→复审→终审）
 * 2. 📝 审核意见记录
 * 3. 📊 修改痕迹追踪
 * 4. ⏰ 审核超时提醒
 * 5. 📧 消息通知
 */

const fs = require('fs');
const path = require('path');

// ── 审核配置 ──────────────────────────────────────────────
const reviewConfig = {
  // 审核级别配置
  levels: [
    { name: '初审', level: 1, timeout: 24 * 60 * 60 * 1000, approvers: ['editor'] },
    { name: '复审', level: 2, timeout: 12 * 60 * 60 * 1000, approvers: ['senior_editor'] },
    { name: '终审', level: 3, timeout: 6 * 60 * 60 * 1000, approvers: ['chief_editor'] }
  ],
  
  // 自动审核规则
  autoReview: {
    enabled: true,
    rules: [
      { type: 'sensitive_words', action: 'flag' },
      { type: 'plagiarism', threshold: 0.8, action: 'reject' },
      { type: 'quality_score', threshold: 6, action: 'require_review' }
    ]
  },
  
  // 通知配置
  notifications: {
    email: true,
    wechat: true,
    sms: false
  }
};

// ── 审核状态枚举 ──────────────────────────────────────────
const ReviewStatus = {
  PENDING: 'pending',           // 待审核
  IN_REVIEW: 'in_review',       // 审核中
  APPROVED: 'approved',         // 已通过
  REJECTED: 'rejected',         // 已驳回
  MODIFIED: 'modified',         // 已修改
  PUBLISHED: 'published'        // 已发布
};

// ── 审核工作流类 ─────────────────────────────────────────
class ReviewWorkflow {
  constructor(config = {}) {
    this.config = { ...reviewConfig, ...config };
    this.reviewHistory = [];
    this.init();
  }
  
  init() {
    console.log('🚀 初始化内容审核工作流...');
    this.loadReviewHistory();
  }
  
  // ── 提交文章审核 ────────────────────────────────────────
  async submitForReview(article) {
    console.log(`\n📝 提交文章审核: ${article.title}`);
    
    try {
      // 1. 自动预审
      console.log('🔍 执行自动预审...');
      const autoReviewResult = await this.autoReview(article);
      
      if (autoReviewResult.action === 'reject') {
        console.log('❌ 自动预审未通过:', autoReviewResult.reason);
        return {
          success: false,
          status: ReviewStatus.REJECTED,
          reason: autoReviewResult.reason,
          autoReview: true
        };
      }
      
      // 2. 创建审核记录
      const reviewRecord = {
        id: this.generateReviewId(),
        articleId: article.id,
        articleTitle: article.title,
        submitter: article.author || 'system',
        submitTime: new Date(),
        currentLevel: 1,
        status: ReviewStatus.PENDING,
        autoReviewResult: autoReviewResult,
        reviewHistory: [],
        modifications: []
      };
      
      // 3. 分配审核人
      reviewRecord.assignedReviewer = await this.assignReviewer(1);
      
      // 4. 设置超时提醒
      this.setReviewTimeout(reviewRecord);
      
      // 5. 发送通知
      await this.notifyReviewer(reviewRecord);
      
      // 6. 保存记录
      this.saveReviewRecord(reviewRecord);
      
      console.log(`✅ 审核提交成功，ID: ${reviewRecord.id}`);
      console.log(`👤 分配审核人: ${reviewRecord.assignedReviewer}`);
      
      return {
        success: true,
        reviewId: reviewRecord.id,
        status: ReviewStatus.PENDING,
        message: '文章已提交审核，等待初审'
      };
      
    } catch (error) {
      console.error('❌ 提交审核失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // ── 自动预审 ────────────────────────────────────────────
  async autoReview(article) {
    const results = [];
    
    // 1. 敏感词检测
    const sensitiveCheck = await this.checkSensitiveWords(article.content);
    results.push(sensitiveCheck);
    
    // 2. 抄袭检测
    const plagiarismCheck = await this.checkPlagiarism(article.content);
    results.push(plagiarismCheck);
    
    // 3. 质量评分
    const qualityCheck = await this.assessQuality(article);
    results.push(qualityCheck);
    
    // 4. 综合判断
    const hasRejection = results.some(r => r.action === 'reject');
    const hasFlag = results.some(r => r.action === 'flag');
    
    if (hasRejection) {
      return {
        action: 'reject',
        reason: results.find(r => r.action === 'reject').message,
        details: results
      };
    }
    
    if (hasFlag) {
      return {
        action: 'flag',
        reason: '需要人工审核',
        details: results
      };
    }
    
    return {
      action: 'pass',
      reason: '自动预审通过',
      details: results
    };
  }
  
  // ── 敏感词检测 ──────────────────────────────────────────
  async checkSensitiveWords(content) {
    const sensitiveWords = [
      '违法', '违规', '色情', '暴力', '赌博', '毒品',
      '政治敏感', '谣言', '虚假信息'
    ];
    
    const found = sensitiveWords.filter(word => content.includes(word));
    
    if (found.length > 0) {
      return {
        type: 'sensitive_words',
        action: 'reject',
        message: `检测到敏感词: ${found.join(', ')}`,
        found: found
      };
    }
    
    return {
      type: 'sensitive_words',
      action: 'pass',
      message: '敏感词检测通过'
    };
  }
  
  // ── 抄袭检测 ────────────────────────────────────────────
  async checkPlagiarism(content) {
    // 这里应该调用抄袭检测API
    // 模拟检测结果
    const similarity = Math.random() * 0.3; // 0-30%相似度
    
    if (similarity > 0.8) {
      return {
        type: 'plagiarism',
        action: 'reject',
        message: `抄袭率过高: ${(similarity * 100).toFixed(1)}%`,
        similarity: similarity
      };
    }
    
    return {
      type: 'plagiarism',
      action: 'pass',
      message: `抄袭检测通过: ${(similarity * 100).toFixed(1)}%`,
      similarity: similarity
    };
  }
  
  // ── 质量评估 ────────────────────────────────────────────
  async assessQuality(article) {
    // 基于文章长度、结构、关键词等评估
    const length = article.content?.length || 0;
    const hasTitle = article.title && article.title.length > 0;
    const hasKeywords = article.keywords && article.keywords.length > 0;
    
    let score = 0;
    if (length > 500) score += 30;
    if (length > 1000) score += 20;
    if (hasTitle) score += 20;
    if (hasKeywords) score += 20;
    if (article.description) score += 10;
    
    if (score < 60) {
      return {
        type: 'quality_score',
        action: 'flag',
        message: `质量评分偏低: ${score}/100`,
        score: score
      };
    }
    
    return {
      type: 'quality_score',
      action: 'pass',
      message: `质量评分: ${score}/100`,
      score: score
    };
  }
  
  // ── 分配审核人 ──────────────────────────────────────────
  async assignReviewer(level) {
    const levelConfig = this.config.levels.find(l => l.level === level);
    if (!levelConfig) return null;
    
    // 这里应该从用户数据库中查询可用的审核人
    // 模拟分配
    const reviewers = {
      1: '初审编辑-张三',
      2: '高级编辑-李四',
      3: '主编-王五'
    };
    
    return reviewers[level] || '系统管理员';
  }
  
  // ── 执行审核 ────────────────────────────────────────────
  async executeReview(reviewId, reviewer, decision, comment = '') {
    console.log(`\n📝 执行审核: ${reviewId}`);
    console.log(`👤 审核人: ${reviewer}`);
    console.log(`📊 决定: ${decision}`);
    
    try {
      const record = this.getReviewRecord(reviewId);
      if (!record) {
        throw new Error('审核记录不存在');
      }
      
      // 1. 记录审核历史
      const reviewEntry = {
        level: record.currentLevel,
        reviewer: reviewer,
        decision: decision,
        comment: comment,
        reviewTime: new Date()
      };
      
      record.reviewHistory.push(reviewEntry);
      
      // 2. 处理审核决定
      if (decision === 'approve') {
        // 判断是否还有下一级审核
        const nextLevel = record.currentLevel + 1;
        const hasNextLevel = this.config.levels.some(l => l.level === nextLevel);
        
        if (hasNextLevel) {
          // 进入下一级审核
          record.currentLevel = nextLevel;
          record.status = ReviewStatus.IN_REVIEW;
          record.assignedReviewer = await this.assignReviewer(nextLevel);
          
          console.log(`➡️  进入第${nextLevel}级审核`);
          await this.notifyReviewer(record);
          
        } else {
          // 审核完成
          record.status = ReviewStatus.APPROVED;
          record.approveTime = new Date();
          
          console.log('✅ 审核通过，可以发布');
          await this.notifySubmitter(record, 'approved');
        }
        
      } else if (decision === 'reject') {
        record.status = ReviewStatus.REJECTED;
        record.rejectTime = new Date();
        record.rejectReason = comment;
        
        console.log('❌ 审核驳回');
        await this.notifySubmitter(record, 'rejected');
        
      } else if (decision === 'modify') {
        record.status = ReviewStatus.MODIFIED;
        record.modifyRequirements = comment;
        
        console.log('📝 需要修改');
        await this.notifySubmitter(record, 'modify');
      }
      
      // 3. 保存更新
      this.saveReviewRecord(record);
      
      return {
        success: true,
        reviewId: reviewId,
        status: record.status,
        currentLevel: record.currentLevel,
        message: this.getStatusMessage(record.status)
      };
      
    } catch (error) {
      console.error('❌ 审核执行失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // ── 修改后重新提交 ──────────────────────────────────────
  async resubmitAfterModification(reviewId, modifiedArticle, modificationNote = '') {
    console.log(`\n🔄 重新提交修改: ${reviewId}`);
    
    try {
      const record = this.getReviewRecord(reviewId);
      if (!record) {
        throw new Error('审核记录不存在');
      }
      
      // 1. 记录修改
      record.modifications.push({
        modificationTime: new Date(),
        modificationNote: modificationNote,
        previousStatus: record.status
      });
      
      // 2. 重新进入审核流程
      record.status = ReviewStatus.PENDING;
      record.resubmitTime = new Date();
      
      // 3. 重新分配审核人（通常是原审核人）
      if (record.reviewHistory.length > 0) {
        const lastReviewer = record.reviewHistory[record.reviewHistory.length - 1].reviewer;
        record.assignedReviewer = lastReviewer;
      }
      
      // 4. 发送通知
      await this.notifyReviewer(record);
      
      // 5. 保存
      this.saveReviewRecord(record);
      
      console.log('✅ 修改已提交，重新进入审核');
      
      return {
        success: true,
        reviewId: reviewId,
        status: ReviewStatus.PENDING,
        message: '修改已提交，等待重新审核'
      };
      
    } catch (error) {
      console.error('❌ 重新提交失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // ── 获取审核列表 ────────────────────────────────────────
  getReviewList(filters = {}) {
    const { status, level, reviewer, page = 1, limit = 20 } = filters;
    
    let list = this.reviewHistory;
    
    // 应用过滤器
    if (status) {
      list = list.filter(r => r.status === status);
    }
    if (level) {
      list = list.filter(r => r.currentLevel === level);
    }
    if (reviewer) {
      list = list.filter(r => r.assignedReviewer === reviewer);
    }
    
    // 分页
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedList = list.slice(start, end);
    
    return {
      total: list.length,
      page: page,
      limit: limit,
      data: paginatedList
    };
  }
  
  // ── 获取审核统计 ────────────────────────────────────────
  getReviewStatistics() {
    const stats = {
      total: this.reviewHistory.length,
      byStatus: {},
      byLevel: {},
      averageReviewTime: 0,
      approvalRate: 0
    };
    
    // 按状态统计
    Object.values(ReviewStatus).forEach(status => {
      stats.byStatus[status] = this.reviewHistory.filter(r => r.status === status).length;
    });
    
    // 按级别统计
    this.config.levels.forEach(level => {
      stats.byLevel[level.name] = this.reviewHistory.filter(
        r => r.currentLevel === level.level
      ).length;
    });
    
    // 计算通过率
    const approved = stats.byStatus[ReviewStatus.APPROVED] || 0;
    const rejected = stats.byStatus[ReviewStatus.REJECTED] || 0;
    const totalCompleted = approved + rejected;
    
    if (totalCompleted > 0) {
      stats.approvalRate = (approved / totalCompleted * 100).toFixed(2) + '%';
    }
    
    return stats;
  }
  
  // ── 工具方法 ────────────────────────────────────────────
  generateReviewId() {
    return 'REV-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }
  
  getReviewRecord(reviewId) {
    return this.reviewHistory.find(r => r.id === reviewId);
  }
  
  saveReviewRecord(record) {
    const index = this.reviewHistory.findIndex(r => r.id === record.id);
    if (index >= 0) {
      this.reviewHistory[index] = record;
    } else {
      this.reviewHistory.push(record);
    }
    this.persistReviewHistory();
  }
  
  loadReviewHistory() {
    try {
      const historyPath = path.join(__dirname, 'review_history.json');
      if (fs.existsSync(historyPath)) {
        const data = fs.readFileSync(historyPath, 'utf8');
        this.reviewHistory = JSON.parse(data);
        console.log(`📚 加载了 ${this.reviewHistory.length} 条审核历史`);
      }
    } catch (error) {
      console.warn('⚠️  无法加载审核历史:', error.message);
      this.reviewHistory = [];
    }
  }
  
  persistReviewHistory() {
    try {
      const historyPath = path.join(__dirname, 'review_history.json');
      fs.writeFileSync(historyPath, JSON.stringify(this.reviewHistory, null, 2));
    } catch (error) {
      console.warn('⚠️  无法保存审核历史:', error.message);
    }
  }
  
  setReviewTimeout(record) {
    const levelConfig = this.config.levels.find(l => l.level === record.currentLevel);
    if (levelConfig && levelConfig.timeout) {
      setTimeout(() => {
        this.handleReviewTimeout(record.id);
      }, levelConfig.timeout);
    }
  }
  
  async handleReviewTimeout(reviewId) {
    const record = this.getReviewRecord(reviewId);
    if (record && record.status === ReviewStatus.PENDING) {
      console.log(`⏰ 审核超时提醒: ${reviewId}`);
      await this.notifyTimeout(record);
    }
  }
  
  // ── 通知方法 ────────────────────────────────────────────
  async notifyReviewer(record) {
    console.log(`📧 通知审核人: ${record.assignedReviewer}`);
    // 这里应该集成邮件/微信通知
  }
  
  async notifySubmitter(record, action) {
    console.log(`📧 通知提交人: ${record.submitter}, 状态: ${action}`);
    // 这里应该集成邮件/微信通知
  }
  
  async notifyTimeout(record) {
    console.log(`⏰ 发送超时提醒: ${record.assignedReviewer}`);
    // 这里应该集成邮件/微信通知
  }
  
  getStatusMessage(status) {
    const messages = {
      [ReviewStatus.PENDING]: '等待审核',
      [ReviewStatus.IN_REVIEW]: '审核中',
      [ReviewStatus.APPROVED]: '审核通过',
      [ReviewStatus.REJECTED]: '审核驳回',
      [ReviewStatus.MODIFIED]: '需要修改',
      [ReviewStatus.PUBLISHED]: '已发布'
    };
    return messages[status] || status;
  }
}

// ── 导出模块 ──────────────────────────────────────────────
module.exports = ReviewWorkflow;

// ── 如果直接运行 ──────────────────────────────────────────
if (require.main === module) {
  console.log('🧪 运行内容审核工作流测试...\n');
  
  const workflow = new ReviewWorkflow();
  
  // 模拟测试
  (async () => {
    // 1. 提交文章审核
    const article = {
      id: 1001,
      title: '测试文章：AI技术发展趋势',
      content: '这是一篇关于AI技术发展的文章...',
      author: '张三',
      keywords: ['AI', '技术'],
      description: 'AI技术发展趋势分析'
    };
    
    const submitResult = await workflow.submitForReview(article);
    console.log('\n提交结果:', submitResult);
    
    if (submitResult.success) {
      // 2. 模拟审核
      const reviewResult = await workflow.executeReview(
        submitResult.reviewId,
        '初审编辑-张三',
        'approve',
        '内容质量良好，通过初审'
      );
      console.log('\n审核结果:', reviewResult);
      
      // 3. 查看统计
      const stats = workflow.getReviewStatistics();
      console.log('\n审核统计:', stats);
    }
  })();
}