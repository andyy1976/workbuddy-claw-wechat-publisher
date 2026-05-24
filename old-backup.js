
        const API = '';
        let sessionStats = { generated: 0, deai: 0, published: 0 };

        // ── Navigation ─────────────────────────────
        function navigateTo(page, data) {
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            const pageEl = document.getElementById('page-' + page);
            if (pageEl) pageEl.classList.add('active');
            document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');

            const titles = { dashboard:'工作台', generate:'内容生成', deaiify:'去AI味优化', publish:'一键发布', product:'产品数据中心', style:'风格系统', cms:'CMS管理' };
            document.getElementById('pageTitle').textContent = titles[page] || page;

            // Auto-fill deaiify
            if (page === 'deaiify' && data) {
                document.getElementById('deaiInput').value = data;
            }

            // Load page data
            if (page === 'product') loadProductData();
            if (page === 'style') loadStyles();
            if (page === 'cms') loadCMS();
            if (page === 'generate') loadProductOptions();
            if (page === 'models') loadModelList();
        }

        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => navigateTo(item.dataset.page));
        });

        // Section tabs
        document.querySelectorAll('.section-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const parent = tab.closest('.page');
                parent.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                parent.querySelectorAll('[id^="tab-"]').forEach(p => {
                    if (p.id !== 'tab-' + tab.dataset.tab) p.style.display = 'none';
                });
                const target = document.getElementById('tab-' + tab.dataset.tab);
                if (target) target.style.display = 'block';
            });
        });

        // ── Toast ──────────────────────────────────
        function showToast(msg, type = 'success') {
            const t = document.getElementById('toast');
            t.textContent = msg;
            t.className = 'toast ' + type;
            setTimeout(() => t.classList.add('show'), 10);
            setTimeout(() => t.classList.remove('show'), 3000);
        }

        // ── Health ─────────────────────────────────
        async function checkHealth() {
            try {
                const r = await fetch(API + '/api/health');
                const d = await r.json();
                document.getElementById('serverStatus').textContent = '运行中 (' + Math.round(d.uptime) + 's)';
                showToast('服务正常 v' + d.version);
            } catch (e) {
                document.getElementById('serverStatus').textContent = '离线';
                showToast('服务未启动,请运行: node server/index.js', 'error');
            }
        }

        // ── Generate ───────────────────────────────
        async function generateContent() {
            const topic = document.getElementById('genTopic').value.trim();
            if (!topic) return showToast('请输入内容主题', 'error');

            // Get selected platforms
            const platforms = Array.from(document.querySelectorAll('input[name="genPlatform"]:checked')).map(cb => cb.value);
            if (platforms.length === 0) return showToast('请至少选择一个目标平台', 'error');

            const btn = document.getElementById('btnGenerate');
            btn.disabled = true;
            document.getElementById('genLoading').style.display = 'flex';
            document.getElementById('genOutput').style.display = 'none';

            try {
                const r = await fetch(API + '/api/content/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        topic,
                        style: document.getElementById('genStyle').value,
                        platform: platforms[0],  // Generate for first selected platform
                        platforms: platforms,  // Send all selected platforms
                        productId: document.getElementById('genProductId').value || null,
                        context: document.getElementById('genContext').value,
                        wordCount: parseInt(document.getElementById('genWordCount').value) || 2000
                    })
                });
                const d = await r.json();

                if (d.success) {
                    document.getElementById('genContent').textContent = d.data.content;
                    document.getElementById('genTitles').textContent = d.data.titles;
                    document.getElementById('genMeta').textContent = JSON.stringify(d.data.metadata, null, 2);
                    document.getElementById('genOutput').style.display = 'grid';
                    sessionStats.generated++;
                    updateStats();
                    showToast('内容生成成功!');

                    // AUTO-PUBLISH to all selected platforms
                    if (platforms.length > 0) {
                        showToast(`开始自动发布到 ${platforms.length} 个平台...`);
                        // Fill pubTitle and pubContent
                        const title = d.data.titles.split('\n')[0].replace(/^\d+[.、\)]\s*/, '').trim() || topic;
                        const content = d.data.content;
                        
                        document.getElementById('pubTitle').value = title;
                        document.getElementById('pubContent').value = content;
                        // Check the same platforms in pubPlatform
                        document.querySelectorAll('input[name="pubPlatform"]').forEach(cb => {
                            cb.checked = platforms.includes(cb.value);
                        });
                        // Auto-publish (with delay to let UI update)
                        setTimeout(() => publishToMultiplePlatforms(title, content), 500);
                    }
                } else {
                    showToast(d.message || '生成失败', 'error');
                }
            } catch (e) {
                showToast('请求失败: ' + e.message, 'error');
            } finally {
                btn.disabled = false;
                document.getElementById('genLoading').style.display = 'none';
            }
        }

        // ── DeAIify ────────────────────────────────
        async function deaiifyContent() {
            const content = document.getElementById('deaiInput').value.trim();
            if (!content) return showToast('请输入或粘贴需要优化的内容', 'error');

            const btn = document.getElementById('btnDeAI');
            btn.disabled = true;
            document.getElementById('deaiOutput').textContent = '';
            document.getElementById('deaiLoading').style.display = 'block';

            try {
                const r = await fetch(API + '/api/content/deaiify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content,
                        intensity: document.getElementById('deaiIntensity').value
                    })
                });
                const d = await r.json();

                if (d.success) {
                    document.getElementById('deaiOutput').textContent = d.data.optimized;
                    sessionStats.deai++;
                    updateStats();
                    showToast('去AI味完成!');
                } else {
                    showToast(d.message || '优化失败', 'error');
                }
            } catch (e) {
                showToast('请求失败: ' + e.message, 'error');
            } finally {
                btn.disabled = false;
                document.getElementById('deaiLoading').style.display = 'none';
            }
        }

        // ── Publish ────────────────────────────────
        async function publishToCMS() {
            const title = document.getElementById('pubTitle').value.trim();
            const content = document.getElementById('pubContent').value.trim();
            if (!title || !content) return showToast('请填写标题和内容', 'error');

            try {
                const r = await fetch(API + '/api/cms/push', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title,
                        content,
                        categoryId: parseInt(document.getElementById('pubCategory').value),
                        source: document.getElementById('pubSource').value
                    })
                });
                const d = await r.json();
                if (d.success) {
                    sessionStats.published++;
                    updateStats();
                    showToast('发布成功!ID: ' + (d.data?.articleId || ''));
                } else {
                    showToast(d.message || '发布失败', 'error');
                }
            } catch (e) {
                showToast('请求失败: ' + e.message, 'error');
            }
        }

        function pushToCMSFromGenerate() {
            const content = document.getElementById('genContent').textContent;
            const titles = document.getElementById('genTitles').textContent;
            const title = titles.split('\n')[0].replace(/^\d+[.、\)]\s*/, '').trim() || document.getElementById('genTopic').value;
            document.getElementById('pubTitle').value = title;
            document.getElementById('pubContent').value = content;
            
            // Get selected platforms from generation page
            const platforms = Array.from(document.querySelectorAll('input[name="genPlatform"]:checked')).map(cb => cb.value);
            
            // Check the same platforms in publish page
            document.querySelectorAll('input[name="pubPlatform"]').forEach(cb => {
                cb.checked = platforms.includes(cb.value);
            });
            
            navigateTo('publish');
            showToast('内容已带入发布页，开始发布...');
            
            // Auto-publish to all selected platforms
            if (platforms.length > 0) {
                setTimeout(() => publishToMultiplePlatforms(), 500);
            }
        }

        async function autoMatchCategory() {
            const title = document.getElementById('pubTitle').value;
            if (!title) return showToast('请先填写标题', 'error');

            try {
                const r = await fetch(API + '/api/cms/match-category', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, content: document.getElementById('pubContent').value })
                });
                const d = await r.json();
                if (d.success) {
                    document.getElementById('pubCategory').value = d.data.id;
                    showToast('推荐栏目: ' + d.data.name);
                }
            } catch (e) {
                showToast('匹配失败', 'error');
            }
        }

        async function previewContent() {
            const content = document.getElementById('pubContent').value;
            if (!content) return;
            try {
                const r = await fetch(API + '/api/publish/preview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content })
                });
                const d = await r.json();
                if (d.success) {
                    const w = window.open('', '_blank');
                    w.document.write(d.data.html);
                    w.document.close();
                }
            } catch (e) {
                showToast('预览失败', 'error');
            }
        }

        async function batchPublish() {
            const input = document.getElementById('batchInput').value.trim();
            if (!input) return showToast('请输入文章列表', 'error');

            const lines = input.split('\n').filter(l => l.trim());
            const articles = lines.map(line => {
                const [title, cat] = line.split('|').map(s => s.trim());
                return { title, categoryId: cat ? parseInt(cat) : null, content: '<p>' + title + '</p><p>待填充详细内容...</p>', status: 1 };
            });

            try {
                const r = await fetch(API + '/api/publish/batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ articles })
                });
                const d = await r.json();
                if (d.success) {
                    sessionStats.published += d.data.success;
                    updateStats();
                    showToast(`推送完成: ${d.data.success}成功 / ${d.data.failed}失败`);
                }
            } catch (e) {
                showToast('批量推送失败: ' + e.message, 'error');
            }
        }

        // ── Product Data ───────────────────────────
        async function loadProductData() {
            try {
                const r = await fetch(API + '/api/product/__all__');
                const d = await r.json();
                if (!d.success) return;

                const { bom, processes, quality, contentHints, advantages } = d.data;

                document.getElementById('bomCount').textContent = Object.keys(bom).length;
                document.getElementById('procCount').textContent = processes.length;
                document.getElementById('qualCount').textContent = Object.keys(quality).length;
                document.getElementById('advCount').textContent = advantages?.length || 0;

                // Advantages
                const advEl = document.getElementById('productAdvantages');
                if (advantages?.length) {
                    advEl.innerHTML = advantages.map(a => `
                        <div style="margin-bottom:12px;">
                            <div class="fw-600" style="color:var(--accent2)">${a.title}</div>
                            <div style="font-size:13px; margin:4px 0;">${a.detail}</div>
                            <div class="text-sm">${a.data.join(' · ')}</div>
                        </div>
                    `).join('');
                }

                // BOM Table
                document.getElementById('bomTable').innerHTML = '<table class="data-table"><thead><tr><th>物料名称</th><th>编码</th><th>分类</th><th>规格</th><th>单价</th><th>供应商</th><th>交期</th><th>核心</th></tr></thead><tbody>' +
                    Object.entries(bom).map(([name, v]) => `<tr><td>${name}</td><td>${v.code}</td><td>${v.category}</td><td>${v.spec}</td><td>¥${v.price}</td><td>${v.supplier}</td><td>${v.leadTime}天</td><td>${v.critical ? '⭐' : ''}</td></tr>`).join('') +
                    '</tbody></table>';

                // Process Table
                document.getElementById('processTable').innerHTML = '<table class="data-table"><thead><tr><th>工序ID</th><th>名称</th><th>工位</th><th>节拍(s)</th><th>良率</th><th>人数</th><th>设备</th></tr></thead><tbody>' +
                    processes.map(p => `<tr><td>${p.id}</td><td>${p.name}</td><td>${p.station}</td><td>${p.cycleTime}</td><td>${p.yield}%</td><td>${p.operator}</td><td>${p.equipment}</td></tr>`).join('') +
                    '</tbody></table>';

                // Quality Table
                document.getElementById('qualityTable').innerHTML = '<table class="data-table"><thead><tr><th>项目</th><th>标准/内容</th></tr></thead><tbody>' +
                    Object.entries(quality).map(([k, v]) => `<tr><td>${k}</td><td>${typeof v === 'object' ? JSON.stringify(v) : v}</td></tr>`).join('') +
                    '</tbody></table>';

            } catch (e) {
                console.log('Product data load error:', e);
            }
        }

        async function loadProductOptions() {
            try {
                const r = await fetch(API + '/api/product/list');
                const d = await r.json();
                const select = document.getElementById('genProductId');
                // Keep first option
                while (select.options.length > 1) select.remove(1);
                if (d.success && d.data.length) {
                    d.data.forEach(p => {
                        const opt = document.createElement('option');
                        opt.value = p.id || p.name;
                        opt.textContent = p.name || p.id;
                        select.appendChild(opt);
                    });
                }
            } catch (e) {}
        }

        // ── Styles ─────────────────────────────────
        async function loadStyles() {
            try {
                const r = await fetch(API + '/api/style/list');
                const d = await r.json();
                if (!d.success) return;

                const grid = document.getElementById('styleGrid');
                grid.innerHTML = Object.values(d.data.styles).map(s => `
                    <div class="style-card" onclick="selectStyle('${s.id}')">
                        <div class="name">${s.id === 'khazix' ? '🔥 ' : ''}${s.name}</div>
                        <div class="desc">${s.description}</div>
                        <div class="text-sm mb-md">${s.features.map(f => '<span class="tag">' + f + '</span> ').join('')}</div>
                        <div class="example">"${s.example}"</div>
                    </div>
                `).join('');

                const pgrid = document.getElementById('platformGrid');
                pgrid.innerHTML = Object.entries(d.data.platforms).map(([k, v]) => `
                    <div class="style-card">
                        <div class="name">${v.name}</div>
                        <div class="desc">${v.wordRange} · ${v.style}</div>
                    </div>
                `).join('');

                // Anti-AI rules
                const gr = await fetch(API + '/api/style/guide');
                const gd = await gr.json();
                if (gd.success) {
                    document.getElementById('antiAIRules').innerHTML = '<ul style="padding-left:20px; line-height:2;">' +
                        gd.data.antiAIRules.map(r => '<li>' + r + '</li>').join('') +
                        '</ul>';
                }
            } catch (e) {}
        }

        function selectStyle(id) {
            document.getElementById('genStyle').value = id;
            showToast('已选择风格: ' + document.getElementById('genStyle').selectedOptions[0].textContent);
        }

        // ── CMS ────────────────────────────────────
        async function loadCMS() {
            try {
                const r = await fetch(API + '/api/cms/categories');
                const d = await r.json();
                if (d.success) {
                    const cats = d.data;
                    document.getElementById('cmsCatCount').textContent = Object.keys(cats).length;
                    document.getElementById('cmsStatus').textContent = d.source === 'config' ? '✅ 正常' : '⚠️ 降级';
                    document.getElementById('cmsCategories').innerHTML = '<table class="data-table"><thead><tr><th>ID</th><th>栏目名</th><th>关键词</th></tr></thead><tbody>' +
                        Object.entries(cats).map(([id, v]) => `<tr><td>${id}</td><td>${v.name}</td><td>${v.keywords.join(', ')}</td></tr>`).join('') +
                        '</tbody></table>';
                }
            } catch (e) {
                document.getElementById('cmsStatus').textContent = '❌ 离线';
            }
        }

        // ── Utils ──────────────────────────────────
        function copyText(id) {
            const text = document.getElementById(id).textContent;
            navigator.clipboard.writeText(text).then(() => showToast('已复制到剪贴板'));
        }

        function updateStats() {
            document.getElementById('statGenerated').textContent = sessionStats.generated;
            document.getElementById('statDeAI').textContent = sessionStats.deai;
            document.getElementById('statPublished').textContent = sessionStats.published;
        }

        // ── Chat ────────────────────────────────────
        async function sendMessage() {
            const input = document.getElementById('chatInput');
            const msg = input.value.trim();
            if (!msg) return;

            const messagesDiv = document.getElementById('chatMessages');

            // Add user message
            const userDiv = document.createElement('div');
            userDiv.style.cssText = 'margin-bottom:12px; padding:10px 14px; background:var(--accent); color:#fff; border-radius:8px; max-width:80%; margin-left:auto; text-align:right;';
            userDiv.textContent = msg;
            messagesDiv.appendChild(userDiv);

            input.value = '';

            // Add loading
            const loadingDiv = document.createElement('div');
            loadingDiv.id = 'chatLoading';
            loadingDiv.style.cssText = 'margin-bottom:12px; color:var(--text2); font-size:12px;';
            loadingDiv.innerHTML = '<span class="spinner" style="display:inline-block; width:12px; height:12px; border:2px solid var(--border); border-top-color:var(--accent); border-radius:50%; animation:spin .8s linear infinite; margin-right:6px;"></span>思考中...';
            messagesDiv.appendChild(loadingDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;

            try {
                const model = document.getElementById('chatModel').value || '';
                const r = await fetch(API + '/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: msg, model: model || undefined })
                });
                const d = await r.json();

                // Remove loading
                loadingDiv.remove();

                if (d.success) {
                    const botDiv = document.createElement('div');
                    botDiv.style.cssText = 'margin-bottom:12px; padding:10px 14px; background:var(--surface2); border-radius:8px; max-width:80%; color:var(--text); line-height:1.7;';
                    botDiv.textContent = d.data.reply;
                    messagesDiv.appendChild(botDiv);
                } else {
                    showToast(d.message || '发送失败', 'error');
                }
            } catch (e) {
                loadingDiv.remove();
                showToast('请求失败: ' + e.message, 'error');
            }

            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        function clearChat() {
            if (!confirm('确定清空所有对话记录?')) return;
            document.getElementById('chatMessages').innerHTML = '<div style="margin-bottom:12px; padding:10px 14px; background:var(--surface2); border-radius:8px; max-width:80%; color:var(--text);">👋 你好!我是 WorkBuddy 智能助手。有什么可以帮你?</div>';
        }

        function handleChatKeydown(event) {
            if (event.key === 'Enter' && event.ctrlKey) {
                event.preventDefault();
                sendMessage();
            }
        }

        async function loadModels() {
            try {
                const r = await fetch(API + '/api/models/list');
                const d = await r.json();
                const select = document.getElementById('chatModel');
                // Keep first option
                while (select.options.length > 1) select.remove(1);
                if (d.success && d.data.length) {
                    d.data.forEach(m => {
                        const opt = document.createElement('option');
                        opt.value = m.id || m.name;
                        opt.textContent = (m.type === 'anonymous' ? '匿名 - ' : '') + (m.name || m.id);
                        select.appendChild(opt);
                    });
                    showToast('模型列表已更新');
                }
            } catch (e) {
                showToast('加载模型失败', 'error');
            }
        }

        // ── Model Config (Simplified) ──────────────────
        async function saveApiKey() {
            const modelId = document.getElementById('configModelSelect').value;
            if (!modelId) return showToast('请选择模型', 'error');

            const apiKey = document.getElementById('configApiKey').value.trim();
            if (!apiKey) return showToast('请填写 API Key', 'error');

            try {
                const r = await fetch(API + '/api/models/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        provider: modelId,
                        config: {
                            key: apiKey,
                            enabled: true
                        }
                    })
                });
                const d = await r.json();
                if (d.success) {
                    showToast('配置已保存,模型已启用');
                    document.getElementById('configApiKey').value = '';
                    loadModelList();
                } else {
                    showToast(d.message || '保存失败', 'error');
                }
            } catch (e) {
                showToast('保存失败: ' + e.message, 'error');
            }
        }

        async function testConnection() {
            const modelId = document.getElementById('configModelSelect').value;
            if (!modelId) return showToast('请选择模型', 'error');

            const apiKey = document.getElementById('configApiKey').value.trim();
            if (!apiKey) return showToast('请填写 API Key', 'error');

            const resultDiv = document.getElementById('testResult');
            resultDiv.style.display = 'block';
            resultDiv.textContent = '测试中...';

            try {
                const r = await fetch(API + '/api/models/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        provider: modelId,
                        config: {
                            key: apiKey
                        },
                        prompt: '你好,请回复"连接成功"'
                    })
                });
                const d = await r.json();
                if (d.success) {
                    resultDiv.textContent = '✅ ' + (d.data.reply || '连接成功');
                    showToast('模型测试成功');
                } else {
                    resultDiv.textContent = '❌ 测试失败: ' + (d.message || '未知错误');
                    showToast('模型测试失败', 'error');
                }
            } catch (e) {
                resultDiv.textContent = '❌ 测试失败: ' + e.message;
                showToast('测试失败: ' + e.message, 'error');
            }
        }

        async function loadModelList() {
            try {
                const r = await fetch(API + '/api/models/list');
                const d = await r.json();

                console.log('API Response:', d);

                // Fill dropdown
                const select = document.getElementById('configModelSelect');
                select.innerHTML = '<option value="">-- 请选择模型 --</option>';

                // Fill table
                const listEl = document.getElementById('modelList');

                // Handle various response formats
                let models = [];

                // Handle _selected field and object format
                const selectedModel = d.data._selected || null;
                let rawData = d.data;
                if (d.data && typeof d.data === 'object' && !Array.isArray(d.data) && !d.data._selected) {
                    rawData = d.data;
                }

                if (Array.isArray(d.data)) {
                    models = d.data;
                } else if (d.data && typeof d.data === 'object' && !Array.isArray(d.data)) {
                    // {deepseek:{...}, volcengine:{...}} → extract _selected + array
                    models = Object.entries(d.data)
                        .filter(([k]) => k !== '_selected')
                        .map(([id, model]) => ({ id, ...model }));
                }

                // Show currently selected model badge
                const badge = document.getElementById('currentModelBadge');
                const nameEl = document.getElementById('currentModelName');
                if (badge && nameEl && selectedModel) {
                    const sel = models.find(m => m.id === selectedModel);
                    nameEl.textContent = sel ? `${sel.name} (${selectedModel})` : selectedModel;
                    badge.style.display = 'block';
                }

                if (!models.length) {
                    listEl.innerHTML = '';
                    document.getElementById('modelListEmpty').style.display = 'block';
                    return;
                }

                // Build table rows
                let tableHtml = '';
                models.forEach((m) => {
                    const isSelected = (m.id === selectedModel);
                    const rowStyle = isSelected ? 'background:rgba(76,175,80,0.08);' : '';
                    tableHtml += `<tr style="${rowStyle}">
                        <td>${m.name || '-'}${isSelected ? ' <span style="color:var(--success);font-size:11px;">★ 当前</span>' : ''}</td>
                        <td style="font-size:11px;color:var(--text2);max-width:180px;overflow:hidden;text-overflow:ellipsis;">${m.url || m.baseUrl || '-'}</td>
                        <td>${m.priority || 10}</td>
                        <td>${m.enabled ? '<span style="color:var(--success);">启用</span>' : '<span style="color:var(--danger);">禁用</span>'}</td>
                        <td>
                            ${!isSelected && m.enabled ? `<button class="btn btn-sm btn-success" onclick="selectModel('${(m.id||'').replace(/'/g,"\\'")}')">选用</button> ` : ''}
                            <button class="btn btn-sm" onclick="toggleModel('${(m.id||'').replace(/'/g,"\\'")}')">${m.enabled ? '禁用' : '启用'}</button>
                            <button class="btn btn-sm" onclick="testModelById('${(m.id||'').replace(/'/g,"\\'")}')">测试</button>
                        </td>
                    </tr>`;
                });

                listEl.innerHTML = tableHtml;
                document.getElementById('modelListEmpty').style.display = 'none';

            } catch (e) {
                console.error('loadModelList error:', e);
                const listEl = document.getElementById('modelList');
                if (listEl) listEl.innerHTML = '';
                const emptyDiv = document.getElementById('modelListEmpty');
                if (emptyDiv) {
                    emptyDiv.textContent = '加载失败: ' + e.message;
                    emptyDiv.style.display = 'block';
                }
                showToast('加载模型列表失败: ' + e.message, 'error');
            }
        }

        async function toggleModel(id) {
            try {
                const r = await fetch(API + '/api/models/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                });
                const d = await r.json();
                if (d.success) {
                    showToast('模型状态已切换');
                    loadModelList();
                } else {
                    showToast(d.message || '操作失败', 'error');
                }
            } catch (e) {
                showToast('操作失败: ' + e.message, 'error');
            }
        }

        async function testModelById(id) {
            try {
                const r = await fetch(API + '/api/models/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        provider: id,
                        prompt: '你好，请介绍一下自己'
                    })
                });
                const d = await r.json();
                if (d.success) {
                    showToast('模型测试成功 ✅');
                } else {
                    showToast(d.message || '测试失败', 'error');
                }
            } catch (e) {
                showToast('测试失败: ' + e.message, 'error');
            }
        }

        // 选用模型：同步到引擎 ai-providers.json
        async function selectModel(id) {
            try {
                const r = await fetch(API + '/api/models/select', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider: id })
                });
                const d = await r.json();
                if (d.success) {
                    showToast(d.message || '模型已选用，引擎配置已同步');
                    loadModelList();  // 刷新列表
                } else {
                    showToast(d.message || '选用失败', 'error');
                }
            } catch (e) {
                showToast('选用失败: ' + e.message, 'error');
            }
        }

        // editModel function removed - UI simplified to configModelSelect + configApiKey only
        // Users now select model from dropdown and fill API Key

        // deleteModel function removed - users should disable models instead of deleting
        // To remove a model from list, set enabled=false

        // Load model list when page loads
        document.addEventListener('DOMContentLoaded', () => {
            loadModelList();
        });

        // ── Init ───────────────────────────────────
        checkHealth();

        // Fix: product/:id route for __all__
        // The product list endpoint should work, but for the full data we need a different approach
        // Let's add a fallback

        // ── Multi-Platform Publish ─────────────────────
        async function publishToMultiplePlatforms(title, content) {
            // If arguments are provided, use them; otherwise read from form
            if (!title) title = document.getElementById('pubTitle').value.trim();
            if (!content) content = document.getElementById('pubContent').value.trim();
            
            if (!title || !content) return showToast('请填写标题和内容', 'error');
            
            // Get selected platforms
            const platforms = Array.from(document.querySelectorAll('input[name="pubPlatform"]:checked')).map(cb => cb.value);
            if (platforms.length === 0) return showToast('请至少选择一个平台', 'error');
            
            showToast(`开始发布到 ${platforms.length} 个平台...`);
            
            const results = [];
            
            for (const platform of platforms) {
                try {
                    let result;
                    switch (platform) {
                        case 'cms':
                            result = await publishToCMSOnly(title, content);
                            break;
                        case 'wechat':
                            result = await publishToWechat(title, content);
                            break;
                        case 'xiaohongshu':
                            result = await publishToXiaohongshu(title, content);
                            break;
                        case 'douyin':
                            result = await publishToDouyin(title, content);
                            break;
                    }
                    results.push({ platform, success: true, data: result });
                } catch (e) {
                    results.push({ platform, success: false, error: e.message });
                }
            }
            
            // Show results
            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;
            
            showToast(`发布完成: ${successCount}成功 / ${failCount}失败`);
            
            if (successCount > 0) {
                sessionStats.published += successCount;
                updateStats();
            }
        }

        async function publishToCMSOnly(title, content) {
            // 支持两种调用方式：传参数 / 读表单
            if (!title || !content) {
                title = document.getElementById('pubTitle').value.trim();
                content = document.getElementById('pubContent').value.trim();
                if (!title || !content) throw new Error('缺少标题或内容');
            }
            
            // 读取平台选择
            const toWechat = document.getElementById('pubPlatformWechat')?.checked;
            const toCMS = document.getElementById('pubPlatformCMS')?.checked;
            
            const r = await fetch(API + '/api/cms/push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    content,
                    categoryId: parseInt(document.getElementById('pubCategory').value) || undefined,
                    source: document.getElementById('pubSource').value || 'WorkBuddy',
                    toWechat: !!toWechat  // 同步推微信草稿箱
                })
            });
            const d = await r.json();
            if (d.success) {
                const result = { articleId: d.data?.articleId };
                if (d.data?.wechat?.articleId) {
                    result.wechatArticleId = d.data.wechat.articleId;
                    showToast('CMS+微信草稿箱发布成功！');
                } else if (toWechat) {
                    showToast('CMS发布成功（微信未配置或失败）', 'error');
                }
                return result;
            } else {
                throw new Error(d.message || 'CMS发布失败');
            }
        }

        async function publishToWechat(title, content) {
            try {
                const r = await fetch(API + '/api/publish/wechat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, content })
                });
                const d = await r.json();
                if (d.success) {
                    showToast('微信公众号发布成功！');
                    return { platform: 'wechat', articleId: d.data?.articleId };
                } else {
                    throw new Error(d.message || '微信发布失败');
                }
            } catch (e) {
                showToast('微信发布失败: ' + e.message, 'error');
                throw e;
            }
        }

        async function publishToXiaohongshu(title, content) {
            try {
                const r = await fetch(API + '/api/publish/xiaohongshu', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, content })
                });
                const d = await r.json();
                if (d.success) {
                    showToast('小红书发布成功！');
                    return { platform: 'xiaohongshu', articleId: d.data?.articleId };
                } else {
                    throw new Error(d.message || '小红书发布失败');
                }
            } catch (e) {
                showToast('小红书发布失败: ' + e.message, 'error');
                throw e;
            }
        }

        async function publishToDouyin(title, content) {
            try {
                const r = await fetch(API + '/api/publish/douyin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, content })
                });
                const d = await r.json();
                if (d.success) {
                    showToast('抖音发布成功！');
                    return { platform: 'douyin', articleId: d.data?.articleId };
                } else {
                    throw new Error(d.message || '抖音发布失败');
                }
            } catch (e) {
                showToast('抖音发布失败: ' + e.message, 'error');
                throw e;
            }
        }

        // ═══ AI自动生成并发布 ═══
        async function runAutoGenerate() {
            const logEl = document.getElementById('autoGenerateLog');
            logEl.style.display = 'block';
            logEl.innerHTML = '🚀 提交AI生成任务...';
            
            const model = document.getElementById('autoModel').value;
            const style = document.getElementById('autoStyle').value;
            const words = document.getElementById('autoWords').value;
            const keywords = document.getElementById('autoKeywords').value.trim();
            const toWechat = document.getElementById('pubToWechat').checked;
            const toCMS = document.getElementById('pubToCMS').checked;
            
            try {
                const r = await fetch(API + '/api/publish/auto-generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model, style, words, keywords, toWechat, toCMS })
                });
                const d = await r.json();
                
                if (d.success && d.taskId) {
                    // 轮询任务状态
                    logEl.innerHTML = '⏳ AI正在生成文章，请稍候...';
                    pollTask(d.taskId, logEl);
                } else {
                    logEl.innerHTML = `<div style="color:var(--danger);">❌ 提交失败: ${d.message}</div>`;
                }
            } catch (e) {
                logEl.innerHTML = `<div style="color:var(--danger);">❌ 请求失败: ${e.message}</div>`;
            }
        }
        
        async function pollTask(taskId, logEl) {
            try {
                const r = await fetch(API + '/api/publish/auto-generate/' + taskId);
                const d = await r.json();
                
                if (d.status === 'running') {
                    logEl.innerHTML = `⏳ AI正在生成文章... (${Math.round((Date.now() - d.startTime) / 1000)}s)`;
                    setTimeout(() => pollTask(taskId, logEl), 5000);
                } else if (d.status === 'completed') {
                    const res = d.result;
                    logEl.innerHTML = `
                        <div style="color:var(--success);margin-bottom:8px;">✅ 生成${res.published ? '并发布' : ''}成功！</div>
                        <div>📝 标题: ${res.title}</div>
                        <div>📊 字数: ${res.wordCount}</div>
                        <div>🏷️ 分类: ${res.category}</div>
                        ${res.mediaId ? `<div>📄 MediaID: ${res.mediaId}</div>` : ''}
                        <div>⏱️ 耗时: ${Math.round(res.elapsedMs/1000)}s</div>
                        <div style="margin-top:8px;"><a href="https://mp.weixin.qq.com" target="_blank">🔗 微信后台查看</a></div>
                    `;
                    showToast('AI生成成功！');
                } else {
                    logEl.innerHTML = `<div style="color:var(--danger);">❌ 生成失败: ${d.error || '未知错误'}</div>`;
                }
            } catch (e) {
                logEl.innerHTML = `<div style="color:var(--danger);">❌ 轮询失败: ${e.message}</div>`;
            }
        }
        
        async function previewTopics() {
            try {
                const r = await fetch(API + '/api/publish/topics');
                const d = await r.json();
                
                if (d.success) {
                    const topicList = d.data.topics || d.data;
                    const topics = (Array.isArray(topicList) ? topicList : []).slice(0, 20).map((t, i) => 
                        `<div style="padding:4px 0;border-bottom:1px solid var(--border);">${i+1}. ${t.topic} <span style="color:var(--text2);">(${t.category})</span></div>`
                    ).join('');
                    
                    document.getElementById('autoGenerateLog').style.display = 'block';
                    document.getElementById('autoGenerateLog').innerHTML = `
                        <div style="font-weight:600;margin-bottom:8px;">📋 话题库（前20条）</div>
                        ${topics}
                        <div style="margin-top:8px;color:var(--text2);">共 ${(Array.isArray(topicList) ? topicList : []).length} 条话题</div>
                    `;
                } else {
                    showToast('加载话题库失败: ' + d.message, 'error');
                }
            } catch (e) {
                showToast('请求失败: ' + e.message, 'error');
            }
        }
        // ── Asset Panels ──────────────────────────────
        function openAssetPanel(type) {
            document.querySelectorAll('[id^="assetPanel-"]').forEach(p => p.style.display = 'none');
            document.getElementById('assetPanel-' + type).style.display = 'block';
        }
        function closeAssetPanel(type) {
            document.getElementById('assetPanel-' + type).style.display = 'none';
        }

        async function generateCoverImage() {
            const title = document.getElementById('coverTitle').value || document.getElementById('pubTitle')?.value || 'Cover';
            const subtitle = document.getElementById('coverSubtitle').value;
            const type = document.getElementById('coverType').value;
            const palette = document.getElementById('coverPalette').value;
            const resultEl = document.getElementById('coverResult');
            resultEl.innerHTML = '<div class="text-muted">⏳ 正在生成封面图...</div>';
            try {
                const r = await fetch(API + '/api/skills/cover-image/execute', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ params: { title, subtitle, dims: type !== 'auto' ? { type } : undefined, palette: palette !== 'auto' ? palette : undefined } })
                });
                const d = await r.json();
                if (!d.success) throw new Error(d.error);
                const prompt = d.result.prompt;
                // Generate image with the prompt
                resultEl.innerHTML = '<div class="text-muted">⏳ AI绘图生成中，约15-20秒...</div>';
                const r2 = await fetch(API + '/api/skills/cover-image/generate', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompts: [{ prompt, filename: 'cover.png' }] })
                });
                const d2 = await r2.json();
                if (d2.success && d2.results?.[0]?.success) {
                    const imgUrl = d2.results[0].url + '?t=' + Date.now();
                    resultEl.innerHTML = '<div style="color:var(--success);">✅ 封面图生成成功！</div><img src="' + imgUrl + '" style="max-width:100%;border-radius:8px;margin-top:8px;">';
                } else {
                    resultEl.innerHTML = '<div style="color:var(--danger);">❌ 图片生成失败: ' + (d2.error || JSON.stringify(d2)) + '</div>';
                }
            } catch (e) {
                resultEl.innerHTML = '<div style="color:var(--danger);">❌ ' + e.message + '</div>';
            }
        }

        async function generateXHSCards() {
            const content = document.getElementById('xhsContent').value;
            if (!content) return showToast('请输入文章内容', 'error');
            const style = document.getElementById('xhsStyle').value;
            const layout = document.getElementById('xhsLayout').value;
            const resultEl = document.getElementById('xhsResult');
            resultEl.innerHTML = '<div class="text-muted">⏳ 正在拆分内容为卡片...</div>';
            try {
                const r = await fetch(API + '/api/skills/xhs-images/execute', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ params: { content, style, layout } })
                });
                const d = await r.json();
                if (!d.success) throw new Error(d.error);
                const cards = d.result.cards;
                resultEl.innerHTML = '<div style="color:var(--success);margin-bottom:8px;">✅ 已拆分为 ' + cards.length + ' 张卡片，开始生成图片...</div>';
                const r2 = await fetch(API + '/api/skills/xhs-images/generate', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompts: cards.map((c, i) => ({ prompt: c.visual || c.title, filename: 'card_' + String(i + 1).padStart(2, '0') + '.png' })), style })
                });
                const d2 = await r2.json();
                if (d2.success) {
                    const imgs = d2.results.map((res, i) => {
                        if (res.success) return '<div><div class="text-sm text-muted">卡片 ' + (i + 1) + ': ' + cards[i]?.title + '</div><img src="' + res.url + '?t=' + Date.now() + '" style="max-width:100%;border-radius:8px;"></div>';
                        return '<div style="color:var(--danger);">卡片 ' + (i + 1) + ' 失败: ' + res.error + '</div>';
                    }).join('');
                    resultEl.innerHTML = '<div style="color:var(--success);margin-bottom:8px;">✅ 生成完成！</div>' + imgs;
                } else {
                    resultEl.innerHTML = '<div style="color:var(--danger);">❌ ' + (d2.error || JSON.stringify(d2)) + '</div>';
                }
            } catch (e) {
                resultEl.innerHTML = '<div style="color:var(--danger);">❌ ' + e.message + '</div>';
            }
        }

        async function generateSlideDeck() {
            const content = document.getElementById('slideContent').value;
            if (!content) return showToast('请输入文章内容', 'error');
            const style = document.getElementById('slideStyle').value;
            const slides = parseInt(document.getElementById('slideCount').value) || 8;
            const resultEl = document.getElementById('slideResult');
            resultEl.innerHTML = '<div class="text-muted">⏳ 正在生成PPT大纲...</div>';
            try {
                const r = await fetch(API + '/api/skills/slide-deck/execute', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ params: { content, style, slides } })
                });
                const d = await r.json();
                if (!d.success) throw new Error(d.error);
                const outline = d.result.outline;
                resultEl.innerHTML = '<div style="color:var(--success);margin-bottom:8px;">✅ 大纲已生成（' + outline.slides.length + '页），开始生成配图...</div>';
                const prompts = outline.slides.map((s, i) => ({ prompt: s.visual || s.title, filename: 'slide_' + String(i + 1).padStart(2, '0') + '.png' }));
                const r2 = await fetch(API + '/api/skills/slide-deck/generate', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompts, style })
                });
                const d2 = await r2.json();
                if (d2.success) {
                    const ok = d2.results.filter(r => r.success).length;
                    resultEl.innerHTML = '<div style="color:var(--success);">✅ 配图生成完成（' + ok + '/' + prompts.length + '）</div>' +
                        '<div class="text-sm text-muted">PPT大纲: ' + outline.title + '</div>';
                } else {
                    resultEl.innerHTML = '<div style="color:var(--danger);">❌ ' + (d2.error || JSON.stringify(d2)) + '</div>';
                }
            } catch (e) {
                resultEl.innerHTML = '<div style="color:var(--danger);">❌ ' + e.message + '</div>';
            }
        }
    