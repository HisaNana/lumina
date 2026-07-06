const DEFAULTS = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  systemPrompt: '你是一个学术名词解释助手，用简洁清晰的中文解释用户选中的术语，并回答后续问题。',
  // 内置功能的显示开关
  builtinEnabled: { explain: true, translate: true, summarize: true, code: true },
  // 用户自定义指令列表
  customActions: []
};

const BUILTIN_META = [
  { id: 'explain',   icon: '🔍', label: '解释' },
  { id: 'translate', icon: '🔤', label: '翻译' },
  { id: 'summarize', icon: '📝', label: '总结' },
  { id: 'code',      icon: '💻', label: '代码解释' },
];

const $ = id => document.getElementById(id);

// ── 渲染内置开关 ─────────────────────────────────────────
function renderBuiltins(enabled) {
  const container = $('builtinToggles');
  container.innerHTML = '';
  BUILTIN_META.forEach(b => {
    const row = document.createElement('div');
    row.className = 'builtin-row';
    row.innerHTML = `
      <span class="builtin-label">${b.icon} ${b.label}</span>
      <label class="toggle">
        <input type="checkbox" id="bi_${b.id}" ${enabled[b.id] !== false ? 'checked' : ''}>
        <span class="slider"></span>
      </label>`;
    container.appendChild(row);
  });
}

// ── 渲染自定义指令列表 ───────────────────────────────────
function renderCustomActions(list) {
  const container = $('actionList');
  container.innerHTML = '';
  list.forEach((action, idx) => {
    const row = document.createElement('div');
    row.className = 'action-row';
    row.dataset.idx = idx;
    row.draggable = true;
    row.innerHTML = `
      <span class="drag-handle" title="拖动排序">⠿</span>
      <div class="action-fields">
        <div class="action-row-top">
          <input class="icon-input" type="text" value="${escHtml(action.icon || '✨')}" placeholder="🔖" maxlength="4" title="图标（emoji 或文字）">
          <input class="label-input" type="text" value="${escHtml(action.label || '')}" placeholder="指令名称">
          <button class="del-btn" title="删除">✕</button>
        </div>
        <textarea class="prompt-input" placeholder="Prompt，用 {{text}} 代表选中文字，例如：\n请用中文解释以下术语并举例：{{text}}">${escHtml(action.prompt || '')}</textarea>
      </div>`;

    // 删除
    row.querySelector('.del-btn').addEventListener('click', () => {
      const cur = readCustomList();
      cur.splice(idx, 1);
      renderCustomActions(cur);
    });

    // 拖拽排序
    row.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', idx);
      row.style.opacity = '.4';
    });
    row.addEventListener('dragend', () => { row.style.opacity = '1'; });
    row.addEventListener('dragover', e => { e.preventDefault(); });
    row.addEventListener('drop', e => {
      e.preventDefault();
      const from = +e.dataTransfer.getData('text/plain');
      const to   = idx;
      if (from === to) return;
      const cur = readCustomList();
      const [item] = cur.splice(from, 1);
      cur.splice(to, 0, item);
      renderCustomActions(cur);
    });

    container.appendChild(row);
  });
}

// 从 DOM 读取当前自定义列表
function readCustomList() {
  return Array.from($('actionList').querySelectorAll('.action-row')).map(row => ({
    icon:   row.querySelector('.icon-input').value.trim()  || '✨',
    label:  row.querySelector('.label-input').value.trim() || '自定义',
    prompt: row.querySelector('.prompt-input').value.trim()
  }));
}

// 读取内置开关状态
function readBuiltinEnabled() {
  const result = {};
  BUILTIN_META.forEach(b => {
    result[b.id] = $(`bi_${b.id}`)?.checked ?? true;
  });
  return result;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── 初始化：从 storage 加载 ──────────────────────────────
chrome.storage.local.get(DEFAULTS, cfg => {
  $('apiKey').value       = cfg.apiKey;
  $('baseUrl').value      = cfg.baseUrl;
  $('model').value        = cfg.model;
  $('systemPrompt').value = cfg.systemPrompt;
  renderBuiltins(cfg.builtinEnabled || DEFAULTS.builtinEnabled);
  renderCustomActions(cfg.customActions || []);
});

// ── 新增自定义指令 ────────────────────────────────────────
$('addAction').addEventListener('click', () => {
  const cur = readCustomList();
  cur.push({ icon: '✨', label: '', prompt: '' });
  renderCustomActions(cur);
  // 滚到底部，聚焦新行的 label
  const rows = $('actionList').querySelectorAll('.action-row');
  const last = rows[rows.length - 1];
  last?.querySelector('.label-input')?.focus();
});

// ── 保存 ─────────────────────────────────────────────────
$('saveBtn').addEventListener('click', () => {
  const cfg = {
    apiKey:         $('apiKey').value.trim(),
    baseUrl:        $('baseUrl').value.trim()   || DEFAULTS.baseUrl,
    model:          $('model').value.trim()     || DEFAULTS.model,
    systemPrompt:   $('systemPrompt').value.trim() || DEFAULTS.systemPrompt,
    builtinEnabled: readBuiltinEnabled(),
    customActions:  readCustomList()
  };
  chrome.storage.local.set(cfg, () => {
    const s = $('status');
    s.textContent = '已保存 ✓';
    setTimeout(() => { s.textContent = ''; }, 2000);
  });
});
