// Blip configuration
// Static settings only. Site/GitHub config is stored in chrome.storage.local via the sidebar UI.

const BLIP_CONFIG = {
  // File resolution
  files: {
    editableExtensions: ['.html', '.php'],
    excludePatterns: ['template']
  },

  // Sidebar settings
  sidebar: {
    widthPx: 300,
    startCollapsed: true
  },

  // Dev mode
  dev: {
    enabled: true,
    showNotifications: true
  },

  // MutationObserver settings
  observer: {
    settleDelayMs: 150
  },

  // LLM safety net (Groq)
  llm: {
    enabled: false,
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    apiKey: ''
  }
};