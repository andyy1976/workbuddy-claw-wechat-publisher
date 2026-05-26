# WorkBuddy 模块化架构设计 v2.0

**目标**: 支持独立运行 + 数字员工平台集成
**核心原则**: 高内聚、低耦合、标准化接口、配置驱动

---

## 一、架构总览

### 1.1 当前架构 (Monolithic)
```
server/
├── index.js              // Express 主入口
├── services/
│   ├── scheduler.js      // 定时任务 (混合逻辑)
│   ├── publish-flow.js   // 发布流程 (混合逻辑)
│   └── llm.js           // LLM 调用 (混合逻辑)
└── routes/               // API 路由 (紧耦合)
```

**问题**:
- 无法独立运行单个能力
- 与 Express 紧耦合
- 难以接入数字员工平台
- 配置分散，环境适配困难

---

### 1.2 目标架构 (Modular)

```
workbuddy-modules/                   # 独立模块包
├── @workbuddy/core/                # 核心引擎 (独立运行)
├── @workbuddy/content-generator/    # 内容生成模块
├── @workbuddy/content-checker/      # 内容质检模块
├── @workbuddy/publisher/           # 发布模块
├── @workbuddy/scheduler/           # 调度模块
└── @workbuddy/platform-adapter/    # 平台适配器

digital-employee-platform/           # 数字员工平台
├── orchestrator/                    # 编排引擎
├── employees/
│   ├── content-employee/           # 引用 @workbuddy/content-generator
│   ├── data-employee/              # 数据处理员工
│   └── qa-employee/              # 质检员工
└── message-bus/                   # 消息总线
```

---

## 二、模块设计

### 2.1 核心引擎模块 (`@workbuddy/core`)

**职责**: 提供不依赖 Express 的纯逻辑能力

#### 目录结构
```
packages/core/
├── package.json
├── src/
│   ├── index.js              // 模块入口
│   ├── engine/
│   │   ├── content-engine.js  // 内容生成引擎
│   │   ├── check-engine.js    // 质检引擎
│   │   └── publish-engine.js  // 发布引擎
│   ├── adapters/
│   │   ├── llm-adapter.js    // LLM 适配 (DeepSeek/OpenAI/...)
│   │   ├── cms-adapter.js    // CMS 适配
│   │   └── wechat-adapter.js // 微信适配
│   ├── pipeline/
│   │   ├── methodology-pipeline.js  // 方法论 Pipeline
│   │   └── qa-pipeline.js         // 质检 Pipeline
│   └── utils/
│       ├── config.js          // 配置管理
│       └── logger.js         // 日志
└── config/
    ├── default.js            // 默认配置
    └── schema.js            // 配置校验
```

#### 独立运行示例
```javascript
// packages/core/examples/standalone.js
const { ContentEngine } = require('@workbuddy/core');

async function main() {
  // 1. 初始化引擎 (不依赖 Express)
  const engine = new ContentEngine({
    llm: {
      provider: 'deepseek',
      apiKey: process.env.DEEPSEEK_KEY,
      model: 'deepseek-chat'
    },
    methodology: {
      enabled: true,
      rules: ['threeIronRules', 'emotionArc']
    }
  });

  // 2. 生成内容 (纯函数调用)
  const result = await engine.generate({
    topic: '新能源汽车电池技术',
    keywords: ['电池', '续航', '快充'],
    style: 'professional',
    language: 'zh-CN',
    wordCount: 2000
  });

  console.log('生成结果:', result);
  // {
  //   title: '...',
  //   content: '...',
  //   methodology: { angle: '...', score: 85 },
  //   quality: { aiSmell: 15, readability: 92 }
  // }

  // 3. 质检
  const qaResult = await engine.check(result.content);
  console.log('质检结果:', qaResult);
  // { passed: true, issues: [], score: 92 }
}

main().catch(console.error);
```

---

### 2.2 内容生成模块 (`@workbuddy/content-generator`)

**职责**: 封装内容生成能力，提供标准化接口

#### 接口定义 (TypeScript)
```typescript
// packages/content-generator/src/types.ts

export interface GenerateRequest {
  topic: string;
  keywords: string[];
  style: 'professional' | 'casual' | 'story' | 'technical';
  language: 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR';
  wordCount: number;
  methodology?: {
    enabled: boolean;
    rules: string[];
  };
  output?: {
    toCMS?: boolean;
    toWechat?: boolean;
    toFile?: string;
  };
}

export interface GenerateResponse {
  success: boolean;
  data?: {
    title: string;
    content: string;
    html: string;
    methodology: {
      angle: string;
      score: number;
      reasoning: string;
    };
    quality: {
      aiSmell: number;
      readability: number;
      sentiment: number;
    };
  };
  error?: string;
}

export interface IContentGenerator {
  generate(req: GenerateRequest): Promise<GenerateResponse>;
  check(content: string): Promise<CheckResponse>;
  getStatus(): Promise<StatusResponse>;
}
```

#### 实现
```javascript
// packages/content-generator/src/index.js
const { ContentEngine } = require('@workbuddy/core');

class ContentGenerator {
  constructor(config) {
    this.engine = new ContentEngine(config);
    this.initialized = false;
  }

  async init() {
    await this.engine.init();
    this.initialized = true;
  }

  async generate(req) {
    if (!this.initialized) await this.init();
    
    // 参数校验
    this._validateGenerateRequest(req);
    
    // 调用核心引擎
    const result = await this.engine.generate(req);
    
    // 后处理
    if (req.output?.toCMS) {
      result.cmsId = await this.engine.publishToCMS(result);
    }
    if (req.output?.toWechat) {
      result.wechatMediaId = await this.engine.publishToWechat(result);
    }
    
    return { success: true, data: result };
  }

  async check(content) {
    return await this.engine.check(content);
  }

  async getStatus() {
    return {
      initialized: this.initialized,
      engine: await this.engine.getStatus(),
      config: this.engine.getConfigSummary()
    };
  }

  _validateGenerateRequest(req) {
    if (!req.topic) throw new Error('topic is required');
    if (!req.keywords?.length) throw new Error('keywords is required');
    // ...
  }
}

module.exports = ContentGenerator;
```

---

### 2.3 平台适配器 (`@workbuddy/platform-adapter`)

**职责**: 将 WorkBuddy 模块适配到数字员工平台

#### 适配器接口
```javascript
// packages/platform-adapter/src/adapters/digital-employee-platform.js

/**
 * 数字员工平台适配器
 * 
 * 平台调用方式:
 *   POST /platform/invoke
 *   {
 *     "employeeId": "content-employee",
 *     "action": "generate",
 *     "params": { "topic": "...", "keywords": [...] }
 *   }
 */

const ContentGenerator = require('@workbuddy/content-generator');
const PublishModule = require('@workbuddy/publisher');

class DigitalEmployeePlatformAdapter {
  constructor(platformConfig) {
    this.platformConfig = platformConfig;
    this.employees = new Map();
    this.messageBus = platformConfig.messageBus || 'redis';
  }

  /**
   * 注册员工能力
   */
  async registerEmployee(employeeId, capabilities) {
    this.employees.set(employeeId, {
      id: employeeId,
      capabilities,
      status: 'online',
      lastHeartbeat: Date.now()
    });

    // 注册到平台
    await this._registerToPlatform(employeeId, capabilities);
  }

  /**
   * 平台调用入口
   */
  async invoke(employeeId, action, params) {
    const employee = this.employees.get(employeeId);
    if (!employee) throw new Error(`Employee ${employeeId} not found`);

    // 路由到具体能力
    switch (action) {
      case 'generate':
        return await this._invokeGenerate(employee, params);
      case 'check':
        return await this._invokeCheck(employee, params);
      case 'publish':
        return await this._invokePublish(employee, params);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * 内容生成
   */
  async _invokeGenerate(employee, params) {
    const generator = new ContentGenerator(employee.config);
    const result = await generator.generate(params);
    
    // 发送消息到平台消息总线
    await this._publishMessage('content.generated', {
      employeeId: employee.id,
      result: result.data
    });

    return result;
  }

  /**
   * 注册到平台
   */
  async _registerToPlatform(employeeId, capabilities) {
    const registration = {
      employeeId,
      capabilities,
      endpoint: this.platformConfig.endpoint,
      heartbeatInterval: 30000
    };

    // 调用平台注册 API
    const res = await fetch(`${this.platformConfig.platformUrl}/api/employees/register`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.platformConfig.token}` },
      body: JSON.stringify(registration)
    });

    return res.json();
  }

  /**
   * 发送消息到平台
   */
  async _publishMessage(topic, payload) {
    if (this.messageBus === 'redis') {
      // Redis Pub/Sub
      const redis = require('redis');
      const client = redis.createClient();
      await client.connect();
      await client.publish(topic, JSON.stringify(payload));
      await client.quit();
    } else if (this.messageBus === 'rabbitmq') {
      // RabbitMQ
      // ...
    }
  }
}

module.exports = DigitalEmployeePlatformAdapter;
```

---

### 2.4 独立运行模式 vs 平台集成模式

#### 模式1: 独立运行 (Standalone Mode)
```javascript
// examples/standalone-content-service.js
const { ContentGenerator } = require('@workbuddy/content-generator');
const express = require('express');

async function main() {
  // 1. 初始化模块
  const generator = new ContentGenerator({
    llm: { provider: 'deepseek', apiKey: process.env.DEEPSEEK_KEY },
    methodology: { enabled: true }
  });
  await generator.init();

  // 2. 启动 HTTP 服务 (可选)
  const app = express();
  app.use(express.json());

  app.post('/generate', async (req, res) => {
    try {
      const result = await generator.generate(req.body);
      res.json(result);
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.listen(8080, () => console.log('Standalone service on :8080'));
}

main();
```

#### 模式2: 平台集成模式 (Platform Integration Mode)
```javascript
// examples/platform-integrated-employee.js
const DigitalEmployeePlatformAdapter = require('@workbuddy/platform-adapter');
const { ContentGenerator } = require('@workbuddy/content-generator');

async function main() {
  // 1. 创建适配器
  const adapter = new DigitalEmployeePlatformAdapter({
    platformUrl: process.env.PLATFORM_URL,
    token: process.env.PLATFORM_TOKEN,
    endpoint: 'http://localhost:8080',
    messageBus: 'redis'
  });

  // 2. 注册为内容员工
  await adapter.registerEmployee('content-employee', [
    { action: 'generate', description: '生成内容' },
    { action: 'check', description: '质检内容' },
    { action: 'publish', description: '发布内容' }
  ]);

  // 3. 启动 HTTP 服务 (接收平台调用)
  const app = require('express')();
  app.use(require('express').json());

  app.post('/platform/invoke', async (req, res) => {
    const { employeeId, action, params } = req.body;
    try {
      const result = await adapter.invoke(employeeId, action, params);
      res.json(result);
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.listen(8080, () => console.log('Platform-integrated employee on :8080'));
}

main();
```

---

## 三、改造路线图

### Phase 1: 模块拆分 (Week 1-2)

#### Step 1.1: 抽取核心逻辑
```bash
# 1. 创建模块包
mkdir -p packages/core/src/engine
mkdir -p packages/content-generator/src
mkdir -p packages/platform-adapter/src

# 2. 抽取核心引擎
# 从 server/services/scheduler.js 抽取纯逻辑 → packages/core/src/engine/content-engine.js
# 从 server/services/publish-flow.js 抽取纯逻辑 → packages/core/src/engine/publish-engine.js
# 从 server/services/llm.js 抽取纯逻辑 → packages/core/src/adapters/llm-adapter.js

# 3. 编写单元测试
npm test -- packages/core
```

#### Step 1.2: 标准化接口
```javascript
// 定义标准化接口 (TypeScript)
// packages/core/src/types.ts

export interface IContentEngine {
  generate(params: GenerateParams): Promise<GenerateResult>;
  check(content: string): Promise<CheckResult>;
  getMethodologyAngle(topic: string): Promise<AngleResult>;
}

export interface IPublishEngine {
  publishToCMS(params: PublishParams): Promise<CMSPublishResult>;
  publishToWechat(params: PublishParams): Promise<WechatPublishResult>;
}
```

#### Step 1.3: 配置管理
```javascript
// packages/core/src/utils/config.js
const fs = require('fs');
const path = require('path');

class ConfigManager {
  constructor(configPath) {
    this.configPath = configPath;
    this.config = {};
  }

  load() {
    const env = process.env.NODE_ENV || 'development';
    const baseConfig = require(path.join(this.configPath, 'default.js'));
    const envConfig = require(path.join(this.configPath, `${env}.js`));
    this.config = this._deepMerge(baseConfig, envConfig);
    return this;
  }

  get(key) {
    return key.split('.').reduce((obj, k) => obj?.[k], this.config);
  }

  _deepMerge(target, source) {
    // 深度合并逻辑
  }
}

module.exports = ConfigManager;
```

---

### Phase 2: 平台适配器 (Week 3-4)

#### Step 2.1: 实现平台适配器
```javascript
// packages/platform-adapter/src/adapters/platforms/
├── digital-employee-platform.js   # 数字员工平台
├── openclaw.js                    # OpenClaw 平台
├── dify.js                        # Dify 平台
└── langchain.js                   # LangChain 集成
```

#### Step 2.2: 消息总线集成
```javascript
// packages/platform-adapter/src/message-bus/
├── redis.js          # Redis Pub/Sub
├── rabbitmq.js      # RabbitMQ
├── kafka.js         # Kafka
└── mock.js          # 本地 Mock (开发用)
```

---

### Phase 3: PLM 集成 (Week 5-6)

#### Step 3.1: PLM 适配器
```javascript
// packages/plm-adapter/src/
├── index.js               # 模块入口
├── adapters/
│   ├── sap-plm.js        # SAP PLM
│   ├── siemens-teamcenter.js  # Siemens Teamcenter
│   └── ptc-windchill.js      # PTC Windchill
├── transformers/
│   ├── bom-transformer.js      # BOM 数据转换
│   ├── process-transformer.js  # 工艺数据转换
│   └── quality-transformer.js  # 质量数据转换
└── examples/
    └── generate-from-plm.js   # 从 PLM 数据生成内容
```

#### Step 3.2: PLM 数据驱动生成
```javascript
// examples/generate-from-plm.js
const PLMAdapter = require('@workbuddy/plm-adapter');
const ContentGenerator = require('@workbuddy/content-generator');

async function main() {
  // 1. 连接 PLM 系统
  const plm = new PLMAdapter({
    type: 'sap-plm',
    endpoint: process.env.SAP_PLM_ENDPOINT,
    credentials: {
      username: process.env.SAP_USERNAME,
      password: process.env.SAP_PASSWORD
    }
  });

  // 2. 获取产品数据
  const productData = await plm.getProduct('BATTERY-001');
  // {
  //   id: 'BATTERY-001',
  //   name: '新能源汽车电池',
  //   bom: [...],
  //   process: [...],
  //   quality: [...]
  // }

  // 3. 转换为内容生成参数
  const generator = new ContentGenerator();
  const result = await generator.generate({
    topic: productData.name,
    keywords: plm.extractKeywords(productData),
    style: 'technical',
    language: 'zh-CN',
    wordCount: 3000,
    plmData: productData  // 传入 PLM 数据
  });

  console.log('生成结果:', result);
}

main();
```

---

## 四、部署方案

### 4.1 独立部署 (Docker)
```dockerfile
# packages/content-generator/Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --production

COPY src ./src
COPY config ./config

EXPOSE 8080

CMD ["node", "src/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  content-generator:
    build: ./packages/content-generator
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - DEEPSEEK_KEY=${DEEPSEEK_KEY}
    depends_on:
      - redis
  
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
```

### 4.2 平台集成部署
```yaml
# kubernetes/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: content-employee
spec:
  replicas: 3
  selector:
    matchLabels:
      app: content-employee
  template:
    metadata:
      labels:
        app: content-employee
    spec:
      containers:
      - name: content-employee
        image: workbuddy/content-employee:latest
        ports:
        - containerPort: 8080
        env:
        - name: PLATFORM_URL
          value: "http://digital-employee-platform:3000"
        - name: REDIS_URL
          value: "redis://redis:6379"
```

---

## 五、测试策略

### 5.1 单元测试
```javascript
// packages/core/test/engine/content-engine.test.js
const { ContentEngine } = require('../../src/engine/content-engine');

describe('ContentEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new ContentEngine({ llm: { mock: true } });
  });

  test('generate should return valid result', async () => {
    const result = await engine.generate({
      topic: 'test',
      keywords: ['test'],
      style: 'professional'
    });

    expect(result.success).toBe(true);
    expect(result.data.title).toBeDefined();
    expect(result.data.content).toBeDefined();
  });
});
```

### 5.2 集成测试
```javascript
// packages/content-generator/test/integration/platform.test.js
const DigitalEmployeePlatformAdapter = require('../../src/adapters/platform');

describe('Platform Integration', () => {
  test('should register employee to platform', async () => {
    const adapter = new DigitalEmployeePlatformAdapter({
      platformUrl: 'http://localhost:3000',
      token: 'test-token'
    });

    const result = await adapter.registerEmployee('test-employee', [
      { action: 'generate', description: 'test' }
    ]);

    expect(result.success).toBe(true);
  });
});
```

---

## 六、迁移指南

### 6.1 从 v1.0 迁移到 v2.0

#### Step 1: 安装新架构
```bash
# 1. 安装模块包
npm install @workbuddy/core @workbuddy/content-generator @workbuddy/platform-adapter

# 2. 复制配置文件
cp -r config config.backup
cp packages/core/config/default.js config/
```

#### Step 2: 修改现有代码
```javascript
// 旧代码 (server/services/scheduler.js)
const result = await generateArticle(topic, keywords);

// 新代码 (使用模块化接口)
const ContentGenerator = require('@workbuddy/content-generator');
const generator = new ContentGenerator();
const result = await generator.generate({ topic, keywords });
```

#### Step 3: 测试
```bash
# 运行兼容性测试
npm run test:compatibility

# 逐步迁移
# 1. 先迁移内容生成
# 2. 再迁移发布流程
# 3. 最后迁移调度逻辑
```

---

## 七、总结

### 7.1 核心优势
1. **模块化**: 每个能力独立封装，可单独部署
2. **标准化**: 统一接口，便于集成
3. **灵活性**: 支持独立运行和平台集成两种模式
4. **可测试**: 纯逻辑易于单元测试
5. **可扩展**: 插件式架构，易于添加新能力

### 7.2 下一步行动
1. **本周**: 完成核心引擎抽取 (Phase 1.1)
2. **下周**: 实现标准化接口 (Phase 1.2)
3. **第3周**: 开发平台适配器 (Phase 2)
4. **第5周**: PLM 集成 (Phase 3)

---

**附录**: 
- [模块 API 文档](./api-reference.md)
- [平台集成示例](./platform-examples.md)
- [PLM 适配器开发指南](./plm-adapter-guide.md)
