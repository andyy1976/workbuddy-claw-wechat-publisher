/**
 * BOM自动生成脚本
 * 功能：基于产品数据生成结构化BOM清单（支持JSON/Markdown/Excel格式）
 * 用法：node scripts/generate-bom.js [productId] [format]
 * 格式：json（默认）/ markdown / excel
 */

const fs = require('fs');
const path = require('path');
// 若需Excel支持，取消下一行注释并npm install exceljs
// const ExcelJS = require('exceljs');

const dataDir = path.join(__dirname, '../data/products');
const outputDir = path.join(__dirname, '../output/bom');
const materialLibPath = path.join(__dirname, '../references/bom-material-library.json');

// 确保输出目录存在
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 读取物料库（默认使用内置示例）
function loadMaterialLibrary() {
  if (fs.existsSync(materialLibPath)) {
    return JSON.parse(fs.readFileSync(materialLibPath, 'utf8'));
  }
  // 默认物料库（中小企业常用传感器元件）
  return {
    "压力敏感芯片": { code: "MAT-001", spec: "量程0-100MPa", unit: "个", price: 85.00, supplier: "芯感科技", leadTime: "7天" },
    "信号放大电路": { code: "MAT-002", spec: "4-20mA输出", unit: "套", price: 42.50, supplier: "华强电子", leadTime: "3天" },
    "防护外壳": { code: "MAT-003", spec: "IP67铝合金", unit: "个", price: 68.00, supplier: "精密压铸", leadTime: "10天" },
    "密封件": { code: "MAT-004", spec: "氟橡胶O型圈", unit: "个", price: 2.50, supplier: "密封科技", leadTime: "2天" },
    "信号线缆": { code: "MAT-005", spec: "2米屏蔽线", unit: "根", price: 12.00, supplier: "线缆厂", leadTime: "1天" }
  };
}

// 生成BOM核心逻辑
function generateBOM(productData, materialLib) {
  const { id, name, model, specs } = productData;
  const bomItems = [];
  
  // 根据产品规格匹配物料（简化逻辑：传感器默认用这5类物料）
  const materialKeys = Object.keys(materialLib);
  materialKeys.forEach((key, index) => {
    const material = materialLib[key];
    bomItems.push({
      seq: index + 1,
      materialCode: material.code,
      materialName: key,
      spec: material.spec,
      unit: material.unit,
      quantity: 1, // 默认每个物料用1个，可根据产品复杂度调整
      supplier: material.supplier,
      unitPrice: material.price,
      totalPrice: material.price * 1,
      leadTime: material.leadTime,
      isCritical: index === 0, // 第一个物料设为核心元件
      notes: index === 0 ? "核心元件，需原厂质保" : "标准品"
    });
  });

  // 计算汇总
  const totalCost = bomItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const criticalCount = bomItems.filter(item => item.isCritical).length;

  return {
    bomMeta: {
      bomId: `BOM-${id}-${Date.now().toString().slice(-6)}`,
      productId: id,
      productName: `${name} ${model}`,
      version: "1.0",
      generatedAt: new Date().toISOString(),
      generatedBy: "sme-content-employee",
      forCompany: "中小企业示例"
    },
    materials: bomItems,
    summary: {
      totalMaterials: bomItems.length,
      totalQuantity: bomItems.length,
      totalCost: totalCost,
      criticalMaterialCount: criticalCount,
      estimatedAssemblyTime: "2小时/台"
    },
    notes: "本BOM适用于小批量生产（<100台），批量采购可享9折优惠"
  };
}

// 输出为JSON格式
function outputJSON(bom, productId) {
  const filePath = path.join(outputDir, `BOM_${productId}_${new Date().toISOString().slice(0,10)}.json`);
  fs.writeFileSync(filePath, JSON.stringify(bom, null, 2), 'utf8');
  console.log(`✅ JSON格式BOM已生成：${filePath}`);
  return filePath;
}

// 输出为Markdown格式
function outputMarkdown(bom, productId) {
  const { bomMeta, materials, summary, notes } = bom;
  let md = `# BOM清单 - ${bomMeta.productName}\n\n`;
  md += `## 基础信息\n`;
  md += `- 产品ID：${bomMeta.productId}\n`;
  md += `- 型号：${bomMeta.productName}\n`;
  md += `- 生成日期：${bomMeta.generatedAt.slice(0,10)}\n`;
  md += `- 生成人：${bomMeta.generatedBy}\n\n`;
  
  md += `## 物料清单\n\n`;
  md += `| 序号 | 物料编码 | 物料名称 | 规格型号 | 单位 | 数量 | 供应商 | 备注 |\n`;
  md += `|------|----------|----------|----------|------|------|--------|------|\n`;
  
  materials.forEach(item => {
    md += `| ${item.seq} | ${item.materialCode} | ${item.materialName} | ${item.spec} | ${item.unit} | ${item.quantity} | ${item.supplier} | ${item.notes} |\n`;
  });
  
  md += `\n## 汇总信息\n`;
  md += `- 总物料数：${summary.totalMaterials}\n`;
  md += `- 总成本：¥${summary.totalCost.toFixed(2)}\n`;
  md += `- 核心物料数：${summary.criticalMaterialCount}\n`;
  md += `- 预估组装时间：${summary.estimatedAssemblyTime}\n\n`;
  md += `## 备注\n${notes}\n`;
  
  const filePath = path.join(outputDir, `BOM_${productId}_${new Date().toISOString().slice(0,10)}.md`);
  fs.writeFileSync(filePath, md, 'utf8');
  console.log(`✅ Markdown格式BOM已生成：${filePath}`);
  return filePath;
}

// 主函数
async function main() {
  const productId = process.argv[2];
  const format = process.argv[3] || 'json';
  
  if (!productId) {
    console.error('❌ 请指定产品ID：node scripts/generate-bom.js [productId] [format]');
    process.exit(1);
  }
  
  const productPath = path.join(dataDir, `${productId}.json`);
  if (!fs.existsSync(productPath)) {
    console.error(`❌ 产品数据不存在：${productPath}，请先执行collect-product-data.js`);
    process.exit(1);
  }
  
  const productData = JSON.parse(fs.readFileSync(productPath, 'utf8'));
  const materialLib = loadMaterialLibrary();
  const bom = generateBOM(productData, materialLib);
  
  console.log(`📊 开始生成BOM：${productData.name} ${productData.model}`);
  
  if (format === 'json') {
    outputJSON(bom, productId);
  } else if (format === 'markdown') {
    outputMarkdown(bom, productId);
  } else if (format === 'excel') {
    console.error('❌ Excel格式需安装exceljs：npm install exceljs');
    // 实际Excel生成逻辑可在此补充
  } else {
    console.error('❌ 不支持的格式，可选：json / markdown / excel');
  }
}

main().catch(err => {
  console.error('❌ BOM生成失败：', err.message);
  process.exit(1);
});
