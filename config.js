// Blip configuration
// Alpha version: hardcoded values. Future: populated from chrome.storage via sidebar UI.

const BLIP_CONFIG = {
  // GitHub settings
  github: {
    owner: 'roprice',
    repo: 'remaphq-site',
    branch: 'main',
    token: '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'
  },

  // File resolution
  files: {
    editableExtensions: ['.html', '.php'],
    // Files matching these patterns are excluded from the editable list
    excludePatterns: ['template']
  },

  // Site matching
  site: {
    url: 'remaphq.com'
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
    apiKey: 'YOUR_GROQ_API_KEY'
  }
};
