/**
 * 企业产品数据服务
 * 
 * 管理产品BOM/工艺/质量数据，用于内容生成的素材来源
 * 数据来源：本地JSON + CMS数据库
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PRODUCTS_DIR = path.join(DATA_DIR, 'products');
const BOM_LIB_PATH = path.join(DATA_DIR, 'bom-library.json');
const PROCESS_LIB_PATH = path.join(DATA_DIR, 'process-library.json');
const QUALITY_LIB_PATH = path.join(DATA_DIR, 'quality-library.json');

// 确保目录存在
[PRODUCTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── 初始化默认数据 ────────────────────────────────
function initDefaultData() {
    if (!fs.existsSync(BOM_LIB_PATH)) {
        fs.writeFileSync(BOM_LIB_PATH, JSON.stringify({
            "传感器模组": { code: "BOM-SEN-001", category: "核心元件", spec: "0-100MPa", price: 85, supplier: "芯感科技", leadTime: 7, critical: true },
            "信号处理板": { code: "BOM-PCB-001", category: "电路板", spec: "4层FR4", price: 42.5, supplier: "华强电子", leadTime: 3, critical: false },
            "防护外壳": { code: "BOM-MEC-001", category: "结构件", spec: "IP67铝合金", price: 68, supplier: "精密压铸", leadTime: 10, critical: false },
            "密封组件": { code: "BOM-SEA-001", category: "密封件", spec: "氟橡胶O型", price: 2.5, supplier: "密封科技", leadTime: 2, critical: true },
            "通信模块": { code: "BOM-COM-001", category: "通信", spec: "4G+BLE5.0", price: 35, supplier: "移远通信", leadTime: 5, critical: true },
            "电源管理IC": { code: "BOM-PMU-001", category: "电源", spec: "DC-DC 3.3V/5V", price: 12, supplier: "TI代理", leadTime: 3, critical: true }
        }, null, 2), 'utf8');
    }
    
    if (!fs.existsSync(PROCESS_LIB_PATH)) {
        fs.writeFileSync(PROCESS_LIB_PATH, JSON.stringify([
            { id: "PROC-001", name: "SMT贴片", station: "贴片车间", cycleTime: 45, yield: 99.7, operator: 1, equipment: "YAMAHA贴片机" },
            { id: "PROC-002", name: "回流焊接", station: "焊接车间", cycleTime: 30, yield: 99.9, operator: 1, equipment: "10温区回流炉" },
            { id: "PROC-003", name: "功能测试", station: "测试工位", cycleTime: 120, yield: 98.5, operator: 2, equipment: "ATE测试台" },
            { id: "PROC-004", name: "气密检测", station: "品质工位", cycleTime: 60, yield: 99.8, operator: 1, equipment: "气密仪" },
            { id: "PROC-005", name: "老化试验", station: "老化室", cycleTime: 14400, yield: 99.5, operator: 1, equipment: "高温老化箱" }
        ], null, 2), 'utf8');
    }
    
    if (!fs.existsSync(QUALITY_LIB_PATH)) {
        fs.writeFileSync(QUALITY_LIB_PATH, JSON.stringify({
            "来料检验": { standard: "GB/T 2828.1", aql: 0.65, sampleMethod: "正常检验II级", rejectRate: "≤1.5%" },
            "过程检验": { standard: "ISO 9001:2015", checkpoints: 12, frequency: "每2小时巡检", spc: true },
            "出厂检验": { standard: "GB/T 2828.1", aql: 0.40, sampleMethod: "加严检验", coverage: "100%功能+外观" },
            "可靠性测试": { items: ["高低温循环", "盐雾试验", "振动测试", "EMC"], standard: "IEC 60068" },
            "追溯体系": { method: "SN码+批次号", traceability: "来料→生产→出货全链路", retention: "10年" }
        }, null, 2), 'utf8');
    }
}
initDefaultData();

// ── 服务接口 ──────────────────────────────────────

/**
 * 获取完整产品数据（BOM+工艺+质量）
 */
function getFullProductData(productId) {
    const bom = JSON.parse(fs.readFileSync(BOM_LIB_PATH, 'utf8'));
    const processes = JSON.parse(fs.readFileSync(PROCESS_LIB_PATH, 'utf8'));
    const quality = JSON.parse(fs.readFileSync(QUALITY_LIB_PATH, 'utf8'));
    
    // 如果有具体产品文件
    let productInfo = null;
    if (productId) {
        const productFile = path.join(PRODUCTS_DIR, `${productId}.json`);
        if (fs.existsSync(productFile)) {
            productInfo = JSON.parse(fs.readFileSync(productFile, 'utf8'));
        }
    }
    
    return {
        product: productInfo,
        bom: bom,
        processes: processes,
        quality: quality,
        // 预处理：生成内容素材
        contentHints: {
            totalBomItems: Object.keys(bom).length,
            criticalParts: Object.entries(bom).filter(([_, v]) => v.critical).length,
            avgYield: processes.length ? (processes.reduce((s, p) => s + p.yield, 0) / processes.length).toFixed(1) : 0,
            qualityStandards: Object.keys(quality).join('、'),
            keyAdvantages: generateAdvantages(bom, processes, quality)
        }
    };
}

/**
 * 从产品数据自动生成内容亮点
 */
function generateAdvantages(bom, processes, quality) {
    const advantages = [];
    
    // BOM 优势
    const criticalParts = Object.entries(bom).filter(([_, v]) => v.critical);
    if (criticalParts.length > 0) {
        advantages.push({
            type: 'supply_chain',
            title: '供应链优势',
            detail: `${criticalParts.length}项核心元件原厂直供，从源头保障品质`,
            data: criticalParts.map(([name, v]) => `${name}(${v.supplier})`)
        });
    }
    
    // 工艺优势
    const avgYield = processes.length ? (processes.reduce((s, p) => s + p.yield, 0) / processes.length).toFixed(1) : 0;
    if (parseFloat(avgYield) > 99) {
        advantages.push({
            type: 'process',
            title: '工艺可靠性',
            detail: `${processes.length}道核心工序，平均良率${avgYield}%`,
            data: processes.map(p => `${p.name}: ${p.yield}%`)
        });
    }
    
    // 质量优势
    if (quality['追溯体系']) {
        advantages.push({
            type: 'quality',
            title: '质量保障',
            detail: `${quality['追溯体系'].method}，${quality['追溯体系'].traceability}`,
            data: Object.entries(quality).map(([k, v]) => `${k}: ${typeof v === 'object' ? v.standard || JSON.stringify(v) : v}`)
        });
    }
    
    return advantages;
}

/**
 * 根据产品数据生成内容大纲
 */
function generateContentOutline(productData, topicType) {
    const { contentHints, product } = productData;
    const productName = product?.name || '智能传感器';
    
    const outlines = {
        product_intro: [
            { section: '行业痛点', hint: `${productName}要解决什么问题？为什么现在需要？` },
            { section: '产品亮点', hint: `核心参数 + ${contentHints.keyAdvantages.length}大优势` },
            { section: '技术深潜', hint: `BOM ${contentHints.totalBomItems}项物料解析，${contentHints.criticalParts}项核心元件` },
            { section: '品质背书', hint: `${contentHints.avgYield}%良率，${contentHints.qualityStandards}` },
            { section: '应用案例', hint: '具体企业使用场景和效果' }
        ],
        process_story: [
            { section: '传统工艺的困境', hint: '行业通用痛点' },
            { section: '我们的工艺方案', hint: `${productData.processes.length}道工序详解` },
            { section: '良率突破之路', hint: `从行业平均到${contentHints.avgYield}%的提升过程` },
            { section: '品质追溯', hint: `${productData.quality['追溯体系']?.traceability || '全链路追溯'}` }
        ],
        bom_story: [
            { section: '一颗传感器的诞生', hint: '从原材料到成品的供应链故事' },
            { section: '核心元件揭秘', hint: `${contentHints.criticalParts}项核心件的技术选型` },
            { section: '供应链韧性的秘密', hint: '多源供应、安全库存策略' },
            { section: '成本与品质的平衡', hint: '物料成本结构与品质投入' }
        ]
    };
    
    return outlines[topicType] || outlines.product_intro;
}

/**
 * 保存产品数据
 */
function saveProductData(productId, data) {
    const filePath = path.join(PRODUCTS_DIR, `${productId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return { success: true, path: filePath };
}

/**
 * 列出所有产品
 */
function listProducts() {
    if (!fs.existsSync(PRODUCTS_DIR)) return [];
    return fs.readdirSync(PRODUCTS_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => {
            try {
                return JSON.parse(fs.readFileSync(path.join(PRODUCTS_DIR, f), 'utf8'));
            } catch { return null; }
        })
        .filter(Boolean);
}

module.exports = {
    getFullProductData,
    generateContentOutline,
    generateAdvantages,
    saveProductData,
    listProducts
};
