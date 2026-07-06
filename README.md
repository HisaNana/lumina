# AI Lookup — Chrome Extension

A lightweight Chrome extension that lets you select any text on a webpage and instantly get AI-powered explanations, translations, summaries, or code analysis in a floating window — without leaving the page.

![demo](assets/demo.png)

## Features

- **Select & Ask** — Highlight any word or sentence; a floating toolbar appears instantly
- **4 Built-in Actions**
  - 🔍 **Explain** — Academic or technical term explanations
  - 🔤 **Translate** — Auto-detects language; Chinese ↔ English
  - 📝 **Summarize** — Summarize selected text or the full page
  - 💻 **Code** — Explain code logic and behavior
- **Custom Actions** — Add your own prompts with custom icons and names; use `{{text}}` as a placeholder for the selected text
- **Floating Chat Windows** — Draggable, closeable, multi-window; each window maintains its own conversation history for follow-up questions
- **Streaming Output** — Token-by-token typewriter effect via SSE
- **Markdown Rendering** — Responses render with headings, bold, code blocks, lists, etc.
- **OpenAI-Compatible** — Works with OpenAI, local Ollama, or any OpenAI-compatible proxy
- **Privacy-First** — Your API key is stored locally in `chrome.storage`; no data passes through any intermediary server

## Installation

This extension is not published to the Chrome Web Store. Load it locally in developer mode.

**Requirements:** Chrome 88+ (Manifest V3 support)

1. Clone or download this repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/ai-lookup-extension.git
   ```
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the `ai-lookup-extension/` folder
5. The extension icon will appear in your toolbar

## Configuration

Click the extension icon to open the settings popup:

| Field | Description | Default |
|-------|-------------|---------|
| API Key | Your OpenAI (or compatible) API key | *(required)* |
| Base URL | API endpoint | `https://api.openai.com/v1` |
| Model | Model name | `gpt-4o-mini` |
| System Prompt | AI role instruction | Academic term explainer |

**Using a proxy or local model:**
- Ollama: set Base URL to `http://localhost:11434/v1`, Model to `llama3`
- Any OpenAI-compatible API: just change the Base URL and model name

## Custom Actions

In the settings popup, scroll to **气泡按钮 (Bubble Buttons)**:

1. Toggle built-in actions on/off
2. Click **＋ 添加自定义指令** to add a custom action
3. Set an icon (emoji or text), a name, and a prompt
4. Use `{{text}}` in the prompt to represent the selected text
5. Drag rows to reorder; click ✕ to delete
6. Click **保存** to save

**Example custom prompts:**
```
请为以下概念推荐3篇相关学术文献：{{text}}
请用费曼技巧解释：{{text}}
Write a Python function that implements: {{text}}
```

## Usage

1. Select any text on a webpage (works on ChatGPT, Claude, articles, documentation, etc.)
2. A floating toolbar appears below the selection
3. Click an action button — a floating chat window opens and the AI responds automatically
4. Ask follow-up questions in the input box (Enter to send, Shift+Enter for newline)
5. Open multiple windows simultaneously; drag them to reposition

> **After reloading the extension**, refresh any open tabs before using it.

## File Structure

```
ai-lookup-extension/
├── manifest.json        # Extension config (Manifest V3)
├── content_script.js    # Injected into all pages; bubble + floating windows
├── background.js        # Service worker; bridges storage API to content script
├── popup.html           # Settings page UI
├── popup.js             # Settings page logic
├── icon16.png
├── icon48.png
└── icon128.png
```

## Privacy

- Your API key is stored only in `chrome.storage.local` on your device
- Requests go directly from your browser to your configured API endpoint
- No analytics, no tracking, no external services beyond your AI provider

## License

MIT
