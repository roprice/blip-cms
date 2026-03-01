// Blip configuration
// Alpha version: hardcoded values. Future: populated from chrome.storage via sidebar UI.

const BLIP_CONFIG = {
  // GitHub settings
  github: {
    owner: 'roprice',
    repo: 'remaphq-site',
    branch: 'main',
    filePath: 'index.html',
    token: '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'
  },

  // Site matching
  site: {
    url: 'remaphq.com'
  },

  // Sidebar settings
  sidebar: {
    defaultWidthPx: 300
  },

  // Dev mode
  dev: {
    enabled: true,
    showNotifications: true
  },

  // MutationObserver settings
  observer: {
    settleDelayMs: 150,
    trackOnlyUserInitiated: true
  }
};
