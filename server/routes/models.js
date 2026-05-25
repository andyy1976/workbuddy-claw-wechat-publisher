const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// 引入 LLM 服务（用于重新加载配置和测试模型）
const llm = require('../services/llm');

// 模型配置文件路径
const configPath = path.join(__dirname, '../config/models.json');

// 确保配置目录存在
const configDir = path.dirname(configPath);
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

// 读取模型配置
function loadModels() {
  if (!fs.existsSync(configPath)) {
    return {};
  }
  const data = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(data);
}

// 保存模型配置
function saveModels(models) {
  fs.writeFileSync(configPath, JSON.stringify(models, null, 2), 'utf8');
}

// GET /api/models/list - 获取已配置的模型列表
router.get('/list', (req, res) => {
  try {
    const models = loadModels();
    res.json({ success: true, data: models });
  } catch (error) {
    console.error('[Models] 加载模型配置失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/models/add - 添加/更新模型配置
router.post('/add', (req, res) => {
  try {
    const { provider, config } = req.body;
    
    if (!provider) {
      return res.status(400).json({ success: false, error: '模型标识不能为空' });
    }
    
    if (!config || !config.key) {
      return res.status(400).json({ success: false, error: 'API Key 不能为空' });
    }
    
    const models = loadModels();
    models[provider] = {
      name: config.name || provider,
      url: config.url || '',
      key: config.key,
      model: config.model || '',
      enabled: config.enabled !== false,
      priority: config.priority || 999,
      description: config.description || ''
    };
    
    saveModels(models);
    
    // 重新加载 LLM 配置
    llm.reloadModels();
    
    res.json({ success: true, message: '模型配置已保存', data: models[provider] });
  } catch (error) {
    console.error('[Models] 保存模型配置失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/models/update - 更新模型配置（别名，功能同 /add）
router.post('/update', (req, res) => {
  try {
    const { provider, config } = req.body;
    
    if (!provider) {
      return res.status(400).json({ success: false, error: '模型标识不能为空' });
    }
    
    if (!config || !config.key) {
      return res.status(400).json({ success: false, error: 'API Key 不能为空' });
    }
    
    const models = loadModels();
    models[provider] = {
      name: config.name || provider,
      url: config.url || '',
      key: config.key,
      model: config.model || '',
      enabled: config.enabled !== false,
      priority: config.priority || 999,
      description: config.description || ''
    };
    
    saveModels(models);
    llm.reloadModels();
    
    res.json({ success: true, message: '模型配置已更新', data: models[provider] });
  } catch (error) {
    console.error('[Models] 更新模型配置失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/models/:provider - 删除模型配置
router.delete('/:provider', (req, res) => {
  try {
    const { provider } = req.params;
    
    if (!provider) {
      return res.status(400).json({ success: false, error: '模型标识不能为空' });
    }
    
    const models = loadModels();
    
    if (!models[provider]) {
      return res.status(404).json({ success: false, error: '模型配置不存在' });
    }
    
    delete models[provider];
    saveModels(models);
    
    // 重新加载 LLM 配置
    llm.reloadModels();
    
    res.json({ success: true, message: '模型配置已删除' });
  } catch (error) {
    console.error('[Models] 删除模型配置失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── 同步选中模型到插件引擎 ───────────────────────────────
// plugins/models.js → plugins/config/ai-providers.json
function syncSelectedModelToPlugin(provider, modelConfig) {
    try {
        const pluginAiPath = path.join('D:\\', '.qclaw', 'workspace', 'wechat-publisher-plugin', 'config', 'ai-providers.json');
        if (!fs.existsSync(pluginAiPath)) return false;
        
        const aiConfig = JSON.parse(fs.readFileSync(pluginAiPath, 'utf8'));
        
        // 更新 selected provider 的 priority=1，其他全推高
        let found = false;
        aiConfig.providers.forEach(p => {
            if (p.name === provider) {
                p.enabled = true;
                p.priority = 1;
                p.baseUrl = modelConfig.url || p.baseUrl;
                p.apiKey = modelConfig.key;
                p.models = [modelConfig.model || p.models?.[0] || 'gpt-4o'];
                found = true;
                console.log(`✅ 同步选中模型到插件: ${provider}`);
            } else {
                p.priority = Math.max(p.priority, 99);
            }
        });
        
        if (found) {
            fs.writeFileSync(pluginAiPath, JSON.stringify(aiConfig, null, 2), 'utf8');
            return true;
        }
        return false;
    } catch (e) {
        console.error('❌ 同步插件配置失败:', e.message);
        return false;
    }
}

// POST /api/models/select - 选中的模型，同步到引擎配置
// ── 切换模型启用/禁用 ─────────────────────────────────
router.post('/toggle', (req, res) => {
    try {
        const { provider } = req.body;
        if (!provider) return res.status(400).json({ success: false, message: '缺少 provider' });
        
        const configPath = path.join(__dirname, '../config/models.json');
        if (!fs.existsSync(configPath)) {
            return res.status(404).json({ success: false, message: '模型配置文件不存在' });
        }
        
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (!config[provider]) {
            return res.status(404).json({ success: false, message: '模型不存在: ' + provider });
        }
        
        config[provider].enabled = !config[provider].enabled;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        
        console.log('[Models] ' + provider + ' -> ' + (config[provider].enabled ? '启用' : '禁用'));
        res.json({ success: true, provider, enabled: config[provider].enabled });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});
router.post('/select', (req, res) => {
    try {
        const { provider } = req.body;
        if (!provider) return res.status(400).json({ success: false, error: 'provider不能为空' });
        
        const models = loadModels();
        const cfg = models[provider];
        if (!cfg) return res.status(404).json({ success: false, error: '模型不存在' });
        if (!cfg.enabled) return res.status(400).json({ success: false, error: '模型未启用' });
        
        // 标记 selected
        Object.keys(models).forEach(k => models[k].selected = (k === provider));
        saveModels(models);
        
        // 同步到插件 ai-providers.json
        const synced = syncSelectedModelToPlugin(provider, cfg);
        
        res.json({ success: true, message: `已选择 ${cfg.name}，${synced ? '已同步到引擎配置' : '插件同步失败(继续可用)'}`, selected: provider });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/models/test - 测试模型连接
router.post('/test', async (req, res) => {
  try {
    const { provider, prompt } = req.body;
    
    if (!provider) {
      return res.status(400).json({ success: false, error: '模型标识不能为空' });
    }
    
    const models = loadModels();
    const modelConfig = models[provider];
    
    if (!modelConfig) {
      return res.status(404).json({ success: false, error: '模型配置不存在' });
    }
    
    if (!modelConfig.enabled) {
      return res.status(400).json({ success: false, error: '模型未启用' });
    }
    
    // 使用 LLM 服务进行测试调用
    const testPrompt = prompt || '请回复"连接测试成功"以确认模型正常工作。';
    
    const response = await llm.callLLM([
      { role: 'user', content: testPrompt }
    ], { provider });
    
    res.json({ 
      success: true, 
      message: '模型连接测试成功',
      response: response,
      provider: provider
    });
  } catch (error) {
    console.error('[Models] 测试模型连接失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
