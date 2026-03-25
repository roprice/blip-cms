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
    widthPx: 350,
    startCollapsed: true
  },


  // Pro mode
  membership: {
    foundingMember: false,
    foundingVIP: false
  },

  // Capability map: which features each tier unlocks
  capabilities: {
    foundingMember: ['github-commit', 'local-file-edit', 'add-site'],
    foundingVIP: ['github-commit', 'local-file-edit', 'add-site', 'unlimited-sites']
  },

  // License cache TTL (7 days in ms)
  licenseTTL: 7 * 24 * 60 * 60 * 1000,

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