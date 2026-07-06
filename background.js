// background.js — service worker
// 处理来自 content_script 的配置读取请求
// content_script 无法直接访问 chrome.storage 时，通过消息中转

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_CONFIG') {
    chrome.storage.local.get({
      apiKey:       '',
      baseUrl:      'https://api.openai.com/v1',
      model:        'gpt-4o-mini',
      systemPrompt: '你是一个学术名词解释助手，用简洁清晰的中文解释用户选中的术语，并回答后续问题。'
    }, cfg => {
      sendResponse({ ok: true, cfg });
    });
    return true; // 保持消息通道开放（异步 sendResponse）
  }
});
