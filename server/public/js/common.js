var API = '';

// ── Navigation ─────────────────────────────
function loadNavigation() {
    fetch('/components/nav.html')
        .then(r => r.text())
        .then(html => {
            const nav = document.getElementById('mainNav');
            if (nav) nav.innerHTML = html;
            const current = window.location.pathname.split('/').pop() || 'index.html';
            document.querySelectorAll('#mainNav .nav-item').forEach(a => {
                const href = a.getAttribute('href');
                if (href === '/' + current || (current === '' && href === '/index.html')) {
                    a.classList.add('active');
                }
            });
        })
        .catch(e => console.error('Nav load failed:', e));
}

// ── Toast ──────────────────────────────────
function showToast(msg, type = 'success') {
    let t = document.getElementById('toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        t.className = 'toast';
        document.body.appendChild(t);
    }
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
        const el = document.getElementById('serverStatus');
        if (el) el.textContent = d.status === 'ok' ? '运行中' : '异常';
        showToast('服务正常 - ' + (d.service || 'WorkBuddy'));
    } catch (e) {
        const el = document.getElementById('serverStatus');
        if (el) el.textContent = '离线';
        showToast('服务未启动', 'error');
    }
}

// 兼容旧页面使用的 healthCheck
function healthCheck() { return checkHealth(); }

// ── Utils ──────────────────────────────────
function copyText(id) {
    const text = document.getElementById(id).textContent;
    navigator.clipboard.writeText(text).then(() => showToast('已复制到剪贴板'));
}

// ── Init ───────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadNavigation();
    checkHealth();
});
