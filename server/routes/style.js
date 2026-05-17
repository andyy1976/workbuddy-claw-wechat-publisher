/**
 * 风格系统路由
 * GET  /api/style/list     - 可用风格列表
 * GET  /api/style/guide    - 风格使用指南
 */

const express = require('express');
const router = express.Router();

const STYLES = {
    khazix: {
        id: 'khazix',
        name: '卡兹克风格',
        description: '去AI味极致版，第一人称视角，短句+反问句，科技圈的野区猎手',
        features: ['个人视角', '反问句多', '行业黑话', '观点鲜明', '口语化'],
        bestFor: '微信公众号长文、技术观点文章',
        example: '"我说句实话，市面上90%的AI内容都带着一股浓浓的AI味。那些"首先、其次、最后"的三段论，连机器人都嫌无聊。"'
    },
    professional: {
        id: 'professional',
        name: '专业深度',
        description: '行业白皮书面貌，数据和案例密集，适合技术决策层',
        features: ['数据驱动', '逻辑清晰', '案例丰富', '行业洞察'],
        bestFor: '企业官网、白皮书、技术报告',
        example: '"某汽车零部件厂上线MES系统后，换型时间从45分钟降至8分钟，产能提升23%。这不是理论推演，而是我们客户的真实数据。"'
    },
    casual: {
        id: 'casual',
        name: '轻松故事',
        description: '像同事在茶水间聊天，适当幽默，会自嘲',
        features: ['故事性', '幽默感', '亲和力', '实用性'],
        bestFor: '公众号软文、知识分享、团队文化',
        example: '"上周我们团队又踩了一个坑。客户说要一个"简单"的报表功能，结果做了两周。为什么？因为"简单"这两个字，在甲方嘴里和乙方耳朵里，从来不是一个意思。"'
    },
    technical: {
        id: 'technical',
        name: '硬核技术',
        description: '原理级解析，代码示例，适合技术社区',
        features: ['原理解析', '代码示例', '架构图', '性能数据'],
        bestFor: 'CSDN、掘金、技术博客',
        example: '"LLM推理优化有四个方向：KV Cache、PagedAttention、Flash Attention、投机解码。各有利弊，我们逐个拆解。"'
    }
};

const PLATFORMS = {
    wechat: { name: '微信公众号', wordRange: '1500-3000字', style: '专业深度，结构清晰' },
    xiaohongshu: { name: '小红书', wordRange: '500-800字', style: 'emoji密集，姐妹感，分点罗列' },
    douyin: { name: '抖音文案', wordRange: '200-500字', style: '3秒钩子，口播友好' },
    cms: { name: '企业官网', wordRange: '1000-2000字', style: '正式可信，产品导向' }
};

router.get('/list', (req, res) => {
    res.json({ success: true, data: { styles: STYLES, platforms: PLATFORMS } });
});

router.get('/guide', (req, res) => {
    const guide = {
        antiAIRules: [
            '禁止"首先...其次...最后..."三段论',
            '禁止"值得注意的是""综上所述""在此基础之上"',
            '禁止"随着...的不断发展""在...背景下"',
            '禁止连续使用"不仅...而且..."',
            '禁止列表后紧跟空洞总结',
            '每段都要有具体案例或数据',
            '用行业人话代替教科书式罗列'
        ],
        styleTips: {
            '去AI味第一法则': '用具体人+具体事+具体数据开头，不要用"在当前形势下"',
            '标题公式': '数字+具体场景+反常识/新观点（例："用AI 3个月，效率翻了5倍"）',
            '转发钩子': '25%放实用清单，50%放金句，75%放争议观点',
            '结尾禁忌': '不要"总而言之"，用行动号召或观点回扣'
        }
    };
    res.json({ success: true, data: guide });
});

module.exports = router;
