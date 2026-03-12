// Sidebar script
// Manages both collapsed (tab widget) and expanded (full sidebar) views

// -------------------------------------------------------
// Expanded view elements
// -------------------------------------------------------
const editBtn = document.getElementById('editBtn');
const saveBtn = document.getElementById('saveBtn');
const cancelBtn = document.getElementById('cancelBtn');
const closeBtn = document.getElementById('closeBtn');
const defaultState = document.getElementById('defaultState');
const editingState = document.getElementById('editingState');
const savingState = document.getElementById('savingState');
const fileList = document.getElementById('fileList');
const notifications = document.getElementById('notifications');
const devLog = document.getElementById('devLog');
const devPanel = document.getElementById('devPanel');
const devToggle = document.getElementById('devToggle');
const configPanel = document.getElementById('configPanel');
const configToggle = document.getElementById('configToggle');
const configBody = document.getElementById('configBody');
const addSiteBtn = document.getElementById('addSiteBtn');
const addSiteForm = document.getElementById('addSiteForm');
const siteForm = document.getElementById('siteForm');
const cancelAddSite = document.getElementById('cancelAddSite');
const savedSitesList = document.getElementById('savedSitesList');

// -------------------------------------------------------
// View elements
// -------------------------------------------------------
const collapsedView = document.getElementById('collapsedView');
const expandedView = document.getElementById('expandedView');
const blipTab = document.getElementById('blipTab');

// -------------------------------------------------------
// Communication with content script
// -------------------------------------------------------
function sendToContent(action, data = {}) {
    window.parent.postMessage({ source: 'blip-sidebar', action, ...data }, '*');
}

// -------------------------------------------------------
// Collapsed view: tab widget click handling
// -------------------------------------------------------
blipTab.addEventListener('click', (e) => {
    const action = e.target.dataset?.action;
    if (!action) return;
    if (action === 'expandSidebar') {
        sendToContent('expandSidebar');
        return;
    }
    sendToContent(action);
});

// -------------------------------------------------------
// Expanded view: button handlers
// -------------------------------------------------------
editBtn.addEventListener('click', () => {
    editBtn.disabled = true;
    editBtn.textContent = 'Loading...';
    sendToContent('startEdit');
});

saveBtn.addEventListener('click', () => {
    showSaving();
    sendToContent('save');
});

cancelBtn.addEventListener('click', () => {
    sendToContent('cancel');
});

closeBtn.addEventListener('click', () => {
    sendToContent('closeSidebar');
});

devToggle.addEventListener('click', () => {
    devPanel.classList.toggle('collapsed');
});

configToggle.addEventListener('click', () => {
    configPanel.classList.toggle('collapsed');
});

// -------------------------------------------------------
// Config: add site form
// -------------------------------------------------------
addSiteBtn.addEventListener('click', () => {
    addSiteForm.classList.remove('hidden');
    addSiteBtn.classList.add('hidden');
});

cancelAddSite.addEventListener('click', () => {
    addSiteForm.classList.add('hidden');
    addSiteBtn.classList.remove('hidden');
    siteForm.reset();
});

siteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const siteUrl = document.getElementById('fieldSiteUrl').value.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const owner = document.getElementById('fieldOwner').value.trim();
    const repo = document.getElementById('fieldRepo').value.trim();
    const branch = document.getElementById('fieldBranch').value.trim() || 'main';
    const token = document.getElementById('fieldToken').value.trim();

    if (!siteUrl || !owner || !repo || !token) return;

    const result = await new Promise((resolve) => {
        chrome.storage.local.get(['blipSites'], resolve);
    });

    const sites = result.blipSites || [];
    const existingIndex = sites.findIndex(s => s.siteUrl === siteUrl);
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
    addSiteForm.classList.add('hidden');
    addSiteBtn.classList.remove('hidden');
    renderSavedSites(sites);
});

async function renderSavedSites(sites) {
    if (!sites) {
        const result = await new Promise((resolve) => {
            chrome.storage.local.get(['blipSites'], resolve);
        });
        sites = result.blipSites || [];
    }

    if (sites.length === 0) {
        savedSitesList.innerHTML = '<p class="config-empty">No sites configured yet.</p>';
        return;
    }

    savedSitesList.innerHTML = sites.map((s, i) => `
    <div class="config-site-item">
      <span class="config-site-url">${escapeHtml(s.siteUrl)}</span>
      <span class="config-site-meta">${escapeHtml(s.owner)}/${escapeHtml(s.repo)} · ${escapeHtml(s.branch)}</span>
      <button class="config-delete-btn" data-index="${i}">Remove</button>
    </div>
  `).join('');

    savedSitesList.querySelectorAll('.config-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const index = parseInt(btn.dataset.index);
            sites.splice(index, 1);
            await new Promise((resolve) => {
                chrome.storage.local.set({ blipSites: sites }, resolve);
            });
            renderSavedSites(sites);
        });
    });
}

// -------------------------------------------------------
// View toggling
// -------------------------------------------------------
function showCollapsedView() {
    document.body.classList.remove('sidebar-expanded');
    collapsedView.classList.remove('hidden');
    expandedView.classList.add('hidden');
}

function showExpandedView() {
    document.body.classList.add('sidebar-expanded');
    expandedView.classList.remove('hidden');
    collapsedView.classList.add('hidden');
}

// -------------------------------------------------------
// Tab state management
// -------------------------------------------------------
let tabContractTimer = null;

function setTabState(state) {
    blipTab.className = 'blip-tab tab-state-' + state;
    if (state === 'saved') {
        if (tabContractTimer) clearTimeout(tabContractTimer);
        tabContractTimer = setTimeout(() => {
            setTabState('default');
            tabContractTimer = null;
        }, 1500);
    }
}

// -------------------------------------------------------
// Expanded view: state transitions
// -------------------------------------------------------
function showEditing() {
    defaultState.classList.add('hidden');
    savingState.classList.add('hidden');
    editingState.classList.remove('hidden');
    saveBtn.disabled = true;
    cancelBtn.disabled = false;
    editBtn.disabled = false;
    editBtn.textContent = 'Edit';
    clearNotifications();
}

function showSaving() {
    editingState.classList.add('hidden');
    defaultState.classList.add('hidden');
    savingState.classList.remove('hidden');
}

function showDefault() {
    editingState.classList.add('hidden');
    savingState.classList.add('hidden');
    defaultState.classList.remove('hidden');
    editBtn.disabled = false;
    editBtn.textContent = 'Edit';
}

function showSyncing(message) {
    savingState.classList.add('hidden');
    editingState.classList.add('hidden');
    defaultState.classList.add('hidden');
    showNotification(message, 'info');
}

// -------------------------------------------------------
// Notifications
// -------------------------------------------------------
function showNotification(message, type = 'success') {
    const div = document.createElement('div');
    div.className = `notification ${type}`;
    div.textContent = message;
    notifications.appendChild(div);
    if (type === 'success') {
        setTimeout(() => div.remove(), 4000);
    }
}

function showErrorWithReload(userMessage) {
    clearNotifications();
    const div = document.createElement('div');
    div.className = 'notification error';
    div.innerHTML = `
    <div style="margin-bottom: 8px;">${escapeHtml(userMessage)}</div>
    <button class="btn-reload" onclick="window.parent.postMessage({source:'blip-sidebar',action:'reloadPage'},'*')">
      Reload page and try again
    </button>
  `;
    notifications.appendChild(div);
}

function clearNotifications() {
    notifications.innerHTML = '';
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// -------------------------------------------------------
// File list (with site name header)
// -------------------------------------------------------
let currentSiteUrl = null;

function updateFileList(resolvedFile, editableFiles, siteUrl) {
    if (!fileList || !editableFiles) return;
    if (siteUrl) currentSiteUrl = siteUrl;

    const sorted = [...editableFiles].sort((a, b) => a.localeCompare(b));

    const header = currentSiteUrl
        ? `<div class="file-site-header">${escapeHtml(currentSiteUrl)}</div>`
        : '';

    fileList.innerHTML = header + sorted.map(fileName => {
        const isActive = fileName === resolvedFile;
        return `<div class="file-item ${isActive ? 'active' : ''}">
      <span class="file-dot"></span>
      <span class="file-name">${escapeHtml(fileName)}</span>
    </div>`;
    }).join('');

    if (!resolvedFile) {
        editBtn.disabled = true;
    } else {
        editBtn.disabled = false;
    }
}

// -------------------------------------------------------
// Dev logging
// -------------------------------------------------------
function devLogEntry(label, value, status = '', entryId = null) {
    if (entryId) {
        const existing = devLog.querySelector(`[data-entry-id="${entryId}"]`);
        if (existing) {
            existing.innerHTML = `<span class="label">${label}:</span> <span class="value ${status}">${value}</span>`;
            devLog.scrollTop = devLog.scrollHeight;
            return;
        }
    }
    const entry = document.createElement('div');
    entry.className = 'entry';
    if (entryId) entry.dataset.entryId = entryId;
    entry.innerHTML = `<span class="label">${label}:</span> <span class="value ${status}">${value}</span>`;
    devLog.appendChild(entry);
    devLog.scrollTop = devLog.scrollHeight;
}

function devLogSeparator() {
    const entry = document.createElement('div');
    entry.className = 'entry separator';
    entry.innerHTML = '<hr style="border: none; border-top: 1px solid rgba(0,0,0,0.06); margin: 4px 0;">';
    devLog.appendChild(entry);
    devLog.scrollTop = devLog.scrollHeight;
}

// -------------------------------------------------------
// Message handler: receive from content script
// -------------------------------------------------------
window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.source !== 'blip-content') return;

    switch (msg.action) {
        case 'collapse':
            showCollapsedView();
            break;
        case 'expand':
            showExpandedView();
            break;
        case 'tabState':
            setTabState(msg.state);
            break;
        case 'editStarted':
            showEditing();
            break;
        case 'editsDetected':
            saveBtn.disabled = false;
            break;
        case 'saved':
            showDefault();
            showNotification('Saved');
            break;
        case 'cancelled':
            showDefault();
            break;
        case 'noChanges':
            showEditing();
            showNotification('Nothing to save yet. Make some edits first.', 'info');
            break;
        case 'syncError':
            showSyncing(msg.userMessage || 'Re-syncing...');
            break;
        case 'recovered':
            showDefault();
            showNotification('Synced. Your edits were not saved, but you can try again.', 'error');
            break;
        case 'recoveryFailed':
            showDefault();
            showErrorWithReload(msg.userMessage || 'Could not sync. Please reload the page.');
            break;
        case 'error':
            showEditing();
            if (msg.recoverable) {
                showNotification(msg.userMessage || 'Something went wrong', 'error');
            } else {
                showErrorWithReload(msg.userMessage || 'Something went wrong. Try reloading the page.');
            }
            break;
        case 'fileInfo':
            updateFileList(msg.resolvedFile, msg.editableFiles, msg.siteUrl);
            break;
        case 'noSiteConfig':
            editBtn.disabled = true;
            fileList.innerHTML = '<p class="file-list-hint">Connect a GitHub repo in Settings to enable saving.</p>';
            configPanel.classList.remove('collapsed');
            break;
        case 'devLog':
            devLogEntry(msg.label, msg.value, msg.status || '', msg.entryId || null);
            break;
        case 'devSeparator':
            devLogSeparator();
            break;
    }
});

// Init: load saved sites into config panel
renderSavedSites();

// Tell the content script we're ready
sendToContent('ready');