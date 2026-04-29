/**
 * 产品平台数据采集脚本
 * 功能：从产品平台API采集产品数据，存储至data/products/目录
 * 用法：node scripts/collect-product-data.js [productId]（不指定则采集全部）
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mysql = require('mysql2/promise');

// 配置文件路径
const configPath = path.join(__dirname, '../config/user-config.json');
const dataDir = path.join(__dirname, '../data/products');
const indexpath = path.join(__dirname, '../data/product-index.json');

// 确保数据目录存在
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 读取配置
let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
  console.error('❌ 配置文件读取失败：', err.message);
  process.exit(1);
}

const { productPlatform } = config;
if (!productPlatform || !productPlatform.apiUrl) {
  console.error('❌ 请先在config/user-config.json配置productPlatform');
  process.exit(1);
}

// 创建axios实例
const apiClient = axios.create({
  baseURL: productPlatform.apiUrl,
  timeout: productPlatform.timeout || 30000,
  headers: {
    'Authorization': `Bearer ${productPlatform.authToken || ''}`,
    'Content-Type': 'application/json'
  }
});

// 采集单个产品详情
async function fetchProductDetail(productId) {
  try {
    const response = await apiClient.get(`/products/${productId}`);
    if (response.data.code === 0) {
      const productData = response.data.data;
      const filePath = path.join(dataDir, `${productId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(productData, null, 2), 'utf8');
      console.log(`✅ 采集成功：${productId} → ${filePath}`);
      return productData;
    } else {
      console.error(`❌ 采集失败[${productId}]：`, response.data.message);
      return null;
    }
  } catch (err) {
    console.error(`❌ 请求失败[${productId}]：`, err.message);
    return null;
  }
}

// 采集全部产品列表
async function fetchAllProducts() {
  try {
    const response = await apiClient.get('/products', {
      params: { page: 1, limit: 1000 }
    });
    if (response.data.code === 0) {
      return response.data.data.items || [];
    } else {
      console.error('❌ 获取产品列表失败：', response.data.message);
      return [];
    }
  } catch (err) {
    console.error('❌ 请求产品列表失败：', err.message);
    return [];
  }
}

// 更新产品索引
function updateProductIndex(products) {
  const index = products.map(p => ({
    id: p.id,
    name: p.name,
    model: p.model,
    category: p.category,
    updatedAt: new Date().toISOString()
  }));
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
  console.log(`✅ 产品索引已更新：${indexPath}`);
}

// 主函数
async function main() {
  const targetProductId = process.argv[2];
  
  if (targetProductId) {
    // 采集单个产品
    await fetchProductDetail(targetProductId);
  } else {
    // 采集全部产品
    console.log('📦 开始采集全部产品...');
    const products = await fetchAllProducts();
    console.log(`📊 共找到${products.length}个产品`);
    
    const collected = [];
    for (const product of products) {
      const data = await fetchProductDetail(product.id);
      if (data) collected.push(data);
    }
    
    updateProductIndex(collected);
    console.log(`✅ 采集完成：成功${collected.length}/${products.length}`);
  }
}

main().catch(err => {
  console.error('❌ 脚本执行失败：', err.message);
  process.exit(1);
});
