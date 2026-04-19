// Sidebar script
// Manages both collapsed (tab widget) and expanded (full sidebar) views

// -------------------------------------------------------
// Expanded view elements
// -------------------------------------------------------
const editBtn = document.getElementById("editBtn");
const saveBtn = document.getElementById("saveBtn");
const cancelBtn = document.getElementById("cancelBtn");
const closeBtn = document.getElementById("closeBtn");
const defaultState = document.getElementById("defaultState");
const editingState = document.getElementById("editingState");
const savingState = document.getElementById("savingState");
const fileList = document.getElementById("fileList");
const notifications = document.getElementById("notifications");
const devLog = document.getElementById("devLog");
const devPanel = document.getElementById("devPanel");
const devToggle = document.getElementById("devToggle");
const configPanel = document.getElementById("configPanel");
const configToggle = document.getElementById("configToggle");
const configBody = document.getElementById("configBody");
const addSiteBtn = document.getElementById("addSiteBtn");
const addSiteForm = document.getElementById("addSiteForm");
const siteForm = document.getElementById("siteForm");
const cancelAddSite = document.getElementById("cancelAddSite");
const savedSitesList = document.getElementById("savedSitesList");

// Local file elements
const localGrantState = document.getElementById("localGrantState");
const grantAccessBtn = document.getElementById("grantAccessBtn");
const localFileInfo = document.getElementById("localFileInfo");
const localFileName = document.getElementById("localFileName");
const localGrantFile = document.getElementById("localGrantFile");

// Save-to and edit history elements
const saveToRepo = document.getElementById("saveToRepo");
const saveToCheckbox = document.getElementById("saveToCheckbox");
const saveToSiteName = document.getElementById("saveToSiteName");
const saveToPrompt = document.getElementById("saveToPrompt");
const promptSiteName = document.getElementById("promptSiteName");
const editsContainer = document.getElementById("editsContainer");
const copyEditsBtn = document.getElementById("copyEditsBtn");

const editsWrapper = document.getElementById("editsWrapper");
const editsPlaceholder = document.getElementById("editsPlaceholder");

// Track whether current site has a working repo connection
let siteConnected = false;

// Track whether we're in local file mode (file:// URL with Pro)
let isLocalFileMode = false;

// -------------------------------------------------------
// View elements
// -------------------------------------------------------
const collapsedView = document.getElementById("collapsedView");
const expandedView = document.getElementById("expandedView");
const blipTab = document.getElementById("blipTab");

// License panel elements
const licensePanel = document.getElementById("licensePanel");
const unlicensedState = document.getElementById("unlicensedState");
const memberState = document.getElementById("memberState");
const vipState = document.getElementById("vipState");
const licenseActiveBadge = document.getElementById("licenseActiveBadge");
const licenseKeyInput = document.getElementById("licenseKeyInput");
const activateBtn = document.getElementById("activateBtn");
const activateError = document.getElementById("activateError");
const maskedKeyDisplay = document.getElementById("maskedKeyDisplay");

// -------------------------------------------------------
// Communication with content script
// -------------------------------------------------------
function sendToContent(action, data = {}) {
  window.parent.postMessage({ source: "blip-sidebar", action, ...data }, "*");
}

// -------------------------------------------------------
// Collapsed view: tab widget click handling
// -------------------------------------------------------
blipTab.addEventListener("click", (e) => {
  const action = e.target.dataset?.action;
  if (!action) return;
  if (action === "expandSidebar") {
    sendToContent("expandSidebar");
    return;
  }
  sendToContent(action);
});

// In sidebar.js
blipTab.addEventListener("mousedown", (e) => {
  // Only initiate drag on the tab-name area, not controls
  if (e.target.dataset?.action) return;

  // Tell the main page to start dragging the iframe
  window.parent.postMessage(
    {
      source: "blip-sidebar",
      action: "dragStart",
      offsetY: e.clientY,
    },
    "*",
  );

  e.preventDefault();
});
// -------------------------------------------------------
// Expanded view: button handlers
// -------------------------------------------------------
editBtn.addEventListener("click", () => {
  editBtn.disabled = true;
  editBtn.textContent = "Loading...";
  sendToContent("startEdit");
});

saveBtn.addEventListener("click", () => {
  showSaving();
  if (isLocalFileMode) {
    // Local file mode: save directly to disk
    sendToContent("saveLocal");
  } else {
    // Normal mode: commit to GitHub or capture diff
    const commitToRepo = siteConnected && saveToCheckbox.checked;
    sendToContent("save", { commitToRepo });
  }
});

cancelBtn.addEventListener("click", () => {
  sendToContent("cancel");
});

closeBtn.addEventListener("click", () => {
  sendToContent("closeSidebar");
});

devToggle.addEventListener("click", () => {
  devPanel.classList.toggle("collapsed");
});

configToggle.addEventListener("click", () => {
  configPanel.classList.toggle("collapsed");
});

grantAccessBtn.addEventListener("click", () => {
  grantAccessBtn.disabled = true;
  grantAccessBtn.textContent = "Waiting for permission...";
  sendToContent("grantLocalAccess");
});

// -------------------------------------------------------
// Edit history: copy button
// -------------------------------------------------------
// Delegated click handler for per-site copy and clear buttons
editsWrapper.addEventListener("click", (e) => {
  // Toggle collapse on header click (but not on action buttons)
  const header = e.target.closest(".edits-site-header");
  const action = e.target.closest(".edits-site-action");

  if (header && !action) {
    const section = header.closest(".edits-site-section");
    if (section) section.classList.toggle("collapsed");
    return;
  }

  if (!action) return;

  const section = action.closest(".edits-site-section");
  if (!section) return;

  const container = section.querySelector(".edits-site-container");

  // Copy action: build structured plain-text from diff entries
  if (action.classList.contains("copy-action")) {
    const siteKey = section.dataset.site;
    const entries = container.querySelectorAll(".diff-entry");
    if (!entries.length) return;

    // Extract changed phrases (group consecutive marks into single strings)
    function extractPhrases(el) {
      const phrases = [];
      let current = [];
      for (const node of el.childNodes) {
        if (node.nodeName === "MARK") {
          current.push(node.textContent);
        } else {
          if (current.length && node.textContent.trim() === "") {
            current.push(node.textContent);
          } else if (current.length) {
            const phrase = current.join("").trim();
            if (phrase) phrases.push(phrase);
            current = [];
          }
        }
      }
      if (current.length) {
        const phrase = current.join("").trim();
        if (phrase) phrases.push(phrase);
      }
      return phrases;
    }

    const stripTags = (s) => s.replace(/<[^>]*>/g, "");

    const lines = [];
    entries.forEach((entry) => {
      const filename = entry.querySelector(".diff-filename");
      const timestamp = entry.querySelector(".diff-timestamp");
      const befores = entry.querySelectorAll(".diff-before");
      const afters = entry.querySelectorAll(".diff-after");

      const path = filename ? filename.textContent.trim() : "/";
      const fullUrl = "https://" + siteKey + path;

      const removed = [];
      const added = [];
      befores.forEach((b) => removed.push(...extractPhrases(b)));
      afters.forEach((a) => added.push(...extractPhrases(a)));

      let summary = fullUrl;
      if (removed.length || added.length) {
        const parts = [];
        if (removed.length) parts.push('removed "' + removed.map(stripTags).join('", "') + '"');
        if (added.length) parts.push('added "' + added.map(stripTags).join('", "') + '"');
        summary += " - " + parts.join(", ");
      }
      lines.push(summary);

      for (let i = 0; i < Math.max(afters.length, befores.length); i++) {
        if (afters[i]) lines.push("after edit:\n" + afters[i].textContent);
        if (befores[i]) lines.push("before edit:\n" + befores[i].textContent);
      }

      const ts = timestamp ? timestamp.textContent.trim() : "";
      lines.push("[edited " + ts + ", with Blip https://blipcms.com]");
      lines.push("");
    });

    const text = lines.join("\n");
    navigator.clipboard.writeText(text).then(() => {
      action.textContent = "check";
      action.classList.add("copied");
      setTimeout(() => {
        action.textContent = "content_copy";
        action.classList.remove("copied");
      }, 1500);
    });
  }

  // Clear action
  if (action.classList.contains("clear-action")) {
    section.remove();
    // Show placeholder if no sections remain
    if (!editsWrapper.querySelector(".edits-site-section")) {
      const ph = document.createElement("p");
      ph.id = "editsPlaceholder";
      ph.className = "edits-placeholder";
      ph.textContent = "Your edits will appear here as you save changes.";
      editsWrapper.appendChild(ph);
    }
    saveEditHistory();
  }
});

// -------------------------------------------------------
// Edit history: prepend a diff entry to the textarea
// -------------------------------------------------------
/**
 * Append a diff entry (HTML string) to the correct per-site container.
 * Creates the site section if it doesn't exist yet.
 * diffHtml is expected to contain a .diff-header with the site hostname.
 */
function appendDiffEntry(diffHtml) {
  // Remove global placeholder
  if (editsPlaceholder) editsPlaceholder.remove();

  // Extract hostname from the diff HTML's diff-header content
  const tmp = document.createElement("div");
  tmp.innerHTML = diffHtml;
  const headerEl = tmp.querySelector(".diff-header");
  const fullUrl = headerEl ? headerEl.textContent.trim() : "unknown";
  const siteKey = (fullUrl.split("/")[0] || "unknown").replace(/^www\./, "");

  // Collapse all other site sections (AFTER siteKey is defined)
  editsWrapper.querySelectorAll(".edits-site-section").forEach((s) => {
    if (s.dataset.site !== siteKey) {
      s.classList.add("collapsed");
    }
  });

  // Find or create the per-site section
  let section = editsWrapper.querySelector(`.edits-site-section[data-site="${siteKey}"]`);
  // ... rest of function
  if (!section) {
    section = document.createElement("div");
    section.className = "edits-site-section";
    section.dataset.site = siteKey;
    section.innerHTML = `
            <div class="edits-site-header">
                <span class="edits-site-name">${escapeHtml(siteKey)}</span>
                <span class="material-symbols-outlined edits-site-action copy-action" title="Copy edits">content_copy</span>
                <span class="material-symbols-outlined edits-site-action clear-action" title="Clear edits">delete_outline</span>
                <span class="material-symbols-outlined edits-site-toggle" title="Collapse/expand">expand_more</span>
            </div>
            <div class="edits-site-container"></div>
        `;
    // Prepend new sites at top
    editsWrapper.prepend(section);
  }

  // Ensure current site section is expanded
  section.classList.remove("collapsed");

  // Move current site section to top of wrapper
  editsWrapper.prepend(section);

  // Prepend the diff entry into the site's container
  const container = section.querySelector(".edits-site-container");
  container.insertAdjacentHTML("afterbegin", diffHtml);
  container.scrollTop = 0;

  // Persist all edits
  saveEditHistory();
}

/**
 * Save all per-site edit history to chrome.storage.local.
 * Stores as { 'site.com': '<html>...', ... }
 */
function saveEditHistory() {
  const data = {};
  editsWrapper.querySelectorAll(".edits-site-section").forEach((section) => {
    const site = section.dataset.site;
    const container = section.querySelector(".edits-site-container");
    if (container && container.innerHTML.trim()) {
      data[site] = container.innerHTML;
    }
  });
  chrome.storage.local.set({ blipEditHistory: data });
}

// -------------------------------------------------------
// Collapsible file site groups: delegated click handler
// -------------------------------------------------------
fileList.addEventListener("click", (e) => {
  // Clickable file navigation
  const fileItem = e.target.closest(".file-item[data-url]");
  if (fileItem) {
    const url = fileItem.dataset.url;
    if (url) sendToContent("navigateTo", { url });
    return;
  }
  // Collapse toggle
  const header = e.target.closest(".file-site-header");
  if (!header) return;
  const website = header.closest(".file-website");
  if (website) website.classList.toggle("collapsed");
});

// -------------------------------------------------------
// Config: add site form
// -------------------------------------------------------
addSiteBtn.addEventListener("click", () => {
  addSiteForm.classList.remove("hidden");
  addSiteBtn.classList.add("hidden");
});

cancelAddSite.addEventListener("click", () => {
  addSiteForm.classList.add("hidden");
  addSiteBtn.classList.remove("hidden");
  siteForm.reset();
});

siteForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const siteUrl = document
    .getElementById("fieldSiteUrl")
    .value.trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  // Split "owner/repo" into parts from single field
  const repoRaw = document.getElementById("fieldRepo").value.trim();
  const slashIdx = repoRaw.indexOf("/");
  const owner = slashIdx > 0 ? repoRaw.slice(0, slashIdx).trim() : "";
  const repo = slashIdx > 0 ? repoRaw.slice(slashIdx + 1).trim() : "";
  const branch = document.getElementById("fieldBranch").value.trim() || "main";
  const token = document.getElementById("fieldToken").value.trim();

  if (!siteUrl || !owner || !repo || !token) return;

  const result = await new Promise((resolve) => {
    chrome.storage.local.get(["blipSites"], resolve);
  });

  const sites = result.blipSites || [];
  const existingIndex = sites.findIndex((s) => s.siteUrl === siteUrl);
  const newSite = { siteUrl, owner, repo, branch, token };

  if (existingIndex >= 0) {
    sites[existingIndex] = newSite;
  } else {
    sites.push(newSite);
  }

  await new Promise((resolve) => {
    chrome.storage.local.set({ blipSites: sites }, resolve);
  });

  siteForm.reset();
  addSiteForm.classList.add("hidden");
  addSiteBtn.classList.remove("hidden");
  renderSavedSites(sites);

  // Re-evaluate license caps (e.g. founding member 1-site limit)
  chrome.storage.local.get(["blipMembership", "blipLicenseKey"], (result) => {
    setLicenseState(result.blipMembership || null, result.blipLicenseKey || null);
  });
});

async function renderSavedSites(sites) {
  if (!sites) {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(["blipSites"], resolve);
    });
    sites = result.blipSites || [];
  }

  document.body.setAttribute("data-site-count", sites.length);

  if (sites.length === 0) {
    savedSitesList.innerHTML = "";
    return;
  }

  savedSitesList.innerHTML = sites
    .map(
      (s, i) => `
    <div class="config-site-item">
      <span class="config-site-url">${escapeHtml(s.siteUrl)}</span>
      <span class="config-site-meta">${escapeHtml(s.owner)}/${escapeHtml(s.repo)} · ${escapeHtml(s.branch)}</span>
      <button class="config-delete-btn" data-index="${i}">Remove</button>
    </div>
  `,
    )
    .join("");

  savedSitesList.querySelectorAll(".config-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const index = parseInt(btn.dataset.index);
      sites.splice(index, 1);
      await new Promise((resolve) => {
        chrome.storage.local.set({ blipSites: sites }, resolve);
      });
      renderSavedSites(sites);

      // Re-evaluate license caps (e.g. founding member can add again after deleting)
      chrome.storage.local.get(["blipMembership", "blipLicenseKey"], (result) => {
        setLicenseState(result.blipMembership || null, result.blipLicenseKey || null);
      });
    });
  });
}

// -------------------------------------------------------
// View toggling
// -------------------------------------------------------
function showCollapsedView() {
  document.body.classList.remove("sidebar-expanded");
  collapsedView.classList.remove("hidden");
  expandedView.classList.add("hidden");
}

// Expose collapse for inline onclick handlers (Stripe purchase links)
window.collapseSidebar = function () {
  sendToContent("closeSidebar");
};

function showExpandedView() {
  document.body.classList.add("sidebar-expanded");
  expandedView.classList.remove("hidden");
  collapsedView.classList.add("hidden");
}

// -------------------------------------------------------
// Tab state management
// -------------------------------------------------------
let tabContractTimer = null;

function setTabState(state) {
  blipTab.className = "blip-tab tab-state-" + state;
  if (state === "saved") {
    if (tabContractTimer) clearTimeout(tabContractTimer);
    tabContractTimer = setTimeout(() => {
      setTabState("default");
      tabContractTimer = null;
    }, 1500);
  }
}

// -------------------------------------------------------
// Expanded view: state transitions
// -------------------------------------------------------
function showEditing() {
  defaultState.classList.add("hidden");
  savingState.classList.add("hidden");
  editingState.classList.remove("hidden");
  saveBtn.disabled = true;
  cancelBtn.disabled = false;
  editBtn.disabled = false;
  editBtn.textContent = "Edit";
  clearNotifications();

  // Show appropriate save-to section based on connection status
  if (siteConnected) {
    saveToRepo.classList.remove("hidden");
    saveToPrompt.classList.add("hidden");
  } else if (currentSiteUrl) {
    saveToRepo.classList.add("hidden");
    saveToPrompt.classList.remove("hidden");
    promptSiteName.textContent = currentSiteUrl;
  } else {
    saveToRepo.classList.add("hidden");
    saveToPrompt.classList.add("hidden");
  }

  // Show local file info when in local mode
  if (isLocalFileMode) {
    localFileInfo.classList.remove("hidden");
    saveToRepo.classList.add("hidden");
    saveToPrompt.classList.add("hidden");
  } else {
    localFileInfo.classList.add("hidden");
  }
}

function showSaving() {
  editingState.classList.add("hidden");
  defaultState.classList.add("hidden");
  savingState.classList.remove("hidden");
}

function showDefault() {
  editingState.classList.add("hidden");
  savingState.classList.add("hidden");
  defaultState.classList.remove("hidden");
  editBtn.disabled = false;
  editBtn.textContent = "Edit";
  // Hide save-to sections when not editing
  saveToRepo.classList.add("hidden");
  saveToPrompt.classList.add("hidden");
}

function showSyncing(message) {
  savingState.classList.add("hidden");
  editingState.classList.add("hidden");
  defaultState.classList.add("hidden");
  showNotification(message, "info");
}

// -------------------------------------------------------
// Notifications
// -------------------------------------------------------
function showNotification(message, type = "success") {
  const div = document.createElement("div");
  div.className = `notification ${type}`;
  div.textContent = message;
  notifications.appendChild(div);
  if (type === "success") {
    setTimeout(() => div.remove(), 4000);
  }
}

function showErrorWithReload(userMessage) {
  clearNotifications();
  const div = document.createElement("div");
  div.className = "notification error";
  div.innerHTML = `
    <div style="margin-bottom: 8px;">${escapeHtml(userMessage)}</div>
    <button class="btn-reload" onclick="window.parent.postMessage({source:'blip-sidebar',action:'reloadPage'},'*')">
      Reload page and try again
    </button>
  `;
  notifications.appendChild(div);
}

function clearNotifications() {
  notifications.innerHTML = "";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// -------------------------------------------------------
// File list: collapsible site groups with connection icons
// -------------------------------------------------------
let currentSiteUrl = null;

// Store all known sites and their file lists for multi-site display
let knownSites = {};

function updateFileList(resolvedFile, editableFiles, siteUrl, connected) {
  if (!fileList || !editableFiles) return;
  if (siteUrl) currentSiteUrl = siteUrl;

  // Track connection status for the save-to checkbox
  if (connected !== undefined) siteConnected = connected;

  // Update save-to site name
  if (siteConnected && currentSiteUrl) {
    saveToSiteName.textContent = currentSiteUrl;
  }

  // Store this site's file list
  if (siteUrl) {
    knownSites[siteUrl] = {
      files: editableFiles,
      resolvedFile: resolvedFile,
      connected: connected !== false,
    };
  }

  // Render all known sites
  renderAllSites();

  // Enable/disable edit button based on resolved file
  if (!resolvedFile) {
    editBtn.disabled = true;
  } else {
    editBtn.disabled = false;
  }
}

function renderAllSites() {
  let html = "";

  for (const [siteUrl, siteData] of Object.entries(knownSites)) {
    const sorted = [...siteData.files].sort((a, b) => a.localeCompare(b));
    const isConnected = siteData.connected;
    const connectionClass = isConnected ? "connected" : "disconnected";
    const connectionIcon = isConnected ? "sync" : "sync_disabled";

    // Chevron SVG for collapse toggle
    const chevron = `<span class="site-toggle">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="2,3 5,7 8,3"/>
            </svg>
        </span>`;

    html += `<div class="file-website ${connectionClass}">`;
    html += `<div class="file-site-header">
            ${escapeHtml(siteUrl)}
            <span class="connection-status"><span class="material-symbols-outlined">${connectionIcon}</span></span>
            ${chevron}
        </div>`;
    html += `<div class="file-items">`;

    for (const fileName of sorted) {
      const isActive = fileName === siteData.resolvedFile;
      const fileUrl = isConnected ? `https://${escapeHtml(siteUrl)}/${escapeHtml(fileName)}` : null;
      const clickAttr = fileUrl ? `data-url="${fileUrl}"` : "";
      html += `<div class="file-item ${isActive ? "active" : ""}" ${clickAttr}>
                <span class="file-dot"></span>
                <span class="file-name">${escapeHtml(fileName)}</span>
            </div>`;
    }

    html += `</div></div>`;
  }

  fileList.innerHTML = html;
}

// -------------------------------------------------------
// Dev logging
// -------------------------------------------------------
function devLogEntry(label, value, status = "", entryId = null) {
  if (entryId) {
    const existing = devLog.querySelector(`[data-entry-id="${entryId}"]`);
    if (existing) {
      existing.innerHTML = `<span class="label">${label}:</span> <span class="value ${status}">${value}</span>`;
      devLog.scrollTop = devLog.scrollHeight;
      return;
    }
  }
  const entry = document.createElement("div");
  entry.className = "entry";
  if (entryId) entry.dataset.entryId = entryId;
  entry.innerHTML = `<span class="label">${label}:</span> <span class="value ${status}">${value}</span>`;
  devLog.appendChild(entry);
  devLog.scrollTop = devLog.scrollHeight;
}

function devLogSeparator() {
  const entry = document.createElement("div");
  entry.className = "entry separator";
  entry.innerHTML = '<hr style="border: none; border-top: 1px solid rgba(0,0,0,0.06); margin: 4px 0;">';
  devLog.appendChild(entry);
  devLog.scrollTop = devLog.scrollHeight;
}

// -------------------------------------------------------
// Message handler: receive from content script
// -------------------------------------------------------
window.addEventListener("message", (event) => {
  const msg = event.data;
  if (msg.source !== "blip-content") return;

  switch (msg.action) {
    case "mappingEstimate":
      editBtn.disabled = true;
      let remaining = Math.ceil(msg.estimatedMs / 1000);
      const labels = ["Mapping"];
      let labelIdx = 0;
      const hint = remaining > 10 ? " (large page)" : "";
      editBtn.textContent = `${labels[0]}... ~${remaining}s${hint}`;
      const countdownInterval = setInterval(() => {
        remaining--;
        labelIdx = 1 - labelIdx;
        if (remaining <= 0) {
          clearInterval(countdownInterval);
          editBtn.textContent = "Almost ready...";
        } else {
          editBtn.textContent = `${labels[labelIdx]}... ~${remaining}s`;
        }
      }, 1000);
      window._blipCountdownInterval = countdownInterval;
      break;
    case "hostInfo":
      // Auto-expand edits section for current site, collapse others, bubble to top
      editsWrapper.querySelectorAll(".edits-site-section").forEach((s) => {
        if (s.dataset.site === msg.hostname) {
          s.classList.remove("collapsed");
          editsWrapper.prepend(s);
        } else {
          s.classList.add("collapsed");
        }
      });
      break;
    case "collapse":
      showCollapsedView();
      break;
    case "expand":
      showExpandedView();
      break;
    case "tabState":
      setTabState(msg.state);
      break;
    case "editStarted":
      if (window._blipCountdownInterval) {
        clearInterval(window._blipCountdownInterval);
        window._blipCountdownInterval = null;
      }
      showEditing();
      break;
    case "editsDetected":
      saveBtn.disabled = false;
      break;
    case "saved":
      showDefault();
      if (isLocalFileMode && siteConnected) {
        showNotification("Saved to file");
      } else if (siteConnected && currentSiteUrl) {
        showNotification("Saved to " + currentSiteUrl);
      } else {
        showNotification("Saved to Blip");
      }
      break;
    case "cancelled":
      showDefault();
      break;
    case "noChanges":
      showEditing();
      showNotification("Nothing to save yet. Make some edits first.", "info");
      break;
    case "syncError":
      showSyncing(msg.userMessage || "Re-syncing...");
      break;
    case "recovered":
      showDefault();
      showNotification("Synced. Your edits were not saved, but you can try again.", "error");
      break;
    case "recoveryFailed":
      showDefault();
      showErrorWithReload(msg.userMessage || "Could not sync. Please reload the page.");
      break;
    case "error":
      showEditing();
      if (msg.recoverable) {
        showNotification(msg.userMessage || "Something went wrong", "error");
      } else {
        showErrorWithReload(msg.userMessage || "Something went wrong. Try reloading the page.");
      }
      break;
    case "fileInfo":
      // connected flag: true if repo is reachable and file resolved
      updateFileList(msg.resolvedFile, msg.editableFiles, msg.siteUrl, msg.connected);
      break;
    case "noSiteConfig":
      // No repo configured for this site.
      // Do NOT disable editing - free users can still edit (freemium DOM-only mode).
      siteConnected = false;
      currentSiteUrl = window.location ? window.location.hostname : null;
      fileList.innerHTML = '<p class="file-list-hint">Connect a GitHub repo in Settings to enable saving.</p>';
      configPanel.classList.remove("collapsed");
      break;
    case "diffEntry":
      // Append formatted diff text to the edits textarea
      appendDiffEntry(msg.diffText);
      break;
    case "devLog":
      devLogEntry(msg.label, msg.value, msg.status || "", msg.entryId || null);
      break;
    case "devSeparator":
      devLogSeparator();
      break;
    case "localFileStatus":
      handleLocalFileStatus(msg);
      break;
    case "licenseActivated":
      // Activation succeeded - update UI, reset buttons
      setLicenseState({ [msg.tier]: true }, msg.key);
      activateBtn.disabled = false;
      activateBtn.textContent = "Activate Pro";
      if (upgradeBtn) {
        upgradeBtn.disabled = false;
        upgradeBtn.textContent = "Activate VIP";
      }
      // Reset edit-key form if it was used
      if (editKeyForm) {
        editKeyForm.classList.add("hidden");
        editKeyInput.value = "";
        editKeyActivateBtn.disabled = false;
        editKeyActivateBtn.textContent = "Activate";
      }
      if (editKeyBtn) editKeyBtn.classList.remove("hidden");
      if (maskedKeyDisplay) maskedKeyDisplay.classList.remove("hidden");
      break;
    case "licenseError":
      // Activation failed - show error, reset buttons
      if (msg.error === "network") {
        activateError.textContent =
          "We couldn't verify your key right now. This is usually temporary - try again in a moment, or email support@blipcms.com";
      } else {
        activateError.textContent =
          "We couldn't verify this key. Please double-check it and try again, or email support@blipcms.com";
      }
      activateError.classList.remove("hidden");
      activateBtn.disabled = false;
      activateBtn.textContent = "Activate Pro";
      if (upgradeBtn) {
        upgradeBtn.disabled = false;
        upgradeBtn.textContent = "Activate VIP";
      }
      if (editKeyActivateBtn) {
        editKeyActivateBtn.disabled = false;
        editKeyActivateBtn.textContent = "Activate";
      }
      break;
  }
});

// -------------------------------------------------------
// Local file mode handling
// -------------------------------------------------------
// -------------------------------------------------------
// Local file mode handling
// -------------------------------------------------------
function handleLocalFileStatus(msg) {
  switch (msg.status) {
    case "ready":
      isLocalFileMode = true;
      defaultState.classList.remove("hidden");
      localGrantState.classList.add("hidden");
      editBtn.disabled = false;
      editBtn.textContent = "Edit";
      localFileName.textContent = msg.fileName;
      grantAccessBtn.disabled = false;
      grantAccessBtn.textContent = "Grant folder access";
      break;

    case "needs-grant":
      isLocalFileMode = true;
      defaultState.classList.add("hidden");
      editBtn.disabled = true;
      localGrantState.classList.remove("hidden");
      localGrantFile.textContent = msg.fileName;
      break;

    case "not-pro":
      isLocalFileMode = false;
      editBtn.disabled = false;
      break;

    case "error":
      isLocalFileMode = false;
      showNotification(msg.error || "Local file error", "error");
      localGrantState.classList.add("hidden");
      grantAccessBtn.disabled = false;
      grantAccessBtn.textContent = "Grant folder access";
      break;
  }
}

// -------------------------------------------------------
// License panel: set UI state based on stored membership
// -------------------------------------------------------
function setLicenseState(membership, licenseKey) {
  // Determine tier
  let tier = "free";
  if (membership && membership.foundingVIP) tier = "foundingVIP";
  else if (membership && membership.foundingMember) tier = "foundingMember";

  // Set tier on body - CSS handles all show/hide from here
  document.body.setAttribute("data-tier", tier);

  // Set capability flags from config
  const caps = BLIP_CONFIG.capabilities[tier] || [];
  const allCaps = ["github-commit", "local-file-edit", "add-site", "unlimited-sites"];
  for (const cap of allCaps) {
    const attr = "data-can-" + cap;
    if (caps.includes(cap)) {
      document.body.setAttribute(attr, "");
    } else {
      document.body.removeAttribute(attr);
    }
  }

  // The few things CSS can't do: set masked key text, disable form inputs
  if (tier !== "free" && licenseKey) {
    maskedKeyDisplay.textContent = licenseKey.substring(0, 8) + "••••••••••••••••••••";
  }

  // Disable form inputs for free users (CSS greys them out, this prevents submission)
  const formFields = siteForm.querySelectorAll('input, button[type="submit"]');
  formFields.forEach((el) => {
    el.disabled = !caps.includes("add-site");
  });

  // Pro tiers: collapse license panel by default
  if (tier === "foundingVIP" || tier === "foundingMember") {
    licensePanel.classList.add("collapsed");
  }

  // Founding Member: disable add-site if they already have one configured
  if (tier === "foundingMember") {
    chrome.storage.local.get(["blipSites"], (result) => {
      const sites = result.blipSites || [];
      if (sites.length >= 1) {
        document.body.removeAttribute("data-can-add-site");
        const fields = siteForm.querySelectorAll('input, button[type="submit"]');
        fields.forEach((el) => {
          el.disabled = true;
        });
      }
    });
  }
}

// -------------------------------------------------------
// License activation (routes through content.js -> licensing.js -> background.js)
// -------------------------------------------------------
activateBtn.addEventListener("click", () => {
  const key = licenseKeyInput.value.trim();
  if (!key) return;

  activateBtn.disabled = true;
  activateBtn.textContent = "Checking...";
  activateError.classList.add("hidden");

  sendToContent("activateKey", { key });
});

// Upgrade button (Founding Member -> VIP)
const upgradeKeyInput = document.getElementById("upgradeKeyInput");
const upgradeBtn = document.getElementById("upgradeBtn");

if (upgradeBtn) {
  upgradeBtn.addEventListener("click", () => {
    const key = upgradeKeyInput.value.trim();
    if (!key) return;

    upgradeBtn.disabled = true;
    upgradeBtn.textContent = "Checking...";

    sendToContent("activateKey", { key });
  });
}

// Edit key: toggle between masked display and re-entry form
const editKeyBtn = document.getElementById("editKeyBtn");
const editKeyForm = document.getElementById("editKeyForm");
const editKeyInput = document.getElementById("editKeyInput");
const editKeyActivateBtn = document.getElementById("editKeyActivateBtn");

if (editKeyBtn) {
  editKeyBtn.addEventListener("click", () => {
    maskedKeyDisplay.classList.add("hidden");
    editKeyBtn.classList.add("hidden");
    editKeyForm.classList.remove("hidden");
    editKeyInput.focus();
  });
}

if (editKeyActivateBtn) {
  editKeyActivateBtn.addEventListener("click", () => {
    const key = editKeyInput.value.trim();
    if (!key) return;
    editKeyActivateBtn.disabled = true;
    editKeyActivateBtn.textContent = "Checking...";
    sendToContent("activateKey", { key });
  });
}
const editKeyCancelBtn = document.getElementById("editKeyCancelBtn");
if (editKeyCancelBtn) {
  editKeyCancelBtn.addEventListener("click", () => {
    editKeyForm.classList.add("hidden");
    editKeyInput.value = "";
    maskedKeyDisplay.classList.remove("hidden");
    editKeyBtn.classList.remove("hidden");
  });
}

// Init: load saved sites into config panel
renderSavedSites();

// Load persisted edit history
// Restore per-site edit history
chrome.storage.local.get(["blipEditHistory"], (result) => {
  const data = result.blipEditHistory;
  if (!data) return;

  // Handle legacy format (plain string from old textarea)
  if (typeof data === "string") {
    // Migrate: clear old format, user starts fresh with new per-site system
    chrome.storage.local.remove("blipEditHistory");
    return;
  }

  // New format: { 'site.com': '<html>...' }
  const sites = Object.keys(data);
  if (sites.length === 0) return;

  // Remove placeholder
  if (editsPlaceholder) editsPlaceholder.remove();

  for (const siteKey of sites) {
    const section = document.createElement("div");
    section.className = "edits-site-section";
    section.dataset.site = siteKey;
    section.innerHTML = `
            <div class="edits-site-header">
                <span class="edits-site-name">${escapeHtml(siteKey)}</span>
                <span class="material-symbols-outlined edits-site-action copy-action" title="Copy edits">content_copy</span>
                <span class="material-symbols-outlined edits-site-action clear-action" title="Clear edits">delete_outline</span>
                <span class="material-symbols-outlined edits-site-toggle" title="Collapse/expand">expand_more</span>
            </div>
            <div class="edits-site-container">${data[siteKey]}</div>
        `;
    editsWrapper.appendChild(section);
  }

  // Re-apply current-site prioritization (hostInfo may have fired before storage restored)
  if (currentSiteUrl) {
    const hostname = currentSiteUrl.replace(/^www\./, "");
    editsWrapper.querySelectorAll(".edits-site-section").forEach((s) => {
      if (s.dataset.site === hostname) {
        s.classList.remove("collapsed");
        editsWrapper.prepend(s);
      } else {
        s.classList.add("collapsed");
      }
    });
  }
});

// Global "Clear edits" button is removed from HTML.
// Per-site clear buttons handle clearing via the delegated handler above

// Load license state on init
chrome.storage.local.get(["blipMembership", "blipLicenseKey"], (result) => {
  setLicenseState(result.blipMembership || null, result.blipLicenseKey || null);
});

document.getElementById("licenseToggle").addEventListener("click", () => {
  document.getElementById("licensePanel").classList.toggle("collapsed");
});

// Tell the content script we're ready
sendToContent("ready");

// Show dev panel from storage toggle
chrome.storage.local.get(["blipDev"], (result) => {
  if (result.blipDev) {
    devPanel.style.display = "flex";
  }
});
