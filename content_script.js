/* ============================================================
   AI Lookup — content_script.js  (完整重写版)
   ============================================================ */
(() => {
  if (window.__aiLookupInjected) return;
  window.__aiLookupInjected = true;

  // ── 诊断日志（带前缀，便于 DevTools 过滤）─────────────────
  const log  = (...a) => console.log( '[AI-Lookup]', ...a);
  const warn = (...a) => console.warn('[AI-Lookup]', ...a);

  log('content_script 已注入，chrome 对象:', typeof chrome);
  log('chrome.runtime:', typeof chrome?.runtime);
  log('chrome.storage:', typeof chrome?.storage);

  // ── 读取配置：先尝试直接访问，失败再走 sendMessage ────────
  async function getConfig() {
    // 方式A：直接访问（在大多数页面可行）
    if (chrome?.storage?.local) {
      log('getConfig: 使用直接 storage 方式');
      return new Promise((resolve, reject) => {
        try {
          chrome.storage.local.get({
            apiKey: '', baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o-mini',
            systemPrompt: '你是一个学术名词解释助手，用简洁清晰的中文解释用户选中的术语，并回答后续问题。'
          }, cfg => {
            if (chrome.runtime.lastError) {
              warn('storage.local.get 报错:', chrome.runtime.lastError.message);
              return reject(new Error(chrome.runtime.lastError.message));
            }
            log('getConfig 成功 (直接):', JSON.stringify({ ...cfg, apiKey: cfg.apiKey ? '***' : '(空)' }));
            resolve(cfg);
          });
        } catch (e) {
          warn('直接访问 storage 异常:', e.message);
          reject(e);
        }
      });
    }

    // 方式B：通过 background sendMessage 中转
    if (chrome?.runtime?.sendMessage) {
      log('getConfig: 使用 sendMessage 中转方式');
      return new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resp => {
            const err = chrome.runtime?.lastError;
            if (err) {
              warn('sendMessage 报错:', err.message);
              return reject(new Error('无法连接插件后台: ' + err.message));
            }
            if (resp?.ok) {
              log('getConfig 成功 (sendMessage)');
              resolve(resp.cfg);
            } else {
              reject(new Error('background 返回异常'));
            }
          });
        } catch (e) {
          warn('sendMessage 异常:', e.message);
          reject(e);
        }
      });
    }

    // 方式C：两种都不行
    warn('getConfig: chrome.storage 和 chrome.runtime 均不可用');
    throw new Error('插件上下文不可用，请刷新页面后重试');
  }

  // ── 内置动作定义 ──────────────────────────────────────────
  const BUILTIN_ACTIONS = [
    { id: 'explain',   icon: '🔍', label: '解释',     prompt: t => `请解释：${t}` },
    { id: 'translate', icon: '🔤', label: '翻译',     prompt: t => /[\u4e00-\u9fa5]/.test(t) ? `请将以下内容翻译成英文：\n${t}` : `请将以下内容翻译成中文：\n${t}` },
    { id: 'summarize', icon: '📝', label: '总结',     prompt: t => `请总结以下内容的要点：\n${t}` },
    { id: 'code',      icon: '💻', label: '代码解释', prompt: t => `请解释以下代码的功能和原理：\n\`\`\`\n${t}\n\`\`\`` },
  ];

  // ── 气泡容器（按钮动态渲染）──────────────────────────────
  const bubble = document.createElement('div');
  Object.assign(bubble.style, {
    position: 'fixed', zIndex: '2147483647', display: 'none',
    alignItems: 'center', gap: '4px', padding: '4px 6px',
    background: '#fff', borderRadius: '24px',
    boxShadow: '0 3px 14px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
    userSelect: 'none', pointerEvents: 'auto',
  });

  // 将一个动作对象渲染为气泡按钮并追加到 bubble
  function addBubbleBtn(icon, label, onClickFn) {
    const btn = document.createElement('button');
    btn.innerHTML = `<span style="font-size:13px;line-height:1">${icon}</span><span style="font-size:11px;font-weight:600;font-family:system-ui,sans-serif;letter-spacing:.2px">${label}</span>`;
    Object.assign(btn.style, {
      display: 'flex', alignItems: 'center', gap: '3px',
      background: 'transparent', border: 'none', cursor: 'pointer',
      padding: '4px 8px', borderRadius: '16px',
      color: '#334155', transition: 'background .12s, color .12s', whiteSpace: 'nowrap',
    });
    btn.addEventListener('mouseenter', () => { btn.style.background = '#2563eb'; btn.style.color = '#fff'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; btn.style.color = '#334155'; });
    btn.addEventListener('click', e => { e.stopPropagation(); onClickFn(); });
    bubble.appendChild(btn);
  }

  // 根据 storage 配置重新渲染气泡按钮
  function rebuildBubble(cfg) {
    bubble.innerHTML = '';
    const enabled = cfg.builtinEnabled || {};
    const customs  = cfg.customActions  || [];

    // 内置按钮
    BUILTIN_ACTIONS.forEach(action => {
      if (enabled[action.id] === false) return;
      addBubbleBtn(action.icon, action.label, () => {
        const text = pendingText;
        bubble.style.display = 'none'; pendingText = '';
        if (!text) return;
        const content = action.id === 'summarize'
          ? (text || (document.body.innerText || '').slice(0, 4000))
          : text;
        createWindow(content, action.prompt(content), action.label);
      });
    });

    // 自定义按钮
    customs.forEach(ca => {
      if (!ca.label) return;
      addBubbleBtn(ca.icon || '✨', ca.label, () => {
        const text = pendingText;
        bubble.style.display = 'none'; pendingText = '';
        if (!text) return;
        // {{text}} 替换为选中内容
        const prompt = (ca.prompt || '{{text}}').replace(/\{\{text\}\}/g, text);
        createWindow(text, prompt, ca.label);
      });
    });
  }

  // 初始渲染：先用内置默认，再等 storage 结果覆盖
  rebuildBubble({ builtinEnabled: {}, customActions: [] });

  // body 可能还没挂载，用 requestAnimationFrame 确保安全插入
  const insertBubble = () => {
    if (document.body) {
      document.body.appendChild(bubble);
      log('气泡已插入 body');
      // 加载真实配置
      loadBubbleConfig();
    } else {
      requestAnimationFrame(insertBubble);
    }
  };
  insertBubble();

  function loadBubbleConfig() {
    try {
      if (chrome?.storage?.local) {
        chrome.storage.local.get({ builtinEnabled: {}, customActions: [] }, cfg => {
          if (!chrome.runtime.lastError) rebuildBubble(cfg);
        });
      } else if (chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resp => {
          if (!chrome.runtime?.lastError && resp?.ok) rebuildBubble(resp.cfg);
        });
      }
    } catch (_) {}
  }

  // ── 鼠标追踪（气泡定位降级用）────────────────────────────
  let lastX = 200, lastY = 200;
  document.addEventListener('mousemove', e => { lastX = e.clientX; lastY = e.clientY; }, { passive: true });

  // ── 表单判断 ──────────────────────────────────────────────
  function isFormField(node) {
    let el = node?.nodeType === 3 ? node.parentElement : node;
    while (el && el !== document.documentElement) {
      const t = el.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return true;
      if (el.isContentEditable) return true;
      el = el.parentElement;
    }
    return false;
  }

  // ── 选中检测 ──────────────────────────────────────────────
  let pendingText = '';

  document.addEventListener('mouseup', e => {
    if (bubble.contains(e.target)) return;

    const sel  = window.getSelection();
    const text = sel?.toString().trim() ?? '';

    // 有选中文字：正常显示工具栏
    if (text && text.length <= 4000 && !isFormField(sel.anchorNode)) {
      pendingText = text;
      log('选中文字:', text.slice(0, 40));
      positionBubble(sel);
      bubble.style.display = 'flex';
      return;
    }

    // 没有选中文字但「总结」功能仍需要显示（待用户触发）
    bubble.style.display = 'none';
    pendingText = '';
  });

  document.addEventListener('mousedown', e => {
    if (!bubble.contains(e.target)) {
      bubble.style.display = 'none';
      pendingText = '';
    }
  });

  function positionBubble(sel) {
    let cx = lastX, cy = lastY;
    try {
      if (sel?.rangeCount) {
        const r = sel.getRangeAt(0).getBoundingClientRect();
        if (r.width > 0 || r.height > 0) { cx = r.left + r.width / 2; cy = r.bottom; }
      }
    } catch (_) {}
    const bw = 160;
    const left = Math.max(4, Math.min(cx - bw / 2, window.innerWidth - bw - 4));
    const top  = Math.max(4, Math.min(cy + 8,      window.innerHeight - 40));
    bubble.style.left = `${left}px`;
    bubble.style.top  = `${top}px`;
  }

  // ── 旧的单按钮点击事件已由 ACTIONS 内联替换，无需此处理器 ──

  // ── 悬浮窗 ────────────────────────────────────────────────
  let winCount = 0;

  // term: 选中词（用于标题栏），firstMsg: 自动发送的第一条消息，actionLabel: 动作名
  function createWindow(term, firstMsg, actionLabel = '解释') {
    const off    = winCount++ * 24;
    const initL  = Math.max(8, Math.min(Math.floor((window.innerWidth - 380) / 2) + off, window.innerWidth - 388));
    const initT  = 80 + off;

    const host   = document.createElement('div');
    host.style.cssText = `position:fixed;z-index:2147483646;top:${initT}px;left:${initL}px;width:380px;pointer-events:none;`;
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);

    shadow.innerHTML = `
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  .w{width:380px;max-height:520px;display:flex;flex-direction:column;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.18);font-family:system-ui,sans-serif;font-size:13px;color:#1e293b;overflow:hidden;pointer-events:auto;user-select:text}
  .tb{display:flex;align-items:center;gap:6px;padding:8px 10px;background:#2563eb;color:#fff;cursor:grab;flex-shrink:0}
  .tb:active{cursor:grabbing}
  .tt{flex:1;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .xb{background:none;border:none;color:rgba(255,255,255,.8);font-size:16px;cursor:pointer;padding:0 2px}
  .xb:hover{color:#fff}
  .msgs{flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px;min-height:120px;max-height:360px}
  .m{padding:7px 10px;border-radius:8px;line-height:1.55;white-space:pre-wrap;word-break:break-word;font-size:13px}
  .m.u{background:#eff6ff;color:#1e40af;align-self:flex-end;max-width:90%}
  .m.a{background:#f1f5f9;color:#1e293b;align-self:flex-start;max-width:95%}
  .m.e{background:#fef2f2;color:#b91c1c;align-self:flex-start;max-width:95%}
  .m.a.cur::after{content:'▌';animation:blink .8s step-end infinite}
  @keyframes blink{50%{opacity:0}}
  .m code{background:#e2e8f0;padding:1px 4px;border-radius:3px;font-family:monospace;font-size:12px}
  .m pre{background:#1e293b;color:#e2e8f0;padding:8px 10px;border-radius:6px;overflow-x:auto;margin:.3em 0}
  .m pre code{background:none;padding:0;font-size:12px;color:inherit}
  .m ul,.m ol{margin:.3em 0 .3em 1.2em;padding:0}
  .m strong{font-weight:600}
  .m em{font-style:italic}
  .ir{display:flex;gap:6px;padding:8px 10px;border-top:1px solid #e2e8f0;flex-shrink:0;background:#f8fafc}
  .ir textarea{flex:1;resize:none;border:1px solid #cbd5e1;border-radius:6px;padding:5px 8px;font-size:12px;font-family:inherit;color:#1e293b;background:#fff;outline:none;min-height:32px;max-height:80px;line-height:1.4}
  .ir textarea:focus{border-color:#2563eb}
  .sb{flex-shrink:0;background:#2563eb;color:#fff;border:none;border-radius:6px;padding:0 12px;font-size:12px;font-weight:500;cursor:pointer;align-self:flex-end;height:32px}
  .sb:hover{background:#1d4ed8}
  .sb:disabled{background:#93c5fd;cursor:not-allowed}
  .diag{font-size:10px;color:#94a3b8;padding:4px 12px;background:#f8fafc;border-top:1px solid #e2e8f0;font-family:monospace}
</style>
<div class="w">
  <div class="tb"><span style="font-size:14px">🔍</span><span class="tt" title="${esc(term)}">[${esc(actionLabel)}] ${esc(term.slice(0, 30))}${term.length > 30 ? '…' : ''}</span><button class="xb">✕</button></div>
  <div class="msgs"></div>
  <div class="diag" id="diag">正在初始化…</div>
  <div class="ir"><textarea placeholder="继续追问…" rows="1"></textarea><button class="sb">发送</button></div>
</div>`;

    const msgs  = shadow.querySelector('.msgs');
    const input = shadow.querySelector('textarea');
    const send_ = shadow.querySelector('.sb');
    const xbtn  = shadow.querySelector('.xb');
    const diag  = shadow.querySelector('#diag');
    const titlebar = shadow.querySelector('.tb');

    const setDiag = t => { diag.textContent = t; };

    // 拖动
    let drag = null;
    titlebar.addEventListener('mousedown', e => {
      if (e.target === xbtn) return;
      e.preventDefault();
      const r = host.getBoundingClientRect();
      drag = { ox: e.clientX - r.left, oy: e.clientY - r.top };
    });
    document.addEventListener('mousemove', e => {
      if (!drag) return;
      host.style.left = `${Math.max(0, Math.min(e.clientX - drag.ox, window.innerWidth  - 380))}px`;
      host.style.top  = `${Math.max(0, Math.min(e.clientY - drag.oy, window.innerHeight - 40 ))}px`;
    });
    document.addEventListener('mouseup', () => { drag = null; });
    xbtn.addEventListener('click', () => { host.remove(); winCount = Math.max(0, winCount - 1); });

    // 消息追加
    const addMsg = (role, txt) => {
      const d = document.createElement('div');
      d.className = 'm ' + role;
      d.textContent = txt;
      msgs.appendChild(d);
      msgs.scrollTop = msgs.scrollHeight;
      return d;
    };

    const history = [];
    let busy = false;

    async function doSend(text) {
      if (busy || !text) return;
      busy = true; send_.disabled = true;

      history.push({ role: 'user', content: text });
      addMsg('u', text);
      const out = addMsg('a', '');
      out.classList.add('cur');
      setDiag('正在获取配置…');

      try {
        let cfg;
        try {
          cfg = await getConfig();
          setDiag(`配置OK | model: ${cfg.model} | key: ${cfg.apiKey ? '已填写' : '未填写'}`);
        } catch (e) {
          throw new Error('配置读取失败: ' + e.message);
        }

        if (!cfg.apiKey) {
          out.classList.remove('cur');
          out.className = 'm e';
          out.textContent = '请先点击插件图标，在设置页填写 API Key。';
          setDiag('未配置 API Key');
          history.pop();
          return;
        }

        setDiag('正在请求 API…');
        const messages = [{ role: 'system', content: cfg.systemPrompt }, ...history];
        log('通过 background 发起请求, 模型:', cfg.model);

        // 生成唯一 requestId，避免多窗口并发时串流
        const requestId = Math.random().toString(36).slice(2);

        // 向 background 发起流式请求
        await new Promise((resolve, reject) => {
          setDiag('流式接收中…');
          out.textContent = '';
          let fullText = '';

          // 监听 background 推回来的 chunk
          const onChunk = (msg) => {
            if (msg.type !== 'AI_CHUNK' || msg.requestId !== requestId) return;
            if (msg.error) {
              chrome.runtime.onMessage.removeListener(onChunk);
              reject(new Error(msg.error));
            } else if (msg.token) {
              fullText += msg.token;
              out.textContent = fullText;
              msgs.scrollTop = msgs.scrollHeight;
            } else if (msg.done) {
              chrome.runtime.onMessage.removeListener(onChunk);
              out.innerHTML = renderMd(fullText);
              out.classList.remove('cur');
              history.push({ role: 'assistant', content: fullText });
              setDiag('完成');
              resolve();
            }
          };
          chrome.runtime.onMessage.addListener(onChunk);

          // 发送请求给 background
          chrome.runtime.sendMessage({ type: 'AI_STREAM', requestId, cfg, messages }, resp => {
            if (chrome.runtime.lastError || !resp?.ok) {
              chrome.runtime.onMessage.removeListener(onChunk);
              reject(new Error(chrome.runtime.lastError?.message || resp?.error || '请求发送失败'));
            }
          });
        });

      } catch (e) {
        out.classList.remove('cur');
        out.className = 'm e';
        out.textContent = '错误：' + e.message;
        setDiag('错误: ' + e.message);
        warn('doSend 错误:', e);
        history.pop();
      } finally {
        busy = false; send_.disabled = false;
      }
    }

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const t = input.value.trim(); input.value = '';
        doSend(t);
      }
    });
    send_.addEventListener('click', () => {
      const t = input.value.trim(); input.value = '';
      doSend(t);
    });

    doSend(firstMsg || ('请解释：' + term));
  }

  // ── 极简 Markdown → HTML 渲染（无外部依赖）─────────────
  function esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function renderMd(text) {
    // 先转义 HTML 特殊字符，再逐步还原 Markdown 结构
    const esc2 = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const lines = text.split('\n');
    let html = '';
    let inUl = false, inOl = false, inCode = false, codeBuf = '';

    const closeList = () => {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (inOl) { html += '</ol>'; inOl = false; }
    };

    const inline = s => s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>');

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];

      // 代码块
      if (raw.trimStart().startsWith('```')) {
        if (!inCode) { closeList(); inCode = true; codeBuf = ''; continue; }
        else { html += `<pre><code>${esc2(codeBuf)}</code></pre>`; inCode = false; continue; }
      }
      if (inCode) { codeBuf += (codeBuf ? '\n' : '') + raw; continue; }

      const line = esc2(raw);

      // 标题
      const hm = line.match(/^(#{1,3})\s+(.+)/);
      if (hm) { closeList(); html += `<h${hm[1].length} style="margin:.4em 0 .2em;font-size:${1.1 - (hm[1].length-1)*.1}em">${inline(hm[2])}</h${hm[1].length}>`; continue; }

      // 水平线
      if (/^[-*_]{3,}$/.test(raw.trim())) { closeList(); html += '<hr style="border:none;border-top:1px solid #e2e8f0;margin:.5em 0">'; continue; }

      // 无序列表
      const ulm = line.match(/^[-*+]\s+(.+)/);
      if (ulm) { if (!inUl) { closeList(); html += '<ul style="margin:.3em 0 .3em 1.2em;padding:0">'; inUl = true; } html += `<li>${inline(ulm[1])}</li>`; continue; }

      // 有序列表
      const olm = line.match(/^\d+\.\s+(.+)/);
      if (olm) { if (!inOl) { closeList(); html += '<ol style="margin:.3em 0 .3em 1.2em;padding:0">'; inOl = true; } html += `<li>${inline(olm[1])}</li>`; continue; }

      // 普通段落
      closeList();
      if (raw.trim() === '') { html += '<br>'; }
      else { html += `<p style="margin:.25em 0">${inline(line)}</p>`; }
    }
    closeList();
    if (inCode) html += `<pre><code>${esc2(codeBuf)}</code></pre>`;
    return html;
  }

})();
