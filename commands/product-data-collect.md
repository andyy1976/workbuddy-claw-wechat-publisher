---
name: product-data-collect
description: 从产品平台采集产品数据，用于BOM生成与内容创作
---

# 产品数据采集命令

## 功能
对接产品平台API，自动采集产品核心数据：
- 基础信息：名称、型号、规格、参数
- 卖点信息：核心优势、差异化特点
- 媒体资源：产品图片、演示视频链接
- 应用场景：适用行业、典型用例

## 前置条件
1. 已提供产品平台API文档（含接口地址、认证方式）
2. 已在`config/user-config.json`配置产品平台连接信息：
   ```json
   {
     "productPlatform": {
       "apiUrl": "https://your-product-platform.com/api",
       "authToken": "your-auth-token",
       "timeout": 30000
     }
   }
   ```

## 执行流程
1. 读取产品平台认证配置
2. 调用产品列表接口获取所有产品ID
3. 遍历产品ID，调用产品详情接口采集完整数据
4. 数据存储至`data/products/`目录（按产品ID命名JSON文件）
5. 生成产品数据索引`data/product-index.json`

## 输出示例
`data/products/PROD-001.json`:
```json
{
  "id": "PROD-001",
  "name": "智能工业传感器",
  "model": "ISC-2000",
  "specs": {
    "精度": "±0.1%",
    "量程": "0-100MPa",
    "输出信号": "4-20mA"
  },
  "sellingPoints": [
    "工业级防护IP67",
    "支持Modbus RTU协议",
    "宽温工作-40~85℃"
  ],
  "media": {
    "images": ["https://product-platform.com/imgs/isc-2000-1.jpg"],
    "video": "https://product-platform.com/videos/isc-2000-demo.mp4"
  },
  "scenarios": ["智能制造", "过程控制", "设备监测"]
}
```

## 待用户提供
- 产品平台API文档（接口地址、认证方式、请求示例）
- 测试产品ID（用于验证采集流程）
