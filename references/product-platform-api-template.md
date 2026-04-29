# 产品平台API对接模板

## 接口认证配置
在`config/user-config.json`中添加：
```json
{
  "productPlatform": {
    "baseUrl": "https://your-product-platform.com/api/v1",
    "authType": "bearer", // bearer/basic/api-key
    "token": "your-auth-token",
    "timeout": 30000,
    "endpoints": {
      "productList": "/products",
      "productDetail": "/products/{id}",
      "productSearch": "/products/search"
    }
  }
}
```

## 核心接口说明

### 1. 获取产品列表
- **接口**：`GET /products`
- **参数**：
  - `page`：页码（默认1）
  - `limit`：每页数量（默认20）
  - `category`：产品分类（可选）
- **响应示例**：
  ```json
  {
    "code": 0,
    "data": {
      "total": 156,
      "items": [
        {
          "id": "PROD-001",
          "name": "智能工业传感器",
          "model": "ISC-2000",
          "category": "传感器",
          "status": "active"
        }
      ]
    }
  }
  ```

### 2. 获取产品详情
- **接口**：`GET /products/{id}`
- **参数**：产品ID（路径参数）
- **响应示例**：
  ```json
  {
    "code": 0,
    "data": {
      "id": "PROD-001",
      "name": "智能工业传感器",
      "model": "ISC-2000",
      "specs": {
        "精度": "±0.1%",
        "量程": "0-100MPa",
        "输出信号": "4-20mA",
        "防护等级": "IP67"
      },
      "sellingPoints": [
        "工业级防护IP67",
        "支持Modbus RTU协议",
        "宽温工作-40~85℃"
      ],
      "media": {
        "images": ["https://platform.com/imgs/isc-2000-1.jpg"],
        "video": "https://platform.com/videos/isc-2000-demo.mp4"
      },
      "scenarios": ["智能制造", "过程控制"]
    }
  }
  ```

### 3. 产品搜索（可选）
- **接口**：`POST /products/search`
- **请求体**：
  ```json
  {
    "keyword": "传感器",
    "filters": {
      "category": "传感器",
      "priceRange": [100, 500]
    }
  }
  ```

## 待用户提供
1. 实际产品平台API文档（替换上述模板）
2. 认证方式具体参数（token获取方式、有效期）
3. 特殊接口说明（如分页规则、限流策略）
