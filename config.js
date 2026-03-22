// Blip configuration
// Static settings only. Site/GitHub config is stored in chrome.storage.local via the sidebar UI.

const BLIP_CONFIG = {
  // File resolution
  // File resolution
  files: {
    editableExtensions: ['.html', '.htm', '.shtml', '.md', '.txt'],
    localEditableExtensions: ['.html', '.htm', '.shtml', '.md', '.txt'],
    devExtensions: ['.php', '.asp', '.aspx', '.rss', '.txt', '.css', '.js', '.json', '.xml', '.svg', '.py', '.ts', '.tsx', '.jsx'],
    excludePatterns: ['template', '.git', '.vscode', '.github', '.blip', '.claude', '.gemini', '.agent', '.antigravity', '.codex', '.copilot', '.cursor', '.ref', 'node_modules', 'dist']
  },

  // Sidebar settings
  sidebar: {
    widthPx: 300,
    startCollapsed: true
  },


  // Pro mode
  membership: {
    foundingMember: false,
    foundingVIP: false
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


};