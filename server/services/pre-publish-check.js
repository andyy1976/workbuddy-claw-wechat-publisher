/**
 * 发布前正则兜底检查
 * 集成到发布管道最后一步（生成排版完成、调用发布API前）
 * 捕获模型偶尔遗漏的时间错位、角度重复、人称异常等问题
 */

const path = require('path');
const fs = require('fs');

// 获取当前日期（格式：YYYY年MM月DD日）
function getCurrentDate() {
    return new Date().toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).replace(/\//g, '年').replace('/', '月').concat('日');
}

// 加载历史角度库（用于检测重复角度）
function loadAngleHistory() {
    try {
        const f = path.join(__dirname, '..', 'data', 'angle-history.json');
        if (fs.existsSync(f)) {
            return JSON.parse(fs.readFileSync(f, 'utf8'));
        }
    } catch (e) {}
    return { usedAngles: [], lastUpdated: null };
}

// 保存角度到历史库
function saveAngleToHistory(topic, angle) {
    try {
        const f = path.join(__dirname, '..', 'data', 'angle-history.json');
        let data = loadAngleHistory();
        data.usedAngles.push({ topic, angle, date: new Date().toISOString() });
        // 只保留最近100条
        if (data.usedAngles.length > 100) {
            data.usedAngles = data.usedAngles.slice(-100);
        }
        data.lastUpdated = new Date().toISOString();
        fs.writeFileSync(f, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('[PrePublish] 保存角度历史失败:', e.message);
    }
}

/**
 * 发布前检查主函数
 * @param {string} content - 待发布的文章内容
 * @param {Object} metadata - 附加元数据
 * @param {string} metadata.topic - 选题
 * @param {string} metadata.angle - 本次使用的角度
 * @param {number} metadata.currentYear - 当前年份（默认2026）
 * @returns {{ pass: boolean, errors: string[], warnings: string[] }}
 */
function prePublishCheck(content, metadata = {}) {
    const errors = [];
    const warnings = [];
    const currentYear = metadata.currentYear || new Date().getFullYear(); // 2026

    // ── 1. 绝对过时时间词检测 ─────────────────────────────
    // 2025年及更早（当前2026年）
    if (/(?:^|[^0-9])202[0-4]年/.test(content)) {
        errors.push('发现2024年及更早的年份，请确认是否为故意引用历史事件');
    }
    // 去年11月、去年12月等（跨年引用需明确）
    if (/去年(1[0-2])月/.test(content)) {
        const match = content.match(/去年(1[0-2])月/);
        if (match) {
            errors.push('发现"去年' + match[1] + '月"的跨年时间引用，需注明"截至X月"或明确是回顾性写法');
        }
    }
    // 非年末时间点出现"还剩X个月到XX年"类句式
    if (new Date().getMonth() !== 11 && /还剩?\d{1,2}个?月(就)?到\d{4}年/.test(content)) {
        errors.push('发现"还剩X个月到XX年"句式，在非年末时间点会引发时间错位，请删除或修改');
    }
    // "X个月前"超过30天（30天内的可以用）
    if (/\d+个月前/.test(content)) {
        errors.push('发现"X个月前"的模糊时间引用，建议改为具体日期或"截至X月X日"');
    }

    // ── 2. 产品版本号过时检测 ─────────────────────────────
    // 常见AI产品的已知版本（需手动维护，匹配时提示需确认）
    const knownProducts = [
        { name: 'Claude', oldPatterns: ['Claude 3.5', 'Claude 3.0', 'Claude 2.1', 'Sonnet 4'], note: 'Claude当前最新为Claude 5' },
        { name: 'GPT', oldPatterns: ['GPT-4.5', 'GPT-4.5-Turbo', 'GPT-5预期'], note: '请确认GPT版本号是否最新' },
        { name: 'DeepSeek', oldPatterns: ['DeepSeek V1', 'DeepSeek-7B'], note: '请确认DeepSeek版本号是否最新' },
        { name: 'Llama', oldPatterns: ['Llama 2', 'Llama-2'], note: 'Llama当前最新为Llama 4' }
    ];
    for (const p of knownProducts) {
        for (const pattern of p.oldPatterns) {
            if (content.includes(pattern) && !content.includes(p.note)) {
                warnings.push('可能使用了过时的' + p.name + '版本号（' + pattern + '），' + p.note);
            }
        }
    }

    // ── 3. 第一人称"我"不当使用检测 ─────────────────────
    // 匹配"我"后跟具体私人化场景（可能是在编造经历）
    const privateScenes = ['洗澡', '半夜', '深夜', '失眠', '下班', '加班', '堵车', '排队', '蹲坑', '摸鱼'];
    for (const scene of privateScenes) {
        if (new RegExp('我[^。\n]{0,20}' + scene).test(content)) {
            warnings.push('发现可能使用了私人化"我经历"（"' + scene + '"场景），请人工确认是否属于真实经历');
        }
    }
    // "我的XX朋友"之类的人情化叙述（AI常见）
    if (/(?:我的|我一个|我朋友)[^。\n]{0,30}(?:告诉我说|说|告诉我)/.test(content)) {
        warnings.push('发现"我朋友说"类人情化叙述，需确认为真实引用');
    }

    // ── 4. 预测性语句缺少时间限定 ────────────────────────
    // 匹配"会XX""将成为"等绝对预测且未加时间限定
    const absolutePredictions = /(?:将?(?:会|成为|取代)|必?(?:将|会)成为)[^。\n]{0,50}(?!截至|预计|根据|目前|短期内|长期来看|截至目前为止)/;
    const match = content.match(absolutePredictions);
    if (match) {
        errors.push('发现未加时间限定的绝对预测："' + match[0].substring(0, 20) + '..."，建议改为"截至目前的趋势是..."或"预计..."');
    }

    // ── 5. 角度重复检测（需要历史库） ───────────────────
    if (metadata.topic && metadata.angle) {
        const history = loadAngleHistory();
        // 简单关键词匹配
        const similar = history.usedAngles.find(h => {
            const angleWords = metadata.angle.split(/[,，、]/).filter(Boolean);
            return angleWords.some(w => w.length > 3 && h.angle.includes(w));
        });
        if (similar) {
            warnings.push('检测到可能与历史角度重复："' + similar.angle + '"（' + similar.date + '），请确认是否重复');
        }
    }

    // ── 6. AI味词汇检测 ─────────────────────────────────
    const aiPhrases = [
        '首先、其次、最后', '值得注意的是', '综上所述', '在此基础之上',
        '随着XXX的不断发展', '众所周知', '不言而喻', '具有重要意义',
        '总而言之', '深度解析', '全面解读', '一文读懂'
    ];
    for (const phrase of aiPhrases) {
        if (content.includes(phrase)) {
            warnings.push('发现AI常用套话："' + phrase + '"，建议替换为更自然的表达');
        }
    }

    const pass = errors.length === 0;
    return { pass, errors, warnings };
}

module.exports = { prePublishCheck, saveAngleToHistory };

// 命令行测试
if (require.main === module) {
    const testContent = process.argv[2] || '这是一篇测试文章内容';
    const result = prePublishCheck(testContent, {
        topic: '测试选题',
        angle: '角度测试'
    });
    console.log(JSON.stringify(result, null, 2));
}
