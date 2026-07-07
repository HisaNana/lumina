// background.js — service worker
// 1. GET_CONFIG: 读取 storage 配置，返回给 content_script
// 2. AI_STREAM:  在扩展上下文发起 fetch（绕过页面 CSP），逐 chunk 推流回 content_script

const DEFAULTS = {
  apiKey:       '',
  baseUrl:      'https://api.openai.com/v1',
  model:        'gpt-4o-mini',
  systemPrompt: '你是一个学术名词解释助手，用简洁清晰的中文解释用户选中的术语，并回答后续问题。',
  builtinEnabled: {},
  customActions:  []
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ── 配置读取 ──────────────────────────────────────────────
  if (msg.type === 'GET_CONFIG') {
    chrome.storage.local.get(DEFAULTS, cfg => {
      sendResponse({ ok: true, cfg });
    });
    return true;
  }

  // ── AI 流式请求 ───────────────────────────────────────────
  if (msg.type === 'AI_STREAM') {
    const { requestId, cfg, messages } = msg;
    const tabId = sender.tab?.id;
    if (!tabId) { sendResponse({ ok: false, error: '无法获取 tabId' }); return; }

    sendResponse({ ok: true }); // 立即响应，后续通过 sendMessage 推流

    (async () => {
      const push = (payload) => {
        chrome.tabs.sendMessage(tabId, { type: 'AI_CHUNK', requestId, ...payload })
          .catch(() => {}); // tab 关闭时忽略
      };

      try {
        const url = cfg.baseUrl.replace(/\/$/, '') + '/chat/completions';
        const resp = await fetch(url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
          body:    JSON.stringify({ model: cfg.model, messages, stream: true })
        });

        if (!resp.ok) {
          let detail = '';
          try { detail = (await resp.json()).error?.message || ''; } catch (_) {}
          push({ error: `API ${resp.status}${detail ? ': ' + detail : ''}` });
          return;
        }

        const reader  = resp.body.getReader();
        const decoder = new TextDecoder();
        let   buf     = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            const t = line.trim();
            if (!t || t === 'data: [DONE]' || !t.startsWith('data: ')) continue;
            try {
              const tok = JSON.parse(t.slice(6)).choices?.[0]?.delta?.content;
              if (tok) push({ token: tok });
            } catch (_) {}
          }
        }
        push({ done: true });

      } catch (e) {
        push({ error: '网络请求失败: ' + e.message });
      }
    })();

    return false; // 已同步 sendResponse，不需要保持通道
  }
});
