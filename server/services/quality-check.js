/**
 * 质量检查系统 v2.0
 * 包含：内容质量、SEO、合规性、原创度、可读性
 */

const fs = require('fs');
const path = require('path');

// 复用 prePublishCheck 的基础检查
const { prePublishCheck, saveAngleToHistory } = require('./pre-publish-check');

/**
 * 质量检查主函数
 * @param {string} content - 待检查的文章内容
 * @param {Object} metadata - 附加元数据
 * @param {string} metadata.topic - 选题
 * @param {string} metadata.title - 文章标题
 * @param {string} metadata.angle - 本次使用的角度
 * @returns {Object} 检查结果
 */
function qualityCheck(content, metadata = {}) {
    const { topic, title, angle } = metadata;
    const errors = [];
    const warnings = [];
    const scores = {}; // 各维度评分 (0-100)

    // ── 1. 基础质量（继承 prePublishCheck）────────────────
    const baseCheck = prePublishCheck(content, metadata);
    errors.push(...baseCheck.errors);
    warnings.push(...baseCheck.warnings);

    // 基础检查通过率评分
    if (baseCheck.pass) {
        scores.baseCheck = 100;
    } else {
        scores.baseCheck = Math.max(0, 100 - baseCheck.errors.length * 20);
    }

    // ── 2. 字数与结构检查 ─────────────────────────────
    const charCount = content.replace(/\s/g, '').length;
    const paragraphCount = content.split(/\n\n+/).filter(p => p.trim().length > 50).length;

    if (charCount < 800) {
        errors.push('文章过短（' + charCount + '字），建议至少800字');
        scores.length = Math.min(100, charCount / 20);
    } else if (charCount > 10000) {
        warnings.push('文章过长（' + charCount + '字），建议拆分');
        scores.length = 90;
    } else {
        scores.length = 100;
    }

    if (paragraphCount < 3) {
        warnings.push('段落过少（' + paragraphCount + '段），建议增加分段');
        scores.structure = 50;
    } else {
        scores.structure = Math.min(100, paragraphCount * 10);
    }

    // ── 3. 标题质量检查 ───────────────────────────────
    if (title) {
        const titleLen = title.length;
        if (titleLen < 8) {
            errors.push('标题过短（' + titleLen + '字），建议8-30字');
            scores.title = 30;
        } else if (titleLen > 35) {
            warnings.push('标题过长（' + titleLen + '字），可能被截断');
            scores.title = 70;
        } else {
            scores.title = 100;
        }

        // 标题吸引力检测（含数字、问号、感叹号等）
        const attractivePatterns = [/\d+/, /？/, /！/, /…/];
        const hasAttractive = attractivePatterns.some(p => p.test(title));
        if (!hasAttractive && !/：/.test(title)) {
            warnings.push('标题缺少吸引元素（数字/标点符号），点击率可能偏低');
            scores.titleAttraction = 50;
        } else {
            scores.titleAttraction = 80;
        }
    } else {
        scores.title = 0;
        scores.titleAttraction = 0;
        warnings.push('未提供标题，无法评估标题质量');
    }

    // ── 4. AI味检测（增强版）────────────────────────
    const aiPatterns = [
        { pattern: /首先，[^。]{0,30}其次/g, label: '"首先...其次"排比结构' },
        { pattern: /值得注意的是/g, label: '"值得注意的是"' },
        { pattern: /综上所述/g, label: '"综上所述"' },
        { pattern: /不言而喻/g, label: '"不言而喻"' },
        { pattern: /随着.*的不断发展/g, label: '"随着XXX的不断发展"' },
        { pattern: /众所周知/g, label: '"众所周知"' },
        { pattern: /具有重要意义/g, label: '"具有重要意义"' },
        { pattern: /总而言之/g, label: '"总而言之"' },
        { pattern: /深度解析|全面解读|一文读懂/g, label: '"深度解析/全面解读/一文读懂"' },
        { pattern: /让我们来看/g, label: '"让我们来看"' },
        { pattern: /不得不说/g, label: '"不得不说"' },
        { pattern: /可以说/g, label: '"可以说"(高频)' }
    ];

    let aiScore = 100;
    let aiHits = [];
    for (const ap of aiPatterns) {
        const matches = content.match(ap.pattern);
        if (matches) {
            aiScore -= matches.length * 5;
            aiHits.push({ phrase: ap.label, count: matches.length });
        }
    }
    scores.aiTaste = Math.max(0, aiScore);
    if (aiHits.length > 0) {
        warnings.push('AI味词汇检测：' + aiHits.map(h => h.phrase + '(' + h.count + '次)').join('、'));
    }

    // ── 5. 可读性检查 ─────────────────────────────────
    const sentences = content.split(/[。！？\n]/).filter(s => s.trim().length > 0);
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.length, 0) / Math.max(sentences.length, 1);

    if (avgSentenceLength > 60) {
        warnings.push('平均句长' + avgSentenceLength.toFixed(0) + '字，偏长，建议拆分长句');
        scores.readability = Math.max(40, 100 - (avgSentenceLength - 30));
    } else {
        scores.readability = 90;
    }

    // ── 6. 关键词密度（基于选题）──────────────────────
    if (topic) {
        const keywords = topic.split(/[\s,，、]+/).filter(k => k.length >= 2);
        let keywordDensity = 0;
        for (const kw of keywords) {
            try {
                const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escapedKw, 'g');
                const matches = content.match(regex);
                if (matches) keywordDensity += matches.length;
            } catch (e) {
                // 跳过无法编译为正则的关键词
            }
        }
        scores.keywordDensity = Math.min(100, keywordDensity * 5);
        if (keywordDensity === 0) {
            warnings.push('未在正文中发现选题关键词，相关性存疑');
        }
    } else {
        scores.keywordDensity = 50;
        warnings.push('未提供选题关键词，无法评估关键词密度');
    }

    // ── 7. 合规性基础检查 ─────────────────────────────
    const sensitiveWords = ['赌博', '色情', '暴力', '诈骗', '洗钱', '黑客攻击'];
    let complianceScore = 100;
    for (const sw of sensitiveWords) {
        if (content.includes(sw)) {
            errors.push('发现敏感词："' + sw + '"，请修改或删除');
            complianceScore = 0;
        }
    }
    scores.compliance = complianceScore;

    // ── 综合评分 ─────────────────────────────────────
    const allScores = Object.values(scores);
    const overallScore = allScores.length > 0
        ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
        : 0;

    // 记录角度到历史库（如果提供了角度）
    if (topic && angle) {
        saveAngleToHistory(topic, angle);
    }

    return {
        pass: errors.length === 0,
        score: overallScore,
        maxScore: 100,
        grade: overallScore >= 85 ? 'A' : overallScore >= 70 ? 'B' : overallScore >= 55 ? 'C' : 'D',
        errors,
        warnings,
        scores,
        stats: {
            charCount,
            paragraphCount,
            sentenceCount: sentences.length,
            avgSentenceLength: Math.round(avgSentenceLength),
            aiHitCount: aiHits.reduce((sum, h) => sum + h.count, 0)
        }
    };
}

module.exports = { qualityCheck };

// 命令行测试
if (require.main === module) {
    const testContent = process.argv[2] || '这是一篇测试文章内容';
    const testTitle = process.argv[3] || '测试标题';
    const testTopic = process.argv[4] || '测试选题';

    const result = qualityCheck(testContent, {
        title: testTitle,
        topic: testTopic,
        angle: '测试角度'
    });

    console.log(JSON.stringify(result, null, 2));
}
