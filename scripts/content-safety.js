/**
 * 内容安全检查模块 v1.0
 * 
 * 检测维度：
 * 1. 政治/社会敏感词（红线）
 * 2. 医疗健康违规（未经审批的疗效声明）
 * 3. 金融违规（夸大收益/保证承诺）
 * 4. 微信平台违规（诱导分享/夸大宣传）
 * 5. 低质量内容（重复/过短）
 * 6. 格式红线（二维码/外链泛滥）
 * 
 * 返回：{ passed: boolean, warnings: [], errors: [], suggestions: [] }
 */

'use strict';

// ── 敏感词库 ──────────────────────────────────────────────
// type: P=政治, S=社会, M=医疗, F=金融, B=品牌风险, W=微信违规
// level: high=直接拦截, medium=警告, low=提示
const SENSITIVE_WORDS = [
    // 微信平台红线
    { word: '微信群', type: 'W', level: 'low',替代: null },
    { word: '扫码进群', type: 'W', level: 'medium',替代: null },
    { word: '加微信', type: 'W', level: 'medium',替代: '私信' },
    { word: '转发朋友圈', type: 'W', level: 'medium',替代: null },
    { word: '关注领取', type: 'W', level: 'medium',替代: null },
    { word: '立即注册', type: 'W', level: 'low',替代: null },
    { word: '限时免费', type: 'W', level: 'medium',替代: null },
    { word: '名额有限', type: 'W', level: 'low',替代: null },
    { word: '错过就没有了', type: 'W', level: 'low',替代: null },
    { word: '赶紧', type: 'W', level: 'low',替代: null },
    { word: '马上', type: 'W', level: 'low',替代: null },
    
    // 金融类（夸大/承诺）
    { word: '稳赚不赔', type: 'F', level: 'high',替代: null },
    { word: '保证盈利', type: 'F', level: 'high',替代: null },
    { word: '收益翻倍', type: 'F', level: 'medium',替代: null },
    { word: '一夜暴富', type: 'F', level: 'medium',替代: null },
    { word: '躺赚', type: 'F', level: 'low',替代: null },
    { word: '月入十万', type: 'F', level: 'medium',替代: null },
    { word: '年化收益', type: 'F', level: 'medium',替代: '历史收益' },
    { word: '收益率', type: 'F', level: 'low',替代: null },
    { word: '本金保障', type: 'F', level: 'high',替代: null },
    { word: '无风险', type: 'F', level: 'high',替代: null },
    { word: '零风险', type: 'F', level: 'high',替代: null },
    { word: '100%赚钱', type: 'F', level: 'high',替代: null },
    { word: '包赚', type: 'F', level: 'high',替代: null },
    { word: '稳赚', type: 'F', level: 'medium',替代: null },
    
    // 医疗健康类
    { word: '治疗癌症', type: 'M', level: 'high',替代: null },
    { word: '治愈糖尿病', type: 'M', level: 'high',替代: null },
    { word: '根治', type: 'M', level: 'medium',替代: null },
    { word: '永不吃药', type: 'M', level: 'high',替代: null },
    { word: '疗效保证', type: 'M', level: 'medium',替代: null },
    { word: '医院推荐', type: 'M', level: 'medium',替代: null },
    { word: '祖传秘方', type: 'M', level: 'medium',替代: null },
    { word: '偏方', type: 'M', level: 'low',替代: null },
    { word: '药品', type: 'M', level: 'medium',替代: null },
    { word: '处方药', type: 'M', level: 'medium',替代: null },
    
    // 夸大宣传类
    { word: '全球第一', type: 'B', level: 'medium',替代: '领先' },
    { word: '世界最强', type: 'B', level: 'medium',替代: null },
    { word: '史上最强', type: 'B', level: 'low',替代: null },
    { word: '最牛逼', type: 'B', level: 'medium',替代: '出色' },
    { word: '最牛', type: 'B', level: 'low',替代: null },
    { word: '遥遥领先', type: 'B', level: 'low',替代: null },
    { word: '吊打', type: 'B', level: 'low',替代: '领先' },
    { word: '碾压', type: 'B', level: 'low',替代: null },
    { word: '完爆', type: 'B', level: 'medium',替代: null },
    { word: '秒杀', type: 'B', level: 'low',替代: null },
    { word: '绝对第一', type: 'B', level: 'high',替代: null },
    { word: '无法超越', type: 'B', level: 'medium',替代: null },
    
    // 社会敏感类（低风险提示）
    { word: '上访', type: 'S', level: 'medium',替代: null },
    { word: '维权', type: 'S', level: 'low',替代: null },
    { word: '腐败', type: 'S', level: 'medium',替代: null },
    { word: '暗箱操作', type: 'S', level: 'low',替代: null },
];

// ── 微信违规模式（正则）──────────────────────────────────
const WEIXIN_PATTERNS = [
    // 诱导行为
    { pattern: /关注.{0,3}回复/g, type: 'W', level: 'medium',替代: null },
    { pattern: /转发.{0,10}(免费|领取|获得)/g, type: 'W', level: 'medium',替代: null },
    { pattern: /扫码.{0,5}(领取|加入|获取)/g, type: 'W', level: 'medium',替代: null },
    { pattern: /群.*满.*人/g, type: 'W', level: 'low',替代: null },
    // 虚假承诺
    { pattern: /保证.{0,5}(赚钱|盈利|收益)/g, type: 'F', level: 'high',替代: null },
    { pattern: /承诺.{0,5}(盈利|收益|回报)/g, type: 'F', level: 'medium',替代: null },
    // 夸大词汇连用
    { pattern: /.{0,3}(最强|第一|最好|最佳|首创|首发).{0,3}(来袭|震撼|发布|上线)/g, type: 'B', level: 'low',替代: null },
    // 联系方式暗示
    { pattern: /想.*交流.*请/g, type: 'W', level: 'low',替代: null },
    { pattern: /需要.*请/g, type: 'W', level: 'low',替代: null },
];

// ── 低质量内容检测 ────────────────────────────────────────
const CLICHES = [
    '随着人工智能的快速发展',
    '在当今时代',
    '首先我们来了解一下',
    '首先',
    '其次',
    '最后',
    '综上所述',
    '总而言之',
    '说白了',
    '本质上',
    '换句话说',
    '意味着什么',
    '不得不说的是',
    '客观来说',
    '毫不夸张地说',
    '众所周知',
    '大家知道',
    '相信大家都知道',
    '相信很多人都知道',
];

const REPEAT_PATTERNS = [
    /(\S{2,})\1{3,}/g,  // 连续重复4次以上
    /[。！？\.!]{3,}/g,  // 连续标点
    /.{0,2}(啊|呀|吧|呢|嘛){2,}/g,  // 无意义语气词连用
];

// ── 核心检测函数 ──────────────────────────────────────────
function checkContent(title, content) {
    const result = {
        passed: true,
        level: 'pass',      // pass / warning / error / block
        score: 100,
        warnings: [],       // 低风险提示
        errors: [],         // 中/高风险问题
        blocks: [],         // 必须修复
        suggestions: [],    // 优化建议
        stats: {}
    };
    
    const fullText = (title || '') + ' ' + (content || '');
    
    // ── 1. 敏感词检测 ──────────────────────────────────
    const wordHits = checkSensitiveWords(fullText);
    for (const hit of wordHits) {
        const item = {
            type: hit.type,
            level: hit.level,
            word: hit.word,
           替代: hit.替代,
            message: ''
        };
        
        if (hit.level === 'high') {
            item.message = `🚫 [${hit.type}] "${hit.word}" 为高风险词，建议${hit.替代 ? '替换为"' + hit.替代 + '"' : '删除'}`;
            result.blocks.push(item);
            result.passed = false;
            result.level = 'block';
            result.score -= 30;
        } else if (hit.level === 'medium') {
            item.message = `⚠️  [${hit.type}] "${hit.word}" 需谨慎使用`;
            result.errors.push(item);
            result.score -= 10;
        } else {
            item.message = `💡 [${hit.type}] "${hit.word}" 可考虑优化`;
            result.warnings.push(item);
            result.score -= 3;
        }
    }
    
    // ── 2. 正则模式检测 ─────────────────────────────────
    const patternHits = checkPatterns(fullText);
    for (const hit of patternHits) {
        const item = {
            type: hit.type,
            level: hit.level,
            pattern: hit.pattern.toString(),
            message: ''
        };
        
        if (hit.level === 'high') {
            item.message = `🚫 [${hit.type}] 命中违规模式: ${hit.pattern.toString()}`;
            result.blocks.push(item);
            result.passed = false;
            result.score -= 25;
        } else if (hit.level === 'medium') {
            item.message = `⚠️  [${hit.type}] 可能违规: ${hit.pattern.toString().slice(0,30)}`;
            result.errors.push(item);
            result.score -= 8;
        } else {
            item.message = `💡 [${hit.type}] 可优化`;
            result.warnings.push(item);
            result.score -= 2;
        }
    }
    
    // ── 3. 低质量内容检测 ───────────────────────────────
    const qualityIssues = checkQuality(title, content);
    result.suggestions.push(...qualityIssues);
    
    // ── 4. 格式红线检测 ─────────────────────────────────
    const formatIssues = checkFormat(fullText);
    for (const issue of formatIssues) {
        result.warnings.push(issue);
        result.score -= 2;
    }
    
    // ── 5. 更新级别 ────────────────────────────────────
    if (result.level !== 'block' && result.errors.length > 3) {
        result.level = 'error';
        result.passed = false;
    } else if (result.level !== 'block' && result.errors.length > 0) {
        result.level = 'warning';
    }
    
    result.score = Math.max(0, result.score);
    
    return result;
}

function checkSensitiveWords(text) {
    const hits = [];
    const lowerText = text.toLowerCase();
    
    for (const item of SENSITIVE_WORDS) {
        if (lowerText.includes(item.word.toLowerCase())) {
            hits.push(item);
        }
    }
    
    return hits;
}

function checkPatterns(text) {
    const hits = [];
    
    for (const item of WEIXIN_PATTERNS) {
        const matches = text.match(item.pattern);
        if (matches && matches.length > 0) {
            // 去重
            const unique = [...new Set(matches)];
            for (const m of unique.slice(0, 3)) {  // 最多记录3个
                hits.push({ ...item, matched: m });
            }
        }
    }
    
    return hits;
}

function checkQuality(title, content) {
    const suggestions = [];
    const fullText = (title || '') + ' ' + (content || '');
    
    // 套话检测
    for (const cliche of CLICHES) {
        if (fullText.includes(cliche)) {
            suggestions.push({
                type: 'Q',
                level: 'low',
                message: `💡 开头套话建议修改: "${cliche.slice(0, 15)}..."`
            });
        }
    }
    
    // 重复检测
    for (const pattern of REPEAT_PATTERNS) {
        const matches = fullText.match(pattern);
        if (matches) {
            suggestions.push({
                type: 'Q',
                level: 'low',
                message: `⚠️  检测到重复/无意义内容: "${matches[0].slice(0, 20)}..."`
            });
        }
    }
    
    // 字数检测
    const charCount = (content || '').replace(/\s/g, '').length;
    if (charCount < 2000) {
        suggestions.push({
            type: 'Q',
            level: 'medium',
            message: `⚠️  文章字数偏少（${charCount}字），建议4000字以上`
        });
    } else if (charCount < 3000) {
        suggestions.push({
            type: 'Q',
            level: 'low',
            message: `💡 文章字数${charCount}字，建议4000字以上效果更佳`
        });
    }
    
    // 标题长度
    if (title && title.length > 40) {
        suggestions.push({
            type: 'Q',
            level: 'low',
            message: `💡 标题较长（${title.length}字），微信显示可能截断`
        });
    }
    
    return suggestions;
}

function checkFormat(text) {
    const issues = [];
    
    // 过多链接
    const linkCount = (text.match(/https?:\/\//g) || []).length;
    if (linkCount > 5) {
        issues.push({
            type: 'F',
            level: 'low',
            message: `💡 外链较多（${linkCount}个），微信可能限制展示`
        });
    }
    
    // 过多感叹号
    const exclamCount = (text.match(/[！!]{2,}/g) || []).length;
    if (exclamCount > 5) {
        issues.push({
            type: 'F',
            level: 'low',
            message: `⚠️  感叹号连用较多（${exclamCount}处），可能影响阅读体验`
        });
    }
    
    // 过多问号
    const questionCount = (text.match(/[？?]{2,}/g) || []).length;
    if (questionCount > 5) {
        issues.push({
            type: 'F',
            level: 'low',
            message: `⚠️  问号连用较多（${questionCount}处）`
        });
    }
    
    return issues;
}

// ── 交互式修复建议 ────────────────────────────────────────
function generateFixReport(checkResult) {
    const lines = [];
    
    lines.push('\n' + '═'.repeat(52));
    lines.push(`  内容安全检查报告  |  安全分: ${checkResult.score}/100`);
    lines.push('═'.repeat(52));
    
    if (checkResult.level === 'pass') {
        lines.push('\n✅ 安全检查通过\n');
    } else if (checkResult.level === 'warning') {
        lines.push('\n⚠️  安全警告（可发布，建议优化）\n');
    } else if (checkResult.level === 'error') {
        lines.push('\n❌ 存在风险问题（建议修复后再发布）\n');
    } else {
        lines.push('\n🚫 高风险内容（必须修复）\n');
    }
    
    if (checkResult.blocks.length > 0) {
        lines.push('【🚫 必须修复】');
        checkResult.blocks.forEach((b, i) => {
            lines.push(`  ${i + 1}. ${b.message}`);
        });
        lines.push('');
    }
    
    if (checkResult.errors.length > 0) {
        lines.push('【⚠️  需注意】');
        checkResult.errors.forEach((e, i) => {
            lines.push(`  ${i + 1}. ${e.message}`);
        });
        lines.push('');
    }
    
    if (checkResult.warnings.length > 0) {
        lines.push('【💡 优化建议】');
        checkResult.warnings.slice(0, 5).forEach((w, i) => {
            lines.push(`  ${i + 1}. ${w.message}`);
        });
        if (checkResult.warnings.length > 5) {
            lines.push(`  ...还有 ${checkResult.warnings.length - 5} 条`);
        }
        lines.push('');
    }
    
    return lines.join('\n');
}

// ── CLI 入口 ──────────────────────────────────────────────
if (require.main === module) {
    const title = process.argv[2] || '';
    const content = process.argv.slice(3).join(' ');
    
    if (!content) {
        console.log('用法: node content-safety.js "标题" "正文"');
        process.exit(0);
    }
    
    const result = checkContent(title, content);
    console.log(generateFixReport(result));
    
    process.exit(result.level === 'block' ? 1 : 0);
}

module.exports = { checkContent, generateFixReport };
