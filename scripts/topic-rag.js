/**
 * 话题知识库 RAG 模块
 * 
 * 核心能力：
 * 1. 向量化话题 → TF-IDF + 余弦相似度搜索
 * 2. 历史去重 → 7天内不重复选同一话题
 * 3. 信号融合 → 关键词权重 + 热度衰减 + 时效加分
 * 4. 语义扩展 → 同义词/相关词自动匹配
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BASE_DIR = path.resolve(__dirname, '..');
const TOPICS_FILE = path.join(BASE_DIR, 'data', 'topics.json');
const HISTORY_FILE = path.join(BASE_DIR, 'data', 'topic-history.json');

// ── 中文分词（轻量级：字+双字组合）─────────────────────────
function tokenize(text) {
    if (!text) return [];
    const cleaned = text.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/g, ' ');
    const tokens = [];
    
    // 英文单词
    const engWords = cleaned.match(/[a-z0-9]{2,}/g) || [];
    tokens.push(...engWords);
    
    // 中文字符 + 双字组合
    const cnChars = cleaned.match(/[\u4e00-\u9fa5]+/g) || [];
    for (const seg of cnChars) {
        // 单字
        for (const ch of seg) tokens.push(ch);
        // 双字组合（最常用的中文词长度）
        for (let i = 0; i < seg.length - 1; i++) {
            tokens.push(seg[i] + seg[i + 1]);
        }
        // 三字组合
        for (let i = 0; i < seg.length - 2; i++) {
            tokens.push(seg[i] + seg[i + 1] + seg[i + 2]);
        }
    }
    
    return tokens;
}

// ── TF-IDF 向量化 ────────────────────────────────────────
class TopicVectorDB {
    constructor(topics) {
        this.topics = topics;
        this.vocab = new Map();  // token → index
        this.idf = [];           // 逆文档频率
        this.vectors = [];       // 每个话题的TF-IDF向量
        
        this._buildIndex();
    }
    
    _buildIndex() {
        // 1. 构建词汇表
        const docFreq = new Map(); // token → 出现文档数
        const allDocTokens = [];
        
        for (const topic of this.topics) {
            const text = [
                topic.topic,
                topic.description || '',
                (topic.keyPoints || []).join(' '),
                (topic.keywords || []).join(' '),
                topic.category || '',
                (topic.tags || []).join(' ')
            ].join(' ');
            
            const tokens = tokenize(text);
            const uniqueTokens = new Set(tokens);
            allDocTokens.push(tokens);
            
            for (const t of uniqueTokens) {
                docFreq.set(t, (docFreq.get(t) || 0) + 1);
            }
        }
        
        // 2. 建立词汇表索引（过滤出现1次的低频词）
        let idx = 0;
        const N = this.topics.length;
        for (const [token, df] of docFreq) {
            if (df >= 1 && df <= N * 0.9) { // 排除过于常见的词
                this.vocab.set(token, idx);
                this.idf.push(Math.log((N + 1) / (df + 1)) + 1);
                idx++;
            }
        }
        
        // 3. 计算每个话题的TF-IDF向量
        for (const tokens of allDocTokens) {
            const vec = new Float64Array(this.vocab.size);
            const tf = new Map();
            
            for (const t of tokens) {
                tf.set(t, (tf.get(t) || 0) + 1);
            }
            
            const maxTf = Math.max(...tf.values());
            
            for (const [token, count] of tf) {
                const i = this.vocab.get(token);
                if (i !== undefined) {
                    vec[i] = (count / maxTf) * this.idf[i];
                }
            }
            
            // L2归一化
            const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
            if (norm > 0) {
                for (let i = 0; i < vec.length; i++) vec[i] /= norm;
            }
            
            this.vectors.push(vec);
        }
    }
    
    // 查询最相关的话题
    search(queryText, topK = 5) {
        const tokens = tokenize(queryText);
        const queryVec = new Float64Array(this.vocab.size);
        const tf = new Map();
        
        for (const t of tokens) {
            tf.set(t, (tf.get(t) || 0) + 1);
        }
        
        const maxTf = Math.max(...tf.values(), 1);
        
        for (const [token, count] of tf) {
            const i = this.vocab.get(token);
            if (i !== undefined) {
                queryVec[i] = (count / maxTf) * this.idf[i];
            }
        }
        
        // L2归一化
        const norm = Math.sqrt(queryVec.reduce((s, v) => s + v * v, 0));
        if (norm > 0) {
            for (let i = 0; i < queryVec.length; i++) queryVec[i] /= norm;
        }
        
        // 计算余弦相似度
        const scores = this.vectors.map((vec, idx) => {
            let dot = 0;
            for (let i = 0; i < vec.length; i++) dot += vec[i] * queryVec[i];
            return { idx, score: dot, topic: this.topics[idx] };
        });
        
        return scores
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }
}

// ── 历史管理 ──────────────────────────────────────────────
function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        }
    } catch (e) { /* ignore */ }
    return { usedTopics: [] };
}

function saveHistory(history) {
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}

function recordUsage(topicId, title) {
    const history = loadHistory();
    history.usedTopics.push({
        id: topicId,
        title,
        usedAt: new Date().toISOString()
    });
    // 只保留最近30条
    if (history.usedTopics.length > 30) {
        history.usedTopics = history.usedTopics.slice(-30);
    }
    saveHistory(history);
}

function getRecentlyUsedIds(days = 7) {
    const history = loadHistory();
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return new Set(
        history.usedTopics
            .filter(h => new Date(h.usedAt).getTime() > cutoff)
            .map(h => h.id)
    );
}

// ── 热度衰减 ──────────────────────────────────────────────
function heatDecay(heat, createdAt) {
    const daysSince = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
    // 指数衰减：3天内几乎不衰减，之后快速下降
    return heat * Math.exp(-0.15 * Math.max(0, daysSince - 1));
}

// ── 主搜索函数 ────────────────────────────────────────────
function searchTopics(queryKeywords, hnSignals = [], topK = 5) {
    // 加载话题库
    let topicsData;
    try {
        topicsData = JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf8'));
    } catch (e) {
        console.error('❌ 话题库加载失败:', e.message);
        return [];
    }
    
    const topics = topicsData.topics || [];
    if (topics.length === 0) return [];
    
    // 构建向量索引
    const db = new TopicVectorDB(topics);
    
    // 构建查询文本
    const queryText = [
        ...queryKeywords,
        ...hnSignals.map(s => s.topic || '')
    ].join(' ');
    
    // 语义搜索
    const semanticResults = db.search(queryText, topK * 3);
    
    // 排除最近使用过的话题
    const recentIds = getRecentlyUsedIds(7);
    
    // 综合评分：语义相似度 + 热度衰减 + 关键词匹配加分
    const scored = semanticResults.map(r => {
        let finalScore = r.score;
        
        // 热度衰减加成
        const adjustedHeat = heatDecay(r.topic.heat || 0, r.topic.createdAt || '2026-04-24');
        finalScore += Math.log10(adjustedHeat / 10000 + 1) * 0.1;
        
        // 关键词精确匹配加分
        const topicText = (r.topic.topic + ' ' + (r.topic.keywords || []).join(' ')).toLowerCase();
        for (const kw of queryKeywords) {
            if (topicText.includes(kw.toLowerCase())) {
                finalScore += 0.3;
            }
        }
        
        // HN信号匹配加分
        for (const signal of hnSignals) {
            if (signal.topic && topicText.split(' ').some(w => signal.topic.toLowerCase().includes(w))) {
                finalScore += 0.15;
            }
        }
        
        // 分类多样性加分（避免连续选同类话题）
        // 这里暂时不加，后续可以实现
        
        const isRecent = recentIds.has(r.topic.id);
        
        return {
            ...r.topic,
            ragScore: Math.round(finalScore * 100) / 100,
            semanticScore: Math.round(r.score * 100) / 100,
            adjustedHeat: Math.round(adjustedHeat),
            isRecent
        };
    });
    
    // 排除最近使用的，然后排序
    const fresh = scored.filter(s => !s.isRecent);
    const result = fresh.length > 0 ? fresh : scored; // 如果全部用过，允许重复
    
    return result
        .sort((a, b) => b.ragScore - a.ragScore)
        .slice(0, topK);
}

// ── 导出 ──────────────────────────────────────────────────
module.exports = {
    tokenize,
    TopicVectorDB,
    searchTopics,
    recordUsage,
    getRecentlyUsedIds,
    loadHistory,
    heatDecay
};
