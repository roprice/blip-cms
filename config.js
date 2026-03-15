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


  // Pro mode
  membership: {
    foundingMember: false,
    foundingVIP: false
  },

  // Dev mode
  dev: {
    enabled: false,
    showNotifications: true
  },

  // MutationObserver settings
  observer: {
    settleDelayMs: 150
  },


};