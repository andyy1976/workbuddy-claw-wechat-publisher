/**
 * 内容方法论引擎 — 注入到现有 WorkBuddy 的决策层
 * 
 * 基于用户分享的内容创作方法论：
 * 1. 信息获取：T型知识结构 + 跨领域碰撞（美第奇效应）
 * 2. 找角度：反直觉 + 陌生化 + 情理之中预料之外
 * 3. 创作：情绪曲线 + 升番技巧 + 正向价值观
 * 4. 数据：赞阅比/转阅比/完读率 + 闭环迭代
 */

const fs = require('fs');
const path = require('path');

// ── 配置 ──────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '..', '..', 'server', 'data', 'methodology');
const BLOODLINE_DB = path.join(DATA_DIR, 'angle-bloodline.json');
const EMOTION_TEMPLATES_DB = path.join(DATA_DIR, 'emotion-templates.json');
const VALUE_RULES_DB = path.join(DATA_DIR, 'value-rules.json');
const PERFORMANCE_HISTORY = path.join(DATA_DIR, 'performance-history.json');

[DATA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ══════════════════════════════════════════════════════
// 模块一：跨领域信息碰撞检测器（美第奇引擎）
// ══════════════════════════════════════════════════════

/**
 * 跨领域素材库 — 每个领域有"结构标签"用于碰撞检测
 * 标签体系：演化路径、垄断格局、第一性原理、反常识、
 *          幂律分布、网络效应、规模效应、技术范式转移等
 */
const CROSS_DOMAIN_LIBRARY = {
  // 综艺/电影叙事
  entertainment: [
    { pattern: 'underdog_rise', label: '弱者逆袭', examples: ['脱口秀大会黑马', '中国好声音素人'], triggerKeywords: ['逆袭', '冷门', '黑马'] },
    { pattern: 'reverse_plot', label: '反转叙事', examples: ['消失的她', '看不见的客人'], triggerKeywords: ['反转', '真相', '颠覆'] },
    { pattern: 'elimination_pressure', label: '淘汰压力', examples: ['创造营', '披荆斩棘'], triggerKeywords: ['淘汰', '内卷', '竞争'] },
  ],
  // 商业传记
  business: [
    { pattern: 'monopoly_path', label: '垄断路径', examples: ['ASML光刻机', '台积电代工', 'Visa网络'], triggerKeywords: ['垄断', '卡脖子', '不可替代'] },
    { pattern: 'first_principle', label: '第一性原理', examples: ['SpaceX回收火箭', '比亚迪垂直整合'], triggerKeywords: ['降本', '重构', '重新定义'] },
    { pattern: 'network_effect', label: '网络效应', examples: ['微信社交', '抖音算法'], triggerKeywords: ['生态', '平台', '飞轮'] },
  ],
  // 历史
  history: [
    { pattern: 'tech_paradigm_shift', label: '技术范式转移', examples: ['蒸汽→电力', '功能机→智能机'], triggerKeywords: ['替代', '革命', '拐点'] },
    { pattern: 'power_vacuum', label: '权力真空', examples: ['罗马崩溃→中世纪', '苏联解体'], triggerKeywords: ['洗牌', '格局', '新秩序'] },
  ],
  // 日常观察
  daily: [
    { pattern: 'price_anchor', label: '价格锚点', examples: ['9.9元定价心理', '高端对比'], triggerKeywords: ['定价', '性价比', '心理'] },
    { pattern: 'ritual_habit', label: '仪式习惯', examples: ['星巴克排队', '晨间冥想'], triggerKeywords: ['习惯', '仪式', '粘性'] },
  ]
};

/**
 * 检测热点话题与跨领域素材的碰撞
 * @param {string} topic - 热点话题
 * @param {string[]} keywords - 话题关键词
 * @returns {Array} 碰撞卡片列表
 */
function detectMediciCollision(topic, keywords) {
  const collisions = [];
  const lowerKeywords = (keywords || []).map(k => k.toLowerCase());
  
  for (const [domain, patterns] of Object.entries(CROSS_DOMAIN_LIBRARY)) {
    for (const p of patterns) {
      const matchCount = p.triggerKeywords.filter(k => 
        lowerKeywords.some(kw => kw.includes(k.toLowerCase()) || k.toLowerCase().includes(kw))
      ).length;
      
      if (matchCount > 0) {
        collisions.push({
          domain,
          pattern: p.pattern,
          label: p.label,
          examples: p.examples,
          relevance: matchCount / p.triggerKeywords.length,
          suggestion: `热点"${topic}"与【${p.label}】模式结构相似 — 可借鉴${p.examples[0]}的叙事结构`
        });
      }
    }
  }
  
  return collisions.sort((a, b) => b.relevance - a.relevance).slice(0, 5);
}

/**
 * 生成"信息组合仪表盘" — T型知识结构推荐
 * @param {string} vertical - 垂直领域
 * @param {string[]} broadInterests - 广度兴趣
 * @returns {Object} 信息组合建议
 */
function generateInfoDashboard(vertical, broadInterests) {
  const verticalSources = {
    'AI': ['arxiv-sanity', 'HuggingFace Daily', '机器之心', '量子位'],
    '智能制造': ['工联网', '智能制造网', 'Control Engineering'],
    '数字化转型': ['36氪', '钛媒体', 'CIO.com'],
  };
  
  const broadSources = {
    '综艺': ['豆瓣综艺榜', '猫眼综艺热度'],
    '电影': ['豆瓣电影Top250', 'IMDB'],
    '商业传记': ['Goodreads商业', '微信读书商业榜'],
    '历史': ['全历史', 'historytoday.com'],
  };
  
  return {
    vertical: {
      domain: vertical,
      sources: verticalSources[vertical] || ['通用行业源'],
      depth: '每日监控'
    },
    broad: (broadInterests || ['综艺', '电影', '商业传记']).map(interest => ({
      domain: interest,
      sources: broadSources[interest] || ['通用源'],
      depth: '每周摘要'
    })),
    collisionCheck: '每日自动检测跨领域结构相似性'
  };
}

// ══════════════════════════════════════════════════════
// 模块二：角度工坊（核心 — 反直觉 + 陌生化）
// ══════════════════════════════════════════════════════

/**
 * 生成"第一直觉角度"（红牌角度 — 不建议直接使用）
 * @param {string} topic - 话题
 * @param {string[]} keywords - 关键词
 * @returns {Object} 红牌角度列表
 */
function generateRedCardAngles(topic, keywords) {
  // 用规则引擎预判"大多数人会怎么写"
  const redCards = [];
  
  // 通用红牌模式
  const commonPatterns = [
    { pattern: '参数解读型', template: `${topic}的技术参数/功能全面解读` },
    { pattern: '对比升级型', template: `${topic}比上一代强了多少` },
    { pattern: '行业影响型', template: `${topic}对某行业的影响/颠覆` },
    { pattern: '利好利空型', template: `${topic}是利好还是利空` },
    { pattern: '科普入门型', template: `一文看懂${topic}` },
    { pattern: '人物故事型', template: `${topic}背后的关键人物/团队` },
  ];
  
  commonPatterns.forEach(p => {
    redCards.push({
      angle: p.template,
      type: p.pattern,
      risk: '高同质化 — 预计80%+的自媒体会用这个角度',
      noveltyScore: 10 + Math.floor(Math.random() * 15) // 10-25，很低
    });
  });
  
  return {
    topic,
    warning: '以下角度为"第一直觉角度"，同质化风险极高，不建议直接使用',
    redCards,
    count: redCards.length
  };
}

/**
 * 反差角度生成器 — 陌生化三法
 * @param {string} topic - 话题
 * @param {string[]} keywords - 关键词
 * @param {Object} options - 选项
 * @returns {Array} 绿牌角度列表
 */
function generateGreenCardAngles(topic, keywords, options = {}) {
  const greenCards = [];
  const kws = keywords || [];
  
  // ── 方法1：逆向思考 ──
  // 对主流叙事取反义词/对立面
  const reverseTemplates = [
    { angle: `为什么${topic}可能没有你想的那么重要`, method: '逆向思考：削弱叙事', psychology: '读者预期"重要"，反差引发好奇', novelty: 75 },
    { angle: `${topic}的失败案例/副作用/暗面`, method: '逆向思考：负面挖掘', psychology: '负面信息天然吸引力+信息差', novelty: 70 },
    { angle: `那些${topic}改变不了的事`, method: '逆向思考：边界限定', psychology: '承认局限性反而增加可信度', novelty: 72 },
    { angle: `如果不做${topic}会怎样？`, method: '逆向思考：缺席思维', psychology: '损失厌恶触发深度思考', novelty: 68 },
  ];
  reverseTemplates.forEach(t => greenCards.push(t));
  
  // ── 方法2：角色转换 ──
  // 从不同利益方视角重述
  const roleTemplates = [
    { angle: `${topic}里被折叠的那群人`, method: '角色转换：边缘人视角', psychology: '共情+信息差，"没想到"的震撼', novelty: 82 },
    { angle: `一线工人怎么看${topic}`, method: '角色转换：底层视角', psychology: '接地气+反精英叙事，真实感', novelty: 78 },
    { angle: `${topic}的既得利益者不想让你知道的`, method: '角色转换：对立面视角', psychology: '阴谋感+揭秘欲', novelty: 76 },
    { angle: `作为消费者，${topic}对我到底意味着什么`, method: '角色转换：用户视角', psychology: '切身相关+去技术化', novelty: 65 },
  ];
  roleTemplates.forEach(t => greenCards.push(t));
  
  // ── 方法3：时空错位 ──
  // 不同时间尺度下的审视
  const timeTemplates = [
    { angle: `十年后再看${topic}，可能只是个小注脚`, method: '时空错位：长周期回望', psychology: '拉远视角的"渺小感"，哲学震撼', novelty: 80 },
    { angle: `${topic}在1990年会发生什么？`, method: '时空错位：历史投射', psychology: '时代差带来的荒诞感和思考', novelty: 85 },
    { angle: `${topic}之后，下一个是什么？`, method: '时空错位：前瞻预测', psychology: '好奇心+预判欲', novelty: 72 },
    { angle: `如果我们把${topic}的时间线压缩到24小时`, method: '时空错位：时间压缩', psychology: '节奏感+紧迫感', novelty: 74 },
  ];
  timeTemplates.forEach(t => greenCards.push(t));
  
  // 按新颖度排序
  greenCards.sort((a, b) => b.novelty - a.novelty);
  
  // 为每个角度附加血缘标记
  return greenCards.map((card, i) => ({
    ...card,
    id: `angle_${Date.now()}_${i}`,
    topic,
    createdAt: new Date().toISOString(),
    // 角度评分
    scores: {
      novelty: card.novelty,
      resonance: estimateResonance(card),
      risk: assessAngleRisk(card)
    }
  }));
}

/**
 * 估算角度的共鸣潜力（简化版，后续可用历史数据训练）
 */
function estimateResonance(angle) {
  let score = 50; // 基准
  if (angle.psychology && angle.psychology.includes('震撼')) score += 15;
  if (angle.psychology && angle.psychology.includes('好奇')) score += 10;
  if (angle.psychology && angle.psychology.includes('共情')) score += 12;
  if (angle.method && angle.method.includes('角色转换')) score += 8;
  if (angle.method && angle.method.includes('时空错位')) score += 5;
  return Math.min(score, 95);
}

/**
 * 评估角度风险（是否可能触碰价值观红线）
 */
function assessAngleRisk(angle) {
  let risk = 'low';
  const text = (angle.angle + ' ' + angle.method).toLowerCase();
  const highRiskPatterns = ['阴谋', '暗面', '不想让你知道', '副作用', '失败'];
  const mediumRiskPatterns = ['折叠', '既得利益', '颠覆'];
  
  if (highRiskPatterns.some(p => text.includes(p))) risk = 'medium';
  if (text.includes('政治') || text.includes('敏感')) risk = 'high';
  return risk;
}

/**
 * 角度评分器 — 综合评估
 */
function scoreAngle(angle, historyAngles) {
  // 与历史角度的相似度（越低越新）
  let noveltyVsHistory = 100;
  if (historyAngles && historyAngles.length > 0) {
    const similarities = historyAngles.map(ha => 
      textSimilarity(angle.angle, ha.angle)
    );
    noveltyVsHistory = 100 - Math.max(...similarities) * 100;
  }
  
  return {
    ...angle.scores,
    noveltyVsHistory: Math.round(noveltyVsHistory),
    overall: Math.round(
      (angle.scores.novelty * 0.4 + 
       angle.scores.resonance * 0.35 + 
       angle.scores.risk === 'low' ? 80 : angle.scores.risk === 'medium' ? 50 : 20) * 0.25
    ),
    recommendation: angle.scores.novelty >= 70 && angle.scores.risk !== 'high' 
      ? '推荐使用' 
      : angle.scores.risk === 'high' 
        ? '风险较高，建议人工复审' 
        : '新颖度不足，建议进一步陌生化'
  };
}

/**
 * 简易文本相似度（Jaccard）
 */
function textSimilarity(a, b) {
  const setA = new Set(a.split(''));
  const setB = new Set(b.split(''));
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ══════════════════════════════════════════════════════
// 模块三：故事引擎（情绪曲线 + 升番 + 价值观过滤）
// ══════════════════════════════════════════════════════

/**
 * 情绪曲线模板
 */
const EMOTION_ARCS = {
  cinderella: {
    name: '灰姑娘型',
    description: '低谷→攀升→高潮',
    points: [
      { position: 0, emotion: -0.3, label: '困境' },
      { position: 0.25, emotion: -0.5, label: '至暗时刻' },
      { position: 0.5, emotion: 0.2, label: '转机' },
      { position: 0.75, emotion: 0.7, label: '突破' },
      { position: 1, emotion: 0.9, label: '蜕变' }
    ]
  },
  fall_into_hole: {
    name: '掉进洞里型',
    description: '平地→跌落→攀爬→重生',
    points: [
      { position: 0, emotion: 0.3, label: '日常' },
      { position: 0.2, emotion: -0.6, label: '意外跌落' },
      { position: 0.45, emotion: -0.8, label: '洞底挣扎' },
      { position: 0.65, emotion: -0.2, label: '找到抓手' },
      { position: 0.85, emotion: 0.5, label: '攀出' },
      { position: 1, emotion: 0.8, label: '新生' }
    ]
  },
  hero_journey: {
    name: '英雄之旅',
    description: '召唤→考验→深渊→归来',
    points: [
      { position: 0, emotion: 0.2, label: '平凡世界' },
      { position: 0.15, emotion: 0.4, label: '冒险召唤' },
      { position: 0.3, emotion: -0.3, label: '考验' },
      { position: 0.5, emotion: -0.7, label: '深渊' },
      { position: 0.65, emotion: 0.1, label: '顿悟' },
      { position: 0.8, emotion: 0.6, label: '蜕变归来' },
      { position: 1, emotion: 0.85, label: '双界大师' }
    ]
  },
  reverse_surprise: {
    name: '反转型',
    description: '看似寻常→层层揭开→颠覆认知',
    points: [
      { position: 0, emotion: 0.1, label: '看似寻常' },
      { position: 0.3, emotion: 0.2, label: '细微异样' },
      { position: 0.5, emotion: 0.3, label: '线索聚集' },
      { position: 0.7, emotion: -0.2, label: '认知崩塌' },
      { position: 0.85, emotion: 0.6, label: '真相浮现' },
      { position: 1, emotion: 0.7, label: '重新理解' }
    ]
  }
};

/**
 * 根据选定角度，推荐情绪曲线
 */
function recommendEmotionArc(angle) {
  const text = (angle.angle + ' ' + angle.method).toLowerCase();
  
  if (text.includes('逆袭') || text.includes('弱者')) return EMOTION_ARCS.cinderella;
  if (text.includes('跌落') || text.includes('失败') || text.includes('副作用')) return EMOTION_ARCS.fall_into_hole;
  if (text.includes('反转') || text.includes('颠覆') || text.includes('真相')) return EMOTION_ARCS.reverse_surprise;
  // 默认英雄之旅
  return EMOTION_ARCS.hero_journey;
}

/**
 * 升番检测器 — 检查内容中是否有足够递进
 * @param {string} content - 文章内容
 * @returns {Object} 升番分析
 */
function analyzeEscalation(content) {
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 10);
  const analysis = {
    totalParagraphs: paragraphs.length,
    escalationPoints: [],
    suggestions: []
  };
  
  // 检测"举例"模式的番数
  let exampleCount = 0;
  let lastExampleIdx = -1;
  paragraphs.forEach((p, i) => {
    if (p.includes('例如') || p.includes('比如') || p.match(/\d+[\.\)、]/)) {
      exampleCount++;
      if (i - lastExampleIdx <= 2 && lastExampleIdx >= 0) {
        analysis.escalationPoints.push({
          paragraphIndex: i,
          type: 'consecutive_examples',
          note: '连续举例，检查是否有递进（升番）'
        });
      }
      lastExampleIdx = i;
    }
  });
  
  // 如果只有1-2个案例，建议升番
  if (exampleCount <= 1) {
    analysis.suggestions.push({
      type: 'add_escalation',
      message: '当前只有1个案例支撑，建议使用"升番"技巧：加第二番（更极端/离谱的同类案例），第三番（反常识视角收尾）',
      priority: 'high'
    });
  }
  
  // 检测情绪是否有低谷→高潮的弧线
  let hasLow = false, hasHigh = false;
  const negativeWords = ['困境', '挑战', '问题', '失败', '挣扎', '焦虑', '痛苦'];
  const positiveWords = ['突破', '解决', '成功', '希望', '蜕变', '收获', '成长'];
  paragraphs.forEach(p => {
    if (negativeWords.some(w => p.includes(w))) hasLow = true;
    if (positiveWords.some(w => p.includes(w))) hasHigh = true;
  });
  
  if (!hasLow) {
    analysis.suggestions.push({
      type: 'add_valley',
      message: '内容缺少低谷/困境描写，建议在40%位置加入一个"至暗时刻"，为高潮蓄力',
      priority: 'medium'
    });
  }
  if (hasLow && !hasHigh) {
    analysis.suggestions.push({
      type: 'add_peak',
      message: '有低谷但没有高潮反转，读者会感到压抑，建议在70%位置加入转折',
      priority: 'high'
    });
  }
  
  return analysis;
}

/**
 * 正向价值观防火墙
 * @param {string} content - 文章内容
 * @returns {Object} 审查结果
 */
function valueFilter(content) {
  const result = {
    passed: true,
    violations: [],
    warnings: [],
    score: 100
  };
  
  // ── 红线1：不懂硬说 ──
  const authorityPatterns = [
    { pattern: /作为.*(专家|权威|资深)/, risk: 'medium', msg: '自封专家头衔，是否真有此专业背景？' },
    { pattern: /我确信|毫无疑问|绝对/, risk: 'low', msg: '过度断言，建议加"据我了解"等限定' },
  ];
  authorityPatterns.forEach(p => {
    if (p.pattern.test(content)) {
      result.warnings.push({ type: 'authority_claim', ...p });
      result.score -= 5;
    }
  });
  
  // ── 红线2：敏感话题 ──
  const sensitivePatterns = [
    { pattern: /政治|体制|意识形态/, risk: 'high', msg: '涉及政治敏感话题，强烈建议人工审核' },
    { pattern: /仇恨|歧视|暴力/, risk: 'high', msg: '可能包含仇恨/歧视/暴力内容' },
  ];
  sensitivePatterns.forEach(p => {
    if (p.pattern.test(content)) {
      result.violations.push({ type: 'sensitive', ...p });
      result.passed = false;
      result.score -= 30;
    }
  });
  
  // ── 红线3：弱者思维/傲慢 ──
  const arrogancePatterns = [
    { pattern: /你不懂|你不知道|给你科普/, risk: 'medium', msg: '居高临下语气，可能冒犯读者' },
    { pattern: /穷人思维|屌丝|韭菜/, risk: 'high', msg: '贬低性称呼，违反正向价值观' },
    { pattern: /活该|自找/, risk: 'medium', msg: '受害者有罪论倾向' },
  ];
  arrogancePatterns.forEach(p => {
    if (p.pattern.test(content)) {
      result.violations.push({ type: 'arrogance', ...p });
      result.score -= 15;
      if (p.risk === 'high') result.passed = false;
    }
  });
  
  // ── 正面检查：是否有"让世界有一丁点不一样"的元素 ──
  const valueAddPatterns = [/新角度|不同|反常识|重新理解|意外|惊喜/];
  const hasValueAdd = valueAddPatterns.some(p => p.test(content));
  if (!hasValueAdd) {
    result.warnings.push({
      type: 'no_novelty',
      risk: 'low',
      msg: '内容似乎缺少"让读者感觉世界有一丁点不一样"的元素，建议加强'
    });
    result.score -= 10;
  }
  
  return result;
}

// ══════════════════════════════════════════════════════
// 模块四：数据教练（预测 + 闭环）
// ══════════════════════════════════════════════════════

/** 基准指标 */
const BENCHMARKS = {
  likeReadRatio: { target: 0.025, label: '赞阅比', unit: '%' },
  shareReadRatio: { target: 0.08, label: '转阅比', unit: '%' },
  completionRate: { long: 0.30, short: 0.40, label: '完读率', unit: '%' },
  regularReaderRatio: { target: 0.15, label: '常读用户比', unit: '%' }
};

/**
 * 发布前预测（简化模型 — 基于角度评分和内容结构）
 */
function predictPerformance(angle, contentAnalysis) {
  const predictions = {};
  
  // 赞阅比：与角度新颖度正相关
  const noveltyFactor = (angle.scores?.novelty || 50) / 100;
  predictions.likeReadRatio = 0.015 + noveltyFactor * 0.015; // 1.5% - 3%
  
  // 转阅比：与共鸣潜力和情绪弧线正相关
  const resonanceFactor = (angle.scores?.resonance || 50) / 100;
  const hasArc = contentAnalysis.escalationPoints?.length > 0 || contentAnalysis.suggestions?.length < 2;
  predictions.shareReadRatio = 0.04 + resonanceFactor * 0.06 * (hasArc ? 1.2 : 0.8); // 4% - 12%
  
  // 完读率：与升番/结构完整度正相关
  const structureScore = Math.max(0, 1 - (contentAnalysis.suggestions?.length || 0) * 0.15);
  const wordCount = contentAnalysis.wordCount || 2000;
  const lengthFactor = wordCount > 3000 ? 0.85 : 1;
  predictions.completionRate = (0.2 + structureScore * 0.15) * lengthFactor;
  
  // 对标基准
  const diagnosis = {};
  for (const [key, bench] of Object.entries(BENCHMARKS)) {
    const predicted = predictions[key];
    const target = bench.target || bench.long;
    diagnosis[key] = {
      label: bench.label,
      predicted: (predicted * 100).toFixed(2) + bench.unit,
      target: (target * 100).toFixed(2) + bench.unit,
      status: predicted >= target ? '达标' : '未达标',
      gap: predicted >= target ? 0 : ((target - predicted) / target * 100).toFixed(1) + '%'
    };
  }
  
  return { predictions, diagnosis };
}

/**
 * 发布后诊断 — 真实数据 vs 预测对比
 */
function diagnosePerformance(articleId, actualData, predictions) {
  const report = { articleId, date: new Date().toISOString(), items: [] };
  
  for (const [key, bench] of Object.entries(BENCHMARKS)) {
    const actual = actualData[key];
    const predicted = predictions?.[key];
    const target = bench.target || bench.long;
    
    if (actual === undefined) continue;
    
    const item = {
      metric: bench.label,
      actual: (actual * 100).toFixed(2) + bench.unit,
      target: (target * 100).toFixed(2) + bench.unit,
      met: actual >= target
    };
    
    if (predicted !== undefined) {
      item.predicted = (predicted * 100).toFixed(2) + bench.unit;
      item.predictionAccuracy = (1 - Math.abs(actual - predicted) / predicted) * 100;
    }
    
    // 归因建议
    if (!item.met) {
      if (key === 'likeReadRatio') {
        item.suggestion = '赞阅比未达标 → 标题/开头可能不够抓人，或角度不够意外';
      } else if (key === 'shareReadRatio') {
        item.suggestion = '转阅比未达标 → 角度不够意外或情绪共鸣不足，建议下次尝试角色转换法';
      } else if (key === 'completionRate') {
        item.suggestion = '完读率未达标 → 节奏可能拖沓，检查中段是否有足够的升番和转折';
      }
    }
    
    report.items.push(item);
  }
  
  return report;
}

/**
 * 记录角度血缘 — 追溯好角度从哪来
 */
function recordAngleBloodline(angleId, source, performance) {
  let bloodline = [];
  try {
    if (fs.existsSync(BLOODLINE_DB)) {
      bloodline = JSON.parse(fs.readFileSync(BLOODLINE_DB, 'utf8'));
    }
  } catch (e) {}
  
  bloodline.push({
    angleId,
    source, // { type: 'medici_collision'|'life_observation'|'cross_domain', detail: '...' }
    performance, // { likeReadRatio, shareReadRatio, completionRate }
    recordedAt: new Date().toISOString()
  });
  
  fs.writeFileSync(BLOODLINE_DB, JSON.stringify(bloodline, null, 2), 'utf8');
  return bloodline.length;
}

/**
 * 记录发布表现历史
 */
function recordPerformance(articleId, angle, actualData, predictions) {
  let history = [];
  try {
    if (fs.existsSync(PERFORMANCE_HISTORY)) {
      history = JSON.parse(fs.readFileSync(PERFORMANCE_HISTORY, 'utf8'));
    }
  } catch (e) {}
  
  history.push({
    articleId,
    angle: { angle: angle.angle, method: angle.method, scores: angle.scores },
    predictions,
    actualData,
    date: new Date().toISOString()
  });
  
  // 保留最近200条
  if (history.length > 200) history = history.slice(-200);
  
  fs.writeFileSync(PERFORMANCE_HISTORY, JSON.stringify(history, null, 2), 'utf8');
}

// ══════════════════════════════════════════════════════
// 完整工作流：从话题到发布决策
// ══════════════════════════════════════════════════════

/**
 * 内容方法论全流程
 * @param {string} topic - 话题
 * @param {string[]} keywords - 关键词
 * @param {Object} options - 选项
 * @returns {Object} 完整分析结果
 */
function fullMethodologyPipeline(topic, keywords, options = {}) {
  console.log('[Methodology] 开始方法论全流程:', topic);
  
  // Step 1: 跨领域碰撞检测
  const mediciCollisions = detectMediciCollision(topic, keywords);
  
  // Step 2: 红牌角度（第一直觉屏蔽）
  const redCards = generateRedCardAngles(topic, keywords);
  
  // Step 3: 绿牌角度（反差/陌生化）
  const greenCards = generateGreenCardAngles(topic, keywords, options);
  
  // Step 4: 为绿牌角度推荐情绪曲线
  const angleWithArcs = greenCards.slice(0, 5).map(angle => ({
    ...angle,
    recommendedArc: recommendEmotionArc(angle),
    scoredAs: scoreAngle(angle, options.historyAngles)
  }));
  
  return {
    topic,
    keywords,
    step1_crossDomain: {
      collisions: mediciCollisions,
      dashboard: generateInfoDashboard(options.vertical || 'AI', options.broadInterests)
    },
    step2_redCards: redCards,
    step3_greenCards: angleWithArcs,
    meta: {
      totalAngles: greenCards.length,
      topAngle: angleWithArcs[0] || null,
      generatedAt: new Date().toISOString()
    }
  };
}

// ── 导出 ────────────────────────────────────────────────

module.exports = {
  // 美第奇引擎
  detectMediciCollision,
  generateInfoDashboard,
  CROSS_DOMAIN_LIBRARY,
  
  // 角度工坊
  generateRedCardAngles,
  generateGreenCardAngles,
  scoreAngle,
  
  // 故事引擎
  EMOTION_ARCS,
  recommendEmotionArc,
  analyzeEscalation,
  valueFilter,
  
  // 数据教练
  BENCHMARKS,
  predictPerformance,
  diagnosePerformance,
  recordAngleBloodline,
  recordPerformance,
  
  // 全流程
  fullMethodologyPipeline,
  
  // 路径
  DATA_DIR
};